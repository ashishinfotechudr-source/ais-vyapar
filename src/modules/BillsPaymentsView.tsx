import React, { useMemo, useState } from 'react';
import { CheckSquare, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { apiFetch, exportRowsToExcel, fmtInr } from '../lib/api.ts';
import { generatePaymentSheetPdf, type PdfOutput } from '../lib/pdfGenerator.ts';
import type { Bill, Company, PaymentSheet, Vendor, Voucher } from '../types/erp.ts';

interface BillsPaymentsViewProps {
  company: Company;
  bills: Bill[];
  paymentSheets: PaymentSheet[];
  vendors: Vendor[];
  vouchers: Voucher[];
  onRefresh: () => Promise<void>;
  onPreviewPdf: (pdf: PdfOutput) => void;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const BillsPaymentsView: React.FC<BillsPaymentsViewProps> = ({
  company,
  bills,
  paymentSheets,
  vendors,
  vouchers,
  onRefresh,
  onPreviewPdf,
  onConfirmDelete,
  notify,
}) => {
  const [tab, setTab] = useState<'bills' | 'sheets' | 'ledger'>('bills');
  const [selectedBillIds, setSelectedBillIds] = useState<number[]>([]);
  const [showNewBill, setShowNewBill] = useState(false);
  const [billForm, setBillForm] = useState({
    billNo: `BL/26-27/${1001 + bills.length}`,
    billDate: new Date().toISOString().slice(0, 10),
    vendorId: '',
    vendorName: '',
    vendorGstin: '',
    docNo: '',
    docDate: '',
    amount: '0',
    gstAmount: '0',
    tdsAmount: '0',
    deduction: '0',
    paymentMode: 'NEFT',
    narration: '',
  });
  const [ledgerVendor, setLedgerVendor] = useState('');

  const netCalc = useMemo(() => {
    const a = Number(billForm.amount) || 0;
    const g = Number(billForm.gstAmount) || 0;
    const t = Number(billForm.tdsAmount) || 0;
    const d = Number(billForm.deduction) || 0;
    return a + g - t - d;
  }, [billForm]);

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billForm.vendorName) return;
    try {
      await apiFetch('/api/bills', {
        method: 'POST',
        body: JSON.stringify({
          ...billForm,
          companyId: company.id,
          vendorId: billForm.vendorId ? Number(billForm.vendorId) : null,
          netAmount: netCalc,
        }),
      });
      await onRefresh();
      setShowNewBill(false);
      notify('Vendor bill saved.');
    } catch (err: any) {
      notify(err.message || 'Failed saving bill.', true);
    }
  };

  const handleGenerateSheet = async () => {
    if (selectedBillIds.length === 0) {
      notify('Select at least one pending bill to generate a Payment Sheet.', true);
      return;
    }
    const chosen = bills.filter((b) => selectedBillIds.includes(b.id));
    const totalNet = chosen.reduce((s, b) => s + (Number(b.netAmount) || 0), 0);
    try {
      await apiFetch('/api/payment-sheets', {
        method: 'POST',
        body: JSON.stringify({
          companyId: company.id,
          sheetNo: `PS/26-27/${1001 + paymentSheets.length}`,
          sheetDate: new Date().toISOString().slice(0, 10),
          payFromBank: company.banks?.[0]?.bankName || 'Primary Bank',
          paymentMode: 'NEFT',
          billIds: selectedBillIds,
          totalNetAmount: totalNet,
          status: 'Initiated',
        }),
      });
      setSelectedBillIds([]);
      await onRefresh();
      setTab('sheets');
      notify('Payment Sheet generated.');
    } catch (err: any) {
      notify(err.message || 'Failed creating payment sheet.', true);
    }
  };

  const ledgerEntries = useMemo(() => {
    if (!ledgerVendor) return [];
    const rows: Array<{ date: string; ref: string; type: string; dr: number; cr: number; narration: string }> = [];
    const vObj = vendors.find((x) => x.vendorName === ledgerVendor);
    if (vObj && Number(vObj.openingBalance) !== 0) {
      rows.push({
        date: 'Opening',
        ref: 'OP-BAL',
        type: 'Opening Balance',
        dr: Number(vObj.openingBalance) < 0 ? Math.abs(Number(vObj.openingBalance)) : 0,
        cr: Number(vObj.openingBalance) > 0 ? Number(vObj.openingBalance) : 0,
        narration: 'Opening Balance',
      });
    }
    bills
      .filter((b) => b.vendorName === ledgerVendor)
      .forEach((b) =>
        rows.push({
          date: b.billDate,
          ref: b.billNo,
          type: 'Vendor Bill',
          dr: 0,
          cr: Number(b.netAmount) || 0,
          narration: b.narration || b.docNo,
        })
      );
    vouchers
      .filter((v) => v.partyName === ledgerVendor && v.status !== 'Cancelled')
      .forEach((v) => {
        const amt = Number(v.totalAmount) || 0;
        const isDr = v.voucherKind === 'sales' || v.voucherKind === 'payment';
        rows.push({
          date: v.voucherDate,
          ref: v.voucherNo,
          type: v.voucherKind.toUpperCase(),
          dr: isDr ? amt : 0,
          cr: isDr ? 0 : amt,
          narration: v.narration,
        });
      });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [ledgerVendor, vendors, bills, vouchers]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Bills, Payment Sheets & Party Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Process vendor bills with TDS, batch NEFT/RTGS payment sheets, bank advice PDFs, and party statements.
          </p>
        </div>
        <div className="flex gap-2">
          {selectedBillIds.length > 0 && (
            <button
              type="button"
              onClick={handleGenerateSheet}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Create Payment Sheet ({selectedBillIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewBill(!showNewBill)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
          >
            <Plus className="h-3.5 w-3.5" /> New Bill Entry
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: 'bills', label: `Bills Register (${bills.length})` },
          { id: 'sheets', label: `Payment Sheets (${paymentSheets.length})` },
          { id: 'ledger', label: 'Party Ledger Statement' },
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

      {showNewBill && (
        <form
          onSubmit={handleSaveBill}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            type="text"
            required
            placeholder="Bill No"
            value={billForm.billNo}
            onChange={(e) => setBillForm({ ...billForm, billNo: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="date"
            required
            value={billForm.billDate}
            onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            required
            value={billForm.vendorId}
            onChange={(e) => {
              const v = vendors.find((x) => x.id === Number(e.target.value));
              setBillForm({
                ...billForm,
                vendorId: e.target.value,
                vendorName: v?.vendorName || '',
                vendorGstin: v?.gstin || '',
              });
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">Select Vendor *</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendorName}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Supplier Invoice No"
            value={billForm.docNo}
            onChange={(e) => setBillForm({ ...billForm, docNo: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Base Amount"
            value={billForm.amount}
            onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="number"
            step="0.01"
            placeholder="GST Amount"
            value={billForm.gstAmount}
            onChange={(e) => setBillForm({ ...billForm, gstAmount: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="number"
            step="0.01"
            placeholder="TDS Deducted"
            value={billForm.tdsAmount}
            onChange={(e) => setBillForm({ ...billForm, tdsAmount: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold dark:bg-slate-800">
            <span>Net Payable:</span>
            <span>{fmtInr(netCalc)}</span>
          </div>
          <div className="flex justify-end gap-2 md:col-span-4">
            <button
              type="button"
              onClick={() => setShowNewBill(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              Save Bill
            </button>
          </div>
        </form>
      )}

      {tab === 'bills' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3">Bill No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Amount + GST</th>
                <th className="px-4 py-3 text-right">TDS</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5">
                    {b.status === 'Pending' && (
                      <input
                        type="checkbox"
                        checked={selectedBillIds.includes(b.id)}
                        onChange={(e) =>
                          setSelectedBillIds((prev) =>
                            e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id)
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold">{b.billNo}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{b.billDate}</td>
                  <td className="px-4 py-2.5 font-medium">{b.vendorName}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {fmtInr(Number(b.amount) + Number(b.gstAmount))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">{fmtInr(b.tdsAmount)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtInr(b.netAmount)}</td>
                  <td className="px-4 py-2.5 font-semibold">{b.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmDelete(`Delete Bill ${b.billNo}?`, 'Removes this bill entry.', async () => {
                          await apiFetch(`/api/bills/${b.id}?companyId=${company.id}`, { method: 'DELETE' });
                          await onRefresh();
                        })
                      }
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
      )}

      {tab === 'sheets' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-3">Sheet No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Pay From Bank</th>
                <th className="px-4 py-3">Bills</th>
                <th className="px-4 py-3 text-right">Total Net Payable</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {paymentSheets.map((ps) => (
                <tr key={ps.id}>
                  <td className="px-4 py-2.5 font-mono font-semibold">{ps.sheetNo}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{ps.sheetDate}</td>
                  <td className="px-4 py-2.5">{ps.payFromBank}</td>
                  <td className="px-4 py-2.5 font-mono">{(ps.billIds || []).length} bill(s)</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtInr(ps.totalNetAmount)}</td>
                  <td className="px-4 py-2.5 font-semibold">{ps.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => onPreviewPdf(generatePaymentSheetPdf(ps, bills, vendors, company))}
                        className="inline-flex items-center gap-1 rounded border border-emerald-600 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                      >
                        <FileText className="h-3 w-3" /> Bank Advice PDF
                      </button>
                      {ps.status !== 'Paid' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/payment-sheets/${ps.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ companyId: company.id, status: 'Paid' }),
                            });
                            await onRefresh();
                            notify('Marked Payment Sheet as Paid.');
                          }}
                          className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white dark:bg-emerald-600"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <select
              value={ledgerVendor}
              onChange={(e) => setLedgerVendor(e.target.value)}
              className="min-w-[280px] rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Select Party / Vendor for Ledger Statement…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.vendorName}>
                  {v.vendorName} {v.gstin ? `(${v.gstin})` : ''}
                </option>
              ))}
            </select>
            {ledgerVendor && (
              <button
                type="button"
                onClick={() =>
                  exportRowsToExcel(`party_ledger_${ledgerVendor}.xlsx`, [
                    {
                      name: 'Party Ledger',
                      headers: ['Date', 'Ref No', 'Type', 'Narration', 'Debit', 'Credit'],
                      rows: ledgerEntries.map((r) => [r.date, r.ref, r.type, r.narration, r.dr, r.cr]),
                    },
                  ])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5" /> Export Statement
              </button>
            )}
          </div>

          {ledgerVendor && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref No</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Narration</th>
                    <th className="px-4 py-3 text-right">Debit (Dr)</th>
                    <th className="px-4 py-3 text-right">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {ledgerEntries.map((r, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{r.date}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold">{r.ref}</td>
                      <td className="px-4 py-2.5">{r.type}</td>
                      <td className="px-4 py-2.5">{r.narration || '-'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.dr ? fmtInr(r.dr) : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.cr ? fmtInr(r.cr) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
