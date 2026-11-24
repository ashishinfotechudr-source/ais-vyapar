import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, RefreshCw, Search } from 'lucide-react';
import { apiFetch, downloadBlob, exportRowsToExcel, fmtInr, fmtNum } from '../lib/api.ts';
import { generateGstSummaryPdf, type PdfOutput } from '../lib/pdfGenerator.ts';
import type { Company, GstMasterRow } from '../types/erp.ts';

interface GstComplianceViewProps {
  company: Company;
  masterData: GstMasterRow[];
  onRefreshMaster: (rows: GstMasterRow[]) => void;
  onPreviewPdf: (pdf: PdfOutput) => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const GstComplianceView: React.FC<GstComplianceViewProps> = ({
  company,
  masterData,
  onRefreshMaster,
  onPreviewPdf,
  notify,
}) => {
  const [tab, setTab] = useState<'gstr1' | 'gstr2' | 'gstr3b' | 'master'>('gstr3b');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [masterCat, setMasterCat] = useState<'hsn' | 'state' | 'uqc' | 'country'>('hsn');
  const [masterQuery, setMasterQuery] = useState('');
  const [syncingMaster, setSyncingMaster] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ companyId: String(company.id) });
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);
      const res = await apiFetch(`/api/gst/reports?${qs.toString()}`);
      setReport(res);
    } catch (err: any) {
      notify(err.message || 'Failed loading GST reports.', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [company.id]);

  const handleSyncGstZen = async () => {
    setSyncingMaster(true);
    try {
      const res = await apiFetch<{ synced: number; livePortalReachable: boolean; rows: GstMasterRow[] }>(
        '/api/master-data/sync',
        { method: 'POST', body: JSON.stringify({}) }
      );
      onRefreshMaster(res.rows);
      notify(
        `Synced ${res.synced} master data records (${res.livePortalReachable ? 'my.gstzen.in + GSTN Registry' : 'GSTN Registry'}).`
      );
    } catch (err: any) {
      notify(err.message || 'Master data sync failed.', true);
    } finally {
      setSyncingMaster(false);
    }
  };

  const filteredMaster = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    return masterData.filter(
      (m) =>
        m.category === masterCat &&
        (!q || [m.code, m.name, m.description].join(' ').toLowerCase().includes(q))
    );
  }, [masterData, masterCat, masterQuery]);

  const handleExportExcel = () => {
    if (!report) return;
    exportRowsToExcel('gst_returns_gstr1_2_3b.xlsx', [
      {
        name: 'GSTR-1 Outward B2B',
        headers: ['Invoice No', 'Date', 'Party', 'GSTIN', 'POS', 'Supply Type', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total'],
        rows: report.gstr1.b2b.map((v: any) => [
          v.voucherNo,
          v.voucherDate,
          v.partyName,
          v.partyGstin,
          v.placeOfSupply,
          v.supplyType,
          v.taxableValue,
          v.igstAmount,
          v.cgstAmount,
          v.sgstAmount,
          v.totalAmount,
        ]),
      },
      {
        name: 'GSTR-1 HSN Summary',
        headers: ['HSN/SAC', 'UQC', 'Total Qty', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Value'],
        rows: report.gstr1.hsnSummary.map((h: any) => [
          h.hsn,
          h.uqc,
          h.qty,
          h.taxableValue,
          h.igst,
          h.cgst,
          h.sgst,
          h.totalValue,
        ]),
      },
      {
        name: 'GSTR-2 Inward ITC',
        headers: ['Doc No', 'Date', 'Supplier', 'GSTIN', 'RCM', 'ITC Status', 'Taxable', 'IGST', 'CGST', 'SGST'],
        rows: report.gstr2.entries.map((e: any) => [
          e.docNo,
          e.docDate,
          e.supplierName,
          e.supplierGstin,
          e.reverseCharge ? 'Yes' : 'No',
          e.itcEligibility,
          e.taxableValue,
          e.igst,
          e.cgst,
          e.sgst,
        ]),
      },
      {
        name: 'GSTR-3B Offset',
        headers: ['Tax Head', 'Paid via IGST ITC', 'Paid via CGST ITC', 'Paid via SGST ITC', 'Cash Payable'],
        rows: [
          [
            'IGST',
            report.gstr3b.table6_1.offset.igst.paidByIgst,
            report.gstr3b.table6_1.offset.igst.paidByCgst,
            report.gstr3b.table6_1.offset.igst.paidBySgst,
            report.gstr3b.table6_1.offset.igst.paidInCash,
          ],
          [
            'CGST',
            report.gstr3b.table6_1.offset.cgst.paidByIgst,
            report.gstr3b.table6_1.offset.cgst.paidByCgst,
            report.gstr3b.table6_1.offset.cgst.paidBySgst,
            report.gstr3b.table6_1.offset.cgst.paidInCash,
          ],
          [
            'SGST',
            report.gstr3b.table6_1.offset.sgst.paidByIgst,
            report.gstr3b.table6_1.offset.sgst.paidByCgst,
            report.gstr3b.table6_1.offset.sgst.paidBySgst,
            report.gstr3b.table6_1.offset.sgst.paidInCash,
          ],
        ],
      },
    ]);
  };

  const handleExportJson = () => {
    if (!report) return;
    const jsonPayload = {
      gstin: company.gstin,
      legalName: company.legalName || company.name,
      fp: toDate ? `${toDate.slice(5, 7)}${toDate.slice(0, 4)}` : 'CURRENT',
      gstr1: report.gstr1,
      gstr2: report.gstr2,
      gstr3b: report.gstr3b,
    };
    downloadBlob(
      new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' }),
      'gst_portal_return_payload.json'
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            GST Compliance & Master Data
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            GSTR-1, GSTR-2, & GSTR-3B tax engine (Rule 88A ITC set-off, RCM, HSN summary) + GSTZen Master Data sync.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> GST JSON
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
          {report && (
            <button
              type="button"
              onClick={() => onPreviewPdf(generateGstSummaryPdf(report, company))}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              <FileText className="h-3.5 w-3.5" /> Return PDF
            </button>
          )}
        </div>
      </div>

      {/* Period Filter & Sub-nav */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'gstr3b', label: 'GSTR-3B (Liability & ITC Set-off)' },
            { id: 'gstr1', label: 'GSTR-1 (Outward & HSN)' },
            { id: 'gstr2', label: 'GSTR-2 (Inward & Eligible ITC)' },
            { id: 'master', label: 'GSTZen Master Data (HSN / States / Units / Countries)' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === t.id
                  ? 'bg-slate-900 text-white dark:bg-emerald-600'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'master' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={loading}
              onClick={loadReport}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-emerald-600"
            >
              {loading ? '…' : 'Apply'}
            </button>
          </div>
        )}
      </div>

      {tab === 'gstr3b' && report && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase text-slate-500">Outward Tax Liability</p>
              <p className="mt-1 font-mono text-lg font-bold">
                {fmtInr(
                  report.gstr3b.table3_1.outwardTaxable.igst +
                    report.gstr3b.table3_1.outwardTaxable.cgst +
                    report.gstr3b.table3_1.outwardTaxable.sgst
                )}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase text-slate-500">RCM Tax Liability</p>
              <p className="mt-1 font-mono text-lg font-bold text-amber-600">
                {fmtInr(
                  report.gstr3b.table3_1.inwardRcm.igst +
                    report.gstr3b.table3_1.inwardRcm.cgst +
                    report.gstr3b.table3_1.inwardRcm.sgst
                )}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase text-slate-500">Eligible Input ITC</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-600">
                {fmtInr(report.gstr2.summary.eligibleItcTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase text-slate-500">Net Cash Payable</p>
              <p className="mt-1 font-mono text-lg font-bold text-red-600">
                {fmtInr(report.gstr3b.table6_1.totalNetCashPayable)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-bold">
              Table 3.1 & 4: Outward Supplies, Reverse Charge & Eligible ITC
            </h3>
            <table className="mt-3 w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2.5">Nature of Supplies</th>
                  <th className="px-3 py-2.5 text-right">Taxable Value</th>
                  <th className="px-3 py-2.5 text-right">IGST</th>
                  <th className="px-3 py-2.5 text-right">CGST</th>
                  <th className="px-3 py-2.5 text-right">SGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                <tr>
                  <td className="px-3 py-2.5 font-medium">3.1(a) Outward Taxable Supplies (other than RCM)</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.outwardTaxable.taxableValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.outwardTaxable.igst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.outwardTaxable.cgst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.outwardTaxable.sgst)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium">3.1(d) Inward Supplies Liable to Reverse Charge (RCM)</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.inwardRcm.taxableValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.inwardRcm.igst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.inwardRcm.cgst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr3b.table3_1.inwardRcm.sgst)}</td>
                </tr>
                <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                  <td className="px-3 py-2.5 font-semibold text-emerald-800 dark:text-emerald-300">
                    4(A) Net Eligible Input Tax Credit (ITC)
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtInr(report.gstr2.summary.taxableValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtInr(report.gstr3b.table4.eligibleItc.igst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtInr(report.gstr3b.table4.eligibleItc.cgst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtInr(report.gstr3b.table4.eligibleItc.sgst)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-bold">
              Table 6.1: Statutory ITC Set-Off & Cash Payment (Rule 88A & Sec 49(4))
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              IGST ITC exhausted first against IGST/CGST/SGST; CGST & SGST ITC never cross-utilized; RCM paid strictly in Cash.
            </p>
            <table className="mt-3 w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2.5">Tax Head</th>
                  <th className="px-3 py-2.5 text-right">Paid via IGST ITC</th>
                  <th className="px-3 py-2.5 text-right">Paid via CGST ITC</th>
                  <th className="px-3 py-2.5 text-right">Paid via SGST ITC</th>
                  <th className="px-3 py-2.5 text-right">Net Cash Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(['igst', 'cgst', 'sgst'] as const).map((head) => {
                  const row = report.gstr3b.table6_1.offset[head];
                  return (
                    <tr key={head}>
                      <td className="px-3 py-2.5 font-mono font-bold uppercase">{head}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtInr(row.paidByIgst)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtInr(row.paidByCgst)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtInr(row.paidBySgst)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-red-600">{fmtInr(row.paidInCash)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gstr1' && report && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-bold">
              GSTR-1 Outward Supplies Register ({report.gstr1.summary.totalInvoices} Invoices)
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-3 py-2">Bucket</th>
                    <th className="px-3 py-2">Invoice No</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Recipient / GSTIN</th>
                    <th className="px-3 py-2">POS</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">CGST</th>
                    <th className="px-3 py-2 text-right">SGST</th>
                    <th className="px-3 py-2 text-right">IGST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {[
                    ...report.gstr1.b2b.map((v: any) => ({ ...v, _bucket: 'B2B' })),
                    ...report.gstr1.b2cl.map((v: any) => ({ ...v, _bucket: 'B2CL' })),
                    ...report.gstr1.b2cs.map((v: any) => ({ ...v, _bucket: 'B2CS' })),
                    ...report.gstr1.exports.map((v: any) => ({ ...v, _bucket: 'EXP' })),
                  ].map((v: any) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-mono font-semibold">{v._bucket}</td>
                      <td className="px-3 py-2 font-mono">{v.voucherNo}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{v.voucherDate}</td>
                      <td className="px-3 py-2">
                        <div>{v.partyName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{v.partyGstin || 'Unregistered'}</div>
                      </td>
                      <td className="px-3 py-2 font-mono">{v.placeOfSupply}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(v.taxableValue)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(v.cgstAmount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(v.sgstAmount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(v.igstAmount)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmtInr(v.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-bold">Table 12: HSN-Wise Summary of Outward Supplies</h3>
            <table className="mt-3 w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2">HSN/SAC</th>
                  <th className="px-3 py-2">UQC</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Taxable Value</th>
                  <th className="px-3 py-2 text-right">IGST</th>
                  <th className="px-3 py-2 text-right">CGST</th>
                  <th className="px-3 py-2 text-right">SGST</th>
                  <th className="px-3 py-2 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {report.gstr1.hsnSummary.map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono font-semibold">{h.hsn}</td>
                    <td className="px-3 py-2 font-mono">{h.uqc}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(h.qty, 2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(h.taxableValue)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(h.igst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(h.cgst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(h.sgst)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{fmtInr(h.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gstr2' && report && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-bold">
            GSTR-2 Inward Supplies & ITC Eligibility ({report.gstr2.summary.totalRecords} Entries)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2">Doc No</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Supplier / GSTIN</th>
                  <th className="px-3 py-2">RCM</th>
                  <th className="px-3 py-2">ITC Eligibility</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">CGST</th>
                  <th className="px-3 py-2 text-right">SGST</th>
                  <th className="px-3 py-2 text-right">IGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {report.gstr2.entries.map((e: any) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-mono font-semibold">{e.docNo}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{e.docDate}</td>
                    <td className="px-3 py-2">
                      <div>{e.supplierName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{e.supplierGstin || 'Unregistered'}</div>
                    </td>
                    <td className="px-3 py-2">{e.reverseCharge ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 font-semibold">{e.itcEligibility}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(e.taxableValue)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(e.cgst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(e.sgst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInr(e.igst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'master' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'hsn', label: 'HSN / SAC Codes' },
                { id: 'state', label: 'Indian States & GST Codes' },
                { id: 'uqc', label: 'GSTN Units (UQC)' },
                { id: 'country', label: 'Countries (ISO)' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setMasterCat(c.id as any)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    masterCat === c.id
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-600 dark:bg-emerald-600'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={masterQuery}
                  onChange={(e) => setMasterQuery(e.target.value)}
                  placeholder="Filter code or name…"
                  className="rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="button"
                disabled={syncingMaster}
                onClick={handleSyncGstZen}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingMaster ? 'animate-spin' : ''}`} />
                {syncingMaster ? 'Syncing…' : 'Sync from GSTZen'}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Description</th>
                  {masterCat === 'hsn' && <th className="px-4 py-2.5 text-right">GST Rate</th>}
                  <th className="px-4 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredMaster.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">{m.code}</td>
                    <td className="px-4 py-2.5 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.description}</td>
                    {masterCat === 'hsn' && (
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{m.gstRate || 0}%</td>
                    )}
                    <td className="px-4 py-2.5 text-[11px] text-slate-500">{m.source}</td>
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
