import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  accountGroups,
  auditLogs,
  bills,
  companies,
  dbSnapshots,
  gatePasses,
  gstMasterData,
  inventoryItems,
  inventoryMovements,
  ledgers,
  paymentSheets,
  purchaseOrders,
  termsTemplates,
  vendors,
  vouchers,
  warehouses,
  workOrders,
} from './schema.ts';
import {
  GSTN_UQC_UNITS,
  HSN_SAC_CATALOG,
  INDIAN_STATES,
  ISO_COUNTRIES,
  round2,
} from '../lib/gstMasterCatalog.ts';

const DEFAULT_GROUPS = [
  { name: 'Capital Account', nature: 'Liability', parentGroup: 'Primary', isSystem: true },
  { name: 'Current Liabilities', nature: 'Liability', parentGroup: 'Primary', isSystem: true },
  { name: 'Sundry Creditors', nature: 'Liability', parentGroup: 'Current Liabilities', isSystem: true },
  { name: 'Duties & Taxes', nature: 'Liability', parentGroup: 'Current Liabilities', isSystem: true },
  { name: 'Fixed Assets', nature: 'Asset', parentGroup: 'Primary', isSystem: true },
  { name: 'Current Assets', nature: 'Asset', parentGroup: 'Primary', isSystem: true },
  { name: 'Sundry Debtors', nature: 'Asset', parentGroup: 'Current Assets', isSystem: true },
  { name: 'Bank Accounts', nature: 'Asset', parentGroup: 'Current Assets', isSystem: true },
  { name: 'Cash-in-Hand', nature: 'Asset', parentGroup: 'Current Assets', isSystem: true },
  { name: 'Closing Stock', nature: 'Asset', parentGroup: 'Current Assets', isSystem: true },
  { name: 'Sales Accounts', nature: 'Income', parentGroup: 'Primary', isSystem: true },
  { name: 'Direct Incomes', nature: 'Income', parentGroup: 'Primary', isSystem: true },
  { name: 'Indirect Incomes', nature: 'Income', parentGroup: 'Primary', isSystem: true },
  { name: 'Purchase Accounts', nature: 'Expense', parentGroup: 'Primary', isSystem: true },
  { name: 'Direct Expenses', nature: 'Expense', parentGroup: 'Primary', isSystem: true },
  { name: 'Indirect Expenses', nature: 'Expense', parentGroup: 'Primary', isSystem: true },
];

const DEFAULT_LEDGERS = [
  { name: 'Cash Account', groupName: 'Cash-in-Hand', nature: 'Asset', openingBalance: '0', openingType: 'Dr' },
  { name: 'Primary Bank Account', groupName: 'Bank Accounts', nature: 'Asset', openingBalance: '0', openingType: 'Dr' },
  { name: 'Sales - GST Local & Inter-State', groupName: 'Sales Accounts', nature: 'Income', openingBalance: '0', openingType: 'Cr' },
  { name: 'Purchase - GST Local & Inter-State', groupName: 'Purchase Accounts', nature: 'Expense', openingBalance: '0', openingType: 'Dr' },
  { name: 'Output CGST', groupName: 'Duties & Taxes', nature: 'Liability', openingBalance: '0', openingType: 'Cr' },
  { name: 'Output SGST', groupName: 'Duties & Taxes', nature: 'Liability', openingBalance: '0', openingType: 'Cr' },
  { name: 'Output IGST', groupName: 'Duties & Taxes', nature: 'Liability', openingBalance: '0', openingType: 'Cr' },
  { name: 'Input CGST (ITC)', groupName: 'Duties & Taxes', nature: 'Asset', openingBalance: '0', openingType: 'Dr' },
  { name: 'Input SGST (ITC)', groupName: 'Duties & Taxes', nature: 'Asset', openingBalance: '0', openingType: 'Dr' },
  { name: 'Input IGST (ITC)', groupName: 'Duties & Taxes', nature: 'Asset', openingBalance: '0', openingType: 'Dr' },
  { name: 'TDS Payable', groupName: 'Duties & Taxes', nature: 'Liability', openingBalance: '0', openingType: 'Cr' },
  { name: 'Freight & Forwarding', groupName: 'Direct Expenses', nature: 'Expense', openingBalance: '0', openingType: 'Dr' },
  { name: 'Office & Admin Expenses', groupName: 'Indirect Expenses', nature: 'Expense', openingBalance: '0', openingType: 'Dr' },
];

