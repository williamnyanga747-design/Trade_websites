import React, { useState, useEffect } from 'react';
import { User, Settings } from '../types';
import { translate } from '../utils/format';
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, DollarSign, FileText,
  Database, FileUp, BarChart3, Users, UserCircle, LogOut, ChevronDown, Store,
  ChevronLeft, ChevronRight
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  currentUser: User | null;
  settings: Settings;
  allowedPages: string[];
  onNavigate: (page: string) => void;
  onLogout: () => void;
  lowStockCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  currentPage,
  currentUser,
  settings,
  allowedPages,
  onNavigate,
  onLogout,
  lowStockCount = 0,
  isCollapsed = false,
  onToggleCollapse
}: SidebarProps) {
  // Helper for submenus to check if any of their children is active
  const isMasterActive = ['companies', 'branches', 'stores', 'customers', 'suppliers', 'categories', 'taxes', 'data-recovery'].includes(currentPage);
  const isImportActive = ['import-stock', 'import-customers', 'import-suppliers'].includes(currentPage);
  const isReportActive = ['report-transaction', 'report-financial', 'report-daily', 'report-monthly', 'report-sales', 'report-purchase', 'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details', 'report-shifts'].includes(currentPage);
  const isUserActive = ['user-info', 'user-access'].includes(currentPage);

  const [showMasters, setShowMasters] = useState(isMasterActive);
  const [showImports, setShowImports] = useState(isImportActive);
  const [showReports, setShowReports] = useState(isReportActive);
  const [showUsers, setShowUsers] = useState(isUserActive);

  // Sync menu states on navigate to a submenu item
  useEffect(() => {
    if (isMasterActive) setShowMasters(true);
  }, [isMasterActive]);

  useEffect(() => {
    if (isImportActive) setShowImports(true);
  }, [isImportActive]);

  useEffect(() => {
    if (isReportActive) setShowReports(true);
  }, [isReportActive]);

  useEffect(() => {
    if (isUserActive) setShowUsers(true);
  }, [isUserActive]);

  const isAllowed = (page: string) => allowedPages.includes(page);
  const t = (text: string) => translate(text, settings.language);

  return (
    <aside className={`${isCollapsed ? 'w-[70px]' : 'w-64'} bg-[#2d323e] text-gray-200 flex flex-col h-full flex-shrink-0 border-r border-gray-800/20 no-print transition-all duration-300`}>
      {/* Brand logo */}
      <div className={`h-[56px] bg-brand flex items-center ${isCollapsed ? 'justify-center px-1' : 'px-4'} gap-2.5 flex-shrink-0 shadow-sm transition-all duration-300`}>
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-brand font-bold shadow-sm flex-shrink-0">T</div>
        {!isCollapsed && <span className="font-semibold text-white tracking-wide truncate">TradeCore</span>}
      </div>

      {/* Nav items list */}
      <nav className={`flex-1 overflow-y-auto py-3 ${isCollapsed ? 'px-1.5' : 'px-2.5'} scrollbar-thin text-[13px] leading-5 space-y-1 transition-all duration-300`}>
        {/* Core Pages */}
        {isAllowed('dashboard') && (
          <button
            onClick={() => onNavigate('dashboard')}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'dashboard' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Dashboard') : undefined}
          >
            <LayoutDashboard className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && <span>{t('Dashboard')}</span>}
          </button>
        )}

        {isAllowed('stock-items') && (
          <button
            onClick={() => onNavigate('stock-items')}
            className={`w-full relative flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'stock-items' ? 'bg-brand text-white font-bold shadow-xs' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Stock Items') : undefined}
          >
            <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <Package className="w-[18px] h-[18px] flex-shrink-0" />
              {!isCollapsed && <span>{t('Stock Items')}</span>}
            </span>
            {!isCollapsed && lowStockCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse transition-all ${
                currentPage === 'stock-items' ? 'bg-white text-brand' : 'bg-brand text-white'
              }`}>
                {lowStockCount}
              </span>
            )}
            {isCollapsed && lowStockCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full border border-white animate-pulse"></span>
            )}
          </button>
        )}

        {isAllowed('purchase-order') && (
          <button
            onClick={() => onNavigate('purchase-order')}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'purchase-order' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Purchase Order') : undefined}
          >
            <ShoppingCart className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && <span>{t('Purchase Order')}</span>}
          </button>
        )}

        {isAllowed('sales-order') && (
          <button
            onClick={() => onNavigate('sales-order')}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'sales-order' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Sales Order') : undefined}
          >
            <Receipt className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && <span>{t('Sales Order')}</span>}
          </button>
        )}

        {/* Expenses Panel (Requested Position: "ALSO EXPENSESS PANEL AFTER SALES ORDER") */}
        {isAllowed('expenses') && (
          <button
            onClick={() => onNavigate('expenses')}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'expenses' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Expenses') : undefined}
          >
            <DollarSign className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && <span>{t('Expenses')}</span>}
          </button>
        )}

        {/* Receipts Panel (Requested: "ADD THE PANEL FOR RECEIPT OF BUYING AND SELLING") */}
        {isAllowed('receipts') && (
          <button
            onClick={() => onNavigate('receipts')}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
              currentPage === 'receipts' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
            }`}
            title={isCollapsed ? t('Receipts') : undefined}
          >
            <FileText className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && <span>{t('Receipts')}</span>}
          </button>
        )}

        {/* MASTER DATA */}
        {(isAllowed('companies') || isAllowed('branches') || isAllowed('stores') || isAllowed('customers') || isAllowed('suppliers')) && (
          <div className="pt-2">
            <button
              onClick={() => {
                if (isCollapsed && onToggleCollapse) {
                  onToggleCollapse();
                } else {
                  setShowMasters(!showMasters);
                }
              }}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-md hover:bg-white/10 text-gray-400 hover:text-gray-200 font-semibold`}
              title={isCollapsed ? t('Master Data') : undefined}
            >
              <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Database className="w-[18px] h-[18px] flex-shrink-0" />
                {!isCollapsed && <span>{t('Master Data')}</span>}
              </span>
              {!isCollapsed && <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showMasters ? 'rotate-180' : ''}`} />}
            </button>
            {!isCollapsed && showMasters && (
              <div className="ml-4 mt-1 border-l border-gray-700 pl-3 space-y-1">
                {isAllowed('companies') && (
                  <button
                    onClick={() => onNavigate('companies')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'companies' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Companies')}
                  </button>
                )}
                {isAllowed('branches') && (
                  <button
                    onClick={() => onNavigate('branches')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'branches' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Branches')}
                  </button>
                )}
                {isAllowed('stores') && (
                  <button
                    onClick={() => onNavigate('stores')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'stores' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Store Management')}
                  </button>
                )}
                {isAllowed('customers') && (
                  <button
                    onClick={() => onNavigate('customers')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'customers' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Customers')}
                  </button>
                )}
                {isAllowed('suppliers') && (
                  <button
                    onClick={() => onNavigate('suppliers')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'suppliers' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Suppliers')}
                  </button>
                )}
                {isAllowed('categories') && (
                  <button
                    onClick={() => onNavigate('categories')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'categories' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Stock Categories')}
                  </button>
                )}
                {isAllowed('taxes') && (
                  <button
                    onClick={() => onNavigate('taxes')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'taxes' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Manage Taxes')}
                  </button>
                )}
                {isAllowed('data-recovery') && (
                  <button
                    onClick={() => onNavigate('data-recovery')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'data-recovery' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ♻️ {t('Data Recovery')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* IMPORT DATA */}
        {(isAllowed('import-stock') || isAllowed('import-customers') || isAllowed('import-suppliers')) && (
          <div>
            <button
              onClick={() => {
                if (isCollapsed && onToggleCollapse) {
                  onToggleCollapse();
                } else {
                  setShowImports(!showImports);
                }
              }}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-md hover:bg-white/10 text-gray-400 hover:text-gray-200 font-semibold`}
              title={isCollapsed ? t('Import Data') : undefined}
            >
              <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <FileUp className="w-[18px] h-[18px] flex-shrink-0" />
                {!isCollapsed && <span>{t('Import Data')}</span>}
              </span>
              {!isCollapsed && <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showImports ? 'rotate-180' : ''}`} />}
            </button>
            {!isCollapsed && showImports && (
              <div className="ml-4 mt-1 border-l border-gray-700 pl-3 space-y-1">
                {isAllowed('import-stock') && (
                  <button
                    onClick={() => onNavigate('import-stock')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'import-stock' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Import Stock Items')}
                  </button>
                )}
                {isAllowed('import-customers') && (
                  <button
                    onClick={() => onNavigate('import-customers')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'import-customers' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Import Customers')}
                  </button>
                )}
                {isAllowed('import-suppliers') && (
                  <button
                    onClick={() => onNavigate('import-suppliers')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'import-suppliers' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Import Suppliers')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* REPORTS */}
        {isAllowed('report-transaction') && (
          <div>
            <button
              onClick={() => {
                if (isCollapsed && onToggleCollapse) {
                  onToggleCollapse();
                } else {
                  setShowReports(!showReports);
                }
              }}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-md hover:bg-white/10 text-gray-400 hover:text-gray-200 font-semibold`}
              title={isCollapsed ? t('Reports') : undefined}
            >
              <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <BarChart3 className="w-[18px] h-[18px] flex-shrink-0" />
                {!isCollapsed && <span>{t('Reports')}</span>}
              </span>
              {!isCollapsed && <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showReports ? 'rotate-180' : ''}`} />}
            </button>
            {!isCollapsed && showReports && (
              <div className="ml-4 mt-1 border-l border-gray-700 pl-3 space-y-1">
                {isAllowed('report-transaction') && (
                  <button
                    onClick={() => onNavigate('report-transaction')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-transaction' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Transaction Report')}
                  </button>
                )}
                
                {/* Financial Statement Report */}
                {isAllowed('report-financial') && (
                  <button
                    onClick={() => onNavigate('report-financial')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-financial' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Financial Report')}
                  </button>
                )}

                {isAllowed('report-daily') && (
                  <button
                    onClick={() => onNavigate('report-daily')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-daily' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Daily Activity Report')}
                  </button>
                )}
                {isAllowed('report-monthly') && (
                  <button
                    onClick={() => onNavigate('report-monthly')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-monthly' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Monthly Report')}
                  </button>
                )}
                {isAllowed('report-sales') && (
                  <button
                    onClick={() => onNavigate('report-sales')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-sales' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Sales Report')}
                  </button>
                )}
                {isAllowed('report-purchase') && (
                  <button
                    onClick={() => onNavigate('report-purchase')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-purchase' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Purchase Report')}
                  </button>
                )}
                {isAllowed('report-sales-outstanding') && (
                  <button
                    onClick={() => onNavigate('report-sales-outstanding')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-sales-outstanding' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Sales Outstanding')}
                  </button>
                )}
                {isAllowed('report-purchase-outstanding') && (
                  <button
                    onClick={() => onNavigate('report-purchase-outstanding')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-purchase-outstanding' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Purchase Outstanding')}
                  </button>
                )}
                {isAllowed('report-lowstock') && (
                  <button
                    onClick={() => onNavigate('report-lowstock')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-lowstock' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Low Stock Items Report')}
                  </button>
                )}
                {isAllowed('report-po-details') && (
                  <button
                    onClick={() => onNavigate('report-po-details')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-po-details' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('Purchase Order Details')}
                  </button>
                )}
                {isAllowed('report-shifts') && (
                  <button
                    onClick={() => onNavigate('report-shifts')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'report-shifts' ? 'text-white font-bold text-xs' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('POS Shift & Drawer Ledger')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* USERS ACCREDITATIONS */}
        {isAllowed('user-info') && (
          <div>
            <button
              onClick={() => {
                if (isCollapsed && onToggleCollapse) {
                  onToggleCollapse();
                } else {
                  setShowUsers(!showUsers);
                }
              }}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-md hover:bg-white/10 text-gray-400 hover:text-gray-200 font-semibold`}
              title={isCollapsed ? t('Manage User') : undefined}
            >
              <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Users className="w-[18px] h-[18px] flex-shrink-0" />
                {!isCollapsed && <span>{t('Manage User')}</span>}
              </span>
              {!isCollapsed && <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showUsers ? 'rotate-180' : ''}`} />}
            </button>
            {!isCollapsed && showUsers && (
              <div className="ml-4 mt-1 border-l border-gray-700 pl-3 space-y-1">
                <button
                  onClick={() => onNavigate('user-info')}
                  className={`w-full text-left px-3 py-1.5 rounded transition ${
                    currentPage === 'user-info' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('User Info')}
                </button>
                {(currentUser?.role === 'Super Admin' || currentUser?.role === 'Admin') && (
                  <button
                    onClick={() => onNavigate('user-access')}
                    className={`w-full text-left px-3 py-1.5 rounded transition ${
                      currentPage === 'user-access' ? 'text-white font-bold' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('User Access')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        <button
          onClick={() => onNavigate('profile')}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-md transition text-left ${
            currentPage === 'profile' ? 'bg-brand text-white font-bold' : 'text-gray-300 hover:bg-white/10'
          }`}
          title={isCollapsed ? t('My Profile') : undefined}
        >
          <UserCircle className="w-[18px] h-[18px] flex-shrink-0" />
          {!isCollapsed && <span>{t('My Profile')}</span>}
        </button>
      </nav>

      {/* Collapse Toggle Button */}
      {onToggleCollapse && (
        <div className="p-3 border-t border-gray-700/25 flex-shrink-0 hidden md:block">
          <button
            onClick={onToggleCollapse}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-3'} py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition`}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4 flex-shrink-0" /> : <ChevronLeft className="w-4 h-4 flex-shrink-0" />}
            {!isCollapsed && <span>{t('Collapse Sidebar')}</span>}
          </button>
        </div>
      )}

      {/* Logout bottom block */}
      <div className="p-3 border-t border-gray-700/50 flex-shrink-0">
        <button
          onClick={onLogout}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-3'} py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition`}
          title={isCollapsed ? t('Logout') : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span>{t('Logout')}</span>}
        </button>
      </div>
    </aside>
  );
}
