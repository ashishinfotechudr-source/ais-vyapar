import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  Edit3,
  FileText,
  Package,
  Plus,
  Trash2,
  Upload,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr, fmtNum } from '../lib/api.ts';
import {
  generateGatePassPdf,
  generateStockValuationPdf,
  type PdfOutput,
} from '../lib/pdfGenerator.ts';
import type {
  Company,
  GatePass,
  GstMasterRow,
  InventoryItem,
  InventoryMovement,
  Vendor,
  Warehouse,
} from '../types/erp.ts';

interface InventoryViewProps {
  company: Company;
  items: InventoryItem[];
  movements: InventoryMovement[];
  warehouses: Warehouse[];
  gatePasses: GatePass[];
  vendors: Vendor[];
  masterData: GstMasterRow[];
  onRefresh: () => Promise<void>;
  onOpenBulkImport: () => void;
  onPreviewPdf: (pdf: PdfOutput) => void;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  company,
  items,
  movements,
  warehouses,
  gatePasses,
  vendors,
  masterData,
  onRefresh,
  onOpenBulkImport,
  onPreviewPdf,
  onConfirmDelete,
  notify,
}) => {
  const [subTab, setSubTab] = useState<'items' | 'movements' | 'warehouses' | 'gatepasses'>('items');
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem> | null>(null);
  const [newMove, setNewMove] = useState<Partial<InventoryMovement> | null>(null);
  const [newWh, setNewWh] = useState({ name: '', code: '', location: '', inCharge: '' });
  const [newGp, setNewGp] = useState<Partial<GatePass> | null>(null);
  const [saving, setSaving] = useState(false);

  const units = useMemo(() => masterData.filter((m) => m.category === 'uqc'), [masterData]);
  const hsnList = useMemo(() => masterData.filter((m) => m.category === 'hsn'), [masterData]);

  const totalStockValue = useMemo(
    () => items.reduce((s, it) => s + (Number(it.currentStock) || 0) * (Number(it.purchaseRate) || 0), 0),
    [items]
  );

  const lowStockCount = useMemo(
    () => items.filter((it) => Number(it.reorderLevel) > 0 && Number(it.currentStock) <= Number(it.reorderLevel)).length,
    [items]
  );

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name) return;
    setSaving(true);
    try {
      const payload = { ...editingItem, companyId: company.id };
      if (editingItem.id) {
        await apiFetch(`/api/inventory/items/${editingItem.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Inventory item updated.');
      } else {
        await apiFetch('/api/inventory/items', { method: 'POST', body: JSON.stringify(payload) });
        notify('Inventory SKU added.');
      }
      await onRefresh();
      setEditingItem(null);
    } catch (err: any) {
      notify(err.message || 'Failed saving item.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMove?.itemId || !newMove.qty) {
      notify('Select an item and enter quantity.', true);
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({ ...newMove, companyId: company.id }),
      });
      await onRefresh();
      setNewMove(null);
      notify('Stock movement posted & stock valuation updated.');
    } catch (err: any) {
      notify(err.message || 'Failed recording movement.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWh.name.trim()) return;
    try {
      await apiFetch('/api/warehouses', {
        method: 'POST',
        body: JSON.stringify({ ...newWh, companyId: company.id }),
      });
      setNewWh({ name: '', code: '', location: '', inCharge: '' });
      await onRefresh();
      notify('Warehouse created.');
    } catch (err: any) {
      notify(err.message || 'Failed creating warehouse.', true);
    }
  };

  const handleSaveGatePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGp?.partyName) return;
    try {
      await apiFetch('/api/gate-passes', {
        method: 'POST',
        body: JSON.stringify({ ...newGp, companyId: company.id }),
      });
      setNewGp(null);
      await onRefresh();
      notify('Gate Pass issued.');
    } catch (err: any) {
      notify(err.message || 'Failed issuing Gate Pass.', true);
    }
  };

  const handleExportInventory = () => {
    exportRowsToExcel('advanced_inventory_export.xlsx', [
      {
        name: 'Inventory Master',
        headers: [
          'SKU',
          'Item Name',
          'Category',
          'HSN/SAC',
          'GST %',
          'UQC',
          'Valuation Method',
          'Current Stock',
          'Min Stock',
          'Reorder Level',
          'Max Stock',
          'Avg Purchase Rate',
          'Selling Rate',
          'Stock Valuation',
          'Bin Location',
        ],
        rows: items.map((it) => [
          it.sku,
          it.name,
          it.category,
          it.hsnSac,
          it.gstRate,
          it.unit,
          it.valuationMethod,
          it.currentStock,
          it.minStock,
          it.reorderLevel,
          it.maxStock,
          it.purchaseRate,
          it.sellingRate,
          (Number(it.currentStock) * Number(it.purchaseRate)).toFixed(2),
          it.binLocation,
        ]),
      },
      {
        name: 'Stock Movements',
        headers: ['Entry No', 'Date', 'Type', 'Item ID', 'Batch No', 'Expiry', 'Qty', 'Unit Rate', 'Total Value', 'Ref Doc'],
        rows: movements.map((m) => [
          m.entryNo,
          m.entryDate,
          m.movementType,
          m.itemId,
          m.batchNo,
          m.expiryDate,
          m.qty,
          m.unitRate,
          m.totalValue,
          m.refDocNo,
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Advanced Inventory Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Multi-warehouse SKUs, Batch & Serial tracking, Weighted Average/FIFO valuation, Reorder alerts, & Gate Passes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5" /> Bulk Import
          </button>
          <button
            type="button"
            onClick={handleExportInventory}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
          <button
            type="button"
            onClick={() => onPreviewPdf(generateStockValuationPdf(items, company))}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-400"
          >
            <FileText className="h-3.5 w-3.5" /> Valuation PDF
          </button>
          <button
            type="button"
            onClick={() =>
              setEditingItem({
                sku: `SKU-${1001 + items.length}`,
                category: 'Raw Material',
                itemType: 'Goods',
                unit: 'NOS',
                gstRate: '18',
                valuationMethod: 'Weighted Average',
                warehouseId: warehouses[0]?.id || null,
                batchTracked: false,
                serialTracked: false,
                active: true,
              })
            }
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add SKU
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-slate-500">Total Stock Valuation</p>
          <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
            {fmtInr(totalStockValue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-slate-500">Active SKUs & Warehouses</p>
          <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
            {items.length} SKUs · {warehouses.length} WH
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-slate-500">Reorder Alerts</p>
          <p className={`mt-1 font-mono text-xl font-bold ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {lowStockCount} Item(s) Low
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { id: 'items', label: `Item Master (${items.length})` },
          { id: 'movements', label: `GRN / Issue / Transfers (${movements.length})` },
          { id: 'warehouses', label: `Warehouses (${warehouses.length})` },
          { id: 'gatepasses', label: `Gate Passes (${gatePasses.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              subTab === t.id
                ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-600 dark:bg-emerald-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {editingItem && (
        <form
          onSubmit={handleSaveItem}
          className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5 dark:border-emerald-900 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">{editingItem.id ? 'Edit Inventory SKU' : 'New Inventory SKU'}</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-emerald-600"
              >
                Save Item
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">SKU Code *</label>
              <input
                type="text"
                required
                value={editingItem.sku || ''}
                onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Item Name *</label>
              <input
                type="text"
                required
                value={editingItem.name || ''}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Category</label>
              <select
                value={editingItem.category || 'Raw Material'}
                onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option>Raw Material</option>
                <option>Finished Goods</option>
                <option>Consumables</option>
                <option>Packing Material</option>
                <option>Capital Asset</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">HSN / SAC</label>
              <input
                type="text"
                list="inv-hsn-list"
                value={editingItem.hsnSac || ''}
                onChange={(e) => {
                  const m = hsnList.find((h) => h.code === e.target.value);
                  setEditingItem({
                    ...editingItem,
                    hsnSac: e.target.value,
                    ...(m?.gstRate ? { gstRate: m.gstRate } : {}),
                  });
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">GST Rate %</label>
              <select
                value={editingItem.gstRate || '18'}
                onChange={(e) => setEditingItem({ ...editingItem, gstRate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {['0', '5', '12', '18', '28'].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Primary UQC</label>
              <select
                value={editingItem.unit || 'NOS'}
                onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} - {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Valuation Method</label>
              <select
                value={editingItem.valuationMethod || 'Weighted Average'}
                onChange={(e) => setEditingItem({ ...editingItem, valuationMethod: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option>Weighted Average</option>
                <option>FIFO</option>
                <option>Standard Cost</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Purchase Rate</label>
              <input
                type="number"
                step="0.01"
                value={editingItem.purchaseRate || '0'}
                onChange={(e) => setEditingItem({ ...editingItem, purchaseRate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Selling Rate</label>
              <input
                type="number"
                step="0.01"
                value={editingItem.sellingRate || '0'}
                onChange={(e) => setEditingItem({ ...editingItem, sellingRate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Opening Stock</label>
              <input
                type="number"
                step="0.01"
                value={editingItem.openingStock || '0'}
                onChange={(e) => setEditingItem({ ...editingItem, openingStock: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Reorder Level</label>
              <input
                type="number"
                step="0.01"
                value={editingItem.reorderLevel || '0'}
                onChange={(e) => setEditingItem({ ...editingItem, reorderLevel: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pt-1 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!editingItem.batchTracked}
                onChange={(e) => setEditingItem({ ...editingItem, batchTracked: e.target.checked })}
              />
              Batch & Expiry Tracking
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!editingItem.serialTracked}
                onChange={(e) => setEditingItem({ ...editingItem, serialTracked: e.target.checked })}
              />
              Serial Number Tracking
            </label>
          </div>
          <datalist id="inv-hsn-list">
            {hsnList.map((h) => (
              <option key={h.code} value={h.code}>
                {h.name} ({h.gstRate}%)
              </option>
            ))}
          </datalist>
        </form>
      )}

      {subTab === 'items' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {items.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">No inventory SKUs yet</p>
              <p className="mt-1 text-xs text-slate-500">Add an SKU or upload your catalog via Bulk Import.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">HSN / GST</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Reorder</th>
                    <th className="px-4 py-3 text-right">Avg Cost</th>
                    <th className="px-4 py-3 text-right">Valuation</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {items.map((it) => {
                    const isLow =
                      Number(it.reorderLevel) > 0 && Number(it.currentStock) <= Number(it.reorderLevel);
                    const val = Number(it.currentStock) * Number(it.purchaseRate);
                    return (
                      <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono font-semibold">{it.sku}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{it.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {it.category}
                            {it.batchTracked ? ' · Batch' : ''}
                            {it.serialTracked ? ' · Serial' : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                          {it.hsnSac || '-'} · {it.gstRate}%
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{it.valuationMethod}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          <span className={isLow ? 'text-red-600' : ''}>
                            {isLow && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />}
                            {fmtNum(it.currentStock, 2)} {it.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">
                          {fmtNum(it.reorderLevel, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmtInr(it.purchaseRate)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{fmtInr(val)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSubTab('movements');
                                setNewMove({
                                  movementType: 'IN_GRN',
                                  itemId: it.id,
                                  warehouseId: it.warehouseId || warehouses[0]?.id || null,
                                  entryDate: new Date().toISOString().slice(0, 10),
                                  qty: '1',
                                  unitRate: it.purchaseRate,
                                });
                              }}
                              className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                              title="Record GRN / Issue"
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItem(it)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onConfirmDelete(
                                  `Delete SKU ${it.sku}?`,
                                  'Removes the item and its movement history from PostgreSQL.',
                                  async () => {
                                    await apiFetch(`/api/inventory/items/${it.id}?companyId=${company.id}`, {
                                      method: 'DELETE',
                                    });
                                    await onRefresh();
                                    notify('Item deleted.');
                                  }
                                )
                              }
                              className="rounded p-1.5 text-slate-400 hover:text-red-600"
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
          )}
        </div>
      )}

      {subTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setNewMove({
                  movementType: 'IN_GRN',
                  entryDate: new Date().toISOString().slice(0, 10),
                  itemId: items[0]?.id,
                  warehouseId: warehouses[0]?.id || null,
                  qty: '1',
                  unitRate: items[0]?.purchaseRate || '0',
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              <Plus className="h-3.5 w-3.5" /> Record Stock Entry (GRN / Issue / Transfer)
            </button>
          </div>

          {newMove && (
            <form
              onSubmit={handleRecordMovement}
              className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <label className="block text-xs font-semibold">Movement Type</label>
                <select
                  value={newMove.movementType}
                  onChange={(e) => setNewMove({ ...newMove, movementType: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="IN_GRN">Material In (GRN)</option>
                  <option value="OUT_ISSUE">Material Issue Out</option>
                  <option value="TRANSFER">Warehouse Transfer</option>
                  <option value="ADJUSTMENT">Stock Adjustment (+/-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold">Inventory SKU *</label>
                <select
                  required
                  value={newMove.itemId || ''}
                  onChange={(e) => {
                    const it = items.find((x) => x.id === Number(e.target.value));
                    setNewMove({
                      ...newMove,
                      itemId: Number(e.target.value),
                      unitRate: it?.purchaseRate || '0',
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select Item…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} · {it.name} ({it.currentStock} {it.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold">Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newMove.qty || ''}
                  onChange={(e) => setNewMove({ ...newMove, qty: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Unit Rate (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newMove.unitRate || '0'}
                  onChange={(e) => setNewMove({ ...newMove, unitRate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Batch / Lot No</label>
                <input
                  type="text"
                  value={newMove.batchNo || ''}
                  onChange={(e) => setNewMove({ ...newMove, batchNo: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Expiry Date</label>
                <input
                  type="date"
                  value={newMove.expiryDate || ''}
                  onChange={(e) => setNewMove({ ...newMove, expiryDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Ref PO / Challan No</label>
                <input
                  type="text"
                  value={newMove.refDocNo || ''}
                  onChange={(e) => setNewMove({ ...newMove, refDocNo: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Vendor (if GRN)</label>
                <select
                  value={newMove.vendorId || ''}
                  onChange={(e) => setNewMove({ ...newMove, vendorId: Number(e.target.value) || null })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">None</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendorName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 md:col-span-4">
                <button
                  type="button"
                  onClick={() => setNewMove(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-emerald-600"
                >
                  Post Movement
                </button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3">Entry No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Batch / Ref</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {movements.map((m) => {
                  const item = items.find((i) => i.id === m.itemId);
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-mono font-semibold">{m.entryNo}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{m.entryDate}</td>
                      <td className="px-4 py-2.5 font-semibold">{m.movementType}</td>
                      <td className="px-4 py-2.5">{item ? `${item.sku} · ${item.name}` : `#${m.itemId}`}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">
                        {[m.batchNo, m.refDocNo].filter(Boolean).join(' · ') || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">
                        {fmtNum(m.qty, 2)} {item?.unit || ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtInr(m.totalValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'warehouses' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCreateWarehouse}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="text"
              placeholder="Code (e.g. WH-02)"
              value={newWh.code}
              onChange={(e) => setNewWh({ ...newWh, code: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              required
              placeholder="Warehouse Name *"
              value={newWh.name}
              onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              placeholder="Location / City"
              value={newWh.location}
              onChange={(e) => setNewWh({ ...newWh, location: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              placeholder="Store In-Charge"
              value={newWh.inCharge}
              onChange={(e) => setNewWh({ ...newWh, inCharge: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              Add Warehouse
            </button>
          </form>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <WarehouseIcon className="h-4 w-4 text-slate-500" />
                    <span className="font-mono text-xs font-bold">{w.code}</span>
                  </div>
                  {!w.isDefault && (
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmDelete(
                          `Remove warehouse ${w.name}?`,
                          'Removes this storage location.',
                          async () => {
                            await apiFetch(`/api/warehouses/${w.id}?companyId=${company.id}`, {
                              method: 'DELETE',
                            });
                            await onRefresh();
                          }
                        )
                      }
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-2 font-display text-sm font-semibold">{w.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {w.location || 'Primary Location'} · In-charge: {w.inCharge || 'Store Manager'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'gatepasses' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setNewGp({
                  passNo: `GP/26-27/${1001 + gatePasses.length}`,
                  passDate: new Date().toISOString().slice(0, 10),
                  passType: 'Returnable',
                  direction: 'Outward',
                  partyName: '',
                  items: [{ id: 'gp-1', description: '', qty: 1, unit: 'NOS' }],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              <Plus className="h-3.5 w-3.5" /> Issue Gate Pass
            </button>
          </div>

          {newGp && (
            <form
              onSubmit={handleSaveGatePass}
              className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <input
                type="text"
                required
                placeholder="Pass No"
                value={newGp.passNo || ''}
                onChange={(e) => setNewGp({ ...newGp, passNo: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                required
                placeholder="Party / Carrier Name *"
                value={newGp.partyName || ''}
                onChange={(e) => setNewGp({ ...newGp, partyName: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Vehicle No"
                value={newGp.vehicleNo || ''}
                onChange={(e) => setNewGp({ ...newGp, vehicleNo: e.target.value.toUpperCase() })}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <select
                value={newGp.passType}
                onChange={(e) => setNewGp({ ...newGp, passType: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option>Returnable</option>
                <option>Non-Returnable</option>
              </select>
              <input
                type="text"
                placeholder="Material Description"
                value={newGp.items?.[0]?.description || ''}
                onChange={(e) =>
                  setNewGp({
                    ...newGp,
                    items: [{ id: 'gp-1', description: e.target.value, qty: newGp.items?.[0]?.qty || 1, unit: 'NOS' }],
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="number"
                placeholder="Qty"
                value={newGp.items?.[0]?.qty || 1}
                onChange={(e) =>
                  setNewGp({
                    ...newGp,
                    items: [
                      {
                        id: 'gp-1',
                        description: newGp.items?.[0]?.description || '',
                        qty: Number(e.target.value),
                        unit: 'NOS',
                      },
                    ],
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2 md:col-span-3">
                <button
                  type="button"
                  onClick={() => setNewGp(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-emerald-600"
                >
                  Save Gate Pass
                </button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3">Pass No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {gatePasses.map((gp) => (
                  <tr key={gp.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{gp.passNo}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{gp.passDate}</td>
                    <td className="px-4 py-2.5">{gp.passType} ({gp.direction})</td>
                    <td className="px-4 py-2.5">{gp.partyName}</td>
                    <td className="px-4 py-2.5 font-mono">{gp.vehicleNo || '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onPreviewPdf(generateGatePassPdf(gp, company))}
                        className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