const DEFAULT_TERMS = [
  {
    name: 'Standard PO Terms',
    docType: 'Purchase Order',
    content:
      '1. Delivery must be completed within the agreed schedule at the designated warehouse.\n2. Tax Invoice showing HSN/SAC, GSTIN, and PO reference must accompany each consignment.\n3. Goods found damaged or deviating from specifications shall be rejected at supplier cost.\n4. Payment will be released within 30 days of GRN verification and quality inspection.',
    isDefault: true,
  },
  {
    name: 'Standard Work Order Terms',
    docType: 'Work Order',
    content:
      '1. All work shall comply with safety norms, statutory PF/ESIC rules, and site engineer instructions.\n2. TDS as applicable under Income Tax Act shall be deducted from running/final bills.\n3. Retention of 5% may apply until defect liability clearance.',
    isDefault: true,
  },
  {
    name: 'Tax Invoice Terms',
    docType: 'Sales Invoice',
    content:
      '1. Goods once sold will not be taken back unless defective.\n2. Interest @18% p.a. will be charged on delayed payments beyond due date.\n3. Subject to local jurisdiction only.',
    isDefault: true,
  },
];

export async function logAudit(
  actorEmail: string,
  action: string,
  entityType: string,
  detail: string,
  companyId?: number | null
) {
  try {
    await db.insert(auditLogs).values({
      companyId: companyId ?? null,
      actorEmail,
      action,
      entityType,
      detail,
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export async function seedGstMasterDataIfEmpty() {
  try {
    const existing = await db.select().from(gstMasterData).limit(1);
    if (existing.length > 0) return;

    const rows: Array<typeof gstMasterData.$inferInsert> = [
      ...INDIAN_STATES.map((s) => ({
        category: 'state',
        code: s.code,
        name: s.name,
        description: `${s.type} (${s.alphaCode})`,
        extra: { alphaCode: s.alphaCode, type: s.type },
        source: 'GSTN / GSTZen Master Data',
      })),
      ...GSTN_UQC_UNITS.map((u) => ({
        category: 'uqc',
        code: u.code,
        name: u.name,
        description: u.description,
        extra: {},
        source: 'GSTN / GSTZen Master Data',
      })),
      ...ISO_COUNTRIES.map((c) => ({
        category: 'country',
        code: c.code,
        name: c.name,
        description: c.currency ? `Currency: ${c.currency}` : 'ISO Country',
        extra: { currency: c.currency || '' },
        source: 'GSTN / GSTZen Master Data',
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
        source: 'GSTN / GSTZen Master Data',
      })),
    ];

    for (const row of rows) {
      await db
        .insert(gstMasterData)
        .values(row)
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error('Failed seeding GST master data:', error);
    throw new Error('Failed to initialize GST master data.', { cause: error });
  }
}

export async function bootstrapCompanyDefaults(companyId: number) {
  try {
    const existingWh = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.companyId, companyId));
    if (existingWh.length === 0) {
      await db.insert(warehouses).values([
        {
          companyId,
          code: 'WH-MAIN',
          name: 'Main Central Warehouse',
          location: 'Primary Facility',
          state: 'Rajasthan',
          inCharge: 'Store Manager',
          isDefault: true,
          active: true,
        },
      ]);
    }

    const existingGroups = await db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.companyId, companyId));
    if (existingGroups.length === 0) {
      await db
        .insert(accountGroups)
        .values(DEFAULT_GROUPS.map((g) => ({ ...g, companyId })));
    }

    const existingLedgers = await db
      .select()
      .from(ledgers)
      .where(eq(ledgers.companyId, companyId));
    if (existingLedgers.length === 0) {
      await db
        .insert(ledgers)
        .values(DEFAULT_LEDGERS.map((l) => ({ ...l, companyId })));
    }

    const existingTerms = await db
      .select()
      .from(termsTemplates)
      .where(eq(termsTemplates.companyId, companyId));
    if (existingTerms.length === 0) {
      await db
        .insert(termsTemplates)
        .values(DEFAULT_TERMS.map((t) => ({ ...t, companyId })));
    }
  } catch (error) {
    console.error('Failed bootstrapping company defaults:', error);
    throw new Error('Failed to initialize company defaults.', { cause: error });
  }
}

export async function getOrCreateDefaultCompany(ownerUid: string, email: string) {
  try {
    await seedGstMasterDataIfEmpty();
    const list = await db
      .select()
      .from(companies)
      .where(eq(companies.deleted, false));

    if (list.length > 0) {
      return list;
    }

    const inserted = await db
      .insert(companies)
      .values({
        code: `CO-${Date.now().toString(36).toUpperCase()}`,
        name: 'Default Enterprise Pvt. Ltd.',
        legalName: 'Default Enterprise Private Limited',
        state: 'Rajasthan',
        stateCode: '08',
        country: 'India',
        email,
        ownerUid,
        numbering: {
          po: { prefix: 'PO/26-27/', nextNo: 1001 },
          wo: { prefix: 'WO/26-27/', nextNo: 1001 },
          sales: { prefix: 'INV/26-27/', nextNo: 1001 },
          purchase: { prefix: 'PUR/26-27/', nextNo: 1001 },
          proforma: { prefix: 'PI/26-27/', nextNo: 1001 },
          receipt: { prefix: 'RCP/26-27/', nextNo: 1001 },
          payment: { prefix: 'PAY/26-27/', nextNo: 1001 },
          journal: { prefix: 'JV/26-27/', nextNo: 1001 },
          bill: { prefix: 'BL/26-27/', nextNo: 1001 },
          sheet: { prefix: 'PS/26-27/', nextNo: 1001 },
          gatepass: { prefix: 'GP/26-27/', nextNo: 1001 },
        },
      })
      .returning();

    await bootstrapCompanyDefaults(inserted[0].id);
    return inserted;
  } catch (error) {
    console.error('Failed loading companies:', error);
    throw new Error('Failed to load companies.', { cause: error });
  }
}

export async function createCompany(data: {
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  state?: string;
  stateCode?: string;
  address?: string;
  city?: string;
  pincode?: string;
  email?: string;
  phone?: string;
  ownerUid: string;
}) {
  try {
    const inserted = await db
      .insert(companies)
      .values({
        code: `CO-${Date.now().toString(36).toUpperCase()}`,
        name: data.name,
        legalName: data.legalName || data.name,
        gstin: data.gstin || '',
        pan: data.pan || '',
        state: data.state || 'Rajasthan',
        stateCode: data.stateCode || '08',
        address: data.address || '',
        city: data.city || '',
        pincode: data.pincode || '',
        email: data.email || '',
        phone: data.phone || '',
        ownerUid: data.ownerUid,
        numbering: {
          po: { prefix: 'PO/26-27/', nextNo: 1001 },
          wo: { prefix: 'WO/26-27/', nextNo: 1001 },
          sales: { prefix: 'INV/26-27/', nextNo: 1001 },
          purchase: { prefix: 'PUR/26-27/', nextNo: 1001 },
          proforma: { prefix: 'PI/26-27/', nextNo: 1001 },
          receipt: { prefix: 'RCP/26-27/', nextNo: 1001 },
          payment: { prefix: 'PAY/26-27/', nextNo: 1001 },
          journal: { prefix: 'JV/26-27/', nextNo: 1001 },
          bill: { prefix: 'BL/26-27/', nextNo: 1001 },
          sheet: { prefix: 'PS/26-27/', nextNo: 1001 },
          gatepass: { prefix: 'GP/26-27/', nextNo: 1001 },
        },
      })
      .returning();

    await bootstrapCompanyDefaults(inserted[0].id);
    return inserted[0];
  } catch (error) {
    console.error('Create company failed:', error);
    throw new Error('Failed to create company.', { cause: error });
  }
}

export async function updateCompanyProfile(
  companyId: number,
  patch: Partial<typeof companies.$inferInsert>
) {
  try {
    const updated = await db
      .update(companies)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();
    return updated[0] || null;
  } catch (error) {
    console.error('Update company failed:', error);
    throw new Error('Failed to update company profile.', { cause: error });
  }
}

export async function getCompanyBundle(companyId: number) {
  try {
    const [
      [company],
      vendorRows,
      warehouseRows,
      itemRows,
      movementRows,
      poRows,
      woRows,
      voucherRows,
      billRows,
      sheetRows,
      gpRows,
      groupRows,
      ledgerRows,
      termsRows,
      auditRows,
      snapshotRows,
    ] = await Promise.all([
      db.select().from(companies).where(eq(companies.id, companyId)),
      db.select().from(vendors).where(eq(vendors.companyId, companyId)).orderBy(desc(vendors.id)),
      db.select().from(warehouses).where(eq(warehouses.companyId, companyId)).orderBy(warehouses.id),
      db.select().from(inventoryItems).where(eq(inventoryItems.companyId, companyId)).orderBy(desc(inventoryItems.id)),
      db.select().from(inventoryMovements).where(eq(inventoryMovements.companyId, companyId)).orderBy(desc(inventoryMovements.id)),
      db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, companyId)).orderBy(desc(purchaseOrders.id)),
      db.select().from(workOrders).where(eq(workOrders.companyId, companyId)).orderBy(desc(workOrders.id)),
      db.select().from(vouchers).where(eq(vouchers.companyId, companyId)).orderBy(desc(vouchers.id)),
      db.select().from(bills).where(eq(bills.companyId, companyId)).orderBy(desc(bills.id)),
      db.select().from(paymentSheets).where(eq(paymentSheets.companyId, companyId)).orderBy(desc(paymentSheets.id)),
      db.select().from(gatePasses).where(eq(gatePasses.companyId, companyId)).orderBy(desc(gatePasses.id)),
      db.select().from(accountGroups).where(eq(accountGroups.companyId, companyId)).orderBy(accountGroups.id),
      db.select().from(ledgers).where(eq(ledgers.companyId, companyId)).orderBy(ledgers.id),
      db.select().from(termsTemplates).where(eq(termsTemplates.companyId, companyId)).orderBy(termsTemplates.id),
      db.select().from(auditLogs).where(eq(auditLogs.companyId, companyId)).orderBy(desc(auditLogs.id)).limit(150),
      db
        .select({
          id: dbSnapshots.id,
          companyId: dbSnapshots.companyId,
          label: dbSnapshots.label,
          createdBy: dbSnapshots.createdBy,
          recordCount: dbSnapshots.recordCount,
          createdAt: dbSnapshots.createdAt,
        })
        .from(dbSnapshots)
        .orderBy(desc(dbSnapshots.id))
        .limit(40),
    ]);

    return {
      company,
      vendors: vendorRows,
      warehouses: warehouseRows,
      inventoryItems: itemRows,
      inventoryMovements: movementRows,
      purchaseOrders: poRows,
      workOrders: woRows,
      vouchers: voucherRows,
      bills: billRows,
      paymentSheets: sheetRows,
      gatePasses: gpRows,
      accountGroups: groupRows,
      ledgers: ledgerRows,
      termsTemplates: termsRows,
      auditLogs: auditRows,
      snapshots: snapshotRows,
    };
  } catch (error) {
    console.error('Failed loading company ERP bundle:', error);
    throw new Error('Failed to load ERP workspace data.', { cause: error });
  }
}

