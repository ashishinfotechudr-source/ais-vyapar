import React, { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr } from '../lib/api.ts';
import type { AccountGroup, Bill, Company, InventoryItem, Ledger, Voucher } from '../types/erp.ts';

interface FinalAccountsViewProps {
  company: Company;
  accountGroups: AccountGroup[];
  ledgers: Ledger[];
  vouchers: Voucher[];
  bills: Bill[];
  inventoryItems: InventoryItem[];
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const FinalAccountsView: React.FC<FinalAccountsViewProps> = ({
  company,
  accountGroups,
  ledgers,
  vouchers,
  bills,
  inventoryItems,
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'tb' | 'pl' | 'bs' | 'ledgers'>('tb');
  const [newLedger, setNewLedger] = useState({
    name: '',
    groupName: accountGroups[0]?.name || 'Indirect Expenses',
    openingBalance: '0',
    openingType: 'Dr',
  });

  const financials = useMemo(() => {
    const salesTotal = vouchers
      .filter((v) => v.voucherKind === 'sales' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.taxableValue), 0);
    const purchaseTotal =
      vouchers
        .filter((v) => v.voucherKind === 'purchase' && v.status !== 'Cancelled')
        .reduce((s, v) => s + Number(v.taxableValue), 0) +
      bills
        .filter((b) => b.status !== 'Cancelled')
        .reduce((s, b) => s + Number(b.amount), 0);
    const outputGst = vouchers
      .filter((v) => v.voucherKind === 'sales' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount), 0);
    const inputGst = vouchers
      .filter((v) => v.voucherKind === 'purchase' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount), 0);
    const closingStock = inventoryItems.reduce(
      (s, it) => s + Number(it.currentStock) * Number(it.purchaseRate),
      0
    );
    const receipts = vouchers
      .filter((v) => v.voucherKind === 'receipt' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.totalAmount), 0);
    const payments = vouchers
      .filter((v) => v.voucherKind === 'payment' && v.status !== 'Cancelled')
      .reduce((s, v) => s + Number(v.totalAmount), 0);

    const ledgerMap = new Map<string, { name: string; group: string; nature: string; dr: number; cr: number }>();
    for (const l of ledgers) {
      const ob = Number(l.openingBalance) || 0;
      ledgerMap.set(l.name, {
        name: l.name,
        group: l.groupName,
        nature: l.nature,
        dr: l.openingType === 'Dr' ? ob : 0,
        cr: l.openingType === 'Cr' ? ob : 0,
      });
    }

    const addAmt = (name: string, group: string, nature: string, dr: number, cr: number) => {
      const ex = ledgerMap.get(name) || { name, group, nature, dr: 0, cr: 0 };
      ex.dr += dr;
      ex.cr += cr;
      ledgerMap.set(name, ex);
    };

    addAmt('Sales - GST Local & Inter-State', 'Sales Accounts', 'Income', 0, salesTotal);
    addAmt('Purchase - GST Local & Inter-State', 'Purchase Accounts', 'Expense', purchaseTotal, 0);
    addAmt('Output GST Liability', 'Duties & Taxes', 'Liability', 0, outputGst);
    addAmt('Input GST Credit (ITC)', 'Duties & Taxes', 'Asset', inputGst, 0);
    addAmt('Sundry Debtors (Receivables)', 'Sundry Debtors', 'Asset', Math.max(0, salesTotal + outputGst - receipts), 0);
    addAmt('Sundry Creditors (Payables)', 'Sundry Creditors', 'Liability', 0, Math.max(0, purchaseTotal + inputGst - payments));
    addAmt('Bank & Cash Balances', 'Bank Accounts', 'Asset', Math.max(0, receipts - payments), 0);

    for (const jv of vouchers.filter((v) => v.voucherKind === 'journal' && v.status !== 'Cancelled')) {
      for (const jl of jv.journalLines || []) {
        addAmt(jl.ledgerName, 'Journal Adjustments', 'Expense', Number(jl.drAmount) || 0, Number(jl.crAmount) || 0);
      }
    }

    const tbRows = Array.from(ledgerMap.values()).filter((r) => r.dr > 0 || r.cr > 0);
    const totalDr = tbRows.reduce((s, r) => s + r.dr, 0);
    const totalCr = tbRows.reduce((s, r) => s + r.cr, 0);
    const netProfit = salesTotal + closingStock - purchaseTotal;

