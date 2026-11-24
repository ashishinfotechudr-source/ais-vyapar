import React, { useMemo, useState } from 'react';
import { Download, Edit3, FileText, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr } from '../lib/api.ts';
import { computeLineItemsTotals, determineSupplyType } from '../lib/gstMasterCatalog.ts';
import { generateVoucherPdf, type PdfOutput } from '../lib/pdfGenerator.ts';
import type {
  Company,
  GstMasterRow,
  InventoryItem,
  JournalLine,
  Ledger,
  Vendor,
  Voucher,
  VoucherKind,
  VoucherLineItem,
} from '../types/erp.ts';

interface VouchersViewProps {
  company: Company;
  vouchers: Voucher[];
  vendors: Vendor[];
  inventoryItems: InventoryItem[];
  ledgers: Ledger[];
  masterData: GstMasterRow[];
  onRefresh: () => Promise<void>;
  onOpenBulkImport: () => void;
  onPreviewPdf: (pdf: PdfOutput) => void;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

const VOUCHER_KINDS: Array<{ id: VoucherKind | 'all'; label: string }> = [
  { id: 'all', label: 'All Vouchers' },
  { id: 'sales', label: 'Sales / Tax Invoice' },
  { id: 'proforma', label: 'Proforma Invoice' },
  { id: 'service', label: 'Service Invoice' },
  { id: 'purchase', label: 'Purchase Voucher' },
  { id: 'receipt', label: 'Receipt Voucher' },
  { id: 'payment', label: 'Payment Voucher' },
  { id: 'journal', label: 'Journal Voucher' },
];

const emptyItem = (): VoucherLineItem => ({
  id: `vi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  description: '',
  hsnSac: '',
  qty: 1,
  unit: 'NOS',
  rate: 0,
  discount: 0,
  taxableValue: 0,
  gstRate: 18,
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  totalAmount: 0,
});

export const VouchersView: React.FC<VouchersViewProps> = ({
  company,
  vouchers,
  vendors,
  inventoryItems,
  ledgers,
  masterData,
  onRefresh,
  onOpenBulkImport,
  onPreviewPdf,
  onConfirmDelete,
  notify,
}) => {
  const [kindFilter, setKindFilter] = useState<VoucherKind | 'all'>('all');
  const [editing, setEditing] = useState<Partial<Voucher> | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifyingPartyGstin, setVerifyingPartyGstin] = useState(false);

  const states = useMemo(() => masterData.filter((m) => m.category === 'state'), [masterData]);
  const units = useMemo(() => masterData.filter((m) => m.category === 'uqc'), [masterData]);
  const hsnList = useMemo(() => masterData.filter((m) => m.category === 'hsn'), [masterData]);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return vouchers;
    return vouchers.filter((v) => v.voucherKind === kindFilter);
  }, [vouchers, kindFilter]);

  const supplyType = useMemo(
    () => determineSupplyType(company.stateCode, editing?.partyStateCode, editing?.partyGstin),
    [company.stateCode, editing?.partyStateCode, editing?.partyGstin]
  );

  const itemTotals = useMemo(
    () => computeLineItemsTotals(editing?.items || [], editing?.charges || [], supplyType),
    [editing?.items, editing?.charges, supplyType]
  );

  const handlePartyGstinVerify = async () => {
    const gstin = String(editing?.partyGstin || '').trim().toUpperCase();
    if (!gstin) return;
    setVerifyingPartyGstin(true);
    try {
      const res = await apiFetch<any>('/api/gst/verify', {
        method: 'POST',
        body: JSON.stringify({ gstin }),
      });
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              partyGstin: res.gstin,
              partyName: res.legalName || prev.partyName,
              partyState: res.state || prev.partyState,
              partyStateCode: res.stateCode || prev.partyStateCode,
              partyAddress: res.address || prev.partyAddress,
              placeOfSupply: res.placeOfSupply || prev.placeOfSupply,
            }
          : prev
      );
      notify(`GSTIN verified (${res.stateCode}-${res.state}).`);
    } catch (err: any) {
      notify(err.message || 'GSTIN verification failed.', true);
    } finally {
      setVerifyingPartyGstin(false);
    }
  };

  const startNewVoucher = (kind: VoucherKind) => {
    const today = new Date().toISOString().slice(0, 10);
    const prefixMap: Record<VoucherKind, string> = {
      sales: 'INV/26-27/',
      proforma: 'PI/26-27/',
      service: 'SRV/26-27/',
      purchase: 'PUR/26-27/',
      receipt: 'RCP/26-27/',
      payment: 'PAY/26-27/',
      journal: 'JV/26-27/',
    };
    const count = vouchers.filter((v) => v.voucherKind === kind).length + 1001;
    setEditing({
      voucherKind: kind,
      voucherNo: `${prefixMap[kind]}${count}`,
      voucherDate: today,
      partyName: kind === 'journal' ? 'Journal Adjustment' : '',
      partyState: company.state || 'Rajasthan',
      partyStateCode: company.stateCode || '08',
      invoiceType: 'B2B',
      reverseCharge: false,
      itcEligibility: 'Eligible',
      paymentMode: 'Bank Transfer',
      items: ['sales', 'purchase', 'proforma', 'service'].includes(kind) ? [emptyItem()] : [],
      journalLines:
        kind === 'journal'
          ? [
              { id: 'jl-1', ledgerName: ledgers[0]?.name || 'Cash Account', drAmount: 0, crAmount: 0 },
              { id: 'jl-2', ledgerName: ledgers[1]?.name || 'Primary Bank Account', drAmount: 0, crAmount: 0 },
            ]
          : [],
      totalAmount: '0',
      status: 'Posted',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.voucherNo || !editing.voucherKind) return;

    if (editing.voucherKind === 'journal') {
      const lines = editing.journalLines || [];
      const dr = lines.reduce((s, l) => s + (Number(l.drAmount) || 0), 0);
      const cr = lines.reduce((s, l) => s + (Number(l.crAmount) || 0), 0);
      if (Math.abs(dr - cr) > 0.01) {
        notify(`Journal Debit (${dr}) must equal Credit (${cr}).`, true);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = { ...editing, companyId: company.id, supplyType };
      if (editing.id) {
        await apiFetch(`/api/vouchers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Voucher updated.');
      } else {
        await apiFetch('/api/vouchers', { method: 'POST', body: JSON.stringify(payload) });
        notify('Voucher posted to PostgreSQL.');
      }
      await onRefresh();
      setEditing(null);
    } catch (err: any) {
      notify(err.message || 'Failed saving voucher.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleExportAll = () => {
    exportRowsToExcel('all_vouchers_export.xlsx', [
      {
        name: 'Vouchers',
        headers: [
          'Kind',
          'Voucher No',
          'Date',
          'Party Name',
          'Party GSTIN',
          'State',
          'Supply Type',
          'Invoice Type',
          'RCM',
          'Taxable Value',
          'CGST',
          'SGST',
          'IGST',
          'Total Amount',
          'Narration',
          'Status',
        ],
        rows: filtered.map((v) => [
          v.voucherKind,
          v.voucherNo,
          v.voucherDate,
          v.partyName,
          v.partyGstin,
          v.partyState,
          v.supplyType,
          v.invoiceType,
          v.reverseCharge ? 'Yes' : 'No',
          v.taxableValue,
          v.cgstAmount,
          v.sgstAmount,
          v.igstAmount,
          v.totalAmount,
          v.narration,
          v.status,
        ]),
      },
    ]);
  };

  if (editing) {
    const kind = (editing.voucherKind || 'sales') as VoucherKind;
    const isItemized = ['sales', 'purchase', 'proforma', 'service'].includes(kind);

    return (
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {editing.id ? `Edit ${kind.toUpperCase()} · ${editing.voucherNo}` : `New ${kind.toUpperCase()} Voucher`}
            </h1>
            <p className="text-xs text-slate-500">
              Place of Supply: {editing.partyStateCode || '08'}-{editing.partyState || company.state} · {supplyType}
            </p>
          </div>
          <div className="flex gap-2">
            {editing.id && (
              <button
                type="button"
                onClick={() => onPreviewPdf(generateVoucherPdf(editing as Voucher, company))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
              >
                <FileText className="h-3.5 w-3.5" />
                Live PDF Preview
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
            >
              {saving ? 'Posting…' : 'Save & Post Voucher'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Voucher No *</label>
            <input
              type="text"
              required
              value={editing.voucherNo || ''}
              onChange={(e) => setEditing({ ...editing, voucherNo: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Voucher Date *</label>
            <input
              type="date"
              required
              value={editing.voucherDate || ''}
              onChange={(e) => setEditing({ ...editing, voucherDate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Select Party (from Vendors)
            </label>
            <select
              value={editing.partyId || ''}
              onChange={(e) => {
                const v = vendors.find((x) => x.id === Number(e.target.value));
                if (v) {
                  setEditing({
                    ...editing,
                    partyId: v.id,
                    partyName: v.vendorName,
                    partyGstin: v.gstin,
                    partyState: v.state,
                    partyStateCode: v.stateCode,
                    partyAddress: v.address,
                    placeOfSupply: `${v.stateCode || '08'}-${v.state || 'Rajasthan'}`,
                  });
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Manual / Custom Party…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendorName} {v.gstin ? `(${v.gstin})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Party Name *</label>
            <input
              type="text"
              required
              value={editing.partyName || ''}
              onChange={(e) => setEditing({ ...editing, partyName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Party GSTIN (Verify & Autofill)
            </label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                maxLength={15}
                value={editing.partyGstin || ''}
                onChange={(e) => setEditing({ ...editing, partyGstin: e.target.value.toUpperCase() })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                disabled={verifyingPartyGstin}
                onClick={handlePartyGstinVerify}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {verifyingPartyGstin ? '…' : 'Verify'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Place of Supply State
            </label>
            <select
              value={editing.partyState || ''}
              onChange={(e) => {
                const st = states.find((s) => s.name === e.target.value);
                setEditing({
                  ...editing,
                  partyState: e.target.value,
                  partyStateCode: st?.code || '08',
                  placeOfSupply: st ? `${st.code}-${st.name}` : e.target.value,
                });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {states.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>

          {isItemized && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  GST Invoice Type
                </label>
                <select
                  value={editing.invoiceType || 'B2B'}
                  onChange={(e) => setEditing({ ...editing, invoiceType: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="B2B">B2B (Registered)</option>
                  <option value="B2CL">B2CL (Large Unregistered Inter-State &gt;2.5L)</option>
                  <option value="B2CS">B2CS (Small Unregistered)</option>
                  <option value="EXP">Export Invoice</option>
                  <option value="NIL">Nil / Exempt Rated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  ITC Eligibility (Purchases)
                </label>
                <select
                  value={editing.itcEligibility || 'Eligible'}
                  onChange={(e) => setEditing({ ...editing, itcEligibility: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="Eligible">Eligible Input / Service ITC</option>
                  <option value="Capital Goods">Capital Goods ITC</option>
                  <option value="Ineligible">Ineligible (Sec 17(5) Blocked Credit)</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  id="rcm-check"
                  type="checkbox"
                  checked={!!editing.reverseCharge}
                  onChange={(e) => setEditing({ ...editing, reverseCharge: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label htmlFor="rcm-check" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reverse Charge (RCM Applicable)
                </label>
              </div>
            </>
          )}
        </div>

        {isItemized && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Invoice Line Items
              </h3>
              <button
                type="button"
                onClick={() => setEditing({ ...editing, items: [...(editing.items || []), emptyItem()] })}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-2">Item / Description</th>
                    <th className="px-2 py-2">HSN/SAC</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">UQC</th>
                    <th className="px-2 py-2">Rate</th>
                    <th className="px-2 py-2">GST %</th>
                    <th className="px-2 py-2 text-right">Line Total</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(editing.items || []).map((it, idx) => {
                    const calc = itemTotals.items[idx];
                    const update = (patch: Partial<VoucherLineItem>) => {
                      const next = [...(editing.items || [])];
                      next[idx] = { ...next[idx], ...patch };
                      setEditing({ ...editing, items: next });
                    };
                    return (
                      <tr key={it.id || idx}>
                        <td className="min-w-[220px] py-2 pr-2">
                          <select
                            value={it.itemId || ''}
                            onChange={(e) => {
                              const inv = inventoryItems.find((x) => x.id === Number(e.target.value));
                              if (inv) {
                                update({
                                  itemId: inv.id,
                                  sku: inv.sku,
                                  description: inv.name,
                                  hsnSac: inv.hsnSac,
                                  unit: inv.unit,
                                  rate:
                                    kind === 'purchase'
                                      ? Number(inv.purchaseRate) || 0
                                      : Number(inv.sellingRate) || Number(inv.purchaseRate) || 0,
                                  gstRate: Number(inv.gstRate) || 18,
                                });
                              }
                            }}
                            className="mb-1 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="">-- Optional: Pick Inventory SKU --</option>
                            {inventoryItems.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.sku} · {inv.name} (Stock: {inv.currentStock})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            value={it.description}
                            onChange={(e) => update({ description: e.target.value })}
                            placeholder="Description"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </td>
                        <td className="w-28 px-2 py-2">
                          <input
                            type="text"
                            list="voucher-hsn-list"
                            value={it.hsnSac}
                            onChange={(e) => {
                              const m = hsnList.find((h) => h.code === e.target.value);
                              update({
                                hsnSac: e.target.value,
                                ...(m?.gstRate ? { gstRate: Number(m.gstRate) } : {}),
                              });
                            }}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </td>
                        <td className="w-20 px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={it.qty}
                            onChange={(e) => update({ qty: Number(e.target.value) })}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </td>
                        <td className="w-24 px-2 py-2">
                          <select
                            value={it.unit}
                            onChange={(e) => update({ unit: e.target.value })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          >
                            {units.map((u) => (
                              <option key={u.code} value={u.code}>
                                {u.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="w-28 px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={it.rate}
                            onChange={(e) => update({ rate: Number(e.target.value) })}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </td>
                        <td className="w-20 px-2 py-2">
                          <select
                            value={it.gstRate}
                            onChange={(e) => update({ gstRate: Number(e.target.value) })}
                            className="w-full rounded border border-slate-300 px-1.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          >
                            {[0, 5, 12, 18, 28].map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-semibold">
                          {fmtInr(calc?.totalAmount || 0)}
                        </td>
                        <td className="py-2 pl-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                ...editing,
                                items: (editing.items || []).filter((_, i) => i !== idx),
                              })
                            }
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="voucher-hsn-list">
              {hsnList.map((h) => (
                <option key={h.code} value={h.code}>
                  {h.name} ({h.gstRate}%)
                </option>
              ))}
            </datalist>

            <div className="mt-4 flex flex-wrap justify-between gap-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="min-w-[260px] flex-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Narration / Remarks
                </label>
                <textarea
                  rows={2}
                  value={editing.narration || ''}
                  onChange={(e) => setEditing({ ...editing, narration: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="w-full max-w-xs space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Taxable Value</span>
                  <span className="font-mono">{fmtInr(itemTotals.taxableValue)}</span>
                </div>
                {supplyType === 'Inter-State' ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">IGST</span>
                    <span className="font-mono">{fmtInr(itemTotals.igstAmount)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CGST</span>
                      <span className="font-mono">{fmtInr(itemTotals.cgstAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SGST</span>
                      <span className="font-mono">{fmtInr(itemTotals.sgstAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                  <span>Invoice Total</span>
                  <span className="font-mono">{fmtInr(itemTotals.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {(kind === 'receipt' || kind === 'payment') && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Amount (INR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={editing.totalAmount || '0'}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    totalAmount: e.target.value,
                    taxableValue: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Payment Mode
              </label>
              <select
                value={editing.paymentMode || 'NEFT'}
                onChange={(e) => setEditing({ ...editing, paymentMode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option>NEFT</option>
                <option>RTGS</option>
                <option>IMPS / UPI</option>
                <option>Cheque</option>
                <option>Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Ref / UTR / Cheque No
              </label>
              <input
                type="text"
                value={editing.refNo || ''}
                onChange={(e) => setEditing({ ...editing, refNo: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Narration</label>
              <input
                type="text"
                value={editing.narration || ''}
                onChange={(e) => setEditing({ ...editing, narration: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
        )}

        {kind === 'journal' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Double-Entry Journal Lines</h3>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    journalLines: [
                      ...(editing.journalLines || []),
                      { id: `jl-${Date.now()}`, ledgerName: ledgers[0]?.name || '', drAmount: 0, crAmount: 0 },
                    ],
                  })
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                + Add Line
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="py-2">Ledger Account</th>
                  <th className="px-2 py-2">Narration</th>
                  <th className="px-2 py-2 text-right">Debit (Dr)</th>
                  <th className="px-2 py-2 text-right">Credit (Cr)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(editing.journalLines || []).map((jl: JournalLine, idx: number) => {
                  const upd = (p: Partial<JournalLine>) => {
                    const next = [...(editing.journalLines || [])];
                    next[idx] = { ...next[idx], ...p };
                    setEditing({ ...editing, journalLines: next });
                  };
                  return (
                    <tr key={jl.id || idx}>
                      <td className="py-2 pr-2">
                        <select
                          value={jl.ledgerName}
                          onChange={(e) => upd({ ledgerName: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          {ledgers.map((l) => (
                            <option key={l.id} value={l.name}>
                              {l.name} ({l.groupName})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={jl.narration || ''}
                          onChange={(e) => upd({ narration: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                      <td className="w-32 px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={jl.drAmount}
                          onChange={(e) => upd({ drAmount: Number(e.target.value) })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                      <td className="w-32 px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={jl.crAmount}
                          onChange={(e) => upd({ crAmount: Number(e.target.value) })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              journalLines: (editing.journalLines || []).filter((_, i) => i !== idx),
                            })
                          }
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Accounting & GST Vouchers
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sales/Tax Invoices, Proforma, Purchase, Receipt, Payment & Journal Vouchers with real-time PDF export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Import Vouchers
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => startNewVoucher(kindFilter === 'all' ? 'sales' : kindFilter)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Create {kindFilter === 'all' ? 'Tax Invoice' : kindFilter.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VOUCHER_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKindFilter(k.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              kindFilter === k.id
                ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-600 dark:bg-emerald-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-3">Voucher No</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Party Name</th>
                <th className="px-4 py-3">GSTIN / Supply</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((v) => {
                const gst = Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount);
                return (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {v.voucherNo}
                    </td>
                    <td className="px-4 py-3 uppercase text-slate-600 dark:text-slate-400">{v.voucherKind}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{v.voucherDate}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{v.partyName}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {v.partyGstin || 'Unregistered'} · {v.supplyType}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtInr(v.taxableValue)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtInr(gst)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {fmtInr(v.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onPreviewPdf(generateVoucherPdf(v, company))}
                          className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                          title="Real-time PDF Invoice"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(v)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onConfirmDelete(
                              `Delete Voucher ${v.voucherNo}?`,
                              'This removes the voucher permanently from PostgreSQL and updates GST calculations.',
                              async () => {
                                await apiFetch(`/api/vouchers/${v.id}?companyId=${company.id}`, {
                                  method: 'DELETE',
                                });
                                await onRefresh();
                                notify('Voucher deleted.');
                              }
                            )
                          }
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No vouchers match this filter. Create a new voucher or use Bulk Import.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