export async function getMasterData(category?: string, query?: string) {
  try {
    await seedGstMasterDataIfEmpty();
    const conditions = [];
    if (category) {
      conditions.push(eq(gstMasterData.category, category));
    }
    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      conditions.push(
        or(
          ilike(gstMasterData.code, q),
          ilike(gstMasterData.name, q),
          ilike(gstMasterData.description, q)
        )
      );
    }

    if (conditions.length > 0) {
      return await db
        .select()
        .from(gstMasterData)
        .where(and(...conditions))
        .orderBy(gstMasterData.category, gstMasterData.code);
    }
    return await db
      .select()
      .from(gstMasterData)
      .orderBy(gstMasterData.category, gstMasterData.code);
  } catch (error) {
    console.error('Failed loading GST master data:', error);
    throw new Error('Failed to load GST master data.', { cause: error });
  }
}

export async function upsertMasterDataEntries(
  entries: Array<typeof gstMasterData.$inferInsert>
) {
  try {
    let count = 0;
    for (const entry of entries) {
      await db
        .insert(gstMasterData)
        .values(entry)
        .onConflictDoUpdate({
          target: [gstMasterData.category, gstMasterData.code],
          set: {
            name: entry.name,
            description: entry.description || '',
            gstRate: entry.gstRate ?? null,
            cgstRate: entry.cgstRate ?? null,
            sgstRate: entry.sgstRate ?? null,
            igstRate: entry.igstRate ?? null,
            extra: entry.extra ?? {},
            source: entry.source || 'GSTZen Live Sync',
            syncedAt: new Date(),
          },
        });
      count++;
    }
    return count;
  } catch (error) {
    console.error('Upsert master data failed:', error);
    throw new Error('Failed to save master data.', { cause: error });
  }
}

