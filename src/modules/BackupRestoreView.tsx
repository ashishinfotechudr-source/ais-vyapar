import React, { useState } from 'react';
import {
  ArchiveRestore,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  History,
  Server,
  Upload,
} from 'lucide-react';
import { apiFetch, downloadBlob, exportRowsToExcel, fmtInr, getSessionToken } from '../lib/api.ts';
import type { ErpBundle } from '../types/erp.ts';
import type { ImportEntityType } from '../components/BulkImportModal.tsx';

interface BackupRestoreViewProps {
  bundle: ErpBundle;
  onRefresh: () => Promise<void>;
  onOpenBulkImport: (entity: ImportEntityType) => void;
  onConfirmAction: (
    title: string,
    description: string,
    confirmLabel: string,
    danger: boolean,
    action: () => Promise<void>
  ) => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({
  bundle,
  onRefresh,
  onOpenBulkImport,
  onConfirmAction,
  notify,
}) => {
  const [snapshotLabel, setSnapshotLabel] = useState(
    `Backup ${bundle.company.code || bundle.company.name} (${new Date().toISOString().slice(0, 10)})`
  );
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedPayload, setUploadedPayload] = useState<Record<string, any> | null>(null);
  const [exportingZip, setExportingZip] = useState(false);

  const handleDownloadHostingerZip = async () => {
    setExportingZip(true);
    try {
      const token = getSessionToken();
      if (!token) throw new Error('Authentication required.');
      const res = await fetch('/api/export/hostinger-php-bundle', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to package Hostinger PHP + MySQL bundle.');
      }
      const blob = await res.blob();
      downloadBlob(blob, 'vyaparledger-hostinger-php-mysql.zip');
      notify('Hostinger PHP + MySQL deployment package downloaded.');
    } catch (err: any) {
      notify(err.message || 'Export failed.', true);
    } finally {
      setExportingZip(false);
    }
  };

