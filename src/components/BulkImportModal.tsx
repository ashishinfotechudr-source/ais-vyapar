import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { apiFetch, exportRowsToExcel, parseSpreadsheetFile } from '../lib/api.ts';

export type ImportEntityType = 'vendors' | 'vouchers' | 'po' | 'wo' | 'inventory';

interface BulkImportModalProps {
  open: boolean;
  entity: ImportEntityType;
  companyId: number;
  onClose: () => void;
  onImported: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

const TEMPLATE_CONFIG: Record<
  ImportEntityType,
  {
    title: string;
    endpoint: string;
    headers: string[];
    sample: Array<Array<string | number>>;
  }
> = {
  vendors: {
    title: 'Bulk Import Vendors',
    endpoint: '/api/vendors/bulk',
    headers: [
      'Vendor Name',
      'Trade Name',
      'Category',
      'Contact Person',
      'Mobile',
      'Email',
      'GSTIN',
      'GST Type',
      'PAN',
      'Address',
      'City',
      'State',
      'Pincode',
      'Bank Name',
      'Account No',
      'IFSC Code',
      'Payment Terms',
      'Opening Balance',
      'TDS Rate',
    ],
    sample: [
      [
        'Apex Steel Industries Pvt Ltd',
        'Apex Steel',
        'Supplier',
        'Ramesh Agarwal',
        '9829011223',
        'sales@apexsteel.in',
        '08AAACA1234A1Z5',
        'Registered - Regular',
        'AAACA1234A',
        'Plot 12, Industrial Area Phase II',
        'Udaipur',
        'Rajasthan',
        '313001',
        'HDFC Bank',
        '50200012345678',
        'HDFC0000123',
        '30 Days',
        0,
        2,
      ],
    ],
  },
  vouchers: {
    title: 'Bulk Import Accounting & GST Vouchers',
    endpoint: '/api/vouchers/bulk',
    headers: [
      'Voucher Kind',
      'Voucher No',
      'Date',
      'Party Name',
      'Party GSTIN',
      'Party State',
      'Invoice Type',
      'Reverse Charge',
      'Item Description',
      'HSN/SAC',
      'Qty',
      'Unit',
      'Rate',
      'GST %',
      'Discount',
      'Payment Mode',
      'Narration',
      'Total Amount',
    ],
    sample: [
      [
        'sales',
        'INV/26-27/2001',
        '2026-04-15',
        'Sunrise Infra Builders',
        '27AABCS1429B1Z8',
        'Maharashtra',
        'B2B',
        'No',
        'TMT Steel Bars 12mm',
        '7214',
        50,
        'MTS',
        58000,
        18,
        0,
        'Bank Transfer',
        'Tax Invoice supply of steel',
        '',
      ],
      [
        'receipt',
        'RCP/26-27/1005',
        '2026-04-18',
        'Sunrise Infra Builders',
        '',
        'Maharashtra',
        '',
        'No',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'NEFT',
        'Received against INV/26-27/2001',
        150000,
      ],
    ],
  },
  po: {
    title: 'Bulk Import Purchase Orders',
    endpoint: '/api/purchase-orders/bulk',
    headers: [
      'PO Number',
      'PO Date',
      'Vendor Name',
      'Vendor GSTIN',
      'Vendor State',
      'Payment Terms',
      'Item Description',
      'HSN/SAC',
      'Qty',
      'Unit',
      'Rate',
      'GST %',
      'Status',
    ],
    sample: [
      [
        'PO/26-27/3001',
        '2026-04-12',
        'Apex Steel Industries Pvt Ltd',
        '08AAACA1234A1Z5',
        'Rajasthan',
        '30 Days',
        'Structural Steel Beams',
        '7308',
        12,
        'MTS',
        62000,
        18,
        'Approved',
      ],
    ],
  },
  wo: {
    title: 'Bulk Import Work Orders',
    endpoint: '/api/work-orders/bulk',
    headers: [
      'WO Number',
      'WO Date',
      'Contractor Name',
      'Vendor GSTIN',
      'Vendor State',
      'Site Location',
      'Work Description',
      'SAC/HSN',
      'Qty',
      'Unit',
      'Rate',
      'GST %',
      'Status',
    ],
    sample: [
      [
        'WO/26-27/4001',
        '2026-04-14',
        'Mewar Civil Contractors',
        '08AAACW4567B1Z2',
        'Rajasthan',
        'Plant Unit 2',
        'Industrial Shed Fabrication & Erection',
        '9954',
        1,
        'NOS',
        450000,
        18,
        'Approved',
      ],
    ],
  },
  inventory: {
    title: 'Bulk Import Inventory Master',
    endpoint: '/api/inventory/items/bulk',
    headers: [
      'SKU',
      'Item Name',
      'Category',
      'Item Type',
      'HSN/SAC',
      'GST %',
      'Unit',
      'Valuation Method',
      'Purchase Rate',
      'Selling Rate',
      'Opening Stock',
      'Min Stock',
      'Reorder Level',
      'Max Stock',
      'Bin Location',
    ],
    sample: [
      [
        'STL-TMT-12',
        'TMT Bar 12mm Fe550',
        'Raw Material',
        'Goods',
        '7214',
        18,
        'MTS',
        'Weighted Average',
        56500,
        61000,
        24,
        5,
        8,
        50,
        'A-01-R2',
      ],
    ],
  },
};

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  open,
  entity,
  companyId,
  onClose,
  onImported,
  notify,
}) => {
  const [parsedRows, setParsedRows] = useState<Array<Record<string, any>>>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const cfg = TEMPLATE_CONFIG[entity];

  const handleDownloadTemplate = () => {
    exportRowsToExcel(`${entity}_import_template.xlsx`, [
      {
        name: 'ImportData',
        headers: cfg.headers,
        rows: cfg.sample,
      },
    ]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseSpreadsheetFile(file);
      setParsedRows(rows);
      setFileName(file.name);
      if (rows.length === 0) {
        notify('The uploaded file contains no data rows.', true);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to parse spreadsheet.', true);
    }
  };

  const transformPayload = () => {
    if (entity === 'vendors') {
      return parsedRows.map((r) => ({
        vendorName: r['Vendor Name'] || r.vendorName || r.Name || '',
        tradeName: r['Trade Name'] || r.tradeName || '',
        vendorCategory: r['Category'] || r.vendorCategory || 'Supplier',
        contactPerson: r['Contact Person'] || r.contactPerson || '',
        mobile: r['Mobile'] || r.mobile || '',
        email: r['Email'] || r.email || '',
        gstin: r['GSTIN'] || r.gstin || '',
        gstType: r['GST Type'] || r.gstType || '',
        pan: r['PAN'] || r.pan || '',
        address: r['Address'] || r.address || '',
        city: r['City'] || r.city || '',
        state: r['State'] || r.state || '',
        pincode: r['Pincode'] || r.pincode || '',
        bankName: r['Bank Name'] || r.bankName || '',
        accountNo: r['Account No'] || r.accountNo || '',
        ifscCode: r['IFSC Code'] || r.ifscCode || '',
        paymentTerms: r['Payment Terms'] || r.paymentTerms || '30 Days',
        openingBalance: Number(r['Opening Balance'] || r.openingBalance || 0),
        tdsRate: Number(r['TDS Rate'] || r.tdsRate || 0),
      }));
    }

    if (entity === 'inventory') {
      return parsedRows.map((r) => ({
        sku: r['SKU'] || r.sku || '',
        name: r['Item Name'] || r.name || '',
        category: r['Category'] || r.category || 'Raw Material',
        itemType: r['Item Type'] || r.itemType || 'Goods',
        hsnSac: r['HSN/SAC'] || r.hsnSac || '',
        gstRate: Number(r['GST %'] ?? r.gstRate ?? 18),
        unit: r['Unit'] || r.unit || 'NOS',
        valuationMethod: r['Valuation Method'] || r.valuationMethod || 'Weighted Average',
        purchaseRate: Number(r['Purchase Rate'] || r.purchaseRate || 0),
        sellingRate: Number(r['Selling Rate'] || r.sellingRate || 0),
        openingStock: Number(r['Opening Stock'] || r.openingStock || 0),
        minStock: Number(r['Min Stock'] || r.minStock || 0),
        reorderLevel: Number(r['Reorder Level'] || r.reorderLevel || 0),
        maxStock: Number(r['Max Stock'] || r.maxStock || 0),
        binLocation: r['Bin Location'] || r.binLocation || '',
      }));
    }

    if (entity === 'po') {
      const grouped = new Map<string, any>();
      parsedRows.forEach((r, idx) => {
        const key = String(r['PO Number'] || r.poNumber || `PO-ROW-${idx}`);
        if (!grouped.has(key)) {
          grouped.set(key, {
            poNumber: key,
            poDate: r['PO Date'] || r.poDate || new Date().toISOString().slice(0, 10),
            vendorName: r['Vendor Name'] || r.vendorName || 'Supplier',
            vendorGstin: r['Vendor GSTIN'] || r.vendorGstin || '',
            vendorState: r['Vendor State'] || r.vendorState || '',
            paymentTerms: r['Payment Terms'] || r.paymentTerms || '30 Days',
            status: r['Status'] || r.status || 'Pending',
            items: [],
          });
        }
        if (r['Item Description'] || r.description) {
          grouped.get(key).items.push({
            description: r['Item Description'] || r.description,
            hsnSac: String(r['HSN/SAC'] || r.hsnSac || ''),
            qty: Number(r['Qty'] || r.qty || 1),
            unit: String(r['Unit'] || r.unit || 'NOS'),
            rate: Number(r['Rate'] || r.rate || 0),
            gstRate: Number(r['GST %'] ?? r.gstRate ?? 18),
            discount: 0,
          });
        }
      });
      return Array.from(grouped.values());
    }

    if (entity === 'wo') {
      const grouped = new Map<string, any>();
      parsedRows.forEach((r, idx) => {
        const key = String(r['WO Number'] || r.woNumber || `WO-ROW-${idx}`);
        if (!grouped.has(key)) {
          grouped.set(key, {
            woNumber: key,
            woDate: r['WO Date'] || r.woDate || new Date().toISOString().slice(0, 10),
            contractorName: r['Contractor Name'] || r.contractorName || 'Contractor',
            vendorGstin: r['Vendor GSTIN'] || r.vendorGstin || '',
            vendorState: r['Vendor State'] || r.vendorState || '',
            siteLocation: r['Site Location'] || r.siteLocation || '',
            status: r['Status'] || r.status || 'Pending',
            items: [],
          });
        }
        if (r['Work Description'] || r.description) {
          grouped.get(key).items.push({
            description: r['Work Description'] || r.description,
            hsnSac: String(r['SAC/HSN'] || r.hsnSac || '9954'),
            qty: Number(r['Qty'] || r.qty || 1),
            unit: String(r['Unit'] || r.unit || 'NOS'),
            rate: Number(r['Rate'] || r.rate || 0),
            gstRate: Number(r['GST %'] ?? r.gstRate ?? 18),
            discount: 0,
          });
        }
      });
      return Array.from(grouped.values());
    }

    // Vouchers (supports multiple line items sharing the same Voucher No)
    const vGrouped = new Map<string, any>();
    parsedRows.forEach((r, idx) => {
      const kind = String(r['Voucher Kind'] || r.voucherKind || 'sales').toLowerCase();
      const vNo = String(r['Voucher No'] || r.voucherNo || `IMP-${idx + 1}`);
      const key = `${kind}__${vNo}`;
      if (!vGrouped.has(key)) {
        vGrouped.set(key, {
          voucherKind: kind,
          voucherNo: vNo,
          voucherDate: r['Date'] || r.voucherDate || new Date().toISOString().slice(0, 10),
          partyName: r['Party Name'] || r.partyName || 'Party',
          partyGstin: r['Party GSTIN'] || r.partyGstin || '',
          partyState: r['Party State'] || r.partyState || '',
          invoiceType: r['Invoice Type'] || r.invoiceType || '',
          reverseCharge: String(r['Reverse Charge'] || '').toLowerCase() === 'yes',
          paymentMode: r['Payment Mode'] || r.paymentMode || 'Bank Transfer',
          narration: r['Narration'] || r.narration || '',
          totalAmount: Number(r['Total Amount'] || r.totalAmount || 0),
          items: [],
        });
      }
      if (r['Item Description'] || r.description) {
        vGrouped.get(key).items.push({
          description: r['Item Description'] || r.description,
          hsnSac: String(r['HSN/SAC'] || r.hsnSac || ''),
          qty: Number(r['Qty'] || r.qty || 1),
          unit: String(r['Unit'] || r.unit || 'NOS'),
          rate: Number(r['Rate'] || r.rate || 0),
          gstRate: Number(r['GST %'] ?? r.gstRate ?? 18),
          discount: Number(r['Discount'] || r.discount || 0),
        });
      }
    });
    return Array.from(vGrouped.values());
  };

  const handleImport = async () => {
    const rows = transformPayload();
    if (!rows.length) {
      notify('No valid rows found to import.', true);
      return;
    }
    setImporting(true);
    try {
      const res = await apiFetch<{ imported: number }>(cfg.endpoint, {
        method: 'POST',
        body: JSON.stringify({ companyId, rows }),
      });
      await onImported();
      notify(`Successfully imported ${res.imported} record(s) into PostgreSQL.`);
      setParsedRows([]);
      setFileName('');
      onClose();
    } catch (err: any) {
      notify(err.message || 'Bulk import failed.', true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {cfg.title}
              </h3>
              <p className="text-xs text-slate-500">
                Upload Excel (.xlsx / .xls) or CSV matching the template columns
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Step 1: Download Template</p>
              <p className="mt-0.5">Includes required headers and a valid GST sample row.</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              Download Excel Template
            </button>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center hover:border-emerald-500 hover:bg-emerald-50/20 dark:border-slate-700 dark:bg-slate-950/30">
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {fileName ? `Selected: ${fileName}` : 'Choose Excel (.xlsx) or CSV file'}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              {parsedRows.length > 0
                ? `${parsedRows.length} rows parsed and ready for preview`
                : 'Click to browse spreadsheet from your device'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Previewing first {Math.min(8, parsedRows.length)} of {parsedRows.length} rows
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[11px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      {Object.keys(parsedRows[0])
                        .slice(0, 7)
                        .map((col) => (
                          <th key={col} className="px-3 py-2 font-semibold">
                            {col}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {parsedRows.slice(0, 8).map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(parsedRows[0])
                          .slice(0, 7)
                          .map((col) => (
                            <td key={col} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsedRows.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Multi-line vouchers & orders sharing the same Voucher/PO/WO number are automatically grouped.</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={importing || parsedRows.length === 0}
            onClick={handleImport}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            {importing ? 'Importing to SQL…' : `Commit ${parsedRows.length || 0} Row(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
