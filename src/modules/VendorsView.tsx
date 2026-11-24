import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  Edit3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr } from '../lib/api.ts';
import type { GstMasterRow, Vendor } from '../types/erp.ts';

interface VendorsViewProps {
  companyId: number;
  vendors: Vendor[];
  masterData: GstMasterRow[];
  onRefresh: () => Promise<void>;
  onOpenBulkImport: () => void;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

const emptyVendor = (): Partial<Vendor> => ({
  vendorCode: '',
  vendorName: '',
  tradeName: '',
  vendorCategory: 'Supplier',
  contactPerson: '',
  mobile: '',
  email: '',
  gstType: 'Registered - Regular',
  gstin: '',
  gstStatus: '',
  businessConstitution: '',
  pan: '',
  tan: '',
  msmeRegNo: '',
  address: '',
  city: '',
  state: 'Rajasthan',
  stateCode: '08',
  pincode: '',
  country: 'India',
  placeOfSupply: '08-Rajasthan',
  bankName: '',
  bankBranch: '',
  accountNo: '',
  ifscCode: '',
  accountType: 'Current',
  paymentTerms: '30 Days',
  creditLimit: '0',
  openingBalance: '0',
  tdsApplicable: false,
  tdsSection: '',
  tdsRate: '0',
  status: 'Active',
  notes: '',
});

export const VendorsView: React.FC<VendorsViewProps> = ({
  companyId,
  vendors,
  masterData,
  onRefresh,
  onOpenBulkImport,
  onConfirmDelete,
  notify,
}) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const [verifyingGstin, setVerifyingGstin] = useState(false);
  const [lookingUpIfsc, setLookingUpIfsc] = useState(false);
  const [saving, setSaving] = useState(false);