export async function recordInventoryMovement(
  companyId: number,
  input: typeof inventoryMovements.$inferInsert
) {
  try {
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.companyId, companyId)));
    if (!item) {
      throw new Error('Inventory item not found.');
    }

    const qty = Number(input.qty) || 0;
    const curStock = Number(item.currentStock) || 0;
    let nextStock = curStock;
    let nextPurchaseRate = Number(item.purchaseRate) || 0;

    if (input.movementType === 'IN_GRN' || input.movementType === 'OPENING') {
      nextStock = round2(curStock + qty);
      if (item.valuationMethod === 'Weighted Average' && Number(input.unitRate) > 0 && nextStock > 0) {
        const prevVal = Math.max(0, curStock) * nextPurchaseRate;
        const addVal = qty * (Number(input.unitRate) || 0);
        nextPurchaseRate = round2((prevVal + addVal) / nextStock);
      }
    } else if (input.movementType === 'OUT_ISSUE') {
      nextStock = round2(curStock - qty);
    } else if (input.movementType === 'ADJUSTMENT') {
      nextStock = round2(curStock + qty);
    }

    const inserted = await db
      .insert(inventoryMovements)
      .values({
        ...input,
        companyId,
        totalValue: String(round2(Math.abs(qty) * (Number(input.unitRate) || 0))),
      })
      .returning();

    await db
      .update(inventoryItems)
      .set({
        currentStock: String(nextStock),
        purchaseRate: String(nextPurchaseRate),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));

    return inserted[0];
  } catch (error) {
    console.error('Inventory movement failed:', error);
    throw new Error('Failed to record inventory movement.', { cause: error });
  }
}

