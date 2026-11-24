import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  Receipt,
  Settings,
  Sun,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, getSessionToken, setSessionToken } from './lib/api.ts';
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

type AuthMode = 'login' | 'signup' | 'forgot';

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

const ADMIN_SUPPORT_EMAIL = 'ashishinfotech.udr@gmail.com';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [forgotNote, setForgotNote] = useState('');

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

  useEffect(() => {
    apiFetch<{ hasUsers: boolean }>('/api/auth/status')
      .then((res) => {
        setHasUsers(res.hasUsers);
        if (!res.hasUsers) {
          setAuthMode('signup');
        }
      })
      .catch(() => {
        setHasUsers(true);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const loadWorkspace = useCallback(async (companyIdOverride?: number) => {
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
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: ErpUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput.trim(),
          email: emailInput.trim(),
          password: passwordInput,
        }),
      });
      setSessionToken(res.token);
      setDbUser(res.user);
      setPasswordInput('');
      await loadWorkspace();
    } catch (err: any) {
      setAuthError(err.message || 'Sign in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ token: string; user: ErpUser }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput.trim(),
          email: emailInput.trim(),
          password: passwordInput,
        }),
      });
      setSessionToken(res.token);
      setDbUser(res.user);
      setHasUsers(true);
      setPasswordInput('');
      setConfirmPasswordInput('');
      await loadWorkspace();
    } catch (err: any) {
      setAuthError(err.message || 'Account creation failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput.trim(),
          email: emailInput.trim(),
          note: forgotNote.trim(),
        }),
      });
      setAuthSuccess(res.message);
    } catch (err: any) {
      setAuthError(err.message || 'Could not submit password reset request.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = () => {
    setSessionToken(null);
    setDbUser(null);
    setBundle(null);
    setCompanies([]);
    setActiveCompanyId(null);
    setPasswordInput('');
    setConfirmPasswordInput('');
    setAuthError(null);
    setAuthSuccess(null);
    setAuthMode('login');
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

  const mailtoHref = `mailto:${ADMIN_SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `VyaparLedger ERP Password Reset Request - ${emailInput || usernameInput}`
  )}&body=${encodeURIComponent(
    `Hello Administrator,\n\nPlease reset my VyaparLedger ERP password.\n\nUsername: ${usernameInput}\nEmail ID: ${emailInput}\nNote: ${forgotNote || 'Forgot password'}\n`
  )}`;

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Initializing VyaparLedger ERP…
      </div>
    );
  }

  if (!dbUser || !getSessionToken()) {
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

          <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className={`rounded-md py-2 text-xs font-semibold transition ${
                authMode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className={`rounded-md py-2 text-xs font-semibold transition ${
                authMode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Create Account
            </button>
          </div>

          {!hasUsers && authMode === 'signup' && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              First account setup: the first registered user automatically becomes the{' '}
              <span className="font-semibold">Administrator</span>.
            </div>
          )}

          {authError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {authError}
            </div>
          )}

          {authSuccess && (
            <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <p>{authSuccess}</p>
              <a
                href={mailtoHref}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800"
              >
                <Mail className="h-3.5 w-3.5" />
                Email {ADMIN_SUPPORT_EMAIL}
              </a>
            </div>
          )}

          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email ID
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
              >
                <KeyRound className="h-4 w-4" />
                {authBusy ? 'Signing in…' : 'Sign In to ERP'}
              </button>
            </form>
          )}

          {authMode === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  autoComplete="username"
                  placeholder="Choose a username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email ID
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Duplicate Email IDs are prevented automatically.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password (min 6 characters)
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Create password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
              >
                <UserPlus className="h-4 w-4" />
                {authBusy ? 'Creating Account…' : !hasUsers ? 'Create Administrator Account' : 'Create User Account'}
              </button>
            </form>
          )}

          {authMode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="mt-5 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                Submit your registered Username and Email ID below, and email{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {ADMIN_SUPPORT_EMAIL}
                </span>{' '}
                for password reset assistance.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Registered Email ID
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Message (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Reason or contact phone"
                  value={forgotNote}
                  onChange={(e) => setForgotNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  <Mail className="h-4 w-4" />
                  {authBusy ? 'Sending Request…' : 'Send Reset Request'}
                </button>
                <a
                  href={mailtoHref}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Compose Email to {ADMIN_SUPPORT_EMAIL}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
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
                {dbUser.username || dbUser.name} ({dbUser.role})
              </p>
              <p className="truncate font-mono text-[11px] text-slate-500">{dbUser.email}</p>
            </div>
            <button
              type="button"
              title="Sign Out"
              onClick={handleSignOut}
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
                  currentUser={dbUser}
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
