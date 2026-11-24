import 'dotenv/config';
import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, eq, isNotNull } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import { build as buildVite, createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import {
  accountGroups,
  bills,
  companies,
  gatePasses,
  inventoryItems,
  ledgers,
  paymentSheets,
  purchaseOrders,
  termsTemplates,
  users,
  vendors,
  vouchers,
  warehouses,
  workOrders,
} from './src/db/schema.ts';
import {
  computeGstComplianceReport,
  createCompany,
  createCompanySnapshot,
  getCompanyBundle,
  getMasterData,
  getOrCreateDefaultCompany,
  getSnapshotPayload,
  logAudit,
  recordInventoryMovement,
  restoreCompanyFromPayload,
  seedGstMasterDataIfEmpty,
  updateCompanyProfile,
  upsertMasterDataEntries,
} from './src/db/erp.ts';
import {
  AuthError,
  listUsers,
  loginWithCredentials,
  resetUserPassword,
  signupWithCredentials,
  updateUserPermissions,
} from './src/db/users.ts';
import { issueSessionToken } from './src/lib/authCrypto.ts';
import { AuthRequest, requireAdmin, requireAuth } from './src/middleware/auth.ts';
import {
  computeLineItemsTotals,
  determineSupplyType,
  GSTN_UQC_UNITS,
  HSN_SAC_CATALOG,
  INDIAN_STATES,
  ISO_COUNTRIES,
  resolveStateFromInput,
  validateGstinChecksum,
} from './src/lib/gstMasterCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function parseCompanyId(req: AuthRequest): number {
  const raw = req.query.companyId ?? req.body?.companyId ?? req.headers['x-company-id'];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Valid companyId is required.');
  }
  return id;
}

function handleError(res: Response, err: unknown, fallback = 'Operation failed') {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  const msg = err instanceof Error ? err.message : fallback;
  const status = msg.toLowerCase().includes('not found') ? 404 : msg.toLowerCase().includes('required') ? 400 : 500;
  res.status(status).json({ error: msg });
}

// Health check (unauthenticated)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vyaparledger-erp' });
});

// Auth status & custom credential authentication
app.get('/api/auth/status', async (_req, res: Response) => {
  try {
    const rows = await db.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash));
    res.json({ hasUsers: rows.length > 0 });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/auth/signup', async (req, res: Response) => {
  try {
    const user = await signupWithCredentials({
      username: req.body?.username,
      email: req.body?.email,
      password: req.body?.password,
    });
    const token = issueSessionToken({
      uid: user.uid,
      email: user.email,
      username: user.username || user.name || '',
      role: user.role,
    });
    await logAudit(user.email, `User Signed Up (${user.role})`, 'auth', `Username: ${user.username}`);
    res.status(201).json({ token, user });
  } catch (err) {
    handleError(res, err, 'Signup failed');
  }
});

app.post('/api/auth/login', async (req, res: Response) => {
  try {
    const user = await loginWithCredentials({
      username: req.body?.username,
      email: req.body?.email,
      password: req.body?.password,
    });
    const token = issueSessionToken({
      uid: user.uid,
      email: user.email,
      username: user.username || user.name || '',
      role: user.role,
    });
    await logAudit(user.email, 'User Logged In', 'auth', `Username: ${user.username}`);
    res.json({ token, user });
  } catch (err) {
    handleError(res, err, 'Login failed');
  }
});

app.post('/api/auth/forgot-password', async (req, res: Response) => {
  try {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid Email ID.' });
    }
    await logAudit(
      email,
      'Forgot Password Request',
      'auth',
      `User ${username || '(unspecified)'} requested password reset. Admin contact: ashishinfotech.udr@gmail.com${note ? ` | Note: ${note}` : ''}`
    );
    res.json({
      ok: true,
      adminEmail: 'ashishinfotech.udr@gmail.com',
      message:
        'Password reset request recorded. Please send the reset request email to ashishinfotech.udr@gmail.com so the Administrator can issue a new password.',
    });
  } catch (err) {
    handleError(res, err, 'Failed to process password reset request');
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.dbUser });
});

// Bootstrap user session, company list, active company bundle, and master data
app.get('/api/bootstrap', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyList = await getOrCreateDefaultCompany(req.dbUser!.uid, req.dbUser!.email);
    const requestedCoId = Number(req.query.companyId);
    const activeCompany =
      companyList.find((c) => c.id === requestedCoId) || companyList[0];

    const [bundle, masterData] = await Promise.all([
      getCompanyBundle(activeCompany.id),
      getMasterData(),
    ]);

    res.json({
      user: req.dbUser,
      companies: companyList,
      activeCompanyId: activeCompany.id,
      bundle,
      masterData,
    });
  } catch (err) {
    console.error('Bootstrap error:', err);
    handleError(res, err, 'Failed to load ERP workspace');
  }
});

