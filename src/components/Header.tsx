import React from 'react';
import { User, Company, Branch, Store, Settings } from '../types';
import { translate } from '../utils/format';
import { Settings as SettingsIcon, Menu, Bell, Sun, Moon, Store as StoreIcon, Globe } from 'lucide-react';

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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenGame?: () => void;
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
  pageTitle,
  theme,
  onToggleTheme,
  onOpenGame
}: HeaderProps) {
  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isAdmin = currentUser?.role === 'Admin' || isSuperAdmin;
  const t = (text: string) => translate(text, settings.language);
  const userInitial = (currentUser?.name?.[0] || currentUser?.username?.[0] || 'U').toUpperCase();

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

    // Restrict operators only to their exact assigned store if it is set
    if (currentUser.storeId) {
      availableStores = availableStores.filter(s => s.id === currentUser.storeId);
    }
  }

  const activeComp = companies.find(c => c.id === currentCompanyId);
  const activeCompCurrency = activeComp?.currency || settings.companyCurrencies?.[currentCompanyId || 1] || settings.currency || 'USD';
  const activeCompLanguage = activeComp?.language || settings.companyLanguages?.[currentCompanyId || 1] || settings.language || 'en';

  return (
    <header className="min-h-[56px] md:h-[56px] bg-brand text-white flex flex-col md:flex-row md:items-center px-3 lg:px-5 py-2 md:py-0 gap-2 md:gap-3 shadow-sm flex-shrink-0 z-20 no-print">
      <div className="flex items-center justify-between w-full md:w-auto flex-1 md:flex-none">
        <div className="flex items-center gap-3">
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
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          {/* Global Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            type="button"
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition text-white"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-100" />}
          </button>

          {/* User Name & Settings Pill for Mobile */}
          <div className="flex items-center gap-1.5 text-xs bg-white/15 px-2 py-1 rounded-full font-semibold border border-white/15">
            <button
              type="button"
              onClick={onOpenGame}
              className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 font-black text-white text-[11px] flex items-center justify-center shadow-xs hover:scale-105 active:scale-95 transition cursor-pointer shrink-0 border border-white/30"
              title={t('Click user letter to open Mind Refresh Game Break')}
            >
              {userInitial}
            </button>
            <span className="text-white font-bold truncate max-w-[80px]">{currentUser?.username || currentUser?.name || 'User'}</span>
            {isAdmin && (
              <button
                onClick={onOpenSettings}
                type="button"
                className="p-1 rounded-full bg-white/20 hover:bg-white/40 transition text-white shrink-0"
                title={t('System Settings')}
              >
                <SettingsIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto w-full md:w-auto justify-between md:justify-end">
        {/* Dynamic Context Selector Hub */}
        <div className="flex items-center gap-1.5 bg-white/10 rounded-lg p-1 border border-white/20 text-xs text-white w-full md:w-auto overflow-x-auto whitespace-nowrap scrollbar-none max-w-full shrink-0">
          {/* Company Context Select */}
          {isSuperAdmin && (
            <select
              value={currentCompanyId || ''}
              onChange={(e) => onContextChange('company', Number(e.target.value))}
              className="bg-transparent text-white text-xs px-2 py-1 outline-none border-none cursor-pointer font-medium shrink-0"
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
              className="bg-transparent text-white text-xs px-2 py-1 outline-none border-none cursor-pointer font-medium shrink-0"
            >
              {availableBranches.map(b => (
                <option key={b.id} value={b.id} className="text-gray-900 bg-white font-medium">{b.name}</option>
              ))}
            </select>
          )}

          {/* Store Context Select Pills Container (Always shown with mobile horizontal scroll) */}
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-thin max-w-full shrink-0 py-0.5">
            <StoreIcon className="w-3.5 h-3.5 text-emerald-300 shrink-0 ml-1" />
            {availableStores.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onContextChange('store', s.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition shrink-0 whitespace-nowrap ${
                  s.id === currentStoreId
                    ? 'bg-emerald-500 text-white shadow-xs border border-emerald-400'
                    : 'bg-white/10 hover:bg-white/20 text-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop-only action controls & user status badge */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          {/* Company-Independent Currency & Language Badge */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="hidden sm:flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 transition cursor-pointer px-2.5 py-1 rounded-full border border-white/15 text-emerald-200 shrink-0 font-extrabold"
            title={t('Click to edit Company Independent Currency & Language')}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-300" />
            <span>{activeCompCurrency}</span>
            <span className="opacity-40">•</span>
            <span className="uppercase">{activeCompLanguage}</span>
          </button>

          {/* Global Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            type="button"
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition text-white"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-100" />}
          </button>

          {/* User Profile Badge with Avatar Letter, Name, Role & System Settings Icon beside User Name */}
          <div className="flex items-center gap-2 text-xs bg-white/10 px-2.5 py-1 rounded-full font-semibold border border-white/15">
            <button
              type="button"
              onClick={onOpenGame}
              className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 font-black text-white text-xs flex items-center justify-center shadow-xs hover:scale-110 active:scale-95 transition cursor-pointer shrink-0 border border-white/30"
              title={t('Click user letter avatar to open Mind Refresh Arcade Game')}
            >
              {userInitial}
            </button>
            <div className="flex flex-col text-left">
              <span className="text-white font-bold leading-tight">{currentUser?.username || currentUser?.name || 'User'}</span>
              <span className="text-gray-200 text-[10px] leading-tight font-medium">{currentUser ? t(currentUser.role) : 'Offline'}</span>
            </div>
            {isAdmin && (
              <button
                onClick={onOpenSettings}
                type="button"
                className="ml-1 p-1 rounded-full bg-white/20 hover:bg-white/40 transition text-white shrink-0"
                title={t('System Settings')}
              >
                <SettingsIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
