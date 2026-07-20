import React, { useState } from 'react';
import { User, Company, Branch, Store, AuditTrail } from '../types';
import {
  Plus, Pencil, Trash2, ShieldAlert, Copy, CheckCircle, X
} from 'lucide-react';
import { ConfirmActionModal } from './ConfirmActionModal';
import { toast } from '../utils/toast';

interface ManageUsersProps {
  currentPage: string;
  users: User[];
  companies: Company[];
  branches: Branch[];
  stores: Store[];
  auditTrails: AuditTrail[];
  rolePermissions: Record<string, string[]>;
  currentUser: User | null;
  currentCompanyId: number | null;
  currentBranchId: number | null;
  currentStoreId: number | null;
  isSuperAdmin: boolean;
  isGlobalSuperAdmin: boolean;
  translate: (text: string) => string;
  logAction: (action: string, details: string) => void;
  saveAllData: (updatedFields: any) => void;
  onNavigate: (page: string) => void;
}

export default function ManageUsers({
  currentPage,
  users,
  companies,
  branches,
  stores,
  auditTrails,
  rolePermissions,
  currentUser,
  currentCompanyId,
  currentBranchId,
  currentStoreId,
  isSuperAdmin,
  isGlobalSuperAdmin,
  translate: t,
  logAction,
  saveAllData,
  onNavigate
}: ManageUsersProps) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [selectedStaffPages, setSelectedStaffPages] = useState<string[]>([]);
  const [lastSyncedStaffId, setLastSyncedStaffId] = useState<number | null>(null);

  // Security Telemetry Panel filters
  const [telemetrySearch, setTelemetrySearch] = useState('');
  const [telemetryCategory, setTelemetryCategory] = useState('All');
  const [telemetryUser, setTelemetryUser] = useState('All');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  });

  // Helper getters
  const getCompanyName = (id: number | null) => id ? (companies.find(c => c.id === id)?.name || t('Unknown')) : t('Global / All');
  const getBranchName = (id: number | null) => id ? (branches.find(b => b.id === id)?.name || t('Unknown')) : t('Global / All');
  const getStoreName = (id: number | null) => id ? (stores.find(s => s.id === id)?.name || t('Unknown')) : t('Global / All');

  // Filter users based on logged-in user's administrative level
  let usersToRender = [...users];

  // Hide root_mandate from everyone else
  if (currentUser?.username !== 'root_mandate') {
    usersToRender = usersToRender.filter(u => u.username !== 'root_mandate');
  }

  // Hide Global Super Admin from standard Admins
  if (!isGlobalSuperAdmin) {
    usersToRender = usersToRender.filter(u => u.username !== 'superadmin');
  }

  // Hide Super Admins and other companies from regular Admins
  if (!isSuperAdmin) {
    usersToRender = usersToRender.filter(
      u => u.role !== 'Super Admin' && u.companyId === currentCompanyId
    );
  }

  // Filter staff to render (exclude Super Admins)
  let staffToRender = users.filter(u => u.role !== 'Super Admin');
  if (currentUser?.username !== 'root_mandate') {
    staffToRender = staffToRender.filter(u => u.username !== 'root_mandate' && u.username !== 'superadmin');
  }
  if (!isSuperAdmin) {
    staffToRender = staffToRender.filter(u => u.companyId === currentCompanyId);
  }

  // Categories of modules for cleaner representation
  const moduleCategories = [
    {
      title: t('Core Operational Panels'),
      items: [
        { id: 'dashboard', name: t('Dashboard') },
        { id: 'stock-items', name: t('Stock Items') },
        { id: 'purchase-order', name: t('Purchase Orders') },
        { id: 'sales-order', name: t('Sales Orders') },
        { id: 'expenses', name: t('Expenses') },
        { id: 'receipts', name: t('Receipts') },
      ]
    },
    {
      title: t('Master Data Panels'),
      items: [
        { id: 'customers', name: t('Customers (Master)') },
        { id: 'suppliers', name: t('Suppliers (Master)') },
        { id: 'categories', name: t('Stock Categories (Master)') },
        { id: 'taxes', name: t('Taxes (Master)') },
        { id: 'stores', name: t('Store Management (Master)') },
        { id: 'branches', name: t('Branch Management (Master)') },
        { id: 'companies', name: t('Company Registry (Super Admin)') },
        { id: 'data-recovery', name: t('Data Recovery / Trash (Master)') },
      ]
    },
    {
      title: t('Import Tools'),
      items: [
        { id: 'import-stock', name: t('Import Stock Items') },
        { id: 'import-customers', name: t('Import Customers') },
        { id: 'import-suppliers', name: t('Import Suppliers') },
      ]
    },
    {
      title: t('Report Sheets'),
      items: [
        { id: 'report-transaction', name: t('Transaction Logs (Date Search)') },
        { id: 'report-financial', name: t('Financial Report (P&L)') },
        { id: 'report-daily', name: t('Daily Activity Sheet') },
        { id: 'report-monthly', name: t('Monthly Report Sheet') },
        { id: 'report-sales', name: t('Sales Report Sheet') },
        { id: 'report-purchase', name: t('Purchase Report Sheet') },
        { id: 'report-sales-outstanding', name: t('Sales Outstanding') },
        { id: 'report-purchase-outstanding', name: t('Purchase Outstanding') },
        { id: 'report-lowstock', name: t('Low Stock Report') },
        { id: 'report-po-details', name: t('PO Details Report') },
      ]
    }
  ];

  // Toggle user block status
  const handleToggleUserBlock = (userId: number, blockBool: boolean) => {
    if (currentUser?.username !== 'root_mandate') return;
    const target = users.find(u => u.id === userId);
    if (target) {
      const status = blockBool ? 'Blocked' : 'Active';
      const updatedUsers = users.map(u => u.id === userId ? { ...u, status } : u);
      saveAllData({ users: updatedUsers });
      logAction(blockBool ? 'Blocked Account' : 'Unblocked Account', `Root mandate changed scope accessibility of ${target.username} to ${status}`);
      toast.success(`${t('Account')} ${target.name} has been ${blockBool ? t('blocked') : t('unblocked')}.`);
    }
  };

  // Delete user handler
  const handleDeleteUser = (id: number) => {
    if (id === currentUser?.id) {
      toast.error(t('Cannot self-terminate active session!'));
      return;
    }

    const target = users.find(u => u.id === id);
    if (!target) return;

    if (target.username === 'root_mandate') {
      toast.error(t('Super Admin is locked and cannot be deleted'));
      return;
    }

    const isFounder = currentUser?.username === 'root_mandate';
    const isGlobalSA = currentUser?.username === 'superadmin' || isFounder;

    if (!isFounder) {
      // Non-founders cannot delete the global superadmin
      if (target.username === 'superadmin') {
        toast.error(t('Global Super Admin is locked and cannot be deleted'));
        return;
      }

      // If not even global super admin, apply company admin checks
      if (!isGlobalSA) {
        if (target.role === 'Super Admin') {
          toast.error(t('Insufficient authorization scope'));
          return;
        }

        // Company Admin of the company can add/delete his/her own staff
        if (target.companyId !== currentCompanyId) {
          toast.error(t('Cannot delete users from other companies'));
          return;
        }
      }
    }

    setConfirmModal({
      isOpen: true,
      title: t('Delete User Account'),
      description: `${t('Are you sure you want to completely revoke the core operational scope for')} ${target.name}? ${t('This action is irreversible.')}`,
      onConfirm: () => {
        const updatedUsers = users.filter(u => u.id !== id);
        saveAllData({ users: updatedUsers });
        logAction('Deleted User Account', `Revoked access for operator ${target.username}`);
      }
    });
  };

  // Copy password helper
  const copyUserPassword = (pwd: string) => {
    navigator.clipboard.writeText(pwd);
    toast.success(t('Password copied to clipboard!'));
  };

  // Save matrix permissions handler
  const saveDynamicPermissions = () => {
    if (!isSuperAdmin) return;

    const roles = ['Admin', 'Store Admin', 'Retailer', 'Wholesaler'];
    const updatedPermissions: Record<string, string[]> = {
      'Super Admin': [
        'dashboard', 'stock-items', 'purchase-order', 'sales-order', 'expenses', 'receipts',
        'companies', 'branches', 'stores', 'customers', 'suppliers', 'categories', 'taxes',
        'import-stock', 'import-customers', 'import-suppliers',
        'report-transaction', 'report-financial', 'report-daily', 'report-monthly', 'report-sales', 'report-purchase',
        'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details',
        'user-info', 'user-access'
      ],
      'Admin': [],
      'Store Admin': [],
      'Retailer': [],
      'Wholesaler': []
    };

    roles.forEach(r => {
      const inputs = document.querySelectorAll(`input[data-role="${r}"]`) as NodeListOf<HTMLInputElement>;
      inputs.forEach(input => {
        if (input.checked && input.dataset.module) {
          updatedPermissions[r].push(input.dataset.module);
        }
      });
    });

    saveAllData({ rolePermissions: updatedPermissions });
    logAction('Updated Permissions Matrix', 'Custom operational permissions modified.');
    toast.success(t('Operational parameters updated successfully'));
  };

  // Modal Save handler
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const data = { ...editingUser };
    data.companyId = isSuperAdmin ? (data.companyId ? parseInt(data.companyId as any) : null) : currentCompanyId;
    data.branchId = (data.branchId as any) === 'None' || !data.branchId ? null : parseInt(data.branchId as any);
    data.storeId = (data.storeId as any) === 'None' || !data.storeId ? null : parseInt(data.storeId as any);

    if (data.id) {
      // Edit
      const updated = users.map(u => u.id === data.id ? data : u);
      saveAllData({ users: updated });
      logAction('Edited User', `Modified user details for ${data.username}`);
      toast.success(t('User saved'));
    } else {
      // Create
      const nextId = Math.max(0, ...users.map(u => u.id)) + 1;
      const newUser = {
        ...data,
        id: nextId,
        firstLogin: true,
        status: 'Active' as const
      };
      saveAllData({ users: [...users, newUser] });
      logAction('Added User', `Registered platform account: ${data.username}`);
      toast.success(t('User saved'));
    }

    setEditingUser(null);
  };

  // Define module screens for Access Matrix
  const modules = [
    { id: 'dashboard', name: t('Dashboard') },
    { id: 'stock-items', name: t('Stock Items') },
    { id: 'purchase-order', name: t('Purchase Orders') },
    { id: 'sales-order', name: t('Sales Orders') },
    { id: 'companies', name: t('Company Settings (Master)') },
    { id: 'branches', name: t('Branch Management (Master)') },
    { id: 'stores', name: t('Store Management (Master)') },
    { id: 'customers', name: t('Customers (Master)') },
    { id: 'suppliers', name: t('Suppliers (Master)') },
    { id: 'categories', name: t('Categories (Master)') },
    { id: 'taxes', name: t('Taxes (Master)') },
    { id: 'import-stock', name: t('Import - Stock Items') },
    { id: 'import-customers', name: t('Import - Customers') },
    { id: 'import-suppliers', name: t('Import - Suppliers') },
    { id: 'report-transaction', name: t('Report - Transaction Date Search') },
    { id: 'report-daily', name: t('Report - Daily Activity') },
    { id: 'report-monthly', name: t('Report - Monthly') },
    { id: 'report-sales', name: t('Report - Sales') },
    { id: 'report-purchase', name: t('Report - Purchase') },
    { id: 'report-sales-outstanding', name: t('Report - Sales Outstanding') },
    { id: 'report-purchase-outstanding', name: t('Report - Purchase Outstanding') },
    { id: 'report-lowstock', name: t('Report - Low Stock') },
    { id: 'report-po-details', name: t('Report - Purchase Order Details') },
    { id: 'user-info', name: t('User Management') }
  ];

  // --- RENDER CONTENT BY currentPage ---
  if (currentPage === 'user-info') {
    let logs = [...auditTrails];

    // Filter audit logs as requested
    if (currentUser?.username !== 'root_mandate') {
      logs = logs.filter(l => l.username !== 'root_mandate');
    }
    if (currentUser?.role !== 'Super Admin') {
      logs = logs.filter(l => l.username !== 'superadmin');
    }
    if (!isSuperAdmin) {
      logs = logs.filter(l => l.role !== 'Super Admin' && l.companyId === currentCompanyId);
    }

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">{t('Account Operations')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('Super Admins and Admins can save, modify, and inspect user passwords directly below.')}</p>
            </div>
            <button
              onClick={() => setEditingUser({
                id: 0,
                username: '',
                password: '',
                role: 'Retailer',
                name: '',
                email: '',
                companyId: currentCompanyId,
                branchId: null,
                storeId: null,
                firstLogin: true,
                status: 'Active',
                allowedPages: rolePermissions['Retailer'] || []
              })}
              className="bg-brand hover:bg-brand-hover text-white px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 shadow"
            >
              <Plus className="w-4 h-4" /> {t('Add User')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] text-left">
              <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3">{t('Name')}</th>
                  <th className="px-4 py-3">{t('Username')}</th>
                  <th className="px-4 py-3">{t('Role')}</th>
                  <th className="px-4 py-3">{t('Company')}</th>
                  <th className="px-4 py-3">{t('Branch')}</th>
                  <th className="px-4 py-3">{t('Store')}</th>
                  <th className="px-4 py-3">{t('Status')}</th>
                  <th className="px-4 py-3 text-brand">{t('Password')}</th>
                  <th className="px-4 py-3">{t('Email')}</th>
                  <th className="px-4 py-3 w-40 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                {usersToRender.map(u => {
                  const isBlocked = u.status === 'Blocked';
                  const isRoot = u.username === 'root_mandate';
                  const isSelf = u.id === currentUser?.id;

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-bold text-gray-900">{u.name}</td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-500">{u.username}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'Admin' ? 'bg-red-100 text-red-800' :
                          u.role === 'Store Admin' ? 'bg-emerald-100 text-emerald-800' :
                          u.role === 'Retailer' ? 'bg-blue-100 text-blue-800' :
                          u.role === 'Super Admin' ? 'bg-purple-100 text-purple-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {t(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{getCompanyName(u.companyId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{getBranchName(u.branchId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{getStoreName(u.storeId)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isBlocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                          {isBlocked ? t('Blocked') : t('Active')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-100 px-2 py-1 rounded text-gray-800 border font-bold font-mono">{u.password}</span>
                          <button
                            onClick={() => copyUserPassword(u.password || '')}
                            className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700"
                            title={t('Copy Password')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{u.email || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {currentUser?.username === 'root_mandate' && !isRoot && !isSelf && (
                            <button
                              onClick={() => handleToggleUserBlock(u.id, !isBlocked)}
                              className={`p-1 px-2 text-[10px] font-bold rounded border transition ${
                                isBlocked
                                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                  : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                              }`}
                            >
                              {isBlocked ? t('Unblock') : t('Block')}
                            </button>
                          )}
                          <button
                            onClick={() => setEditingUser({
                              ...u,
                              allowedPages: u.allowedPages && u.allowedPages.length > 0 ? u.allowedPages : (rolePermissions[u.role] || [])
                            })}
                            className="p-1 px-2 text-[10px] font-bold rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition inline-flex items-center gap-1"
                            title={t('Edit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t('Edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1 px-2 text-[10px] font-bold rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition inline-flex items-center gap-1"
                            title={t('Delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* AUDIT TRAILS PANEL */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 text-sm mb-1 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-brand" />
            {t('Authenticated Core System Action Audit Trails')}
          </h3>
          <p className="text-xs text-gray-500 mb-4">{t('Real-time auditing of personnel tasks performed inside the security boundary.')}</p>
          <div className="overflow-y-auto max-h-[350px] scrollbar-thin border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b text-gray-500 font-bold uppercase">
                <tr>
                  <th className="p-3">{t('Timestamp')}</th>
                  <th className="p-3">{t('Operator')}</th>
                  <th className="p-3">{t('Role')}</th>
                  <th className="p-3">{t('Action Perform')}</th>
                  <th className="p-3">{t('Details')}</th>
                  <th className="p-3 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-700 font-medium">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50">
                    <td className="p-3 text-gray-400 whitespace-nowrap">{l.timestamp}</td>
                    <td className="p-3 font-bold text-gray-900">{l.username}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 font-bold border">{t(l.role)}</span></td>
                    <td className="p-3 font-bold text-brand">{l.action}</td>
                    <td className="p-3 font-mono text-gray-600 max-w-md truncate">{l.details}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: t('Delete Core Audit Trail'),
                            description: t('Are you sure you want to permanently delete this core system action audit trail log? This action is irreversible.'),
                            onConfirm: () => {
                              const remaining = auditTrails.filter(item => item.id !== l.id);
                              saveAllData({ auditTrails: remaining });
                              toast.success(t('Core action log deleted successfully.'));
                              logAction('Delete Core Action Log', `Permanently deleted core audit log ID: ${l.id}`);
                            }
                          });
                        }}
                        className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition inline-flex items-center"
                        title={t('Delete Log')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-400 font-semibold">
                      {t('No core action audits captured yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {renderUserEditModal()}

        <ConfirmActionModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          description={confirmModal.description}
        />
      </div>
    );
  }

  if (currentPage === 'user-access') {
    if (!isSuperAdmin && currentUser?.role !== 'Admin') {
      return <div className="p-4 bg-red-100 text-red-800 rounded-lg">{t('Access Denied')}</div>;
    }

    const roles = ['Admin', 'Store Admin', 'Retailer', 'Wholesaler'];
    
    // Fallback sync for selectedStaffId if not selected or invalid
    const activeStaffId = selectedStaffId !== null ? selectedStaffId : (staffToRender[0]?.id || null);
    const activeStaff = users.find(u => u.id === activeStaffId);

    // Sync selectedStaffPages state when selected operator changes
    if (activeStaff && activeStaff.id !== lastSyncedStaffId) {
      setLastSyncedStaffId(activeStaff.id);
      setSelectedStaffPages(activeStaff.allowedPages && activeStaff.allowedPages.length > 0 ? activeStaff.allowedPages : (rolePermissions[activeStaff.role] || []));
    }

    const handleSelectStaff = (s: User) => {
      setSelectedStaffId(s.id);
      setSelectedStaffPages(s.allowedPages && s.allowedPages.length > 0 ? s.allowedPages : (rolePermissions[s.role] || []));
    };

    const handleTogglePage = (pageId: string) => {
      setSelectedStaffPages(prev =>
        prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId]
      );
    };

    const handleSaveStaffPermissions = () => {
      if (!activeStaffId) return;
      const updatedUsers = users.map(u => {
        if (u.id === activeStaffId) {
          return { ...u, allowedPages: selectedStaffPages };
        }
        return u;
      });
      saveAllData({ users: updatedUsers });
      
      const targetUser = users.find(u => u.id === activeStaffId);
      logAction('Updated Staff Permissions', `Customized operational pages for operator ${targetUser?.username}`);
      toast.success(t('Permissions saved successfully!'));
    };

    return (
      <div className="space-y-6">
        {/* Render Global Matrix for Super Admin only */}
        {isSuperAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-brand" />
                  {t('Global Dynamic Access Matrix')}
                </h3>
                <p className="text-xs text-gray-500 font-semibold">{t('Configure default core module access levels across personnel roles.')}</p>
              </div>
              <button
                onClick={saveDynamicPermissions}
                className="bg-brand hover:bg-brand-hover text-white px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                <CheckCircle className="w-4 h-4" /> {t('Save Matrix Levels')}
              </button>
            </div>
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-50 border-b text-gray-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5 text-left">{t('Module / Workspace Screen')}</th>
                    <th className="px-5 py-3.5 text-center text-purple-700">Super Admin</th>
                    {roles.map(r => (
                      <th key={r} className="px-5 py-3.5 text-center text-blue-700">{t(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {modules.map(mod => (
                    <tr key={mod.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-bold text-gray-900">{mod.name}</td>
                      <td className="px-5 py-3 text-center">
                        <input type="checkbox" checked disabled className="accent-brand w-4 h-4" />
                      </td>
                      {roles.map(r => {
                        const isChecked = (rolePermissions[r] || []).includes(mod.id);
                        return (
                          <td key={r} className="px-5 py-3 text-center">
                            <input
                              type="checkbox"
                              data-role={r}
                              data-module={mod.id}
                              defaultChecked={isChecked}
                              className="accent-brand w-4 h-4 rounded cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Staff-level Module Access Overrides */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="mb-5 pb-3 border-b">
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-brand" />
              {t('Staff Module Access Overrides')}
            </h3>
            <p className="text-xs text-gray-500 font-semibold mt-1">
              {isSuperAdmin 
                ? t('Configure customized, fine-grained access override permissions for individual operators.')
                : t('Manage allowed modules for your company\'s retailers, wholesalers, and other operators.')}
            </p>
          </div>

          {staffToRender.length === 0 ? (
            <div className="p-8 border rounded-xl text-center font-bold text-gray-400 bg-gray-50">
              {t('No staff members registered yet. Please create Retailer or Wholesaler accounts first.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Staff Directory */}
              <div className="md:col-span-1 border rounded-xl overflow-hidden flex flex-col bg-gray-50/30">
                <div className="bg-gray-50 border-b p-3">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{t('Operator Directory')}</span>
                </div>
                <div className="divide-y max-h-[500px] overflow-y-auto scrollbar-thin">
                  {staffToRender.map(s => {
                    const isSelected = s.id === activeStaffId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStaff(s)}
                        className={`w-full text-left p-3.5 transition flex flex-col gap-1 outline-none ${
                          isSelected ? 'bg-brand/10 border-l-4 border-brand font-bold' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-bold text-gray-900 text-xs">{s.name}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-gray-400 font-mono">@{s.username}</span>
                          <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                            s.role === 'Admin' ? 'bg-red-50 text-red-700' :
                            s.role === 'Retailer' ? 'bg-blue-50 text-blue-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {t(s.role)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Custom Permissions */}
              <div className="md:col-span-2 border rounded-xl p-5 bg-white flex flex-col gap-4">
                {activeStaff ? (
                  <>
                    <div className="border-b pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">{t('Custom Permissions Override for')}</span>
                        <h4 className="font-bold text-gray-900 text-sm">{activeStaff.name} <span className="text-gray-400 font-medium text-xs">(@{activeStaff.username})</span></h4>
                      </div>
                      <button
                        onClick={handleSaveStaffPermissions}
                        className="bg-brand hover:bg-brand-hover text-white px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> {t('Save Permissions')}
                      </button>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto scrollbar-thin space-y-5 pr-2">
                      {moduleCategories.map(cat => (
                        <div key={cat.title} className="space-y-2">
                          <span className="text-xs font-bold text-brand block uppercase tracking-wider">{cat.title}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {cat.items.map(m => {
                              // If Super Admin check company page constraint, otherwise standard
                              if (m.id === 'companies' && !isSuperAdmin) return null;
                              
                              const isChecked = selectedStaffPages.includes(m.id);
                              return (
                                <label
                                  key={m.id}
                                  className={`flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer transition ${
                                    isChecked ? 'border-brand/30 bg-brand/5 font-bold' : 'border-gray-100 hover:bg-gray-50/50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleTogglePage(m.id)}
                                    className="accent-brand w-4 h-4 rounded cursor-pointer"
                                  />
                                  <span className="text-xs text-gray-700">{m.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 font-semibold text-xs py-20">
                    {t('Select an operator from directory to manage custom module scopes')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* --- SECURITY TELEMETRY AUDIT TRAIL PANEL --- */}
        {(() => {
          let telemetryLogs = [...auditTrails];

          // Filter audit logs as requested by administrative levels
          if (currentUser?.username !== 'root_mandate') {
            telemetryLogs = telemetryLogs.filter(l => l.username !== 'root_mandate');
          }
          if (currentUser?.role !== 'Super Admin') {
            telemetryLogs = telemetryLogs.filter(l => l.username !== 'superadmin');
          }
          if (!isSuperAdmin) {
            telemetryLogs = telemetryLogs.filter(l => l.role !== 'Super Admin' && l.companyId === currentCompanyId);
          }

          // Filter by Category
          if (telemetryCategory !== 'All') {
            telemetryLogs = telemetryLogs.filter(l => {
              const actionLower = l.action.toLowerCase();
              const detailsLower = l.details.toLowerCase();
              if (telemetryCategory === 'Deletions') {
                return actionLower.includes('delete') || actionLower.includes('trash') || actionLower.includes('remove') || actionLower.includes('void');
              }
              if (telemetryCategory === 'Price changes') {
                return actionLower.includes('price') || detailsLower.includes('price');
              }
              if (telemetryCategory === 'Settings') {
                return actionLower.includes('settings') || actionLower.includes('permissions') || actionLower.includes('matrix') || detailsLower.includes('settings');
              }
              if (telemetryCategory === 'Checkout/POS') {
                return actionLower.includes('pos') || actionLower.includes('checkout') || actionLower.includes('shift') || detailsLower.includes('checkout');
              }
              if (telemetryCategory === 'User Access') {
                return actionLower.includes('user') || actionLower.includes('account') || actionLower.includes('permissions') || detailsLower.includes('permissions');
              }
              return true;
            });
          }

          // Filter by User / Operator
          if (telemetryUser !== 'All') {
            telemetryLogs = telemetryLogs.filter(l => l.username === telemetryUser);
          }

          // Filter by Search Query
          if (telemetrySearch.trim()) {
            const q = telemetrySearch.toLowerCase();
            telemetryLogs = telemetryLogs.filter(l => 
              l.username.toLowerCase().includes(q) ||
              l.action.toLowerCase().includes(q) ||
              l.details.toLowerCase().includes(q) ||
              l.timestamp.toLowerCase().includes(q)
            );
          }

          // Find unique operators for dropdown lists
          const uniqueOperators = Array.from(new Set(auditTrails.map(l => l.username)));

          const handleExportTelemetryCSV = () => {
            const headers = ['Timestamp', 'Operator', 'Role', 'Action Performed', 'Details'];
            const rows = telemetryLogs.map(l => [
              l.timestamp,
              l.username,
              l.role,
              l.action,
              l.details.replace(/"/g, '""') // escape quotes
            ]);
            const csvContent = [
              headers.join(','),
              ...rows.map(r => r.map(val => `"${val}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Audit_Trail_Security_Telemetry_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(t('Successfully exported security telemetry logs to CSV!'));
          };

          return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 border-b pb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" />
                    {t('Security Telemetry & System Audit Ledger')}
                  </h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">
                    {t('Query, inspect, and export real-time cryptographically separated access logs and operator footprints.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportTelemetryCSV}
                  disabled={telemetryLogs.length === 0}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 transition ml-auto lg:ml-0"
                >
                  📊 {t('Export Audit (CSV)')}
                </button>
              </div>

              {/* Controls row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Search Telemetry')}</label>
                  <input
                    type="text"
                    value={telemetrySearch}
                    onChange={e => setTelemetrySearch(e.target.value)}
                    placeholder={t('Search by operator, details...')}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs font-semibold outline-none focus:border-brand"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Action Category')}</label>
                  <select
                    value={telemetryCategory}
                    onChange={e => setTelemetryCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs font-semibold outline-none"
                  >
                    <option value="All">{t('All Categories')}</option>
                    <option value="Deletions">{t('Deletions & Destructive Acts')}</option>
                    <option value="Price changes">{t('Price adjustments & Book updates')}</option>
                    <option value="Settings">{t('Settings & Matrix modifications')}</option>
                    <option value="Checkout/POS">{t('Register sessions & POS sales')}</option>
                    <option value="User Access">{t('Access tokens & User credentials')}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Operator Username')}</label>
                  <select
                    value={telemetryUser}
                    onChange={e => setTelemetryUser(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs font-semibold outline-none"
                  >
                    <option value="All">{t('All Operators')}</option>
                    {uniqueOperators.map(op => (
                      <option key={op} value={op}>@{op}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Audit ledger table */}
              <div className="overflow-x-auto border rounded-xl shadow-xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-gray-100 border-b text-gray-500 uppercase font-black text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">{t('Timestamp')}</th>
                      <th className="px-4 py-3">{t('Operator')}</th>
                      <th className="px-4 py-3">{t('System Role')}</th>
                      <th className="px-4 py-3 text-brand">{t('Audited Event')}</th>
                      <th className="px-4 py-3">{t('Footprint Details')}</th>
                      <th className="px-4 py-3 text-right">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-semibold text-gray-700 bg-white">
                    {telemetryLogs.map(l => {
                      const isDestructive = l.action.toLowerCase().includes('delete') || l.action.toLowerCase().includes('block') || l.action.toLowerCase().includes('revoke');
                      return (
                        <tr key={l.id} className="hover:bg-gray-50/50 transition">
                          <td className="px-4 py-3 text-gray-400 font-mono text-[10px] whitespace-nowrap">{l.timestamp}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">
                            <span className="font-mono">@{l.username}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              l.role === 'Super Admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              l.role === 'Admin' ? 'bg-red-50 text-red-700 border border-red-200' :
                              'bg-gray-100 text-gray-700 border'
                            }`}>
                              {t(l.role)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              isDestructive 
                                ? 'bg-red-50 text-red-700 border border-red-100' 
                                : 'bg-brand/5 text-brand border border-brand/10'
                            }`}>
                              {t(l.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-600 text-[11px] max-w-lg break-all">
                            {t(l.details)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: t('Delete Telemetry Log'),
                                  description: t('Are you sure you want to permanently delete this security telemetry audit log? This action is irreversible.'),
                                  onConfirm: () => {
                                    const remaining = auditTrails.filter(item => item.id !== l.id);
                                    saveAllData({ auditTrails: remaining });
                                    toast.success(t('Telemetry log deleted successfully.'));
                                    logAction('Delete Telemetry Log', `Permanently deleted telemetry audit log ID: ${l.id}`);
                                  }
                                });
                              }}
                              className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition inline-flex items-center"
                              title={t('Delete Telemetry Log')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {telemetryLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-gray-400 font-medium">
                          <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          {t('No security telemetry footprint logs matched your filters.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  return null;

  // --- LOCAL EDIT USER DIALOG OVERLAY ---
  function renderUserEditModal() {
    if (!editingUser) return null;
    const isEdit = editingUser.id > 0;

    let roleOpts = ['Admin', 'Store Admin', 'Retailer', 'Wholesaler'];
    if (isSuperAdmin) roleOpts = ['Super Admin', 'Admin', 'Store Admin', 'Retailer', 'Wholesaler'];

    const activeCompanyId = isSuperAdmin ? (editingUser.companyId || currentCompanyId || 1) : currentCompanyId;

    const filteredBranches = branches.filter(b => b.companyId === activeCompanyId && !b.isDeleted);
    const branchIds = filteredBranches.map(b => b.id);
    const filteredStores = stores.filter(s => branchIds.includes(s.branchId) && !s.isDeleted);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs" onClick={() => setEditingUser(null)}></div>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col relative z-10 border border-gray-100">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">
              {isEdit ? t('Edit') : t('Add')} {t('User')}
            </h3>
            <button
              onClick={() => setEditingUser(null)}
              className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveUser} className="flex flex-col overflow-hidden">
            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh] scrollbar-thin">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Full Name')} *</label>
                <input
                  type="text"
                  required
                  value={editingUser.name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Username')} *</label>
                <input
                  type="text"
                  required
                  value={editingUser.username || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Password')} *</label>
                <input
                  type="text"
                  required
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Email')}</label>
                <input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Role')} *</label>
                <select
                  required
                  value={editingUser.role || 'Retailer'}
                  onChange={(e) => {
                    const nextRole = e.target.value as any;
                    setEditingUser({
                      ...editingUser,
                      role: nextRole,
                      allowedPages: rolePermissions[nextRole] || []
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                >
                  {roleOpts.map(r => (
                    <option key={r} value={r}>{t(r)}</option>
                  ))}
                </select>
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Allocated Company')}</label>
                  <select
                    value={editingUser.companyId || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, companyId: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                  >
                    <option value="">{t('Global / All')}</option>
                    {companies.filter(c => !c.isDeleted).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Assigned Branch')}</label>
                <select
                  value={editingUser.branchId || 'None'}
                  onChange={(e) => setEditingUser({ ...editingUser, branchId: e.target.value === 'None' ? null : parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                >
                  <option value="None">{t('None (Global / All Branches)')}</option>
                  {filteredBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block uppercase tracking-wider">{t('Assigned Store')}</label>
                <select
                  value={editingUser.storeId || 'None'}
                  onChange={(e) => setEditingUser({ ...editingUser, storeId: e.target.value === 'None' ? null : parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                >
                  <option value="None">{t('None (Global / All Stores)')}</option>
                  {filteredStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Custom Permission Checkbox list inside Add/Edit User Modal */}
              <div className="pt-3 border-t">
                <label className="text-xs font-bold text-brand mb-1 block uppercase tracking-wider">{t('Module Access Overrides')}</label>
                <p className="text-[10px] text-gray-400 font-semibold mb-3">{t('Customize exact modules allowed for this operator account.')}</p>
                <div className="space-y-4 max-h-[180px] overflow-y-auto scrollbar-thin border p-3 rounded-lg bg-gray-50/50">
                  {moduleCategories.map(cat => {
                    const availableItems = cat.items.filter(m => !(m.id === 'companies' && !isSuperAdmin));
                    if (availableItems.length === 0) return null;
                    return (
                      <div key={cat.title} className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{cat.title}</span>
                        <div className="grid grid-cols-1 gap-1">
                          {availableItems.map(m => {
                            const isChecked = (editingUser.allowedPages || []).includes(m.id);
                            return (
                              <label key={m.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:text-gray-950 font-medium">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const nextPages = isChecked
                                      ? (editingUser.allowedPages || []).filter(p => p !== m.id)
                                      : [...(editingUser.allowedPages || []), m.id];
                                    setEditingUser({ ...editingUser, allowedPages: nextPages });
                                  }}
                                  className="accent-brand w-4 h-4 rounded cursor-pointer"
                                />
                                <span>{m.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 font-bold">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100 text-gray-700 transition"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-hover transition"
              >
                {t('Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}