// Companies
app.post('/api/companies', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required.' });
    const created = await createCompany({
      ...req.body,
      name,
      ownerUid: req.dbUser!.uid,
    });
    await logAudit(req.dbUser!.email, 'Company Created', 'company', `${created.name} (#${created.id})`, created.id);
    res.json(created);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/companies/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { id: _id, code: _code, ownerUid: _owner, createdAt: _c, updatedAt: _u, ...patch } = req.body || {};
    const updated = await updateCompanyProfile(id, patch);
    if (!updated) return res.status(404).json({ error: 'Company not found.' });
    await logAudit(req.dbUser!.email, 'Company Profile Updated', 'company', updated.name, id);
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/companies/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const all = await db.select().from(companies).where(eq(companies.deleted, false));
    if (all.length <= 1) {
      return res.status(400).json({ error: 'At least one active company must remain.' });
    }
    const [updated] = await db
      .update(companies)
      .set({ deleted: true, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Company not found.' });
    await logAudit(req.dbUser!.email, 'Company Archived', 'company', updated.name, id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// GSTIN Verification & Autofill (Tally verification endpoint + local checksum/state parser fallback)
app.post('/api/gst/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const gstinInput = String(req.body?.gstin || '').trim().toUpperCase();
    const check = validateGstinChecksum(gstinInput);
    if (!check.valid) {
      return res.status(400).json({ error: check.error, parsed: check });
    }

    let remoteData: Record<string, any> | null = null;
    let source = 'Checksum & GSTN Structure';

    try {
      const formBody = new URLSearchParams({ gstin: check.gstin });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(
        'https://tallysolutions.com/wp-content/themes/tally/api/gstin-serach-api.php',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0',
          },
          body: formBody.toString(),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const rawText = await response.text();
      if (rawText && rawText.trim().startsWith('{')) {
        const parsed = JSON.parse(rawText);
        if (parsed && (parsed.status == 1 || parsed.legal_name || parsed.trade_name)) {
          remoteData = parsed;
          source = 'Tally GSTIN Verification Portal';
        }
      }
    } catch (fetchErr) {
      console.warn('Remote GSTIN verification lookup fallback:', fetchErr);
    }

    const fullAddress = String(remoteData?.address || '').trim();
    const pinMatch = fullAddress.match(/\b(\d{6})\b/);
    const pincode = pinMatch ? pinMatch[1] : '';
    const addrParts = fullAddress.split(',').map((s) => s.trim()).filter(Boolean);
    const city = addrParts.length >= 3 ? addrParts[addrParts.length - 3] : addrParts.length >= 2 ? addrParts[addrParts.length - 2] : '';

    res.json({
      verified: true,
      source,
      gstin: check.gstin,
      pan: check.pan,
      stateCode: check.stateCode,
      state: check.stateName,
      placeOfSupply: `${check.stateCode}-${check.stateName}`,
      legalName: remoteData?.legal_name || '',
      tradeName: remoteData?.trade_name || remoteData?.legal_name || '',
      gstStatus: remoteData?.gstin_status || 'Format & Checksum Valid',
      gstType: remoteData?.registration_type
        ? `Registered - ${remoteData.registration_type}`
        : 'Registered - Regular',
      businessConstitution: remoteData?.business_constitution || '',
      businessActivity: remoteData?.business_activity || '',
      address: fullAddress,
      city,
      pincode,
      remoteFound: !!remoteData,
    });
  } catch (err) {
    handleError(res, err);
  }
});

// IFSC Bank Lookup (allowlisted Razorpay IFSC endpoint)
app.get('/api/ifsc/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ifsc = String(req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return res.status(400).json({ error: 'Invalid 11-character IFSC format.' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(`https://ifsc.razorpay.com/${ifsc}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) {
      return res.status(404).json({ error: 'IFSC code not found.' });
    }
    const data = await resp.json();
    res.json({
      ifsc: data.IFSC || ifsc,
      bankName: data.BANK || '',
      branch: data.BRANCH || '',
      city: data.CITY || '',
      state: data.STATE || '',
    });
  } catch (err) {
    handleError(res, err, 'Failed to lookup IFSC code');
  }
});