export async function computeGstComplianceReport(
  companyId: number,
  fromDate?: string,
  toDate?: string
) {
  try {
    const allVouchers = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.companyId, companyId));
    const allBills = await db
      .select()
      .from(bills)
      .where(eq(bills.companyId, companyId));

    const inRange = (d?: string) => {
      if (!d) return true;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    const salesDocs = allVouchers.filter(
      (v) => v.voucherKind === 'sales' && v.status !== 'Cancelled' && inRange(v.voucherDate)
    );
    const purchaseDocs = allVouchers.filter(
      (v) => v.voucherKind === 'purchase' && v.status !== 'Cancelled' && inRange(v.voucherDate)
    );
    const billDocs = allBills.filter(
      (b) => b.status !== 'Cancelled' && inRange(b.billDate)
    );

    // GSTR-1 classification: B2B (with GSTIN), B2CL (Inter-state > 2,50,000 without GSTIN), B2CS (rest without GSTIN), EXP, NIL
    const gstr1B2B = salesDocs.filter((v) => v.partyGstin && v.partyGstin.trim().length === 15 && v.invoiceType !== 'EXP');
    const gstr1B2CL = salesDocs.filter(
      (v) =>
        (!v.partyGstin || v.partyGstin.trim().length < 15) &&
        v.supplyType === 'Inter-State' &&
        Number(v.totalAmount) > 250000
    );
    const gstr1B2CS = salesDocs.filter(
      (v) =>
        (!v.partyGstin || v.partyGstin.trim().length < 15) &&
        !(v.supplyType === 'Inter-State' && Number(v.totalAmount) > 250000) &&
        v.invoiceType !== 'NIL' &&
        v.invoiceType !== 'EXP'
    );
    const gstr1Exports = salesDocs.filter((v) => v.invoiceType === 'EXP');

    // GSTR-1 HSN Summary
    const hsnMap = new Map<
      string,
      {
        hsn: string;
        uqc: string;
        qty: number;
        taxableValue: number;
        igst: number;
        cgst: number;
        sgst: number;
        cess: number;
        totalValue: number;
      }
    >();

    for (const v of salesDocs) {
      for (const item of v.items || []) {
        const key = `${item.hsnSac || 'NA'}__${item.unit || 'NOS'}`;
        const existing = hsnMap.get(key) || {
          hsn: item.hsnSac || 'NA',
          uqc: item.unit || 'NOS',
          qty: 0,
          taxableValue: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
          totalValue: 0,
        };
        existing.qty = round2(existing.qty + (Number(item.qty) || 0));
        existing.taxableValue = round2(existing.taxableValue + (Number(item.taxableValue) || 0));
        existing.igst = round2(existing.igst + (Number(item.igstAmount) || 0));
        existing.cgst = round2(existing.cgst + (Number(item.cgstAmount) || 0));
        existing.sgst = round2(existing.sgst + (Number(item.sgstAmount) || 0));
        existing.cess = round2(existing.cess + (Number(item.cessAmount) || 0));
        existing.totalValue = round2(existing.totalValue + (Number(item.totalAmount) || 0));
        hsnMap.set(key, existing);
      }
    }

    // GSTR-2 Inward supplies (Purchase Vouchers + GST Bills)
    const gstr2Entries = [
      ...purchaseDocs.map((p) => ({
        id: `pv-${p.id}`,
        docNo: p.voucherNo,
        docDate: p.voucherDate,
        supplierName: p.partyName,
        supplierGstin: p.partyGstin || '',
        state: p.partyState || '',
        supplyType: p.supplyType || 'Intra-State',
        reverseCharge: !!p.reverseCharge,
        itcEligibility: p.itcEligibility || 'Eligible',
        taxableValue: Number(p.taxableValue) || 0,
        cgst: Number(p.cgstAmount) || 0,
        sgst: Number(p.sgstAmount) || 0,
        igst: Number(p.igstAmount) || 0,
        cess: Number(p.cessAmount) || 0,
        totalValue: Number(p.totalAmount) || 0,
      })),
      ...billDocs
        .filter((b) => Number(b.gstAmount) > 0)
        .map((b) => ({
          id: `bl-${b.id}`,
          docNo: b.docNo || b.billNo,
          docDate: b.docDate || b.billDate,
          supplierName: b.vendorName,
          supplierGstin: b.vendorGstin || '',
          state: '',
          supplyType: Number(b.igstAmount) > 0 ? 'Inter-State' : 'Intra-State',
          reverseCharge: false,
          itcEligibility: b.vendorGstin ? 'Eligible' : 'Ineligible',
          taxableValue: Number(b.amount) || 0,
          cgst: Number(b.cgstAmount) || round2((Number(b.gstAmount) || 0) / 2),
          sgst: Number(b.sgstAmount) || round2((Number(b.gstAmount) || 0) / 2),
          igst: Number(b.igstAmount) || 0,
          cess: 0,
          totalValue: round2((Number(b.amount) || 0) + (Number(b.gstAmount) || 0)),
        })),
    ];

    // GSTR-3B Section 3.1 Outward + RCM
    const outwardTaxable = round2(
      salesDocs.filter((v) => !v.reverseCharge).reduce((s, v) => s + (Number(v.taxableValue) || 0), 0)
    );
    const outwardIgst = round2(
      salesDocs.filter((v) => !v.reverseCharge).reduce((s, v) => s + (Number(v.igstAmount) || 0), 0)
    );
    const outwardCgst = round2(
      salesDocs.filter((v) => !v.reverseCharge).reduce((s, v) => s + (Number(v.cgstAmount) || 0), 0)
    );
    const outwardSgst = round2(
      salesDocs.filter((v) => !v.reverseCharge).reduce((s, v) => s + (Number(v.sgstAmount) || 0), 0)
    );
    const outwardCess = round2(
      salesDocs.filter((v) => !v.reverseCharge).reduce((s, v) => s + (Number(v.cessAmount) || 0), 0)
    );

    const rcmInward = gstr2Entries.filter((e) => e.reverseCharge);
    const rcmTaxable = round2(rcmInward.reduce((s, e) => s + e.taxableValue, 0));
    const rcmIgst = round2(rcmInward.reduce((s, e) => s + e.igst, 0));
    const rcmCgst = round2(rcmInward.reduce((s, e) => s + e.cgst, 0));
    const rcmSgst = round2(rcmInward.reduce((s, e) => s + e.sgst, 0));

    // Eligible ITC (Section 4) - requires Registered GSTIN & Eligible status (Section 16 / Rule 36(4))
    const eligibleItc = gstr2Entries.filter(
      (e) => e.itcEligibility !== 'Ineligible' && (e.supplierGstin.length === 15 || e.reverseCharge)
    );
    const itcIgst = round2(eligibleItc.reduce((s, e) => s + e.igst, 0));
    const itcCgst = round2(eligibleItc.reduce((s, e) => s + e.cgst, 0));
    const itcSgst = round2(eligibleItc.reduce((s, e) => s + e.sgst, 0));
    const itcCess = round2(eligibleItc.reduce((s, e) => s + e.cess, 0));

    const ineligibleItc = gstr2Entries.filter(
      (e) => e.itcEligibility === 'Ineligible' || (e.supplierGstin.length !== 15 && !e.reverseCharge)
    );

    // GSTR-3B Section 6.1 Optimal Tax Payment & ITC Utilization Order (Rule 88A):
    // 1) IGST ITC must be exhausted first: against IGST -> CGST -> SGST
    // 2) CGST ITC against CGST -> IGST (cannot cross-utilize against SGST)
    // 3) SGST ITC against SGST -> IGST (cannot cross-utilize against CGST)
    // 4) RCM liability MUST be paid in Cash (Section 49(4))
    let remOutIgst = outwardIgst;
    let remOutCgst = outwardCgst;
    let remOutSgst = outwardSgst;

    let remItcIgst = itcIgst;
    let remItcCgst = itcCgst;
    let remItcSgst = itcSgst;

    const igstByIgst = Math.min(remOutIgst, remItcIgst);
    remOutIgst = round2(remOutIgst - igstByIgst);
    remItcIgst = round2(remItcIgst - igstByIgst);

    const cgstByIgst = Math.min(remOutCgst, remItcIgst);
    remOutCgst = round2(remOutCgst - cgstByIgst);
    remItcIgst = round2(remItcIgst - cgstByIgst);

    const sgstByIgst = Math.min(remOutSgst, remItcIgst);
    remOutSgst = round2(remOutSgst - sgstByIgst);
    remItcIgst = round2(remItcIgst - sgstByIgst);

    const cgstByCgst = Math.min(remOutCgst, remItcCgst);
    remOutCgst = round2(remOutCgst - cgstByCgst);
    remItcCgst = round2(remItcCgst - cgstByCgst);

    const igstByCgst = Math.min(remOutIgst, remItcCgst);
    remOutIgst = round2(remOutIgst - igstByCgst);
    remItcCgst = round2(remItcCgst - igstByCgst);

    const sgstBySgst = Math.min(remOutSgst, remItcSgst);
    remOutSgst = round2(remOutSgst - sgstBySgst);
    remItcSgst = round2(remItcSgst - sgstBySgst);

    const igstBySgst = Math.min(remOutIgst, remItcSgst);
    remOutIgst = round2(remOutIgst - igstBySgst);
    remItcSgst = round2(remItcSgst - igstBySgst);

    const cessByCess = Math.min(outwardCess, itcCess);
    const cashCess = round2(outwardCess - cessByCess);

    const cashIgst = round2(remOutIgst + rcmIgst);
    const cashCgst = round2(remOutCgst + rcmCgst);
    const cashSgst = round2(remOutSgst + rcmSgst);

    return {
      period: { fromDate: fromDate || 'All', toDate: toDate || 'All' },
      gstr1: {
        summary: {
          totalInvoices: salesDocs.length,
          taxableValue: round2(salesDocs.reduce((s, v) => s + (Number(v.taxableValue) || 0), 0)),
          cgst: round2(salesDocs.reduce((s, v) => s + (Number(v.cgstAmount) || 0), 0)),
          sgst: round2(salesDocs.reduce((s, v) => s + (Number(v.sgstAmount) || 0), 0)),
          igst: round2(salesDocs.reduce((s, v) => s + (Number(v.igstAmount) || 0), 0)),
          cess: round2(salesDocs.reduce((s, v) => s + (Number(v.cessAmount) || 0), 0)),
          totalValue: round2(salesDocs.reduce((s, v) => s + (Number(v.totalAmount) || 0), 0)),
        },
        b2b: gstr1B2B,
        b2cl: gstr1B2CL,
        b2cs: gstr1B2CS,
        exports: gstr1Exports,
        hsnSummary: Array.from(hsnMap.values()),
      },
      gstr2: {
        summary: {
          totalRecords: gstr2Entries.length,
          taxableValue: round2(gstr2Entries.reduce((s, e) => s + e.taxableValue, 0)),
          cgst: round2(gstr2Entries.reduce((s, e) => s + e.cgst, 0)),
          sgst: round2(gstr2Entries.reduce((s, e) => s + e.sgst, 0)),
          igst: round2(gstr2Entries.reduce((s, e) => s + e.igst, 0)),
          eligibleItcTotal: round2(itcIgst + itcCgst + itcSgst + itcCess),
          ineligibleItcTotal: round2(
            ineligibleItc.reduce((s, e) => s + e.igst + e.cgst + e.sgst + e.cess, 0)
          ),
        },
        entries: gstr2Entries,
      },
      gstr3b: {
        table3_1: {
          outwardTaxable: {
            taxableValue: outwardTaxable,
            igst: outwardIgst,
            cgst: outwardCgst,
            sgst: outwardSgst,
            cess: outwardCess,
          },
          inwardRcm: {
            taxableValue: rcmTaxable,
            igst: rcmIgst,
            cgst: rcmCgst,
            sgst: rcmSgst,
            cess: 0,
          },
        },
        table4: {
          eligibleItc: {
            igst: itcIgst,
            cgst: itcCgst,
            sgst: itcSgst,
            cess: itcCess,
          },
          ineligibleCount: ineligibleItc.length,
        },
        table6_1: {
          offset: {
            igst: { paidByIgst: igstByIgst, paidByCgst: igstByCgst, paidBySgst: igstBySgst, paidInCash: cashIgst },
            cgst: { paidByIgst: cgstByIgst, paidByCgst: cgstByCgst, paidBySgst: 0, paidInCash: cashCgst },
            sgst: { paidByIgst: sgstByIgst, paidByCgst: 0, paidBySgst: sgstBySgst, paidInCash: cashSgst },
            cess: { paidByCess: cessByCess, paidInCash: cashCess },
          },
          closingItcBalance: {
            igst: remItcIgst,
            cgst: remItcCgst,
            sgst: remItcSgst,
            cess: round2(itcCess - cessByCess),
          },
          totalNetCashPayable: round2(cashIgst + cashCgst + cashSgst + cashCess),
        },
      },
    };
  } catch (error) {
    console.error('GST compliance calculation failed:', error);
    throw new Error('Failed to compute GST reports.', { cause: error });
  }
}

