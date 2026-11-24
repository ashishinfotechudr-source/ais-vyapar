import React, { useMemo } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileText, Package, Receipt, Users } from 'lucide-react';
import { fmtInr, fmtNum } from '../lib/api.ts';
import type { ErpBundle } from '../types/erp.ts';

interface DashboardViewProps {
  bundle: ErpBundle;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ bundle, onNavigate }) => {
  const stats = useMemo(() => {
    const salesTotal = bundle.vouchers
      .filter((v) => v.voucherKind === 'sales' && v.status !== 'Cancelled')
      .reduce((s, v) => s + (Number(v.totalAmount) || 0), 0);
    const purchaseTotal = bundle.vouchers
      .filter((v) => v.voucherKind === 'purchase' && v.status !== 'Cancelled')
      .reduce((s, v) => s + (Number(v.totalAmount) || 0), 0);
    const pendingBills = bundle.bills
      .filter((b) => b.status === 'Pending' || b.status === 'Approved')
      .reduce((s, b) => s + (Number(b.netAmount) || 0), 0);
    const stockValue = bundle.inventoryItems.reduce(
      (s, it) => s + (Number(it.currentStock) || 0) * (Number(it.purchaseRate) || 0),
      0
    );
    const lowStock = bundle.inventoryItems.filter(
      (it) => Number(it.reorderLevel) > 0 && Number(it.currentStock) <= Number(it.reorderLevel)
    );
    const outputGst = bundle.vouchers
      .filter((v) => v.voucherKind === 'sales' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount), 0);
    const inputGst = bundle.vouchers
      .filter((v) => v.voucherKind === 'purchase' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount), 0);

    return {
      salesTotal,
      purchaseTotal,
      pendingBills,
      stockValue,
      lowStock,
      outputGst,
      inputGst,
      netGstEstimate: Math.max(0, outputGst - inputGst),
    };
  }, [bundle]);

  const maxBar = Math.max(stats.salesTotal, stats.purchaseTotal, stats.stockValue, stats.pendingBills, 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Executive Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {bundle.company.legalName || bundle.company.name} · GSTIN: {bundle.company.gstin || 'Not Configured'} · State Code {bundle.company.stateCode || '08'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('vouchers')}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            <Receipt className="h-3.5 w-3.5" />
            New Tax Invoice
          </button>
          <button
            type="button"
            onClick={() => onNavigate('gst')}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <FileText className="h-3.5 w-3.5" />
            GSTR-1 / 2 / 3B
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Total Sales Revenue</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {fmtInr(stats.salesTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Output GST: <span className="font-mono">{fmtInr(stats.outputGst)}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Purchases & Procurement</span>
            <ArrowDownRight className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {fmtInr(stats.purchaseTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Input ITC: <span className="font-mono">{fmtInr(stats.inputGst)}</span> · {bundle.purchaseOrders.length} POs
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Inventory Valuation</span>
            <Package className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {fmtInr(stats.stockValue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {bundle.inventoryItems.length} SKUs · {bundle.warehouses.length} Warehouse(s)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Pending Bills & Net GST</span>
            <Users className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {fmtInr(stats.pendingBills)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Est. GST Cash Liability: <span className="font-mono">{fmtInr(stats.netGstEstimate)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Financial Position Comparison
          </h3>
          <p className="text-xs text-slate-500">Live figures aggregated from PostgreSQL ERP tables</p>
          <div className="mt-5 space-y-4">
            {[
              { label: 'Sales Invoiced', value: stats.salesTotal, color: 'bg-emerald-600' },
              { label: 'Purchases Booked', value: stats.purchaseTotal, color: 'bg-slate-800 dark:bg-slate-400' },
              { label: 'Closing Stock Value', value: stats.stockValue, color: 'bg-sky-600' },
              { label: 'Payables Pending', value: stats.pendingBills, color: 'bg-amber-600' },
            ].map((bar) => (
              <div key={bar.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{bar.label}</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {fmtInr(bar.value)}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full ${bar.color}`}
                    style={{ width: `${Math.max(4, Math.round((bar.value / maxBar) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Inventory Reorder Alerts
              </h3>
              <p className="text-xs text-slate-500">Items at or below configured reorder threshold</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Manage Stock
            </button>
          </div>
          {stats.lowStock.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
              All {bundle.inventoryItems.length} inventory SKUs are above reorder levels.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {stats.lowStock.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{item.sku} · HSN {item.hsnSac || '-'}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      {fmtNum(item.currentStock, 2)} {item.unit}
                    </p>
                    <p className="text-[11px] text-slate-500">Reorder @ {fmtNum(item.reorderLevel, 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent Accounting & GST Vouchers
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('vouchers')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400"
          >
            View All ({bundle.vouchers.length})
          </button>
        </div>
        {bundle.vouchers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No vouchers recorded yet. Create your first Tax Invoice, Purchase Voucher, or Journal Entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-2.5">Voucher No</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Party</th>
                  <th className="px-4 py-2.5">GSTIN</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bundle.vouchers.slice(0, 8).map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {v.voucherNo}
                    </td>
                    <td className="px-4 py-2.5 uppercase text-slate-600 dark:text-slate-400">{v.voucherKind}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{v.voucherDate}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{v.partyName}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{v.partyGstin || 'Unregistered'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {fmtInr(v.totalAmount)}
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