  const states = useMemo(
    () => masterData.filter((m) => m.category === 'state'),
    [masterData]
  );
  const countries = useMemo(
    () => masterData.filter((m) => m.category === 'country'),
    [masterData]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.vendorName, v.tradeName, v.gstin, v.pan, v.mobile, v.city, v.state]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [vendors, search]);

  const handleVerifyGstin = async () => {
    const gstin = String(editing?.gstin || '').trim().toUpperCase();
    if (!gstin) {
      notify('Enter a 15-digit GSTIN first.', true);
      return;
    }
    setVerifyingGstin(true);
    try {
      const res = await apiFetch<any>('/api/gst/verify', {
        method: 'POST',
        body: JSON.stringify({ gstin }),
      });
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              gstin: res.gstin,
              pan: res.pan || prev.pan,
              stateCode: res.stateCode || prev.stateCode,
              state: res.state || prev.state,
              placeOfSupply: res.placeOfSupply || prev.placeOfSupply,
              vendorName: res.legalName || prev.vendorName,
              tradeName: res.tradeName || prev.tradeName,
              gstStatus: res.gstStatus || prev.gstStatus,
              gstType: res.gstType || prev.gstType,
              businessConstitution: res.businessConstitution || prev.businessConstitution,
              address: res.address || prev.address,
              city: res.city || prev.city,
              pincode: res.pincode || prev.pincode,
            }
          : prev
      );
      notify(
        res.remoteFound
          ? `Verified via ${res.source} — form autofilled.`
          : `GSTIN checksum & state (${res.state}) verified. Fill legal name if offline.`
      );
    } catch (err: any) {
      notify(err.message || 'GSTIN verification failed.', true);
    } finally {
      setVerifyingGstin(false);
    }
  };

  const handleLookupIfsc = async () => {
    const ifsc = String(editing?.ifscCode || '').trim().toUpperCase();
    if (!ifsc) {
      notify('Enter an 11-character IFSC code.', true);
      return;
    }
    setLookingUpIfsc(true);
    try {
      const res = await apiFetch<any>(`/api/ifsc/${encodeURIComponent(ifsc)}`);
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              ifscCode: res.ifsc,
              bankName: res.bankName || prev.bankName,
              bankBranch: res.branch || prev.bankBranch,
            }
          : prev
      );
      notify(`Bank details fetched: ${res.bankName}`);
    } catch (err: any) {
      notify(err.message || 'IFSC lookup failed.', true);
    } finally {
      setLookingUpIfsc(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.vendorName?.trim()) {
      notify('Vendor / Legal Name is required.', true);
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await apiFetch(`/api/vendors/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...editing, companyId }),
        });
        notify('Vendor updated.');
      } else {
        await apiFetch('/api/vendors', {
          method: 'POST',
          body: JSON.stringify({ ...editing, companyId }),
        });
        notify('Vendor created in PostgreSQL.');
      }
      await onRefresh();
      setEditing(null);
    } catch (err: any) {
      notify(err.message || 'Failed to save vendor.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    exportRowsToExcel('vendors_master_export.xlsx', [
      {
        name: 'Vendors',
        headers: [
          'Vendor Code',
          'Vendor Name',
          'Trade Name',
          'Category',
          'GSTIN',
          'GST Status',
          'PAN',
          'Mobile',
          'Email',
          'Address',
          'City',
          'State',
          'State Code',
          'Pincode',
          'Country',
          'Bank Name',
          'Account No',
          'IFSC',
          'Payment Terms',
          'Opening Balance',
          'Status',
        ],
        rows: vendors.map((v) => [
          v.vendorCode,
          v.vendorName,
          v.tradeName,
          v.vendorCategory,
          v.gstin,
          v.gstStatus,
          v.pan,
          v.mobile,
          v.email,
          v.address,
          v.city,
          v.state,
          v.stateCode,
          v.pincode,
          v.country,
          v.bankName,
          v.accountNo,
          v.ifscCode,
          v.paymentTerms,
          v.openingBalance,
          v.status,
        ]),
      },
    ]);
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {editing.id ? `Edit Vendor · ${editing.vendorName}` : 'Add New Vendor'}
            </h1>
            <p className="text-xs text-slate-500">
              Enter GSTIN and click Verify & Autofill to pull taxpayer registration details automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              Back to List
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600"
            >
              {saving ? 'Saving…' : 'Save Vendor'}
            </button>
          </div>
        </div>

        {/* GSTIN Verification & Autofill Box */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                GSTIN (15-Character Verification & Autofill)
              </label>
              <input
                type="text"
                maxLength={15}
                value={editing.gstin || ''}
                onChange={(e) => setEditing({ ...editing, gstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 27AABCU9603R1ZM"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <button
              type="button"
              disabled={verifyingGstin}
              onClick={handleVerifyGstin}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {verifyingGstin ? 'Verifying GSTIN…' : 'Verify & Autofill GSTIN'}
            </button>
          </div>
          {editing.gstStatus && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Status: {editing.gstStatus} · Constitution: {editing.businessConstitution || 'N/A'} · State Code: {editing.stateCode}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Vendor / Legal Name *
            </label>
            <input
              type="text"
              required
              value={editing.vendorName || ''}
              onChange={(e) => setEditing({ ...editing, vendorName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Trade Name
            </label>
            <input
              type="text"
              value={editing.tradeName || ''}
              onChange={(e) => setEditing({ ...editing, tradeName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Category
            </label>
            <select
              value={editing.vendorCategory || 'Supplier'}
              onChange={(e) => setEditing({ ...editing, vendorCategory: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option>Supplier</option>
              <option>Contractor</option>
              <option>Service Provider</option>
              <option>Customer & Vendor</option>
              <option>Transporter</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              GST Registration Type
            </label>
            <select
              value={editing.gstType || 'Registered - Regular'}
              onChange={(e) => setEditing({ ...editing, gstType: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option>Registered - Regular</option>
              <option>Registered - Composition</option>
              <option>Unregistered</option>
              <option>SEZ / Export</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">PAN</label>
            <input
              type="text"
              value={editing.pan || ''}
              onChange={(e) => setEditing({ ...editing, pan: e.target.value.toUpperCase() })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              MSME / Udyam No
            </label>
            <input
              type="text"
              value={editing.msmeRegNo || ''}
              onChange={(e) => setEditing({ ...editing, msmeRegNo: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Contact Person
            </label>
            <input
              type="text"
              value={editing.contactPerson || ''}
              onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Mobile</label>
            <input
              type="text"
              value={editing.mobile || ''}
              onChange={(e) => setEditing({ ...editing, mobile: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={editing.email || ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Registered Address
            </label>
            <input
              type="text"
              value={editing.address || ''}
              onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">City</label>
            <input
              type="text"
              value={editing.city || ''}
              onChange={(e) => setEditing({ ...editing, city: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              State & GST Code
            </label>
            <select
              value={editing.state || ''}
              onChange={(e) => {
                const st = states.find((s) => s.name === e.target.value);
                setEditing({
                  ...editing,
                  state: e.target.value,
                  stateCode: st?.code || editing.stateCode,
                  placeOfSupply: st ? `${st.code}-${st.name}` : editing.placeOfSupply,
                });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Select State</option>
              {states.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Pincode</label>
            <input
              type="text"
              value={editing.pincode || ''}
              onChange={(e) => setEditing({ ...editing, pincode: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Country</label>
            <select
              value={editing.country || 'India'}
              onChange={(e) => setEditing({ ...editing, country: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              IFSC Code (Auto-fetch Bank)
            </label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                maxLength={11}
                value={editing.ifscCode || ''}
                onChange={(e) => setEditing({ ...editing, ifscCode: e.target.value.toUpperCase() })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                disabled={lookingUpIfsc}
                onClick={handleLookupIfsc}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
              >
                {lookingUpIfsc ? '…' : 'Fetch'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Bank Name</label>
            <input
              type="text"
              value={editing.bankName || ''}
              onChange={(e) => setEditing({ ...editing, bankName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Bank Account No
            </label>
            <input
              type="text"
              value={editing.accountNo || ''}
              onChange={(e) => setEditing({ ...editing, accountNo: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Opening Balance (INR)
            </label>
            <input
              type="number"
              step="0.01"
              value={editing.openingBalance || '0'}
              onChange={(e) => setEditing({ ...editing, openingBalance: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Payment Terms
            </label>
            <input
              type="text"
              value={editing.paymentTerms || '30 Days'}
              onChange={(e) => setEditing({ ...editing, paymentTerms: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Status</label>
            <select
              value={editing.status || 'Active'}
              onChange={(e) => setEditing({ ...editing, status: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option>Active</option>
              <option>Inactive</option>
              <option>On Hold</option>
            </select>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Vendor Master
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage suppliers, contractors, GSTIN verification autofill, bank mandates, and bulk spreadsheets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Import
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => setEditing(emptyVendor())}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Vendor
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor name, GSTIN, PAN, city..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-800 dark:bg-slate-900"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">No vendors found</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a vendor with instant GSTIN autofill or upload an Excel sheet via Bulk Import.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3">Vendor / Legal Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-right">Opening Bal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{v.vendorName}</div>
                      <div className="text-[11px] text-slate-500">
                        {v.vendorCode} {v.tradeName ? `· ${v.tradeName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{v.vendorCategory}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {v.gstin || 'Unregistered'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {v.stateCode ? `${v.stateCode} · ` : ''}
                      {v.state || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div>{v.mobile || '-'}</div>
                      <div className="text-[11px] text-slate-400">{v.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800 dark:text-slate-200">
                      {fmtInr(v.openingBalance)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          v.status === 'Active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(v)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onConfirmDelete(
                              `Delete Vendor ${v.vendorName}?`,
                              'This removes the vendor from Vendor Master in PostgreSQL.',
                              async () => {
                                await apiFetch(`/api/vendors/${v.id}?companyId=${companyId}`, {
                                  method: 'DELETE',
                                });
                                await onRefresh();
                                notify('Vendor deleted.');
                              }
                            )
                          }
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