export async function createCompanySnapshot(
  companyId: number,
  label: string,
  createdBy: string
) {
  try {
    const bundle = await getCompanyBundle(companyId);
    const { snapshots: _ignoreSnapshots, auditLogs: _ignoreAudit, ...exportData } = bundle;
    const recordCount =
      bundle.vendors.length +
      bundle.warehouses.length +
      bundle.inventoryItems.length +
      bundle.inventoryMovements.length +
      bundle.purchaseOrders.length +
      bundle.workOrders.length +
      bundle.vouchers.length +
      bundle.bills.length +
      bundle.paymentSheets.length +
      bundle.gatePasses.length +
      bundle.ledgers.length +
      bundle.termsTemplates.length;

    const inserted = await db
      .insert(dbSnapshots)
      .values({
        companyId,
        label,
        createdBy,
        recordCount,
        payload: exportData,
      })
      .returning({
        id: dbSnapshots.id,
        companyId: dbSnapshots.companyId,
        label: dbSnapshots.label,
        createdBy: dbSnapshots.createdBy,
        recordCount: dbSnapshots.recordCount,
        createdAt: dbSnapshots.createdAt,
      });

    return { snapshot: inserted[0], data: exportData };
  } catch (error) {
    console.error('Snapshot creation failed:', error);
    throw new Error('Failed to create database snapshot.', { cause: error });
  }
}

