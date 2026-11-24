import React, { useEffect, useState } from 'react';
import { Building2, Landmark, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { BankAccount, Company, ErpUser, GstMasterRow, TermsTemplate } from '../types/erp.ts';

interface SetupAdminViewProps {
  company: Company;
  companies: Company[];
  termsTemplates: TermsTemplate[];
  masterData: GstMasterRow[];
  onRefresh: () => Promise<void>;
  onSwitchCompany: (companyId: number) => Promise<void>;
  onConfirmDelete: (title: string, desc: string, action: () => Promise<void>) => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const SetupAdminView: React.FC<SetupAdminViewProps> = ({
  company,
  companies,
  termsTemplates,
  masterData,
  onRefresh,
  onSwitchCompany,
  onConfirmDelete,
  notify,
}) => {
  const [tab, setTab] = useState<'profile' | 'banks' | 'terms' | 'companies' | 'users'>('profile');
  const [form, setForm] = useState<Company>(company);
  const [saving, setSaving] = useState(false);
  const [verifyingGst, setVerifyingGst] = useState(false);

  const [newBank, setNewBank] = useState<BankAccount>({
    id: '',
    bankName: '',
    branch: '',
    accountNo: '',
    ifscCode: '',
    accountType: 'Current',
    isDefault: false,
  });

  const [newTerm, setNewTerm] = useState({
    name: '',
    docType: 'Purchase Order',
    content: '',
    isDefault: false,
  });

  const [newCompany, setNewCompany] = useState({
    name: '',
    legalName: '',
    gstin: '',
    state: 'Rajasthan',
    stateCode: '08',
    city: '',
    email: '',
  });

  const [users, setUsers] = useState<ErpUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    setForm(company);
  }, [company]);

  useEffect(() => {
    if (tab === 'users') {
      setLoadingUsers(true);
      apiFetch<ErpUser[]>('/api/users')
        .then(setUsers)
        .catch((err) => notify(err.message || 'Failed to load users', true))
        .finally(() => setLoadingUsers(false));
    }
  }, [tab, notify]);

  const states = masterData.filter((m) => m.category === 'state');

  const handleVerifyCompanyGstin = async () => {
    if (!form.gstin || form.gstin.trim().length < 15) {
      notify('Enter a 15-character GSTIN before verifying.', true);
      return;
    }
    setVerifyingGst(true);
    try {
      const res = await apiFetch<any>('/api/gst/verify', {
        method: 'POST',
        body: JSON.stringify({ gstin: form.gstin }),
      });
      setForm((prev) => ({
        ...prev,
        gstin: res.gstin,
        pan: res.pan || prev.pan,
        state: res.state || prev.state,
        stateCode: res.stateCode || prev.stateCode,
        legalName: res.legalName || prev.legalName,
        name: prev.name || res.tradeName || res.legalName,
        address: res.address || prev.address,
        city: res.city || prev.city,
        pincode: res.pincode || prev.pincode,
      }));
      notify(`Company GSTIN verified (${res.source}).`);
    } catch (err: any) {
      notify(err.message || 'GSTIN verification failed.', true);
    } finally {
      setVerifyingGst(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await onRefresh();
      notify('Company profile updated in PostgreSQL.');
    } catch (err: any) {
      notify(err.message || 'Failed to update company profile.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleIfscLookup = async () => {
    if (!newBank.ifscCode) return;
    try {
      const res = await apiFetch<any>(`/api/ifsc/${newBank.ifscCode.trim()}`);
      setNewBank((prev) => ({
        ...prev,
        ifscCode: res.ifsc,
        bankName: res.bankName || prev.bankName,
        branch: res.branch || prev.branch,
      }));
      notify(`Fetched ${res.bankName} (${res.branch}).`);
    } catch (err: any) {
      notify(err.message || 'IFSC lookup failed.', true);
    }
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.bankName || !newBank.accountNo) {
      notify('Bank Name and Account Number are required.', true);
      return;
    }
    const updatedBanks = [
      ...(form.banks || []).map((b) => (newBank.isDefault ? { ...b, isDefault: false } : b)),
      { ...newBank, id: `bnk-${Date.now()}` },
    ];
    try {
      await apiFetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        body: JSON.stringify({ banks: updatedBanks }),
      });
      setNewBank({
        id: '',
        bankName: '',
        branch: '',
        accountNo: '',
        ifscCode: '',
        accountType: 'Current',
        isDefault: false,
      });
      await onRefresh();
      notify('Bank account added to company profile.');
    } catch (err: any) {
      notify(err.message || 'Failed to add bank account.', true);
    }
  };

  const handleDeleteBank = async (bankId: string) => {
    const updatedBanks = (form.banks || []).filter((b) => b.id !== bankId);
    try {
      await apiFetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        body: JSON.stringify({ banks: updatedBanks }),
      });
      await onRefresh();
      notify('Bank account removed.');
    } catch (err: any) {
      notify(err.message || 'Failed to remove bank account.', true);
    }
  };

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.name || !newTerm.content) {
      notify('Template name and content are required.', true);
      return;
    }
    try {
      await apiFetch('/api/terms', {
        method: 'POST',
        body: JSON.stringify({ companyId: company.id, ...newTerm }),
      });
      setNewTerm({ name: '', docType: 'Purchase Order', content: '', isDefault: false });
      await onRefresh();
      notify('Terms template saved.');
    } catch (err: any) {
      notify(err.message || 'Failed to add terms template.', true);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name.trim()) {
      notify('Company display name is required.', true);
      return;
    }
    try {
      const created = await apiFetch<Company>('/api/companies', {
        method: 'POST',
        body: JSON.stringify(newCompany),
      });
      setNewCompany({
        name: '',
        legalName: '',
        gstin: '',
        state: 'Rajasthan',
        stateCode: '08',
        city: '',
        email: '',
      });
      await onSwitchCompany(created.id);
      notify(`Company "${created.name}" created and activated.`);
    } catch (err: any) {
      notify(err.message || 'Failed to create company.', true);
    }
  };

  const handleUpdateUserRole = async (userId: number, role: string, active: boolean) => {
    try {
      const updated = await apiFetch<ErpUser>(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role, active }),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      notify(`Updated access for ${updated.email}.`);
    } catch (err: any) {
      notify(err.message || 'Failed to update user access.', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Company Setup & Administration
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure GST registration, company bank accounts, standard terms templates, entities, and user access.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {[
          { id: 'profile', label: 'Company & GST Profile' },
          { id: 'banks', label: 'Banks & Numbering' },
          { id: 'terms', label: 'Terms Templates' },
          { id: 'companies', label: 'Companies' },
          { id: 'users', label: 'Users & Access' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveCompany}
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Display Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Legal Registered Name</label>
              <input
                type="text"
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Company GSTIN</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  maxLength={15}
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  disabled={verifyingGst}
                  onClick={handleVerifyCompanyGstin}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {verifyingGst ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">PAN</label>
              <input
                type="text"
                value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">TAN</label>
              <input
                type="text"
                value={form.tan}
                onChange={(e) => setForm({ ...form, tan: e.target.value.toUpperCase() })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">CIN</label>
              <input
                type="text"
                value={form.cin}
                onChange={(e) => setForm({ ...form, cin: e.target.value.toUpperCase() })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Registered Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">State (Place of Origin)</label>
              <select
                value={form.state}
                onChange={(e) => {
                  const found = states.find((s) => s.name === e.target.value);
                  setForm({
                    ...form,
                    state: e.target.value,
                    stateCode: found ? found.code : form.stateCode,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {states.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">GST State Code</label>
              <input
                type="text"
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Pincode</label>
              <input
                type="text"
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Financial Year Start</label>
              <input
                type="date"
                value={form.financialYearStart}
                onChange={(e) => setForm({ ...form, financialYearStart: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving Profile…' : 'Save Company Profile'}
            </button>
          </div>
        </form>
      )}

      {tab === 'banks' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-emerald-600" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add Company Bank Account
              </h3>
            </div>
            <form onSubmit={handleAddBank} className="mt-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="IFSC Code (11 chars)"
                  value={newBank.ifscCode}
                  onChange={(e) => setNewBank({ ...newBank, ifscCode: e.target.value.toUpperCase() })}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={handleIfscLookup}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Fetch IFSC
                </button>
              </div>
              <input
                type="text"
                placeholder="Bank Name"
                value={newBank.bankName}
                onChange={(e) => setNewBank({ ...newBank, bankName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Branch"
                  value={newBank.branch || ''}
                  onChange={(e) => setNewBank({ ...newBank, branch: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="Account Number"
                  value={newBank.accountNo}
                  onChange={(e) => setNewBank({ ...newBank, accountNo: e.target.value })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={!!newBank.isDefault}
                  onChange={(e) => setNewBank({ ...newBank, isDefault: e.target.checked })}
                />
                Set as default invoice & payment bank
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Bank Account
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Configured Bank Accounts ({(form.banks || []).length})
            </h3>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {(form.banks || []).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {b.bankName} {b.isDefault ? '(Default)' : ''}
                    </p>
                    <p className="font-mono text-slate-500">
                      A/C: {b.accountNo} · IFSC: {b.ifscCode} {b.branch ? `· ${b.branch}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBank(b.id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {(!form.banks || form.banks.length === 0) && (
                <p className="py-6 text-center text-xs text-slate-500">No bank accounts configured.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'terms' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleAddTerm}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Create Terms & Conditions Template
            </h3>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Template Name (e.g. Standard PO Terms)"
                value={newTerm.name}
                onChange={(e) => setNewTerm({ ...newTerm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <select
                value={newTerm.docType}
                onChange={(e) => setNewTerm({ ...newTerm, docType: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="Purchase Order">Purchase Order</option>
                <option value="Work Order">Work Order</option>
                <option value="Tax Invoice">Tax Invoice</option>
                <option value="Proforma Invoice">Proforma Invoice</option>
              </select>
              <textarea
                rows={5}
                placeholder="Enter standard commercial, GST, and delivery clauses..."
                value={newTerm.content}
                onChange={(e) => setNewTerm({ ...newTerm, content: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Save Template
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Saved Templates ({termsTemplates.length})
            </h3>
            <div className="mt-4 space-y-3">
              {termsTemplates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-200 p-3.5 text-xs dark:border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{t.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-slate-500">[{t.docType}]</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmDelete(
                          'Delete Terms Template',
                          `Remove template "${t.name}"?`,
                          async () => {
                            await apiFetch(`/api/terms/${t.id}?companyId=${company.id}`, {
                              method: 'DELETE',
                            });
                            await onRefresh();
                            notify('Terms template deleted.');
                          }
                        )
                      }
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-400">{t.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'companies' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleCreateCompany}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Create Additional Company / GSTIN Entity
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Company Name"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Legal Name"
                value={newCompany.legalName}
                onChange={(e) => setNewCompany({ ...newCompany, legalName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  maxLength={15}
                  placeholder="GSTIN (Optional)"
                  value={newCompany.gstin}
                  onChange={(e) => setNewCompany({ ...newCompany, gstin: e.target.value.toUpperCase() })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                />
                <select
                  value={newCompany.state}
                  onChange={(e) => {
                    const found = states.find((s) => s.name === e.target.value);
                    setNewCompany({
                      ...newCompany,
                      state: e.target.value,
                      stateCode: found ? found.code : newCompany.stateCode,
                    });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {states.map((s) => (
                    <option key={s.code} value={s.name}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Create & Switch Company
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Active Companies ({companies.length})
            </h3>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {c.name} {c.id === company.id ? '(Current)' : ''}
                    </p>
                    <p className="font-mono text-slate-500">
                      {c.gstin || 'No GSTIN'} · {c.state} ({c.stateCode})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.id !== company.id && (
                      <button
                        type="button"
                        onClick={() => onSwitchCompany(c.id)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                      >
                        Switch
                      </button>
                    )}
                    {companies.length > 1 && c.id !== company.id && (
                      <button
                        type="button"
                        onClick={() =>
                          onConfirmDelete(
                            'Archive Company',
                            `Archive "${c.name}"?`,
                            async () => {
                              await apiFetch(`/api/companies/${c.id}`, { method: 'DELETE' });
                              await onRefresh();
                              notify(`Archived ${c.name}.`);
                            }
                          )
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Registered ERP Users & Role Access
              </h3>
            </div>
          </div>
          {loadingUsers ? (
            <div className="p-6 text-center text-xs text-slate-500">Loading users…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.id, e.target.value, u.active)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Accountant">Accountant</option>
                          <option value="Inventory Manager">Inventory Manager</option>
                          <option value="Viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={u.active}
                          onChange={(e) => handleUpdateUserRole(u.id, u.role, e.target.checked)}
                        />
                      </td>
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
