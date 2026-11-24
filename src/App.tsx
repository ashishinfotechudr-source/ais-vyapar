import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { apiFetch } from './lib/api.ts';
import { signInWithGoogle, signOutUser, subscribeAuth } from './lib/firebase.ts';
import type { PdfOutput } from './lib/pdfGenerator.ts';
import type { Company, ErpBundle, ErpUser, GstMasterRow } from './types/erp.ts';
import { BulkImportModal, type ImportEntityType } from './components/BulkImportModal.tsx';
import { ConfirmModal } from './components/ConfirmModal.tsx';
import { PdfPreviewModal } from './components/PdfPreviewModal.tsx';
import { BackupRestoreView } from './modules/BackupRestoreView.tsx';
import { BillsPaymentsView } from './modules/BillsPaymentsView.tsx';
import { DashboardView } from './modules/DashboardView.tsx';
import { FinalAccountsView } from './modules/FinalAccountsView.tsx';
import { GstComplianceView } from './modules/GstComplianceView.tsx';
import { InventoryView } from './modules/InventoryView.tsx';
import { OrdersView } from './modules/OrdersView.tsx';
import { SetupAdminView } from './modules/SetupAdminView.tsx';
import { VendorsView } from './modules/VendorsView.tsx';
import { VouchersView } from './modules/VouchersView.tsx';