// Master Data (HSN/SAC, Countries, States, GST Codes, Units) + GSTZen Sync
app.get('/api/master-data', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const rows = await getMasterData(category, q);
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/master-data/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await seedGstMasterDataIfEmpty();
    const syncedEntries: Array<any> = [];
    let livePortalReachable = false;

    // Allowlisted probe to my.gstzen.in/p/useful-tools/master-data/ subpages
    const gstzenPages = [
      'https://my.gstzen.in/p/useful-tools/master-data/',
      'https://my.gstzen.in/p/useful-tools/master-data/states/',
      'https://my.gstzen.in/p/useful-tools/master-data/units/',
      'https://my.gstzen.in/p/useful-tools/master-data/countries/',
    ];

    for (const url of gstzenPages) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'VyaparLedgerERP/1.0' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          livePortalReachable = true;
          const html = await resp.text();
          const $ = cheerio.load(html);
          $('table tbody tr').each((_idx, tr) => {
            const cols = $(tr)
              .find('td')
              .map((_i, td) => $(td).text().trim())
              .get();
            if (cols.length >= 2 && cols[0] && cols[1]) {
              const cat = url.includes('states')
                ? 'state'
                : url.includes('units')
                ? 'uqc'
                : url.includes('countries')
                ? 'country'
                : null;
              if (cat) {
                syncedEntries.push({
                  category: cat,
                  code: cols[0],
                  name: cols[1],
                  description: cols[2] || '',
                  source: 'my.gstzen.in',
                });
              }
            }
          });
        }
      } catch {
        // Continue gracefully with official GSTN baseline
      }
    }

    const baseCount = await upsertMasterDataEntries([
      ...INDIAN_STATES.map((s) => ({
        category: 'state',
        code: s.code,
        name: s.name,
        description: `${s.type} (${s.alphaCode})`,
        extra: { alphaCode: s.alphaCode, type: s.type },
        source: livePortalReachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Master Registry',
      })),
      ...GSTN_UQC_UNITS.map((u) => ({
        category: 'uqc',
        code: u.code,
        name: u.name,
        description: u.description,
        extra: {},
        source: livePortalReachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Master Registry',
      })),
      ...ISO_COUNTRIES.map((c) => ({
        category: 'country',
        code: c.code,
        name: c.name,
        description: c.currency ? `Currency: ${c.currency}` : 'ISO Country',
        extra: { currency: c.currency || '' },
        source: livePortalReachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Master Registry',
      })),
      ...HSN_SAC_CATALOG.map((h) => ({
        category: 'hsn',
        code: h.code,
        name: h.name,
        description: h.description,
        gstRate: String(h.gstRate),
        cgstRate: String(h.cgstRate),
        sgstRate: String(h.sgstRate),
        igstRate: String(h.igstRate),
        extra: { type: h.type },
        source: livePortalReachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Master Registry',
      })),
      ...syncedEntries,
    ]);

    const rows = await getMasterData();
    await logAudit(req.dbUser!.email, 'Master Data Synced', 'gst_master_data', `Synced ${baseCount} GSTN/GSTZen records`);
    res.json({
      synced: baseCount,
      livePortalReachable,
      total: rows.length,
      rows,
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Vendors CRUD + Bulk Import
app.post('/api/vendors', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const body = req.body || {};
    if (!String(body.vendorName || '').trim()) {
      return res.status(400).json({ error: 'Vendor name is required.' });
    }
    const stateRes = resolveStateFromInput(body.state, body.gstin);
    const [inserted] = await db
      .insert(vendors)
      .values({
        companyId,
        vendorCode: body.vendorCode || `VND-${Date.now().toString(36).toUpperCase().slice(-5)}`,
        vendorName: String(body.vendorName).trim(),
        tradeName: body.tradeName || '',
        vendorCategory: body.vendorCategory || 'Supplier',
        contactPerson: body.contactPerson || '',
        mobile: body.mobile || '',
        email: body.email || '',
        website: body.website || '',
        gstType: body.gstType || (body.gstin ? 'Registered - Regular' : 'Unregistered'),
        gstin: String(body.gstin || '').trim().toUpperCase(),
        gstStatus: body.gstStatus || '',
        businessConstitution: body.businessConstitution || '',
        pan: String(body.pan || (body.gstin ? String(body.gstin).slice(2, 12) : '')).toUpperCase(),
        tan: String(body.tan || '').toUpperCase(),
        msmeRegNo: body.msmeRegNo || '',
        address: body.address || '',
        city: body.city || '',
        state: stateRes.stateName || body.state || '',
        stateCode: body.stateCode || stateRes.stateCode || '',
        pincode: body.pincode || '',
        country: body.country || 'India',
        placeOfSupply: body.placeOfSupply || (stateRes.stateCode ? `${stateRes.stateCode}-${stateRes.stateName}` : ''),
        bankName: body.bankName || '',
        bankBranch: body.bankBranch || '',
        accountNo: body.accountNo || '',
        ifscCode: String(body.ifscCode || '').toUpperCase(),
        accountType: body.accountType || 'Current',
        paymentTerms: body.paymentTerms || '30 Days',
        creditLimit: String(Number(body.creditLimit) || 0),
        openingBalance: String(Number(body.openingBalance) || 0),
        tdsApplicable: !!body.tdsApplicable,
        tdsSection: body.tdsSection || '',
        tdsRate: String(Number(body.tdsRate) || 0),
        status: body.status || 'Active',
        notes: body.notes || '',
      })
      .returning();

    await logAudit(req.dbUser!.email, 'Vendor Created', 'vendor', inserted.vendorName, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/vendors/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const { id: _id, companyId: _cid, createdAt: _c, updatedAt: _u, ...body } = req.body || {};
    const stateRes = resolveStateFromInput(body.state, body.gstin);

    const [updated] = await db
      .update(vendors)
      .set({
        ...body,
        ...(body.gstin !== undefined ? { gstin: String(body.gstin).trim().toUpperCase() } : {}),
        ...(stateRes.stateName ? { state: stateRes.stateName, stateCode: stateRes.stateCode } : {}),
        ...(body.creditLimit !== undefined ? { creditLimit: String(Number(body.creditLimit) || 0) } : {}),
        ...(body.openingBalance !== undefined ? { openingBalance: String(Number(body.openingBalance) || 0) } : {}),
        ...(body.tdsRate !== undefined ? { tdsRate: String(Number(body.tdsRate) || 0) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(vendors.id, id), eq(vendors.companyId, companyId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Vendor not found.' });
    await logAudit(req.dbUser!.email, 'Vendor Updated', 'vendor', updated.vendorName, companyId);
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/vendors/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const [deleted] = await db
      .delete(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.companyId, companyId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Vendor not found.' });
    await logAudit(req.dbUser!.email, 'Vendor Deleted', 'vendor', deleted.vendorName, companyId);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/vendors/bulk', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'No rows provided for import.' });

    const toInsert = rows
      .filter((r: any) => String(r.vendorName || '').trim())
      .map((r: any, idx: number) => {
        const gstin = String(r.gstin || '').trim().toUpperCase();
        const st = resolveStateFromInput(r.state, gstin);
        return {
          companyId,
          vendorCode: r.vendorCode || `VND-${Date.now().toString(36).toUpperCase().slice(-4)}${idx}`,
          vendorName: String(r.vendorName).trim(),
          tradeName: r.tradeName || '',
          vendorCategory: r.vendorCategory || 'Supplier',
          contactPerson: r.contactPerson || '',
          mobile: String(r.mobile || ''),
          email: r.email || '',
          gstType: r.gstType || (gstin ? 'Registered - Regular' : 'Unregistered'),
          gstin,
          pan: String(r.pan || (gstin.length >= 12 ? gstin.slice(2, 12) : '')).toUpperCase(),
          tan: String(r.tan || '').toUpperCase(),
          address: r.address || '',
          city: r.city || '',
          state: st.stateName || r.state || '',
          stateCode: r.stateCode || st.stateCode || '',
          pincode: String(r.pincode || ''),
          country: r.country || 'India',
          placeOfSupply: st.stateCode ? `${st.stateCode}-${st.stateName}` : '',
          bankName: r.bankName || '',
          accountNo: String(r.accountNo || ''),
          ifscCode: String(r.ifscCode || '').toUpperCase(),
          paymentTerms: r.paymentTerms || '30 Days',
          openingBalance: String(Number(r.openingBalance) || 0),
          tdsRate: String(Number(r.tdsRate) || 0),
          status: r.status || 'Active',
        };
      });

    const inserted = await db.insert(vendors).values(toInsert).returning();
    await logAudit(req.dbUser!.email, 'Vendors Bulk Imported', 'vendor', `Imported ${inserted.length} vendors`, companyId);
    res.json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    handleError(res, err);
  }
});

// Warehouses
app.post('/api/warehouses', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const { name, code, location, state, inCharge, isDefault } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Warehouse name is required.' });
    const [inserted] = await db
      .insert(warehouses)
      .values({
        companyId,
        code: code || `WH-${Date.now().toString(36).toUpperCase().slice(-4)}`,
        name: String(name).trim(),
        location: location || '',
        state: state || '',
        inCharge: inCharge || '',
        isDefault: !!isDefault,
        active: true,
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/warehouses/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Inventory Items & Advanced Movements
app.post('/api/inventory/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Item name is required.' });
    const opening = Number(b.openingStock) || 0;
    const [inserted] = await db
      .insert(inventoryItems)
      .values({
        companyId,
        sku: b.sku || `SKU-${Date.now().toString(36).toUpperCase().slice(-5)}`,
        name: String(b.name).trim(),
        description: b.description || '',
        category: b.category || 'Raw Material',
        itemType: b.itemType || 'Goods',
        hsnSac: b.hsnSac || '',
        gstRate: String(Number(b.gstRate) ?? 18),
        cessRate: String(Number(b.cessRate) || 0),
        unit: b.unit || 'NOS',
        altUnit: b.altUnit || '',
        conversionFactor: String(Number(b.conversionFactor) || 1),
        valuationMethod: b.valuationMethod || 'Weighted Average',
        purchaseRate: String(Number(b.purchaseRate) || 0),
        sellingRate: String(Number(b.sellingRate) || 0),
        mrp: String(Number(b.mrp) || 0),
        openingStock: String(opening),
        currentStock: String(b.currentStock !== undefined ? Number(b.currentStock) : opening),
        minStock: String(Number(b.minStock) || 0),
        reorderLevel: String(Number(b.reorderLevel) || 0),
        maxStock: String(Number(b.maxStock) || 0),
        warehouseId: b.warehouseId ? Number(b.warehouseId) : null,
        binLocation: b.binLocation || '',
        batchTracked: !!b.batchTracked,
        serialTracked: !!b.serialTracked,
        preferredVendorId: b.preferredVendorId ? Number(b.preferredVendorId) : null,
        active: b.active !== false,
      })
      .returning();

    await logAudit(req.dbUser!.email, 'Inventory Item Created', 'inventory', `${inserted.sku} - ${inserted.name}`, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/inventory/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const { id: _id, companyId: _cid, createdAt: _c, updatedAt: _u, ...b } = req.body || {};
    const [updated] = await db
      .update(inventoryItems)
      .set({
        ...b,
        ...(b.gstRate !== undefined ? { gstRate: String(Number(b.gstRate) || 0) } : {}),
        ...(b.cessRate !== undefined ? { cessRate: String(Number(b.cessRate) || 0) } : {}),
        ...(b.purchaseRate !== undefined ? { purchaseRate: String(Number(b.purchaseRate) || 0) } : {}),
        ...(b.sellingRate !== undefined ? { sellingRate: String(Number(b.sellingRate) || 0) } : {}),
        ...(b.mrp !== undefined ? { mrp: String(Number(b.mrp) || 0) } : {}),
        ...(b.minStock !== undefined ? { minStock: String(Number(b.minStock) || 0) } : {}),
        ...(b.reorderLevel !== undefined ? { reorderLevel: String(Number(b.reorderLevel) || 0) } : {}),
        ...(b.maxStock !== undefined ? { maxStock: String(Number(b.maxStock) || 0) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Inventory item not found.' });
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/inventory/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/inventory/items/bulk', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No inventory rows provided.' });

    const toInsert = rows
      .filter((r: any) => String(r.name || '').trim())
      .map((r: any, idx: number) => {
        const opening = Number(r.openingStock ?? r.currentStock) || 0;
        return {
          companyId,
          sku: r.sku || `SKU-${Date.now().toString(36).toUpperCase().slice(-4)}${idx}`,
          name: String(r.name).trim(),
          description: r.description || '',
          category: r.category || 'Raw Material',
          itemType: r.itemType || 'Goods',
          hsnSac: String(r.hsnSac || ''),
          gstRate: String(Number(r.gstRate) ?? 18),
          unit: String(r.unit || 'NOS').toUpperCase(),
          valuationMethod: r.valuationMethod || 'Weighted Average',
          purchaseRate: String(Number(r.purchaseRate) || 0),
          sellingRate: String(Number(r.sellingRate) || 0),
          openingStock: String(opening),
          currentStock: String(opening),
          minStock: String(Number(r.minStock) || 0),
          reorderLevel: String(Number(r.reorderLevel) || 0),
          maxStock: String(Number(r.maxStock) || 0),
          binLocation: r.binLocation || '',
          batchTracked: Boolean(r.batchTracked),
          serialTracked: Boolean(r.serialTracked),
          active: true,
        };
      });

    const inserted = await db.insert(inventoryItems).values(toInsert).returning();
    await logAudit(req.dbUser!.email, 'Inventory Bulk Imported', 'inventory', `Imported ${inserted.length} items`, companyId);
    res.json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/inventory/movements', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    if (!b.itemId || !b.movementType) {
      return res.status(400).json({ error: 'itemId and movementType are required.' });
    }
    const inserted = await recordInventoryMovement(companyId, {
      companyId,
      entryNo: b.entryNo || `STK-${Date.now().toString().slice(-6)}`,
      entryDate: b.entryDate || new Date().toISOString().slice(0, 10),
      movementType: b.movementType,
      itemId: Number(b.itemId),
      warehouseId: b.warehouseId ? Number(b.warehouseId) : null,
      toWarehouseId: b.toWarehouseId ? Number(b.toWarehouseId) : null,
      batchNo: b.batchNo || '',
      expiryDate: b.expiryDate || '',
      serialNumbers: Array.isArray(b.serialNumbers) ? b.serialNumbers : [],
      qty: String(Number(b.qty) || 0),
      unitRate: String(Number(b.unitRate) || 0),
      refDocType: b.refDocType || '',
      refDocNo: b.refDocNo || '',
      vendorId: b.vendorId ? Number(b.vendorId) : null,
      remarks: b.remarks || '',
      createdBy: req.dbUser!.email,
    });
    await logAudit(req.dbUser!.email, `Stock ${b.movementType}`, 'inventory_movement', `${inserted.entryNo} (${inserted.qty})`, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

// Purchase Orders CRUD + Bulk Import
app.post('/api/purchase-orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
    const totals = computeLineItemsTotals(b.items || [], b.charges || [], supplyType);

    const [inserted] = await db
      .insert(purchaseOrders)
      .values({
        companyId,
        poNumber: b.poNumber || `PO-${Date.now().toString().slice(-6)}`,
        poDate: b.poDate || new Date().toISOString().slice(0, 10),
        expectedDelivery: b.expectedDelivery || '',
        vendorId: b.vendorId ? Number(b.vendorId) : null,
        vendorName: b.vendorName || 'Supplier',
        vendorGstin: b.vendorGstin || '',
        vendorState: b.vendorState || '',
        vendorStateCode: b.vendorStateCode || '',
        vendorAddress: b.vendorAddress || '',
        deliveryAddress: b.deliveryAddress || co?.address || '',
        warehouseId: b.warehouseId ? Number(b.warehouseId) : null,
        paymentTerms: b.paymentTerms || '30 Days',
        termsText: b.termsText || '',
        items: totals.items,
        charges: b.charges || [],
        taxableValue: String(totals.taxableValue),
        cgstAmount: String(totals.cgstAmount),
        sgstAmount: String(totals.sgstAmount),
        igstAmount: String(totals.igstAmount),
        cessAmount: String(totals.cessAmount),
        totalAmount: String(totals.totalAmount),
        supplyType,
        status: b.status || 'Pending',
        notes: b.notes || '',
      })
      .returning();

    await logAudit(req.dbUser!.email, 'Purchase Order Created', 'po', inserted.poNumber, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/purchase-orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
    const totals = b.items ? computeLineItemsTotals(b.items, b.charges || [], supplyType) : null;

    const patch: Record<string, any> = {
      ...(b.poNumber !== undefined ? { poNumber: b.poNumber } : {}),
      ...(b.poDate !== undefined ? { poDate: b.poDate } : {}),
      ...(b.expectedDelivery !== undefined ? { expectedDelivery: b.expectedDelivery } : {}),
      ...(b.vendorId !== undefined ? { vendorId: b.vendorId } : {}),
      ...(b.vendorName !== undefined ? { vendorName: b.vendorName } : {}),
      ...(b.vendorGstin !== undefined ? { vendorGstin: b.vendorGstin } : {}),
      ...(b.vendorState !== undefined ? { vendorState: b.vendorState } : {}),
      ...(b.vendorStateCode !== undefined ? { vendorStateCode: b.vendorStateCode } : {}),
      ...(b.vendorAddress !== undefined ? { vendorAddress: b.vendorAddress } : {}),
      ...(b.deliveryAddress !== undefined ? { deliveryAddress: b.deliveryAddress } : {}),
      ...(b.paymentTerms !== undefined ? { paymentTerms: b.paymentTerms } : {}),
      ...(b.termsText !== undefined ? { termsText: b.termsText } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.notes !== undefined ? { notes: b.notes } : {}),
      supplyType,
      updatedAt: new Date(),
    };

    if (totals) {
      patch.items = totals.items;
      patch.charges = b.charges || [];
      patch.taxableValue = String(totals.taxableValue);
      patch.cgstAmount = String(totals.cgstAmount);
      patch.sgstAmount = String(totals.sgstAmount);
      patch.igstAmount = String(totals.igstAmount);
      patch.cessAmount = String(totals.cessAmount);
      patch.totalAmount = String(totals.totalAmount);
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set(patch)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Purchase Order not found.' });
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/purchase-orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/purchase-orders/bulk', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const toInsert = rows.map((b: any, idx: number) => {
      const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
      const totals = computeLineItemsTotals(b.items || [], b.charges || [], supplyType);
      return {
        companyId,
        poNumber: b.poNumber || `PO-IMP-${Date.now().toString().slice(-4)}${idx}`,
        poDate: b.poDate || new Date().toISOString().slice(0, 10),
        vendorName: b.vendorName || 'Supplier',
        vendorGstin: b.vendorGstin || '',
        vendorState: b.vendorState || '',
        vendorStateCode: b.vendorStateCode || '',
        paymentTerms: b.paymentTerms || '30 Days',
        items: totals.items,
        charges: b.charges || [],
        taxableValue: String(totals.taxableValue),
        cgstAmount: String(totals.cgstAmount),
        sgstAmount: String(totals.sgstAmount),
        igstAmount: String(totals.igstAmount),
        cessAmount: String(totals.cessAmount),
        totalAmount: String(totals.totalAmount),
        supplyType,
        status: b.status || 'Pending',
      };
    });
    const inserted = await db.insert(purchaseOrders).values(toInsert).returning();
    await logAudit(req.dbUser!.email, 'Purchase Orders Bulk Imported', 'po', `Imported ${inserted.length} POs`, companyId);
    res.json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    handleError(res, err);
  }
});

// Work Orders CRUD + Bulk Import
app.post('/api/work-orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
    const totals = computeLineItemsTotals(b.items || [], b.charges || [], supplyType);

    const [inserted] = await db
      .insert(workOrders)
      .values({
        companyId,
        woNumber: b.woNumber || `WO-${Date.now().toString().slice(-6)}`,
        woDate: b.woDate || new Date().toISOString().slice(0, 10),
        completionDate: b.completionDate || '',
        vendorId: b.vendorId ? Number(b.vendorId) : null,
        contractorName: b.contractorName || 'Contractor',
        vendorGstin: b.vendorGstin || '',
        vendorState: b.vendorState || '',
        vendorStateCode: b.vendorStateCode || '',
        siteLocation: b.siteLocation || '',
        scopeOfWork: b.scopeOfWork || '',
        termsText: b.termsText || '',
        items: totals.items,
        charges: b.charges || [],
        taxableValue: String(totals.taxableValue),
        cgstAmount: String(totals.cgstAmount),
        sgstAmount: String(totals.sgstAmount),
        igstAmount: String(totals.igstAmount),
        totalAmount: String(totals.totalAmount),
        supplyType,
        status: b.status || 'Pending',
        notes: b.notes || '',
      })
      .returning();

    await logAudit(req.dbUser!.email, 'Work Order Created', 'wo', inserted.woNumber, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/work-orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
    const totals = b.items ? computeLineItemsTotals(b.items, b.charges || [], supplyType) : null;

    const patch: Record<string, any> = {
      ...(b.woNumber !== undefined ? { woNumber: b.woNumber } : {}),
      ...(b.woDate !== undefined ? { woDate: b.woDate } : {}),
      ...(b.completionDate !== undefined ? { completionDate: b.completionDate } : {}),
      ...(b.contractorName !== undefined ? { contractorName: b.contractorName } : {}),
      ...(b.vendorGstin !== undefined ? { vendorGstin: b.vendorGstin } : {}),
      ...(b.vendorState !== undefined ? { vendorState: b.vendorState } : {}),
      ...(b.vendorStateCode !== undefined ? { vendorStateCode: b.vendorStateCode } : {}),
      ...(b.siteLocation !== undefined ? { siteLocation: b.siteLocation } : {}),
      ...(b.scopeOfWork !== undefined ? { scopeOfWork: b.scopeOfWork } : {}),
      ...(b.termsText !== undefined ? { termsText: b.termsText } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.notes !== undefined ? { notes: b.notes } : {}),
      supplyType,
      updatedAt: new Date(),
    };

    if (totals) {
      patch.items = totals.items;
      patch.charges = b.charges || [];
      patch.taxableValue = String(totals.taxableValue);
      patch.cgstAmount = String(totals.cgstAmount);
      patch.sgstAmount = String(totals.sgstAmount);
      patch.igstAmount = String(totals.igstAmount);
      patch.totalAmount = String(totals.totalAmount);
    }

    const [updated] = await db
      .update(workOrders)
      .set(patch)
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Work Order not found.' });
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/work-orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/work-orders/bulk', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const toInsert = rows.map((b: any, idx: number) => {
      const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', b.vendorStateCode, b.vendorGstin);
      const totals = computeLineItemsTotals(b.items || [], b.charges || [], supplyType);
      return {
        companyId,
        woNumber: b.woNumber || `WO-IMP-${Date.now().toString().slice(-4)}${idx}`,
        woDate: b.woDate || new Date().toISOString().slice(0, 10),
        contractorName: b.contractorName || 'Contractor',
        vendorGstin: b.vendorGstin || '',
        vendorState: b.vendorState || '',
        vendorStateCode: b.vendorStateCode || '',
        siteLocation: b.siteLocation || '',
        scopeOfWork: b.scopeOfWork || '',
        items: totals.items,
        charges: b.charges || [],
        taxableValue: String(totals.taxableValue),
        cgstAmount: String(totals.cgstAmount),
        sgstAmount: String(totals.sgstAmount),
        igstAmount: String(totals.igstAmount),
        totalAmount: String(totals.totalAmount),
        supplyType,
        status: b.status || 'Pending',
      };
    });
    const inserted = await db.insert(workOrders).values(toInsert).returning();
    await logAudit(req.dbUser!.email, 'Work Orders Bulk Imported', 'wo', `Imported ${inserted.length} WOs`, companyId);
    res.json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    handleError(res, err);
  }
});

// Vouchers CRUD + Bulk Import (sales, purchase, receipt, payment, journal, proforma, service)
app.post('/api/vouchers', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const kind = b.voucherKind || 'sales';
    const stateInfo = resolveStateFromInput(b.partyState, b.partyGstin);
    const partyStateCode = b.partyStateCode || stateInfo.stateCode || co?.stateCode || '08';
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', partyStateCode, b.partyGstin);

    let taxableValue = Number(b.taxableValue) || 0;
    let cgstAmount = Number(b.cgstAmount) || 0;
    let sgstAmount = Number(b.sgstAmount) || 0;
    let igstAmount = Number(b.igstAmount) || 0;
    let cessAmount = Number(b.cessAmount) || 0;
    let roundOff = Number(b.roundOff) || 0;
    let totalAmount = Number(b.totalAmount) || 0;
    let computedItems = b.items || [];

    if (Array.isArray(b.items) && b.items.length > 0 && ['sales', 'purchase', 'proforma', 'service'].includes(kind)) {
      const calc = computeLineItemsTotals(b.items, b.charges || [], supplyType);
      computedItems = calc.items;
      taxableValue = calc.taxableValue;
      cgstAmount = calc.cgstAmount;
      sgstAmount = calc.sgstAmount;
      igstAmount = calc.igstAmount;
      cessAmount = calc.cessAmount;
      roundOff = calc.roundOff;
      totalAmount = calc.totalAmount;
    } else if (kind === 'journal' && Array.isArray(b.journalLines)) {
      const drTotal = b.journalLines.reduce((s: number, l: any) => s + (Number(l.drAmount) || 0), 0);
      totalAmount = drTotal;
      taxableValue = drTotal;
    }

    const tdsPercent = Number(b.tdsPercent) || 0;
    const tdsAmount = b.tdsAmount !== undefined ? Number(b.tdsAmount) : Math.round((taxableValue * tdsPercent) / 100);

    const [inserted] = await db
      .insert(vouchers)
      .values({
        companyId,
        voucherKind: kind,
        voucherNo: b.voucherNo || `${kind.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`,
        voucherDate: b.voucherDate || new Date().toISOString().slice(0, 10),
        dueDate: b.dueDate || '',
        partyId: b.partyId ? Number(b.partyId) : null,
        partyName: b.partyName || (kind === 'journal' ? 'Journal Entry' : 'Party'),
        partyGstin: String(b.partyGstin || '').toUpperCase(),
        partyState: stateInfo.stateName || b.partyState || '',
        partyStateCode,
        partyAddress: b.partyAddress || '',
        placeOfSupply: b.placeOfSupply || `${partyStateCode}-${stateInfo.stateName || b.partyState || ''}`,
        supplyType,
        invoiceType:
          b.invoiceType ||
          (b.partyGstin && String(b.partyGstin).length === 15
            ? 'B2B'
            : supplyType === 'Inter-State' && totalAmount > 250000
            ? 'B2CL'
            : 'B2CS'),
        reverseCharge: !!b.reverseCharge,
        itcEligibility: b.itcEligibility || 'Eligible',
        refNo: b.refNo || '',
        refDate: b.refDate || '',
        paymentMode: b.paymentMode || 'Bank Transfer',
        bankAccount: b.bankAccount || '',
        tdsPercent: String(tdsPercent),
        tdsAmount: String(tdsAmount),
        items: computedItems,
        charges: b.charges || [],
        journalLines: b.journalLines || [],
        taxableValue: String(taxableValue),
        cgstAmount: String(cgstAmount),
        sgstAmount: String(sgstAmount),
        igstAmount: String(igstAmount),
        cessAmount: String(cessAmount),
        roundOff: String(roundOff),
        totalAmount: String(totalAmount),
        paidAmount: String(Number(b.paidAmount) || 0),
        narration: b.narration || '',
        termsText: b.termsText || '',
        status: b.status || 'Posted',
      })
      .returning();

    await logAudit(req.dbUser!.email, `Voucher Created (${kind})`, 'voucher', inserted.voucherNo, companyId);
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/vouchers/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const kind = b.voucherKind || 'sales';
    const stateInfo = resolveStateFromInput(b.partyState, b.partyGstin);
    const partyStateCode = b.partyStateCode || stateInfo.stateCode || co?.stateCode || '08';
    const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', partyStateCode, b.partyGstin);

    const patch: Record<string, any> = {
      ...(b.voucherNo !== undefined ? { voucherNo: b.voucherNo } : {}),
      ...(b.voucherDate !== undefined ? { voucherDate: b.voucherDate } : {}),
      ...(b.dueDate !== undefined ? { dueDate: b.dueDate } : {}),
      ...(b.partyName !== undefined ? { partyName: b.partyName } : {}),
      ...(b.partyGstin !== undefined ? { partyGstin: String(b.partyGstin).toUpperCase() } : {}),
      ...(b.partyAddress !== undefined ? { partyAddress: b.partyAddress } : {}),
      ...(b.reverseCharge !== undefined ? { reverseCharge: !!b.reverseCharge } : {}),
      ...(b.itcEligibility !== undefined ? { itcEligibility: b.itcEligibility } : {}),
      ...(b.invoiceType !== undefined ? { invoiceType: b.invoiceType } : {}),
      ...(b.refNo !== undefined ? { refNo: b.refNo } : {}),
      ...(b.paymentMode !== undefined ? { paymentMode: b.paymentMode } : {}),
      ...(b.bankAccount !== undefined ? { bankAccount: b.bankAccount } : {}),
      ...(b.narration !== undefined ? { narration: b.narration } : {}),
      ...(b.termsText !== undefined ? { termsText: b.termsText } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(stateInfo.stateName ? { partyState: stateInfo.stateName, partyStateCode } : {}),
      supplyType,
      updatedAt: new Date(),
    };

    if (Array.isArray(b.items) && b.items.length > 0 && ['sales', 'purchase', 'proforma', 'service'].includes(kind)) {
      const calc = computeLineItemsTotals(b.items, b.charges || [], supplyType);
      patch.items = calc.items;
      patch.charges = b.charges || [];
      patch.taxableValue = String(calc.taxableValue);
      patch.cgstAmount = String(calc.cgstAmount);
      patch.sgstAmount = String(calc.sgstAmount);
      patch.igstAmount = String(calc.igstAmount);
      patch.cessAmount = String(calc.cessAmount);
      patch.roundOff = String(calc.roundOff);
      patch.totalAmount = String(calc.totalAmount);
    } else if (b.totalAmount !== undefined) {
      patch.totalAmount = String(Number(b.totalAmount) || 0);
      patch.taxableValue = String(Number(b.taxableValue ?? b.totalAmount) || 0);
    }
    if (b.journalLines !== undefined) patch.journalLines = b.journalLines;

    const [updated] = await db
      .update(vouchers)
      .set(patch)
      .where(and(eq(vouchers.id, id), eq(vouchers.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Voucher not found.' });
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/vouchers/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(vouchers).where(and(eq(vouchers.id, id), eq(vouchers.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/vouchers/bulk', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No voucher rows provided.' });

    const toInsert = rows.map((b: any, idx: number) => {
      const kind = b.voucherKind || 'sales';
      const st = resolveStateFromInput(b.partyState, b.partyGstin);
      const pCode = b.partyStateCode || st.stateCode || co?.stateCode || '08';
      const supplyType = b.supplyType || determineSupplyType(co?.stateCode || '08', pCode, b.partyGstin);

      let calc = null;
      if (Array.isArray(b.items) && b.items.length > 0 && ['sales', 'purchase', 'proforma', 'service'].includes(kind)) {
        calc = computeLineItemsTotals(b.items, b.charges || [], supplyType);
      }

      const totalAmount = calc ? calc.totalAmount : Number(b.totalAmount) || 0;
      const gstin = String(b.partyGstin || '').toUpperCase();

      return {
        companyId,
        voucherKind: kind,
        voucherNo: b.voucherNo || `${kind.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}${idx}`,
        voucherDate: b.voucherDate || new Date().toISOString().slice(0, 10),
        dueDate: b.dueDate || '',
        partyName: b.partyName || (kind === 'journal' ? 'Journal Entry' : 'Party'),
        partyGstin: gstin,
        partyState: st.stateName || b.partyState || '',
        partyStateCode: pCode,
        partyAddress: b.partyAddress || '',
        placeOfSupply: `${pCode}-${st.stateName || b.partyState || ''}`,
        supplyType,
        invoiceType: b.invoiceType || (gstin.length === 15 ? 'B2B' : supplyType === 'Inter-State' && totalAmount > 250000 ? 'B2CL' : 'B2CS'),
        reverseCharge: Boolean(b.reverseCharge),
        itcEligibility: b.itcEligibility || 'Eligible',
        refNo: b.refNo || '',
        paymentMode: b.paymentMode || 'Bank Transfer',
        bankAccount: b.bankAccount || '',
        tdsPercent: String(Number(b.tdsPercent) || 0),
        tdsAmount: String(Number(b.tdsAmount) || 0),
        items: calc ? calc.items : [],
        charges: b.charges || [],
        journalLines: b.journalLines || [],
        taxableValue: String(calc ? calc.taxableValue : Number(b.taxableValue ?? totalAmount) || 0),
        cgstAmount: String(calc ? calc.cgstAmount : Number(b.cgstAmount) || 0),
        sgstAmount: String(calc ? calc.sgstAmount : Number(b.sgstAmount) || 0),
        igstAmount: String(calc ? calc.igstAmount : Number(b.igstAmount) || 0),
        cessAmount: String(calc ? calc.cessAmount : Number(b.cessAmount) || 0),
        roundOff: String(calc ? calc.roundOff : 0),
        totalAmount: String(totalAmount),
        narration: b.narration || '',
        status: b.status || 'Posted',
      };
    });

    const inserted = await db.insert(vouchers).values(toInsert).returning();
    await logAudit(req.dbUser!.email, 'Vouchers Bulk Imported', 'voucher', `Imported ${inserted.length} vouchers`, companyId);
    res.json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    handleError(res, err);
  }
});

// Bills
app.post('/api/bills', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const amt = Number(b.amount) || 0;
    const gst = Number(b.gstAmount) || 0;
    const tds = Number(b.tdsAmount) || 0;
    const ded = Number(b.deduction) || 0;
    const net = b.netAmount !== undefined ? Number(b.netAmount) : amt + gst - tds - ded;

    const [inserted] = await db
      .insert(bills)
      .values({
        companyId,
        billNo: b.billNo || `BL-${Date.now().toString().slice(-6)}`,
        billDate: b.billDate || new Date().toISOString().slice(0, 10),
        vendorId: b.vendorId ? Number(b.vendorId) : null,
        vendorName: b.vendorName || 'Vendor',
        vendorGstin: b.vendorGstin || '',
        docNo: b.docNo || '',
        docDate: b.docDate || '',
        poWoRef: b.poWoRef || '',
        amount: String(amt),
        gstAmount: String(gst),
        cgstAmount: String(Number(b.cgstAmount) || gst / 2),
        sgstAmount: String(Number(b.sgstAmount) || gst / 2),
        igstAmount: String(Number(b.igstAmount) || 0),
        tdsAmount: String(tds),
        deduction: String(ded),
        netAmount: String(net),
        payFromBank: b.payFromBank || '',
        paymentMode: b.paymentMode || 'NEFT',
        status: b.status || 'Pending',
        narration: b.narration || '',
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/bills/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const { id: _id, companyId: _cid, createdAt: _c, ...b } = req.body || {};
    const [updated] = await db
      .update(bills)
      .set(b)
      .where(and(eq(bills.id, id), eq(bills.companyId, companyId)))
      .returning();
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/bills/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(bills).where(and(eq(bills.id, id), eq(bills.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Payment Sheets
app.post('/api/payment-sheets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const billIds: number[] = Array.isArray(b.billIds) ? b.billIds.map(Number) : [];
    const [inserted] = await db
      .insert(paymentSheets)
      .values({
        companyId,
        sheetNo: b.sheetNo || `PS-${Date.now().toString().slice(-6)}`,
        sheetDate: b.sheetDate || new Date().toISOString().slice(0, 10),
        payFromBank: b.payFromBank || '',
        paymentMode: b.paymentMode || 'NEFT',
        billIds,
        totalNetAmount: String(Number(b.totalNetAmount) || 0),
        status: b.status || 'Initiated',
        remarks: b.remarks || '',
      })
      .returning();

    for (const billId of billIds) {
      await db
        .update(bills)
        .set({ paymentSheetId: inserted.id, status: b.status === 'Paid' ? 'Paid' : 'Approved' })
        .where(and(eq(bills.id, billId), eq(bills.companyId, companyId)));
    }

    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/payment-sheets/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [updated] = await db
      .update(paymentSheets)
      .set({ status: b.status, remarks: b.remarks })
      .where(and(eq(paymentSheets.id, id), eq(paymentSheets.companyId, companyId)))
      .returning();
    if (updated && b.status === 'Paid') {
      for (const billId of updated.billIds || []) {
        await db.update(bills).set({ status: 'Paid' }).where(eq(bills.id, billId));
      }
    }
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

// Gate Passes
app.post('/api/gate-passes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [inserted] = await db
      .insert(gatePasses)
      .values({
        companyId,
        passNo: b.passNo || `GP-${Date.now().toString().slice(-6)}`,
        passDate: b.passDate || new Date().toISOString().slice(0, 10),
        passType: b.passType || 'Returnable',
        direction: b.direction || 'Outward',
        partyName: b.partyName || 'Party',
        vehicleNo: b.vehicleNo || '',
        driverName: b.driverName || '',
        items: b.items || [],
        status: b.status || 'Open',
        remarks: b.remarks || '',
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/gate-passes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    const { id: _id, companyId: _cid, createdAt: _c, ...b } = req.body || {};
    const [updated] = await db
      .update(gatePasses)
      .set(b)
      .where(and(eq(gatePasses.id, id), eq(gatePasses.companyId, companyId)))
      .returning();
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/gate-passes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(gatePasses).where(and(eq(gatePasses.id, id), eq(gatePasses.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Account Groups, Ledgers, Terms
app.post('/api/account-groups', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const { name, nature, parentGroup } = req.body || {};
    const [inserted] = await db
      .insert(accountGroups)
      .values({ companyId, name, nature: nature || 'Expense', parentGroup: parentGroup || 'Primary', isSystem: false })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/account-groups/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(accountGroups).where(and(eq(accountGroups.id, id), eq(accountGroups.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/ledgers', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [inserted] = await db
      .insert(ledgers)
      .values({
        companyId,
        name: b.name,
        groupName: b.groupName || 'Indirect Expenses',
        nature: b.nature || 'Expense',
        openingBalance: String(Number(b.openingBalance) || 0),
        openingType: b.openingType || 'Dr',
        gstin: b.gstin || '',
        state: b.state || '',
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/ledgers/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(ledgers).where(and(eq(ledgers.id, id), eq(ledgers.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/terms', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const b = req.body || {};
    const [inserted] = await db
      .insert(termsTemplates)
      .values({
        companyId,
        name: b.name,
        docType: b.docType || 'Purchase Order',
        content: b.content || '',
        isDefault: !!b.isDefault,
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/terms/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const companyId = parseCompanyId(req);
    await db.delete(termsTemplates).where(and(eq(termsTemplates.id, id), eq(termsTemplates.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// GST Compliance Reports (GSTR-1, GSTR-2, GSTR-3B)
app.get('/api/gst/reports', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
    const report = await computeGstComplianceReport(companyId, fromDate, toDate);
    res.json(report);
  } catch (err) {
    handleError(res, err);
  }
});

// SQL Snapshot Backup & Restore
app.post('/api/backup/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    const label = String(req.body?.label || `Manual SQL Snapshot (${new Date().toISOString().slice(0, 16)})`);
    const result = await createCompanySnapshot(companyId, label, req.dbUser!.email);
    await logAudit(req.dbUser!.email, 'SQL Snapshot Created', 'backup', label, companyId);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/api/backup/snapshot/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await getSnapshotPayload(id);
    if (!row) return res.status(404).json({ error: 'Snapshot not found.' });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/backup/restore', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = parseCompanyId(req);
    let payload = req.body?.payload;

    if (!payload && req.body?.snapshotId) {
      const snap = await getSnapshotPayload(Number(req.body.snapshotId));
      if (!snap) return res.status(404).json({ error: 'Snapshot not found.' });
      payload = snap.payload;
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Valid backup snapshot or JSON payload is required.' });
    }

    const bundle = await restoreCompanyFromPayload(companyId, payload, req.dbUser!.email);
    res.json({ ok: true, bundle });
  } catch (err) {
    handleError(res, err);
  }
});

// Users & Access Rights (Admin Only)
app.get('/api/users', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await listUsers();
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { role, active, name, perms, companyIds } = req.body || {};
    const updated = await updateUserPermissions(id, { role, active, name, perms, companyIds });
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    await logAudit(req.dbUser!.email, 'User Rights Updated', 'user', updated.email);
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/users/:id/password', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const newPassword = String(req.body?.newPassword || '');
    const updated = await resetUserPassword(id, newPassword);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    await logAudit(req.dbUser!.email, 'User Password Reset by Admin', 'user', updated.email);
    res.json({ ok: true, user: updated });
  } catch (err) {
    handleError(res, err);
  }
});

// Export Hostinger Shared Hosting (PHP + MySQL) Deployment ZIP Bundle
app.get('/api/export/hostinger-php-bundle', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const distDir = path.resolve(__dirname, 'dist');
    const phpDir = path.resolve(__dirname, 'hostinger-php');

    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      await buildVite({ root: __dirname, logLevel: 'silent' });
    }

    const zip = new JSZip();
    const addDirToZip = (dirPath: string, zipPrefix: string, skipSubdir?: string) => {
      if (!fs.existsSync(dirPath)) return;
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (skipSubdir && entry.name === skipSubdir) continue;
        const fullPath = path.join(dirPath, entry.name);
        const relPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDirToZip(fullPath, relPath);
        } else {
          zip.file(relPath, fs.readFileSync(fullPath));
        }
      }
    };

    addDirToZip(distDir, '', 'src');
    addDirToZip(phpDir, '');

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="vyaparledger-hostinger-php-mysql.zip"');
    res.send(buf);
  } catch (err) {
    handleError(res, err, 'Failed to build Hostinger PHP + MySQL ZIP bundle');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VyaparLedger ERP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