    return {
      tbRows,
      totalDr,
      totalCr,
      salesTotal,
      purchaseTotal,
      closingStock,
      netProfit,
      outputGst,
      inputGst,
    };
  }, [ledgers, vouchers, bills, inventoryItems]);

  const handleAddLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLedger.name.trim()) return;
    const grp = accountGroups.find((g) => g.name === newLedger.groupName);
    try {
      await apiFetch('/api/ledgers', {
        method: 'POST',
        body: JSON.stringify({
          ...newLedger,
          companyId: company.id,
          nature: grp?.nature || 'Expense',
        }),
      });
      setNewLedger({ ...newLedger, name: '', openingBalance: '0' });
      await onRefresh();
      notify('Ledger account created.');
    } catch (err: any) {
      notify(err.message || 'Failed creating ledger.', true);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Final Accounts & Financial Statements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live Trial Balance, Trading & Profit & Loss Account, Balance Sheet, and Chart of Accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            exportRowsToExcel('final_accounts_report.xlsx', [
              {
                name: 'Trial Balance',
                headers: ['Ledger Name', 'Account Group', 'Nature', 'Debit (INR)', 'Credit (INR)'],
                rows: financials.tbRows.map((r) => [r.name, r.group, r.nature, r.dr, r.cr]),
              },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" /> Export Excel
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: 'tb', label: 'Trial Balance' },
          { id: 'pl', label: 'Profit & Loss A/c' },
          { id: 'bs', label: 'Balance Sheet' },
          { id: 'ledgers', label: `Ledgers (${ledgers.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold ${
              tab === t.id ? 'bg-slate-900 text-white dark:bg-emerald-600' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tb' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-3">Ledger Account</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Nature</th>
                <th className="px-4 py-3 text-right">Debit (Dr)</th>
                <th className="px-4 py-3 text-right">Credit (Cr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {financials.tbRows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.group}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.nature}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.dr ? fmtInr(r.dr) : '-'}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.cr ? fmtInr(r.cr) : '-'}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold dark:bg-slate-950">
                <td colSpan={3} className="px-4 py-3">
                  Total Trial Balance
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtInr(financials.totalDr)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtInr(financials.totalCr)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pl' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="border-b border-slate-200 pb-2 font-display text-sm font-bold dark:border-slate-800">
              Debit (Purchases & Expenses)
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span>Purchases (Net of GST)</span>
                <span className="font-mono font-semibold">{fmtInr(financials.purchaseTotal)}</span>
              </div>
              {financials.netProfit >= 0 && (
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
                  <span>Net Profit</span>
                  <span className="font-mono">{fmtInr(financials.netProfit)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="border-b border-slate-200 pb-2 font-display text-sm font-bold dark:border-slate-800">
              Credit (Revenue & Closing Stock)
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span>Sales Revenue (Net of GST)</span>
                <span className="font-mono font-semibold">{fmtInr(financials.salesTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Closing Stock Valuation</span>
                <span className="font-mono font-semibold">{fmtInr(financials.closingStock)}</span>
              </div>
              {financials.netProfit < 0 && (
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-red-600 dark:border-slate-800">
                  <span>Net Loss</span>
                  <span className="font-mono">{fmtInr(Math.abs(financials.netProfit))}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'bs' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="border-b border-slate-200 pb-2 font-display text-sm font-bold dark:border-slate-800">
              Liabilities & Capital
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span>Current Year Surplus (P&L)</span>
                <span className="font-mono font-semibold">{fmtInr(financials.netProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span>Output GST Liability</span>
                <span className="font-mono font-semibold">{fmtInr(financials.outputGst)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="border-b border-slate-200 pb-2 font-display text-sm font-bold dark:border-slate-800">
              Assets
            </h3>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span>Closing Stock in Hand</span>
                <span className="font-mono font-semibold">{fmtInr(financials.closingStock)}</span>
              </div>
              <div className="flex justify-between">
                <span>Input Tax Credit (GST Receivable)</span>
                <span className="font-mono font-semibold">{fmtInr(financials.inputGst)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'ledgers' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddLedger}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="text"
              required
              placeholder="Ledger Account Name *"
              value={newLedger.name}
              onChange={(e) => setNewLedger({ ...newLedger, name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs md:col-span-2 dark:border-slate-700 dark:bg-slate-950"
            />
            <select
              value={newLedger.groupName}
              onChange={(e) => setNewLedger({ ...newLedger, groupName: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              {accountGroups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name} ({g.nature})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Opening Balance"
              value={newLedger.openingBalance}
              onChange={(e) => setNewLedger({ ...newLedger, openingBalance: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              <Plus className="h-3.5 w-3.5" /> Add Ledger
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3">Ledger Name</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Nature</th>
                  <th className="px-4 py-3 text-right">Opening Balance</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ledgers.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 font-semibold">{l.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.groupName}</td>
                    <td className="px-4 py-2.5">{l.nature}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {fmtInr(l.openingBalance)} {l.openingType}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/ledgers/${l.id}?companyId=${company.id}`, { method: 'DELETE' });
                          await onRefresh();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