export async function getSnapshotPayload(snapshotId: number) {
  try {
    const [row] = await db
      .select()
      .from(dbSnapshots)
      .where(eq(dbSnapshots.id, snapshotId));
    return row || null;
  } catch (error) {
    console.error('Fetch snapshot failed:', error);
    throw new Error('Failed to load snapshot.', { cause: error });
  }
}

export async function restoreCompanyFromPayload(
  companyId: number,
  payload: Record<string, any>,
  actorEmail: string
) {
  try {
    // Take automatic safety backup before restoring
    await createCompanySnapshot(companyId, `Pre-Restore Auto Backup (${new Date().toISOString().slice(0, 16)})`, actorEmail);

    await db.transaction(async (tx) => {
      // Clear company-scoped operational tables cleanly
      await tx.delete(inventoryMovements).where(eq(inventoryMovements.companyId, companyId));
      await tx.delete(inventoryItems).where(eq(inventoryItems.companyId, companyId));
      await tx.delete(warehouses).where(eq(warehouses.companyId, companyId));
      await tx.delete(purchaseOrders).where(eq(purchaseOrders.companyId, companyId));
      await tx.delete(workOrders).where(eq(workOrders.companyId, companyId));
      await tx.delete(vouchers).where(eq(vouchers.companyId, companyId));
      await tx.delete(bills).where(eq(bills.companyId, companyId));
      await tx.delete(paymentSheets).where(eq(paymentSheets.companyId, companyId));
      await tx.delete(gatePasses).where(eq(gatePasses.companyId, companyId));
      await tx.delete(vendors).where(eq(vendors.companyId, companyId));
      await tx.delete(ledgers).where(eq(ledgers.companyId, companyId));
      await tx.delete(accountGroups).where(eq(accountGroups.companyId, companyId));
      await tx.delete(termsTemplates).where(eq(termsTemplates.companyId, companyId));

      if (payload.company && typeof payload.company === 'object') {
        const c = payload.company;
        await tx
          .update(companies)
          .set({
            name: c.name || undefined,
            legalName: c.legalName ?? '',
            gstin: c.gstin ?? '',
            pan: c.pan ?? '',
            tan: c.tan ?? '',
            address: c.address ?? '',
            city: c.city ?? '',
            state: c.state ?? 'Rajasthan',
            stateCode: c.stateCode ?? '08',
            pincode: c.pincode ?? '',
            email: c.email ?? '',
            phone: c.phone ?? '',
            logoUrl: c.logoUrl ?? '',
            signatureUrl: c.signatureUrl ?? '',
            banks: Array.isArray(c.banks) ? c.banks : [],
            numbering: c.numbering || {},
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      }

      const stripId = <T extends Record<string, any>>(rows: T[] | undefined) =>
        (Array.isArray(rows) ? rows : []).map(({ id: _id, createdAt: _c, updatedAt: _u, companyId: _cid, ...rest }) => ({
          ...rest,
          companyId,
        }));

      const whList = stripId(payload.warehouses);
      if (whList.length) await tx.insert(warehouses).values(whList as any);

      const vendorList = stripId(payload.vendors);
      if (vendorList.length) await tx.insert(vendors).values(vendorList as any);

      const itemIdMap = new Map<number, number>();
      const rawItems = Array.isArray(payload.inventoryItems) ? payload.inventoryItems : [];
      for (const rawItem of rawItems) {
        const oldId = rawItem.id;
        const { id: _id, createdAt: _c, updatedAt: _u, companyId: _cid, ...rest } = rawItem;
        const [ins] = await tx
          .insert(inventoryItems)
          .values({ ...rest, companyId } as any)
          .returning({ id: inventoryItems.id });
        if (oldId && ins) itemIdMap.set(oldId, ins.id);
      }

      const rawMovs = Array.isArray(payload.inventoryMovements) ? payload.inventoryMovements : [];
      const movsToInsert = rawMovs
        .map((m: any) => {
          const { id: _id, createdAt: _c, companyId: _cid, ...rest } = m;
          const mappedItemId = itemIdMap.get(m.itemId) || m.itemId;
          return { ...rest, itemId: mappedItemId, companyId };
        })
        .filter((m: any) => itemIdMap.size === 0 || itemIdMap.has(m.itemId) || typeof m.itemId === 'number');
      if (movsToInsert.length) {
        for (const m of movsToInsert) {
          if (itemIdMap.size > 0 && !Array.from(itemIdMap.values()).includes(m.itemId)) continue;
          await tx.insert(inventoryMovements).values(m as any);
        }
      }

      const poList = stripId(payload.purchaseOrders);
      if (poList.length) await tx.insert(purchaseOrders).values(poList as any);

      const woList = stripId(payload.workOrders);
      if (woList.length) await tx.insert(workOrders).values(woList as any);

      const voucherList = stripId(payload.vouchers);
      if (voucherList.length) await tx.insert(vouchers).values(voucherList as any);

      const billList = stripId(payload.bills);
      if (billList.length) await tx.insert(bills).values(billList as any);

      const sheetList = stripId(payload.paymentSheets);
      if (sheetList.length) await tx.insert(paymentSheets).values(sheetList as any);

      const gpList = stripId(payload.gatePasses);
      if (gpList.length) await tx.insert(gatePasses).values(gpList as any);

      const grpList = stripId(payload.accountGroups);
      if (grpList.length) await tx.insert(accountGroups).values(grpList as any);

      const ldgList = stripId(payload.ledgers);
      if (ldgList.length) await tx.insert(ledgers).values(ldgList as any);

      const termList = stripId(payload.termsTemplates);
      if (termList.length) await tx.insert(termsTemplates).values(termList as any);
    });

    await logAudit(actorEmail, 'Database Restored', 'snapshot', `Restored company #${companyId} from SQL backup`, companyId);
    return await getCompanyBundle(companyId);
  } catch (error) {
    console.error('Database restore failed:', error);
    throw new Error('Failed to restore database snapshot.', { cause: error });
  }
}
