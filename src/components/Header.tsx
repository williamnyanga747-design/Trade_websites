import React from 'react';
import { User, Company, Branch, Store, Settings } from '../types';
import { translate } from '../utils/format';
import { Settings as SettingsIcon, Menu, Bell } from 'lucide-react';

interface HeaderProps {
  currentPage: string;
  currentUser: User | null;
  companies: Company[];
  branches: Branch[];
  stores: Store[];
  currentCompanyId: number | null;
  currentBranchId: number | null;
  currentStoreId: number | null;
  settings: Settings;
  onContextChange: (level: 'company' | 'branch' | 'store', val: number) => void;
  onOpenSettings: () => void;
  onToggleMobileSidebar: () => void;
  pageTitle: string;
}

export default function Header({
  currentPage,
  currentUser,
  companies,
  branches,
  stores,
  currentCompanyId,
  currentBranchId,
  currentStoreId,
  settings,
  onContextChange,
  onOpenSettings,
  onToggleMobileSidebar,
  pageTitle
}: HeaderProps) {
  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isAdmin = currentUser?.role === 'Admin' || isSuperAdmin;
  const t = (text: string) => translate(text, settings.language);

  // Filter available options based on hierarchy and soft-deleted status
  const availableCompanies = (isSuperAdmin 
    ? companies 
    : companies.filter(c => c.id === currentCompanyId)
  ).filter(c => !c.isDeleted);

  const availableBranches = (isSuperAdmin 
    ? branches.filter(b => b.companyId === currentCompanyId)
    : branches.filter(b => b.companyId === currentUser?.companyId) // Normal Admins can see branches within their allocated company
  ).filter(b => !b.isDeleted);

  let availableStores = stores.filter(s => s.branchId === currentBranchId && !s.isDeleted);

  if (currentUser && currentUser.role !== 'Super Admin') {
    // Restrict standard Admins/Operators to their assigned company's branches & stores
    const userCompanyBranchIds = branches
      .filter(b => b.companyId === currentUser.companyId && !b.isDeleted)
      .map(b => b.id);
    availableStores = availableStores.filter(s => userCompanyBranchIds.includes(s.branchId));

    // Restrict operators (Retailer/Wholesaler) only to their exact assigned store
    if (currentUser.role === 'Retailer' || currentUser.role === 'Wholesaler') {
      if (currentUser.storeId) {
        availableStores = availableStores.filter(s => s.id === currentUser.storeId);
      }
    }
  }

  return (
    <header className="h-[56px] bg-brand text-white flex items-center px-3 lg:px-5 gap-3 shadow-sm flex-shrink-0 z-20 no-print">
      {/* Mobile Toggle Button */}
      <button
        onClick={onToggleMobileSidebar}
        className="lg:hidden p-1.5 hover:bg-white/10 rounded"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page Title */}
      <h1 className="font-semibold text-[15px] lg:text-base truncate">
        {t(pageTitle)}
      </h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Settings button shown only to admin roles */}
        {isAdmin && (
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            title="System Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}

        {/* Dynamic Context Selector Hub */}
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5 border border-white/20 text-xs text-white">
          {/* Company Context Select */}
          {isSuperAdmin && (
            <select
              value={currentCompanyId || ''}
              onChange={(e) => onContextChange('company', Number(e.target.value))}
              className="bg-transparent text-white text-xs px-2 py-1 outline-none border-none cursor-pointer font-medium"
            >
              {availableCompanies.map(c => (
                <option key={c.id} value={c.id} className="text-gray-900 bg-white font-medium">{c.name}</option>
              ))}
            </select>
          )}

          {/* Branch Context Select */}
          {isAdmin && (
            <select
              value={currentBranchId || ''}
              onChange={(e) => onContextChange('branch', Number(e.target.value))}
              className="bg-transparent text-white text-xs px-2 py-1 outline-none border-none cursor-pointer font-medium"
            >
              {availableBranches.map(b => (
                <option key={b.id} value={b.id} className="text-gray-900 bg-white font-medium">{b.name}</option>
              ))}
            </select>
          )}

          {/* Store Context Select (Always shown to choose active store location) */}
          <select
            value={currentStoreId || ''}
            onChange={(e) => onContextChange('store', Number(e.target.value))}
            className="bg-transparent text-white text-xs px-2 py-1 outline-none border-none cursor-pointer font-bold"
          >
            {availableStores.map(s => (
              <option key={s.id} value={s.id} className="text-gray-900 bg-white font-bold">{s.name}</option>
            ))}
          </select>
        </div>

        {/* User Role Status Badge */}
        <div className="hidden sm:flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-full font-semibold border border-white/10">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span>{currentUser ? t(currentUser.role) : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