type NavTab =
  | 'dashboard'
  | 'vendors'
  | 'orders'
  | 'vouchers'
  | 'bills'
  | 'inventory'
  | 'gst'
  | 'accounts'
  | 'backup'
  | 'setup';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'vendors', label: 'Vendors & GSTIN', icon: Users },
  { id: 'orders', label: 'PO & Work Orders', icon: ClipboardList },
  { id: 'vouchers', label: 'Vouchers & Invoices', icon: Receipt },
  { id: 'bills', label: 'Bills & Payments', icon: CreditCard },
  { id: 'inventory', label: 'Advanced Inventory', icon: Package },
  { id: 'gst', label: 'GST Reports & Master', icon: FileSpreadsheet },
  { id: 'accounts', label: 'Final Accounts', icon: BookOpen },
  { id: 'backup', label: 'SQL Backup & Restore', icon: DatabaseBackup },
  { id: 'setup', label: 'Setup & Admin', icon: Settings },
];

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbUser, setDbUser] = useState<ErpUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<ErpBundle | null>(null);
  const [masterData, setMasterData] = useState<GstMasterRow[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfOutput | null>(null);
  const [bulkImport, setBulkImport] = useState<{ open: boolean; entity: ImportEntityType }>({
    open: false,
    entity: 'vouchers',
  });
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    danger: boolean;
    busy: boolean;
    action: (() => Promise<void>) | null;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    danger: true,
    busy: false,
    action: null,
  });

  const notify = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4200);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const loadWorkspace = useCallback(
    async (companyIdOverride?: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const qs = companyIdOverride ? `?companyId=${companyIdOverride}` : '';
        const res = await apiFetch<{
          user: ErpUser;
          companies: Company[];
          activeCompanyId: number;
          bundle: ErpBundle;
          masterData: GstMasterRow[];
        }>(`/api/bootstrap${qs}`);
        setDbUser(res.user);
        setCompanies(res.companies);
        setActiveCompanyId(res.activeCompanyId);
        setBundle(res.bundle);
        setMasterData(res.masterData);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load ERP workspace.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        loadWorkspace();
      } else {
        setBundle(null);
        setCompanies([]);
        setDbUser(null);
      }
    });
    return () => unsub();
  }, [loadWorkspace]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      notify(err.message || 'Google sign-in cancelled or failed.', true);
    } finally {
      setSigningIn(false);
    }
  };

  const handleConfirmDelete = (title: string, desc: string, action: () => Promise<void>) => {
    setConfirmState({
      open: true,
      title,
      description: desc,
      confirmLabel: 'Delete',
      danger: true,
      busy: false,
      action,
    });
  };

  const handleConfirmAction = (
    title: string,
    description: string,
    confirmLabel: string,
    danger: boolean,
    action: () => Promise<void>
  ) => {
    setConfirmState({
      open: true,
      title,
      description,
      confirmLabel,
      danger,
      busy: false,
      action,
    });
  };

  const executeConfirm = async () => {
    if (!confirmState.action) return;
    setConfirmState((prev) => ({ ...prev, busy: true }));
    try {
      await confirmState.action();
      setConfirmState((prev) => ({ ...prev, open: false, busy: false, action: null }));
    } catch (err: any) {
      setConfirmState((prev) => ({ ...prev, busy: false }));
      notify(err.message || 'Action failed.', true);
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Initializing VyaparLedger ERP…
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-emerald-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                VyaparLedger ERP
              </h1>
              <p className="text-xs text-slate-500">GST Accounting, Inventory & SQL ERP Suite</p>
            </div>
          </div>

          <div className="mt-6 space-y-2.5 border-y border-slate-200 py-5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Included Capabilities:</p>
            <ul className="space-y-1.5">
              <li>• PostgreSQL Relational Persistence with Snapshot Backup & Restore</li>
              <li>• GSTR-1, GSTR-2 & GSTR-3B Compliance with Table 6.1 ITC Utilization</li>
              <li>• Tally GSTIN Verification & Vendor Autofill + GSTZen Master Catalog</li>
              <li>• Multi-Warehouse Advanced Inventory (Weighted Avg, Batch/Serial, Gate Pass)</li>
              <li>• Real-Time PDF Invoice Generation & Bulk Excel Import/Export</li>
            </ul>
          </div>

          <button
            type="button"
            disabled={signingIn}
            onClick={handleSignIn}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-emerald-600">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-bold tracking-tight">VyaparLedger</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">GST ERP Suite</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded p-1 text-slate-500 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {dbUser?.name || firebaseUser.displayName || 'ERP User'}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-500">{firebaseUser.email}</p>
            </div>
            <button
              type="button"
              title="Sign Out"
              onClick={() => signOutUser()}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {companies.length > 0 && (
              <select
                value={activeCompanyId ?? companies[0].id}
                onChange={(e) => loadWorkspace(Number(e.target.value))}
                className="max-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.gstin ? `(${c.gstin})` : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle Theme"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {loading && !bundle ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Loading SQL ERP workspace…
            </div>
          ) : loadError && !bundle ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <p className="font-semibold">{loadError}</p>
              <button
                type="button"
                onClick={() => loadWorkspace(activeCompanyId ?? undefined)}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Retry
              </button>
            </div>
          ) : bundle ? (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  bundle={bundle}
                  onNavigate={(t) => setActiveTab(t as NavTab)}
                />
              )}
              {activeTab === 'vendors' && (
                <VendorsView
                  companyId={bundle.company.id}
                  vendors={bundle.vendors}
                  masterData={masterData}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onOpenBulkImport={() => setBulkImport({ open: true, entity: 'vendors' })}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
              {activeTab === 'orders' && (
                <OrdersView
                  company={bundle.company}
                  vendors={bundle.vendors}
                  inventoryItems={bundle.inventoryItems}
                  purchaseOrders={bundle.purchaseOrders}
                  workOrders={bundle.workOrders}
                  termsTemplates={bundle.termsTemplates}
                  masterData={masterData}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onOpenBulkImport={(entity) => setBulkImport({ open: true, entity })}
                  onPreviewPdf={setPdfPreview}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
              {activeTab === 'vouchers' && (
                <VouchersView
                  company={bundle.company}
                  vouchers={bundle.vouchers}
                  vendors={bundle.vendors}
                  inventoryItems={bundle.inventoryItems}
                  ledgers={bundle.ledgers}
                  masterData={masterData}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onOpenBulkImport={() => setBulkImport({ open: true, entity: 'vouchers' })}
                  onPreviewPdf={setPdfPreview}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
              {activeTab === 'bills' && (
                <BillsPaymentsView
                  company={bundle.company}
                  bills={bundle.bills}
                  paymentSheets={bundle.paymentSheets}
                  vendors={bundle.vendors}
                  vouchers={bundle.vouchers}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onPreviewPdf={setPdfPreview}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryView
                  company={bundle.company}
                  items={bundle.inventoryItems}
                  movements={bundle.inventoryMovements}
                  warehouses={bundle.warehouses}
                  gatePasses={bundle.gatePasses}
                  vendors={bundle.vendors}
                  masterData={masterData}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onOpenBulkImport={() => setBulkImport({ open: true, entity: 'inventory' })}
                  onPreviewPdf={setPdfPreview}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
              {activeTab === 'gst' && (
                <GstComplianceView
                  company={bundle.company}
                  masterData={masterData}
                  onRefreshMaster={setMasterData}
                  onPreviewPdf={setPdfPreview}
                  notify={notify}
                />
              )}
              {activeTab === 'accounts' && (
                <FinalAccountsView
                  company={bundle.company}
                  accountGroups={bundle.accountGroups}
                  ledgers={bundle.ledgers}
                  vouchers={bundle.vouchers}
                  bills={bundle.bills}
                  inventoryItems={bundle.inventoryItems}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  notify={notify}
                />
              )}
              {activeTab === 'backup' && (
                <BackupRestoreView
                  bundle={bundle}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onOpenBulkImport={(entity) => setBulkImport({ open: true, entity })}
                  onConfirmAction={handleConfirmAction}
                  notify={notify}
                />
              )}
              {activeTab === 'setup' && (
                <SetupAdminView
                  company={bundle.company}
                  companies={companies}
                  termsTemplates={bundle.termsTemplates}
                  masterData={masterData}
                  onRefresh={() => loadWorkspace(bundle.company.id)}
                  onSwitchCompany={(cid) => loadWorkspace(cid)}
                  onConfirmDelete={handleConfirmDelete}
                  notify={notify}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-lg px-4 py-3 text-xs font-semibold text-white shadow-lg ${
            toast.isError ? 'bg-red-600' : 'bg-slate-900 dark:bg-emerald-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <PdfPreviewModal pdf={pdfPreview} onClose={() => setPdfPreview(null)} />

      {bundle && (
        <BulkImportModal
          open={bulkImport.open}
          entity={bulkImport.entity}
          companyId={bundle.company.id}
          onClose={() => setBulkImport((prev) => ({ ...prev, open: false }))}
          onImported={() => loadWorkspace(bundle.company.id)}
          notify={notify}
        />
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        danger={confirmState.danger}
        busy={confirmState.busy}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false, action: null }))}
      />
    </div>
  );
}
