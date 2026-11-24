import React, { useMemo, useState } from 'react';
import { Download, Edit3, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr, fmtNum } from '../lib/api.ts';
import { computeLineItemsTotals, determineSupplyType } from '../lib/gstMasterCatalog.ts';
import { generatePoPdf, generateWoPdf, type PdfOutput } from '../lib/pdfGenerator.ts';
import type {
  Company,
  GstMasterRow,
  InventoryItem,
  PurchaseOrder,
  TermsTemplate,
  Vendor,
  VoucherLineItem,
  WorkOrder,
} from '../types/erp.ts';

interface OrdersViewProps {
  company: Company;
  vendors: Vendor[];
  inventoryItems: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  workOrders: WorkOrder[];
  termsTemplates: TermsTemplate[];
  masterData: GstMasterRow[];
  onRefresh: () => Promise<void>;
  onOpenBulkImport: (entity: 'po' | 'wo') => void;
  onPreviewPdf: (pdf: PdfOutput) => void;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

const emptyLine = (): VoucherLineItem => ({
  id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

export const OrdersView: React.FC<OrdersViewProps> = ({
  company,
  vendors,
  inventoryItems,
  purchaseOrders,
  workOrders,
  termsTemplates,
  masterData,
  onRefresh,
  onOpenBulkImport,
  onPreviewPdf,
  onConfirmDelete,
  notify,
}) => {
  const [tab, setTab] = useState<'po' | 'wo'>('po');
  const [editingPo, setEditingPo] = useState<Partial<PurchaseOrder> | null>(null);
  const [editingWo, setEditingWo] = useState<Partial<WorkOrder> | null>(null);
  const [saving, setSaving] = useState(false);

  const units = useMemo(() => masterData.filter((m) => m.category === 'uqc'), [masterData]);
  const hsnList = useMemo(() => masterData.filter((m) => m.category === 'hsn'), [masterData]);

  const activeItems = editingPo ? editingPo.items || [] : editingWo?.items || [];
  const activeSupplyType = useMemo(() => {
    const sc = editingPo ? editingPo.vendorStateCode : editingWo?.vendorStateCode;
    const gstin = editingPo ? editingPo.vendorGstin : editingWo?.vendorGstin;
    return determineSupplyType(company.stateCode, sc, gstin);
  }, [company.stateCode, editingPo, editingWo]);

  const liveTotals = useMemo(
    () => computeLineItemsTotals(activeItems, [], activeSupplyType),
    [activeItems, activeSupplyType]
  );

  const handleSavePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPo?.vendorName) {
      notify('Select or enter supplier name.', true);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editingPo, companyId: company.id, supplyType: activeSupplyType };
      if (editingPo.id) {
        await apiFetch(`/api/purchase-orders/${editingPo.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Purchase Order updated.');
      } else {
        await apiFetch('/api/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
        notify('Purchase Order created.');
      }
      await onRefresh();
      setEditingPo(null);
    } catch (err: any) {
      notify(err.message || 'Failed saving PO.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWo?.contractorName) {
      notify('Select or enter contractor name.', true);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editingWo, companyId: company.id, supplyType: activeSupplyType };
      if (editingWo.id) {
        await apiFetch(`/api/work-orders/${editingWo.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Work Order updated.');
      } else {
        await apiFetch('/api/work-orders', { method: 'POST', body: JSON.stringify(payload) });
        notify('Work Order created.');
      }
      await onRefresh();
      setEditingWo(null);
    } catch (err: any) {
      notify(err.message || 'Failed saving WO.', true);
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (idx: number, patch: Partial<VoucherLineItem>) => {
    const next = [...activeItems];
    next[idx] = { ...next[idx], ...patch };
    if (editingPo) setEditingPo({ ...editingPo, items: next });
    if (editingWo) setEditingWo({ ...editingWo, items: next });
  };

  const handleExport = () => {
    if (tab === 'po') {
      exportRowsToExcel('purchase_orders_export.xlsx', [
        {
          name: 'Purchase Orders',
          headers: ['PO Number', 'PO Date', 'Vendor', 'GSTIN', 'Supply Type', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Status'],
          rows: purchaseOrders.map((p) => [
            p.poNumber,
            p.poDate,
            p.vendorName,
            p.vendorGstin,
            p.supplyType,
            p.taxableValue,
            p.cgstAmount,
            p.sgstAmount,
            p.igstAmount,
            p.totalAmount,
            p.status,
          ]),
        },
      ]);
    } else {
      exportRowsToExcel('work_orders_export.xlsx', [
        {
          name: 'Work Orders',
          headers: ['WO Number', 'WO Date', 'Contractor', 'GSTIN', 'Site', 'Taxable', 'Total', 'Status'],
          rows: workOrders.map((w) => [
            w.woNumber,
            w.woDate,
            w.contractorName,
            w.vendorGstin,
            w.siteLocation,
            w.taxableValue,
            w.totalAmount,
            w.status,
          ]),
        },
      ]);
    }
  };

  if (editingPo || editingWo) {
    const isPo = !!editingPo;
    return (
      <form onSubmit={isPo ? handleSavePo : handleSaveWo} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {isPo ? (editingPo?.id ? `Edit PO · ${editingPo.poNumber}` : 'New Purchase Order') : editingWo?.id ? `Edit WO · ${editingWo.woNumber}` : 'New Work Order'}
            </h1>
            <p className="text-xs text-slate-500">
              Supply Type: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeSupplyType}</span> ({activeSupplyType === 'Inter-State' ? 'IGST Applied' : 'CGST + SGST Split'})
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingPo(null);
                setEditingWo(null);
              }}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
            >
              {saving ? 'Saving…' : isPo ? 'Save Purchase Order' : 'Save Work Order'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isPo ? 'PO Number' : 'WO Number'}
            </label>
            <input
              type="text"
              required
              value={(isPo ? editingPo?.poNumber : editingWo?.woNumber) || ''}
              onChange={(e) =>
                isPo
                  ? setEditingPo({ ...editingPo, poNumber: e.target.value })
                  : setEditingWo({ ...editingWo, woNumber: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Date</label>
            <input
              type="date"
              required
              value={(isPo ? editingPo?.poDate : editingWo?.woDate) || ''}
              onChange={(e) =>
                isPo
                  ? setEditingPo({ ...editingPo, poDate: e.target.value })
                  : setEditingWo({ ...editingWo, woDate: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isPo ? 'Supplier (Vendor Master)' : 'Contractor (Vendor Master)'}
            </label>
            <select
              value={(isPo ? editingPo?.vendorId : editingWo?.vendorId) || ''}
              onChange={(e) => {
                const v = vendors.find((x) => x.id === Number(e.target.value));
                if (!v) return;
                if (isPo) {
                  setEditingPo({
                    ...editingPo,
                    vendorId: v.id,
                    vendorName: v.vendorName,
                    vendorGstin: v.gstin,
                    vendorState: v.state,
                    vendorStateCode: v.stateCode,
                    vendorAddress: v.address,
                    paymentTerms: v.paymentTerms,
                  });
                } else {
                  setEditingWo({
                    ...editingWo,
                    vendorId: v.id,
                    contractorName: v.vendorName,
                    vendorGstin: v.gstin,
                    vendorState: v.state,
                    vendorStateCode: v.stateCode,
                  });
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Select Vendor…</option>
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
              value={(isPo ? editingPo?.vendorName : editingWo?.contractorName) || ''}
              onChange={(e) =>
                isPo
                  ? setEditingPo({ ...editingPo, vendorName: e.target.value })
                  : setEditingWo({ ...editingWo, contractorName: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Vendor GSTIN</label>
            <input
              type="text"
              value={(isPo ? editingPo?.vendorGstin : editingWo?.vendorGstin) || ''}
              onChange={(e) =>
                isPo
                  ? setEditingPo({ ...editingPo, vendorGstin: e.target.value.toUpperCase() })
                  : setEditingWo({ ...editingWo, vendorGstin: e.target.value.toUpperCase() })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Status</label>
            <select
              value={(isPo ? editingPo?.status : editingWo?.status) || 'Pending'}
              onChange={(e) =>
                isPo
                  ? setEditingPo({ ...editingPo, status: e.target.value })
                  : setEditingWo({ ...editingWo, status: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option>Pending</option>
              <option>Approved</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Line Items & GST Calculation
            </h3>
            <button
              type="button"
              onClick={() => {
                const next = [...activeItems, emptyLine()];
                if (isPo) setEditingPo({ ...editingPo, items: next });
                else setEditingWo({ ...editingWo, items: next });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-2">Pick Item / Description</th>
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
                {activeItems.map((it, idx) => {
                  const computed = liveTotals.items[idx];
                  return (
                    <tr key={it.id || idx}>
                      <td className="min-w-[230px] py-2 pr-2">
                        <div className="flex flex-col gap-1">
                          <select
                            value={it.itemId || ''}
                            onChange={(e) => {
                              const inv = inventoryItems.find((x) => x.id === Number(e.target.value));
                              if (inv) {
                                updateLine(idx, {
                                  itemId: inv.id,
                                  sku: inv.sku,
                                  description: inv.name,
                                  hsnSac: inv.hsnSac,
                                  unit: inv.unit,
                                  rate: Number(inv.purchaseRate) || 0,
                                  gstRate: Number(inv.gstRate) || 18,
                                });
                              }
                            }}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="">-- Optional: Pick Inventory SKU --</option>
                            {inventoryItems.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.sku} · {inv.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            placeholder="Description of goods / work"
                            value={it.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                            className="rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>
                      </td>
                      <td className="w-28 px-2 py-2">
                        <input
                          type="text"
                          list="hsn-datalist"
                          value={it.hsnSac}
                          onChange={(e) => {
                            const match = hsnList.find((h) => h.code === e.target.value);
                            updateLine(idx, {
                              hsnSac: e.target.value,
                              ...(match?.gstRate ? { gstRate: Number(match.gstRate) } : {}),
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
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                      <td className="w-24 px-2 py-2">
                        <select
                          value={it.unit}
                          onChange={(e) => updateLine(idx, { unit: e.target.value })}
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
                          onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                      <td className="w-20 px-2 py-2">
                        <select
                          value={it.gstRate}
                          onChange={(e) => updateLine(idx, { gstRate: Number(e.target.value) })}
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
                        {fmtInr(computed?.totalAmount || 0)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const next = activeItems.filter((_, i) => i !== idx);
                            if (isPo) setEditingPo({ ...editingPo, items: next });
                            else setEditingWo({ ...editingWo, items: next });
                          }}
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
          <datalist id="hsn-datalist">
            {hsnList.map((h) => (
              <option key={h.code} value={h.code}>
                {h.name} ({h.gstRate}%)
              </option>
            ))}
          </datalist>

          <div className="mt-4 flex flex-wrap justify-between gap-6 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="min-w-[280px] flex-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Terms & Conditions
                </label>
                <select
                  onChange={(e) => {
                    const t = termsTemplates.find((x) => x.id === Number(e.target.value));
                    if (t) {
                      if (isPo) setEditingPo({ ...editingPo, termsText: t.content });
                      else setEditingWo({ ...editingWo, termsText: t.content });
                    }
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Insert Terms Template…</option>
                  {termsTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={3}
                value={(isPo ? editingPo?.termsText : editingWo?.termsText) || ''}
                onChange={(e) =>
                  isPo
                    ? setEditingPo({ ...editingPo, termsText: e.target.value })
                    : setEditingWo({ ...editingWo, termsText: e.target.value })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Taxable Value</span>
                <span className="font-mono font-medium">{fmtInr(liveTotals.taxableValue)}</span>
              </div>
              {activeSupplyType === 'Inter-State' ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">IGST</span>
                  <span className="font-mono">{fmtInr(liveTotals.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CGST</span>
                    <span className="font-mono">{fmtInr(liveTotals.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SGST</span>
                    <span className="font-mono">{fmtInr(liveTotals.sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                <span>Grand Total</span>
                <span className="font-mono">{fmtInr(liveTotals.totalAmount)}</span>
              </div>
            </div>
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
            Purchase & Work Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue GST-compliant POs & contractor Work Orders with live PDF generation and bulk Excel import/export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenBulkImport(tab)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Import {tab.toUpperCase()}
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
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              if (tab === 'po') {
                setEditingPo({
                  poNumber: `PO/26-27/${1001 + purchaseOrders.length}`,
                  poDate: today,
                  items: [emptyLine()],
                  status: 'Pending',
                });
              } else {
                setEditingWo({
                  woNumber: `WO/26-27/${1001 + workOrders.length}`,
                  woDate: today,
                  items: [{ ...emptyLine(), hsnSac: '9954' }],
                  status: 'Pending',
                });
              }
            }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New {tab === 'po' ? 'Purchase Order' : 'Work Order'}
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setTab('po')}
          className={`rounded-md px-4 py-1.5 text-xs font-semibold ${
            tab === 'po'
              ? 'bg-slate-900 text-white dark:bg-emerald-600'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          Purchase Orders ({purchaseOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('wo')}
          className={`rounded-md px-4 py-1.5 text-xs font-semibold ${
            tab === 'wo'
              ? 'bg-slate-900 text-white dark:bg-emerald-600'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          Work Orders ({workOrders.length})
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-3">{tab === 'po' ? 'PO No' : 'WO No'}</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">{tab === 'po' ? 'Supplier' : 'Contractor'}</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {(tab === 'po' ? purchaseOrders : workOrders).map((row: any) => {
                const gstSum = Number(row.cgstAmount) + Number(row.sgstAmount) + Number(row.igstAmount);
                return (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {tab === 'po' ? row.poNumber : row.woNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {tab === 'po' ? row.poDate : row.woDate}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {tab === 'po' ? row.vendorName : row.contractorName}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">{row.vendorGstin || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtInr(row.taxableValue)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtInr(gstSum)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fmtInr(row.totalAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">{row.status}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewPdf(
                              tab === 'po' ? generatePoPdf(row, company) : generateWoPdf(row, company)
                            )
                          }
                          className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                          title="Real-time PDF Preview & Download"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => (tab === 'po' ? setEditingPo(row) : setEditingWo(row))}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onConfirmDelete(
                              `Delete ${tab === 'po' ? row.poNumber : row.woNumber}?`,
                              'This permanently deletes the order record from PostgreSQL.',
                              async () => {
                                await apiFetch(
                                  `/api/${tab === 'po' ? 'purchase-orders' : 'work-orders'}/${row.id}?companyId=${company.id}`,
                                  { method: 'DELETE' }
                                );
                                await onRefresh();
                                notify('Order deleted.');
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