  const totalRecords =
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
    bundle.ledgers.length;

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiFetch('/api/backup/snapshot', {
        method: 'POST',
        body: JSON.stringify({
          companyId: bundle.company.id,
          label: snapshotLabel.trim() || `Manual Backup (${new Date().toISOString().slice(0, 16)})`,
        }),
      });
      await onRefresh();
      notify('SQL snapshot saved in PostgreSQL.');
    } catch (err: any) {
      notify(err.message || 'Failed to create SQL snapshot.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadSnapshotJson = async (snapshotId: number, label: string) => {
    setDownloadingId(snapshotId);
    try {
      const snap = await apiFetch<any>(`/api/backup/snapshot/${snapshotId}`);
      const safeName = label.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${safeName}_snapshot_${snapshotId}.json`);
      notify('Snapshot JSON backup downloaded.');
    } catch (err: any) {
      notify(err.message || 'Failed to download snapshot.', true);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRestoreSnapshot = (snapshotId: number, label: string) => {
    onConfirmAction(
      'Restore Company Database from SQL Snapshot',
      `Restoring "${label}" will replace the current company vouchers, orders, vendors, bills, inventory, and ledgers with the snapshot data. An automatic pre-restore backup will be created first.`,
      'Restore Snapshot',
      true,
      async () => {
        await apiFetch('/api/backup/restore', {
          method: 'POST',
          body: JSON.stringify({
            companyId: bundle.company.id,
            snapshotId,
          }),
        });
        await onRefresh();
        notify('Company database restored cleanly from SQL snapshot.');
      }
    );
  };

  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const candidate = parsed?.payload || parsed?.data || parsed;
      if (!candidate || typeof candidate !== 'object' || (!candidate.company && !candidate.vouchers && !candidate.vendors)) {
        notify('Invalid ERP backup JSON file structure.', true);
        return;
      }
      setUploadedPayload(candidate);
      setUploadedFileName(file.name);
      notify(`Parsed backup file "${file.name}" ready for restore.`);
    } catch {
      notify('Could not parse JSON backup file.', true);
    }
  };

  const handleRestoreFromFile = () => {
    if (!uploadedPayload) return;
    onConfirmAction(
      'Restore Database from Uploaded JSON File',
      `Restore company "${bundle.company.name}" from "${uploadedFileName}"? Existing records for this company will be replaced after an automatic pre-restore SQL snapshot is saved.`,
      'Confirm Full Restore',
      true,
      async () => {
        await apiFetch('/api/backup/restore', {
          method: 'POST',
          body: JSON.stringify({
            companyId: bundle.company.id,
            payload: uploadedPayload,
          }),
        });
        setUploadedPayload(null);
        setUploadedFileName('');
        await onRefresh();
        notify('Database successfully restored from uploaded JSON backup.');
      }
    );
  };

  const handleFullExcelWorkbookExport = () => {
    exportRowsToExcel(`${bundle.company.code || 'ERP'}_Full_Data_${new Date().toISOString().slice(0, 10)}.xlsx`, [
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
          'RCM',
          'Taxable',
          'CGST',
          'SGST',
          'IGST',
          'Total Amount',
          'Status',
        ],
        rows: bundle.vouchers.map((v) => [
          v.voucherKind,
          v.voucherNo,
          v.voucherDate,
          v.partyName,
          v.partyGstin,
          v.partyState,
          v.supplyType,
          v.reverseCharge ? 'Yes' : 'No',
          Number(v.taxableValue) || 0,
          Number(v.cgstAmount) || 0,
          Number(v.sgstAmount) || 0,
          Number(v.igstAmount) || 0,
          Number(v.totalAmount) || 0,
          v.status,
        ]),
      },
      {
        name: 'Vendors',
        headers: ['Code', 'Vendor Name', 'Category', 'GSTIN', 'PAN', 'State', 'City', 'Mobile', 'Email', 'Bank', 'Account No', 'IFSC'],
        rows: bundle.vendors.map((v) => [
          v.vendorCode,
          v.vendorName,
          v.vendorCategory,
          v.gstin,
          v.pan,
          v.state,
          v.city,
          v.mobile,
          v.email,
          v.bankName,
          v.accountNo,
          v.ifscCode,
        ]),
      },
      {
        name: 'PurchaseOrders',
        headers: ['PO Number', 'Date', 'Vendor', 'GSTIN', 'Supply Type', 'Taxable', 'GST', 'Total', 'Status'],
        rows: bundle.purchaseOrders.map((p) => [
          p.poNumber,
          p.poDate,
          p.vendorName,
          p.vendorGstin,
          p.supplyType,
          Number(p.taxableValue) || 0,
          (Number(p.cgstAmount) || 0) + (Number(p.sgstAmount) || 0) + (Number(p.igstAmount) || 0),
          Number(p.totalAmount) || 0,
          p.status,
        ]),
      },
      {
        name: 'WorkOrders',
        headers: ['WO Number', 'Date', 'Contractor', 'Site', 'Taxable', 'GST', 'Total', 'Status'],
        rows: bundle.workOrders.map((w) => [
          w.woNumber,
          w.woDate,
          w.contractorName,
          w.siteLocation,
          Number(w.taxableValue) || 0,
          (Number(w.cgstAmount) || 0) + (Number(w.sgstAmount) || 0) + (Number(w.igstAmount) || 0),
          Number(w.totalAmount) || 0,
          w.status,
        ]),
      },
      {
        name: 'InventoryMaster',
        headers: ['SKU', 'Item Name', 'Category', 'HSN/SAC', 'GST %', 'Unit', 'Current Stock', 'Purchase Rate', 'Stock Value', 'Reorder Level'],
        rows: bundle.inventoryItems.map((i) => [
          i.sku,
          i.name,
          i.category,
          i.hsnSac,
          Number(i.gstRate) || 0,
          i.unit,
          Number(i.currentStock) || 0,
          Number(i.purchaseRate) || 0,
          (Number(i.currentStock) || 0) * (Number(i.purchaseRate) || 0),
          Number(i.reorderLevel) || 0,
        ]),
      },
      {
        name: 'StockMovements',
        headers: ['Entry No', 'Date', 'Type', 'Item ID', 'Qty', 'Unit Rate', 'Total Value', 'Batch No', 'Ref Doc', 'Remarks'],
        rows: bundle.inventoryMovements.map((m) => [
          m.entryNo,
          m.entryDate,
          m.movementType,
          m.itemId,
          Number(m.qty) || 0,
          Number(m.unitRate) || 0,
          Number(m.totalValue) || 0,
          m.batchNo,
          m.refDocNo,
          m.remarks,
        ]),
      },
      {
        name: 'Bills',
        headers: ['Bill No', 'Date', 'Vendor', 'GSTIN', 'PO/WO Ref', 'Base Amt', 'GST', 'TDS', 'Net Payable', 'Status'],
        rows: bundle.bills.map((b) => [
          b.billNo,
          b.billDate,
          b.vendorName,
          b.vendorGstin,
          b.poWoRef,
          Number(b.amount) || 0,
          Number(b.gstAmount) || 0,
          Number(b.tdsAmount) || 0,
          Number(b.netAmount) || 0,
          b.status,
        ]),
      },
      {
        name: 'Ledgers',
        headers: ['Ledger Name', 'Group', 'Nature', 'Opening Balance', 'Type', 'GSTIN', 'State'],
        rows: bundle.ledgers.map((l) => [
          l.name,
          l.groupName,
          l.nature,
          Number(l.openingBalance) || 0,
          l.openingType,
          l.gstin,
          l.state,
        ]),
      },
    ]);
    notify('Multi-sheet Excel workbook exported.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            SQL Backup, Restore & Bulk Data Hub
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create PostgreSQL snapshots, restore historical backups transactionally, and run bulk Excel imports/exports.
          </p>
        </div>
        <button
          type="button"
          onClick={handleFullExcelWorkbookExport}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export Full Multi-Sheet Excel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stored SQL Records</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">{totalRecords}</p>
          <p className="mt-0.5 text-xs text-slate-500">{bundle.company.name}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vouchers & Invoices</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">{bundle.vouchers.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {fmtInr(bundle.vouchers.reduce((s, v) => s + (Number(v.totalAmount) || 0), 0))} total volume
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Orders & Vendors</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {bundle.vendors.length} / {bundle.purchaseOrders.length + bundle.workOrders.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {bundle.purchaseOrders.length} POs · {bundle.workOrders.length} WOs
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saved SQL Snapshots</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100">{bundle.snapshots.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">Point-in-time recoverable</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleCreateSnapshot}
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2.5">
            <DatabaseBackup className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Create New SQL Snapshot
              </h3>
              <p className="text-xs text-slate-500">
                Serializes all tables for {bundle.company.name} into PostgreSQL backup storage.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              placeholder="Snapshot label (e.g. Pre-GSTR3B Filing)"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              <HardDriveDownload className="h-4 w-4" />
              {creating ? 'Snapshotting…' : 'Save Snapshot'}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <ArchiveRestore className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Restore from Local JSON Backup File
              </h3>
              <p className="text-xs text-slate-500">
                Upload a previously downloaded snapshot `.json` file to restore this company database.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <Upload className="h-4 w-4" />
              {uploadedFileName || 'Select Backup .json File'}
              <input type="file" accept=".json,application/json" onChange={handleJsonUpload} className="hidden" />
            </label>
            {uploadedPayload && (
              <button
                type="button"
                onClick={handleRestoreFromFile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore Uploaded File
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Bulk Import Wizards (Excel / CSV Templates)
          </h3>
          <p className="text-xs text-slate-500">
            Download standardized Excel templates, validate rows in preview, and commit directly into PostgreSQL.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { entity: 'vouchers' as ImportEntityType, label: 'Vouchers & Invoices', count: bundle.vouchers.length },
            { entity: 'vendors' as ImportEntityType, label: 'Vendors Master', count: bundle.vendors.length },
            { entity: 'po' as ImportEntityType, label: 'Purchase Orders', count: bundle.purchaseOrders.length },
            { entity: 'wo' as ImportEntityType, label: 'Work Orders', count: bundle.workOrders.length },
            { entity: 'inventory' as ImportEntityType, label: 'Inventory SKUs', count: bundle.inventoryItems.length },
          ].map((card) => (
            <button
              key={card.entity}
              type="button"
              onClick={() => onOpenBulkImport(card.entity)}
              className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50/30 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{card.label}</span>
                <Upload className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <span className="mt-1 font-mono text-xs text-slate-500">{card.count} existing</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Hostinger Shared Hosting Export Package (PHP 8 + MySQL)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Download a complete `.zip` bundle containing the built frontend, `.htaccess`, `schema.sql`, and PHP REST API (`/api/*`) ready to extract into `erp1.ashishinfotechsolution.com`.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={exportingZip}
            onClick={handleDownloadHostingerZip}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exportingZip ? 'Building Package…' : 'Download Hostinger PHP + MySQL (.zip)'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 md:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">1. Subdomain:</span> Create `erp1.ashishinfotechsolution.com` & enable SSL in hPanel.
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">2. MySQL DB:</span> Create DB in hPanel & import `schema.sql` in phpMyAdmin.
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">3. Extract & Config:</span> Extract ZIP in subdomain root & update `api/config.php`.
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">4. Auth Domain:</span> Add `erp1.ashishinfotechsolution.com` to Firebase Authorized Domains.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              SQL Snapshot History
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-500">{bundle.snapshots.length} snapshots</span>
        </div>
        {bundle.snapshots.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No SQL snapshots saved yet. Create a snapshot above to enable one-click rollback and JSON backup downloads.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Snapshot Label</th>
                  <th className="px-4 py-2.5">Created By</th>
                  <th className="px-4 py-2.5 text-right">Records</th>
                  <th className="px-4 py-2.5">Created At</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bundle.snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-slate-500">#{snap.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{snap.label}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{snap.createdBy}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{snap.recordCount}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {new Date(snap.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={downloadingId === snap.id}
                          onClick={() => handleDownloadSnapshotJson(snap.id, snap.label)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" />
                          JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(snap.id, snap.label)}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                        >
                          <ArchiveRestore className="h-3 w-3" />
                          Restore
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
