import React, { useState, useEffect, useMemo } from 'react';
import {
  Company, Branch, Store, User, StockItem, PurchaseOrder, SalesOrder, Expense, Tax, Supplier, Customer, AuditTrail, Settings, PosShift, StockTransfer
} from './types';
import {
  defaultSettings, defaultRolePermissions, defaultCompanies, defaultBranches, defaultStores, defaultUsers,
  defaultCategories, defaultTaxes, defaultSuppliers, defaultCustomers, defaultStockItems, defaultPurchaseOrders,
  defaultSalesOrders, defaultExpenses, defaultAuditTrails
} from './initialData';

// Modular Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Expenses from './components/Expenses';
import Receipts from './components/Receipts';
import FinancialReport from './components/FinancialReport';
import MasterData from './components/MasterData';
import ImportData from './components/ImportData';
import Reports from './components/Reports';
import ManageUsers from './components/ManageUsers';
import Profile from './components/Profile';
import POSModal from './components/POSModal';
import PurchaseOrderModal from './components/PurchaseOrderModal';
import { ConfirmActionModal } from './components/ConfirmActionModal';

// Utils
import { translate, formatMoney, exportToExcel } from './utils/format';
import { handlePrintWithFallback } from './utils/printHelper';
import { filterActiveData } from './utils/cascadeDelete';
import { generateSalesOrderPDF } from './utils/pdfGenerator';
import { saveSystemDataToCloud, fetchSystemDataFromCloud, subscribeToSystemDataCloud } from './utils/firebase';
import { toast, Toast } from './utils/toast';
import { getStoreCategories, cleanCategoryName } from './utils/categoryHelper';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';

// Icons
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, DollarSign, FileText, Database, FileUp,
  BarChart3, Users, UserCircle, LogOut, Settings as SettingsIcon, Search, Plus, ArrowLeftRight,
  Pencil, Trash2, Printer, FileSpreadsheet, Copy, CheckCircle, AlertTriangle, AlertCircle, X, XCircle, Check,
  ShieldAlert, DollarSign as DollarIcon, CreditCard, Monitor, Barcode, Store as StoreIcon,
  Calendar, TrendingUp, Info, ShieldCheck, Lock, Globe, Truck, ChevronDown, ChevronUp
} from 'lucide-react';

// Helper function to darken/lighten hex colors dynamically
function adjustColorBrightness(hex: string, percent: number): string {
  const color = hex.replace('#', '');
  const num = parseInt(color, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function App() {
  // --- DATABASE STATE ---
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [auditTrails, setAuditTrails] = useState<AuditTrail[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(defaultRolePermissions);
  const [posShifts, setPosShifts] = useState<PosShift[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);

  // --- OPERATIONAL STATES ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [currentCompanyId, setCurrentCompanyId] = useState<number | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<number | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<number | null>(null);

  const getActiveCurrency = (): string => {
    if (currentUser) {
      if (settings.userCurrencies && settings.userCurrencies[currentUser.username]) {
        return settings.userCurrencies[currentUser.username];
      }
      if (currentUser.companyId && settings.companyCurrencies && settings.companyCurrencies[currentUser.companyId]) {
        return settings.companyCurrencies[currentUser.companyId];
      }
    }
    return settings.currency;
  };

  const getActiveExchangeRate = (): number => {
    if (currentUser) {
      if (settings.userExchangeRates && settings.userExchangeRates[currentUser.username] !== undefined) {
        return settings.userExchangeRates[currentUser.username];
      }
      if (currentUser.companyId && settings.companyExchangeRates && settings.companyExchangeRates[currentUser.companyId] !== undefined) {
        return settings.companyExchangeRates[currentUser.companyId];
      }
    }
    return settings.exchangeRate;
  };

  const activeCurrency = getActiveCurrency();
  const activeExchangeRate = getActiveExchangeRate();

  // --- CASCADE DYNAMIC FILTERING ---
  const activeData = React.useMemo(() => filterActiveData({
    companies,
    branches,
    stores,
    users,
    stockItems,
    purchaseOrders,
    salesOrders,
    expenses
  }), [companies, branches, stores, users, stockItems, purchaseOrders, salesOrders, expenses]);

  const activeUsers = activeData.users;
  const activeStockItems = activeData.stockItems;
  const activePurchaseOrders = activeData.purchaseOrders;
  const activeSalesOrders = activeData.salesOrders;
  const activeExpenses = activeData.expenses;

  // --- SYNC COOLDOWN REFS ---
  const lastLocalWriteTimeRef = React.useRef<number>(0);

  // --- DATABASE STATE REF (for synchronous, race-condition-free updates) ---
  const dbStateRef = React.useRef<{
    companies: Company[];
    branches: Branch[];
    stores: Store[];
    users: User[];
    categories: string[];
    taxes: Tax[];
    suppliers: Supplier[];
    customers: Customer[];
    stockItems: StockItem[];
    purchaseOrders: PurchaseOrder[];
    salesOrders: SalesOrder[];
    expenses: Expense[];
    auditTrails: AuditTrail[];
    settings: Settings;
    rolePermissions: Record<string, string[]>;
    posShifts: PosShift[];
    stockTransfers: StockTransfer[];
  }>({
    companies: [],
    branches: [],
    stores: [],
    users: [],
    categories: [],
    taxes: [],
    suppliers: [],
    customers: [],
    stockItems: [],
    purchaseOrders: [],
    salesOrders: [],
    expenses: [],
    auditTrails: [],
    settings: defaultSettings,
    rolePermissions: defaultRolePermissions,
    posShifts: [],
    stockTransfers: [],
  });

  // --- AUTH / SECURITY STATES ---
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showForcePasswordModal, setShowForcePasswordModal] = useState(false);
  const [forceNewPass, setForceNewPass] = useState('');
  const [forceConfirmPass, setForceConfirmPass] = useState('');

  // --- INTERACTIVE UI MODALS STATES ---
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((newToast) => {
      setToasts(prev => [...prev, newToast]);
      if (newToast.duration !== 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== newToast.id));
        }, newToast.duration || 4000);
      }
    });
    return unsubscribe;
  }, []);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tradecore_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('tradecore_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Modals for Stock
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [formUseSubUnit, setFormUseSubUnit] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProductId, setTransferProductId] = useState<number | null>(null);
  const [expandedStockIds, setExpandedStockIds] = useState<number[]>([]);
  
  // Stock list filters
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockFilterCategory, setStockFilterCategory] = useState('');
  const [transferFilter, setTransferFilter] = useState<'All' | 'Pending' | 'In-Transit' | 'Completed' | 'Rejected'>('All');
  const [currencySandboxAmount, setCurrencySandboxAmount] = useState<string>('1');
  const [localExchangeRateStr, setLocalExchangeRateStr] = useState<string>('');

  // Pricing & sub-unit calculation state variables
  const [formPurchasePrice, setFormPurchasePrice] = useState<string>('');
  const [formRetailPrice, setFormRetailPrice] = useState<string>('');
  const [formWholesalePrice, setFormWholesalePrice] = useState<string>('');
  const [formPartnerPrice, setFormPartnerPrice] = useState<string>('');
  const [formConversionFactor, setFormConversionFactor] = useState<string>('');
  const [formSubRetailPrice, setFormSubRetailPrice] = useState<string>('');
  const [formSubWholesalePrice, setFormSubWholesalePrice] = useState<string>('');
  const [formSubPartnerPrice, setFormSubPartnerPrice] = useState<string>('');

  useEffect(() => {
    if (showStockModal) {
      const isUSD = settings.currency === 'USD';
      const multiplier = isUSD ? 1 : settings.exchangeRate;
      
      if (editingStockItem) {
        setFormPurchasePrice(String(editingStockItem.purchasePrice * multiplier));
        setFormRetailPrice(String(editingStockItem.retailPrice * multiplier));
        setFormWholesalePrice(String(editingStockItem.wholesalePrice * multiplier));
        setFormPartnerPrice(String((editingStockItem.partnerPrice || editingStockItem.retailPrice) * multiplier));
        setFormConversionFactor(editingStockItem.subUnitConversion ? String(editingStockItem.subUnitConversion) : '');
        setFormSubRetailPrice(editingStockItem.subUnitRetailPrice !== undefined ? String(editingStockItem.subUnitRetailPrice * multiplier) : '');
        setFormSubWholesalePrice(editingStockItem.subUnitWholesalePrice !== undefined ? String(editingStockItem.subUnitWholesalePrice * multiplier) : '');
        setFormSubPartnerPrice(editingStockItem.subUnitPartnerPrice !== undefined ? String(editingStockItem.subUnitPartnerPrice * multiplier) : '');
      } else {
        setFormPurchasePrice('');
        setFormRetailPrice('');
        setFormWholesalePrice('');
        setFormPartnerPrice('');
        setFormConversionFactor('');
        setFormSubRetailPrice('');
        setFormSubWholesalePrice('');
        setFormSubPartnerPrice('');
      }
    }
  }, [showStockModal, editingStockItem, settings.currency, settings.exchangeRate]);

  const handleMainPriceChange = (field: 'purchase' | 'retail' | 'wholesale' | 'partner', value: string) => {
    if (field === 'purchase') setFormPurchasePrice(value);
    if (field === 'retail') {
      setFormRetailPrice(value);
      const conversion = parseFloat(formConversionFactor);
      const valNum = parseFloat(value);
      if (conversion > 0 && !isNaN(valNum)) {
        setFormSubRetailPrice((valNum / conversion).toFixed(2));
      }
    }
    if (field === 'wholesale') {
      setFormWholesalePrice(value);
      const conversion = parseFloat(formConversionFactor);
      const valNum = parseFloat(value);
      if (conversion > 0 && !isNaN(valNum)) {
        setFormSubWholesalePrice((valNum / conversion).toFixed(2));
      }
    }
    if (field === 'partner') {
      setFormPartnerPrice(value);
      const conversion = parseFloat(formConversionFactor);
      const valNum = parseFloat(value);
      if (conversion > 0 && !isNaN(valNum)) {
        setFormSubPartnerPrice((valNum / conversion).toFixed(2));
      }
    }
  };

  const handleConversionChange = (value: string) => {
    setFormConversionFactor(value);
    const conversion = parseFloat(value);
    if (conversion > 0) {
      const rVal = parseFloat(formRetailPrice);
      if (!isNaN(rVal)) setFormSubRetailPrice((rVal / conversion).toFixed(2));
      const wVal = parseFloat(formWholesalePrice);
      if (!isNaN(wVal)) setFormSubWholesalePrice((wVal / conversion).toFixed(2));
      const pVal = parseFloat(formPartnerPrice);
      if (!isNaN(pVal)) setFormSubPartnerPrice((pVal / conversion).toFixed(2));
    }
  };

  const getMarginText = (sellingPriceStr: string, purchasePriceStr: string) => {
    const sp = parseFloat(sellingPriceStr);
    const pp = parseFloat(purchasePriceStr);
    if (isNaN(sp) || isNaN(pp) || sp <= 0) return null;
    const margin = ((sp - pp) / sp) * 100;
    const isNegative = margin < 0;
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-1.5 ${isNegative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {margin > 0 ? '+' : ''}{margin.toFixed(1)}% {t('margin')}
      </span>
    );
  };

  const getSubMarginText = (subSellingPriceStr: string, purchasePriceStr: string, conversionStr: string) => {
    const ssp = parseFloat(subSellingPriceStr);
    const pp = parseFloat(purchasePriceStr);
    const conv = parseFloat(conversionStr);
    if (isNaN(ssp) || isNaN(pp) || isNaN(conv) || conv <= 0 || ssp <= 0) return null;
    const subPP = pp / conv;
    const margin = ((ssp - subPP) / ssp) * 100;
    const isNegative = margin < 0;
    return (
      <span className={`text-[9px] font-bold px-1 py-0.2 rounded ml-1 ${isNegative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {margin > 0 ? '+' : ''}{margin.toFixed(1)}% {t('margin')}
      </span>
    );
  };
  
  // Modals for PO/SO
  const [showPOModal, setShowPOModal] = useState(false);
  const [showSOModal, setShowSOModal] = useState(false);

  // Confirmation Modal
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

  // Master Modals
  const [showMasterModal, setShowMasterModal] = useState<{ type: string; obj: any } | null>(null);

  // Apply parsed cloud/local database state to React state
  const applyData = (parsed: any) => {
    const loadedCompanies = (parsed.companies || defaultCompanies).map((c: any) => {
      if (!c.themeColor) {
        const matchedDefault = defaultCompanies.find((dc: any) => dc.id === c.id);
        return {
          ...c,
          themeColor: matchedDefault?.themeColor || (c.id === 2 ? '#1e3a8a' : '#c41e3a')
        };
      }
      return c;
    });

    const updatedState = {
      companies: loadedCompanies,
      branches: parsed.branches || defaultBranches,
      stores: parsed.stores || defaultStores,
      users: parsed.users || defaultUsers,
      categories: parsed.categories || defaultCategories,
      taxes: parsed.taxes || defaultTaxes,
      suppliers: parsed.suppliers || defaultSuppliers,
      customers: parsed.customers || defaultCustomers,
      stockItems: parsed.stockItems || defaultStockItems,
      purchaseOrders: parsed.purchaseOrders || defaultPurchaseOrders,
      salesOrders: parsed.salesOrders || defaultSalesOrders,
      expenses: parsed.expenses || defaultExpenses,
      auditTrails: parsed.auditTrails || defaultAuditTrails,
      settings: parsed.settings || defaultSettings,
      rolePermissions: parsed.rolePermissions || defaultRolePermissions,
      posShifts: parsed.posShifts || [],
      stockTransfers: parsed.stockTransfers || [],
    };

    dbStateRef.current = updatedState;

    setCompanies(updatedState.companies);
    setBranches(updatedState.branches);
    setStores(updatedState.stores);
    setUsers(updatedState.users);
    setCategories(updatedState.categories);
    setTaxes(updatedState.taxes);
    setSuppliers(updatedState.suppliers);
    setCustomers(updatedState.customers);
    setStockItems(updatedState.stockItems);
    setPurchaseOrders(updatedState.purchaseOrders);
    setSalesOrders(updatedState.salesOrders);
    setExpenses(updatedState.expenses);
    setAuditTrails(updatedState.auditTrails);
    setSettings(updatedState.settings);
    setRolePermissions(updatedState.rolePermissions);
    setPosShifts(updatedState.posShifts);
    setStockTransfers(updatedState.stockTransfers);
  };

  // --- LOAD INITIAL DATA AND REAL-TIME SYNC FROM CLOUD ---
  useEffect(() => {
    // 1. Instantly load local data to prevent any blank screen or login lag
    const stored = localStorage.getItem('tradecore_data');
    let initialData = null;
    if (stored) {
      try {
        initialData = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse local tradecore_data', e);
      }
    }

    if (initialData) {
      applyData(initialData);
    } else {
      // In-memory defaults only, to avoid blank screen, but DO NOT save to Cloud/LocalStorage yet
      const defaults = {
        companies: defaultCompanies,
        branches: defaultBranches,
        stores: defaultStores,
        users: defaultUsers,
        categories: defaultCategories,
        taxes: defaultTaxes,
        suppliers: defaultSuppliers,
        customers: defaultCustomers,
        stockItems: defaultStockItems,
        purchaseOrders: defaultPurchaseOrders,
        salesOrders: defaultSalesOrders,
        expenses: defaultExpenses,
        auditTrails: defaultAuditTrails,
        settings: defaultSettings,
        rolePermissions: defaultRolePermissions,
      };
      dbStateRef.current = defaults;
      setCompanies(defaultCompanies);
      setBranches(defaultBranches);
      setStores(defaultStores);
      setUsers(defaultUsers);
      setCategories(defaultCategories);
      setTaxes(defaultTaxes);
      setSuppliers(defaultSuppliers);
      setCustomers(defaultCustomers);
      setStockItems(defaultStockItems);
      setPurchaseOrders(defaultPurchaseOrders);
      setSalesOrders(defaultSalesOrders);
      setExpenses(defaultExpenses);
      setAuditTrails(defaultAuditTrails);
      setSettings(defaultSettings);
      setRolePermissions(defaultRolePermissions);
    }

    // Check user session
    const savedUser = localStorage.getItem('tradecore_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (e) {
        localStorage.removeItem('tradecore_user');
      }
    }

    // 2. Keep devices in sync by subscribing to cloud changes in real-time
    const unsubscribe = subscribeToSystemDataCloud((cloudData) => {
      // Check if we wrote locally in the last 5 seconds to avoid overwriting optimistic state
      if (Date.now() - lastLocalWriteTimeRef.current < 5000) {
        console.log('[Sync] Skipping real-time update to protect recent optimistic local write');
        return;
      }
      if (cloudData) {
        // Avoid overwriting local updates if local cached data is newer or equal
        const localCachedStr = localStorage.getItem('tradecore_data');
        if (localCachedStr) {
          try {
            const localCached = JSON.parse(localCachedStr);
            if (localCached.lastUpdated && cloudData.lastUpdated) {
              const localTime = new Date(localCached.lastUpdated).getTime();
              const cloudTime = new Date(cloudData.lastUpdated).getTime();
              if (cloudTime <= localTime) {
                // Already in sync or local is newer, avoid overriding
                return;
              }
            }
          } catch (e) {
            console.error('Failed to compare local and cloud update times', e);
          }
        }

        console.log('[Sync] Received real-time cloud update!');
        // Apply cloud changes to state
        applyData(cloudData);
        // Persist to local cache
        localStorage.setItem('tradecore_data', JSON.stringify(cloudData));

        // Ensure logged-in user is updated in session if details changed
        const sessionUserStr = localStorage.getItem('tradecore_user');
        if (sessionUserStr && cloudData.users) {
          try {
            const sessionUser = JSON.parse(sessionUserStr);
            const freshUser = cloudData.users.find((u: any) => u.id === sessionUser.id);
            if (freshUser) {
              localStorage.setItem('tradecore_user', JSON.stringify(freshUser));
              setCurrentUser(freshUser);
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        // Cloud data is null - seed database
        console.log('[Sync] Cloud database is empty. Seeding from local cache or defaults...');
        const localCached = localStorage.getItem('tradecore_data');
        if (localCached) {
          try {
            const parsed = JSON.parse(localCached);
            saveSystemDataToCloud(parsed);
          } catch (e) {
            console.error('Failed to parse local cache for seeding', e);
          }
        } else {
          const defaultState = {
            companies: defaultCompanies,
            branches: defaultBranches,
            stores: defaultStores,
            users: defaultUsers,
            categories: defaultCategories,
            taxes: defaultTaxes,
            suppliers: defaultSuppliers,
            customers: defaultCustomers,
            stockItems: defaultStockItems,
            purchaseOrders: defaultPurchaseOrders,
            salesOrders: defaultSalesOrders,
            expenses: defaultExpenses,
            auditTrails: defaultAuditTrails,
            settings: defaultSettings,
            rolePermissions: defaultRolePermissions,
            lastUpdated: new Date().toISOString()
          };
          localStorage.setItem('tradecore_data', JSON.stringify(defaultState));
          saveSystemDataToCloud(defaultState);
        }
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'tradecore_data' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          applyData(parsed);
        } catch (err) {
          console.error('[Sync] Local storage event parse failed', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // --- SYNC TO STORAGE & CLOUD ---
  const saveAllData = async (updatedFields: Partial<{
    companies: Company[]; branches: Branch[]; stores: Store[]; users: User[];
    categories: string[]; taxes: Tax[]; suppliers: Supplier[]; customers: Customer[];
    stockItems: StockItem[]; purchaseOrders: PurchaseOrder[]; salesOrders: SalesOrder[];
    expenses: Expense[]; auditTrails: AuditTrail[]; settings: Settings;
    rolePermissions: Record<string, string[]>;
    posShifts: PosShift[];
    stockTransfers: StockTransfer[];
  }>) => {
    // Record cooldown timestamp to pause background synchronization polling
    lastLocalWriteTimeRef.current = Date.now();

    // Fetch the previous cached update time before applying optimistic changes
    const prevCachedStr = localStorage.getItem('tradecore_data');
    let prevLastUpdated = 0;
    if (prevCachedStr) {
      try {
        const prev = JSON.parse(prevCachedStr);
        prevLastUpdated = new Date(prev.lastUpdated || 0).getTime();
      } catch (e) {}
    }

    const nowIso = new Date().toISOString();
    
    // Get absolute latest synchronous values from the reference
    const current = dbStateRef.current;

    // Mutate reference instantly so any subsequent call in the same tick sees these changes
    const nextState = {
      companies: updatedFields.companies !== undefined ? updatedFields.companies : current.companies,
      branches: updatedFields.branches !== undefined ? updatedFields.branches : current.branches,
      stores: updatedFields.stores !== undefined ? updatedFields.stores : current.stores,
      users: updatedFields.users !== undefined ? updatedFields.users : current.users,
      categories: updatedFields.categories !== undefined ? updatedFields.categories : current.categories,
      taxes: updatedFields.taxes !== undefined ? updatedFields.taxes : current.taxes,
      suppliers: updatedFields.suppliers !== undefined ? updatedFields.suppliers : current.suppliers,
      customers: updatedFields.customers !== undefined ? updatedFields.customers : current.customers,
      stockItems: updatedFields.stockItems !== undefined ? updatedFields.stockItems : current.stockItems,
      purchaseOrders: updatedFields.purchaseOrders !== undefined ? updatedFields.purchaseOrders : current.purchaseOrders,
      salesOrders: updatedFields.salesOrders !== undefined ? updatedFields.salesOrders : current.salesOrders,
      expenses: updatedFields.expenses !== undefined ? updatedFields.expenses : current.expenses,
      auditTrails: updatedFields.auditTrails !== undefined ? updatedFields.auditTrails : current.auditTrails,
      settings: updatedFields.settings !== undefined ? updatedFields.settings : current.settings,
      rolePermissions: updatedFields.rolePermissions !== undefined ? updatedFields.rolePermissions : current.rolePermissions,
      posShifts: updatedFields.posShifts !== undefined ? updatedFields.posShifts : current.posShifts,
      stockTransfers: updatedFields.stockTransfers !== undefined ? updatedFields.stockTransfers : current.stockTransfers,
    };
    dbStateRef.current = nextState;

    // 1. Update React states instantly for 100% snappy UI response
    if (updatedFields.companies !== undefined) setCompanies(updatedFields.companies);
    if (updatedFields.branches !== undefined) setBranches(updatedFields.branches);
    if (updatedFields.stores !== undefined) setStores(updatedFields.stores);
    if (updatedFields.users !== undefined) setUsers(updatedFields.users);
    if (updatedFields.categories !== undefined) setCategories(updatedFields.categories);
    if (updatedFields.taxes !== undefined) setTaxes(updatedFields.taxes);
    if (updatedFields.suppliers !== undefined) setSuppliers(updatedFields.suppliers);
    if (updatedFields.customers !== undefined) setCustomers(updatedFields.customers);
    if (updatedFields.stockItems !== undefined) setStockItems(updatedFields.stockItems);
    if (updatedFields.purchaseOrders !== undefined) setPurchaseOrders(updatedFields.purchaseOrders);
    if (updatedFields.salesOrders !== undefined) setSalesOrders(updatedFields.salesOrders);
    if (updatedFields.expenses !== undefined) setExpenses(updatedFields.expenses);
    if (updatedFields.auditTrails !== undefined) setAuditTrails(updatedFields.auditTrails);
    if (updatedFields.settings !== undefined) setSettings(updatedFields.settings);
    if (updatedFields.rolePermissions !== undefined) setRolePermissions(updatedFields.rolePermissions);
    if (updatedFields.posShifts !== undefined) setPosShifts(updatedFields.posShifts);
    if (updatedFields.stockTransfers !== undefined) setStockTransfers(updatedFields.stockTransfers);

    // 2. Compute local state with optimistic changes
    const freshDataLocal = {
      ...nextState,
      lastUpdated: nowIso
    };

    // 3. Write optimistic cache to localStorage instantly
    localStorage.setItem('tradecore_data', JSON.stringify(freshDataLocal));

    // 4. Handle merge with cloud concurrently in the background (pull-merge-push)
    try {
      const cloudData = await fetchSystemDataFromCloud();
      let mergedData = { ...freshDataLocal };

      if (cloudData) {
        const cloudTime = new Date(cloudData.lastUpdated || 0).getTime();
        const isCloudNewer = cloudTime > prevLastUpdated;
        
        console.log(`[Sync] Cloud time: ${cloudTime}, Prev local time: ${prevLastUpdated}. Is cloud newer? ${isCloudNewer}`);

        // If cloud is newer, pull fields we did NOT update in this tick.
        const latestDb = dbStateRef.current;
        mergedData = {
          companies: updatedFields.companies !== undefined ? updatedFields.companies : (isCloudNewer ? (cloudData.companies || latestDb.companies) : latestDb.companies),
          branches: updatedFields.branches !== undefined ? updatedFields.branches : (isCloudNewer ? (cloudData.branches || latestDb.branches) : latestDb.branches),
          stores: updatedFields.stores !== undefined ? updatedFields.stores : (isCloudNewer ? (cloudData.stores || latestDb.stores) : latestDb.stores),
          users: updatedFields.users !== undefined ? updatedFields.users : (isCloudNewer ? (cloudData.users || latestDb.users) : latestDb.users),
          categories: updatedFields.categories !== undefined ? updatedFields.categories : (isCloudNewer ? (cloudData.categories || latestDb.categories) : latestDb.categories),
          taxes: updatedFields.taxes !== undefined ? updatedFields.taxes : (isCloudNewer ? (cloudData.taxes || latestDb.taxes) : latestDb.taxes),
          suppliers: updatedFields.suppliers !== undefined ? updatedFields.suppliers : (isCloudNewer ? (cloudData.suppliers || latestDb.suppliers) : latestDb.suppliers),
          customers: updatedFields.customers !== undefined ? updatedFields.customers : (isCloudNewer ? (cloudData.customers || latestDb.customers) : latestDb.customers),
          stockItems: updatedFields.stockItems !== undefined ? updatedFields.stockItems : (isCloudNewer ? (cloudData.stockItems || latestDb.stockItems) : latestDb.stockItems),
          purchaseOrders: updatedFields.purchaseOrders !== undefined ? updatedFields.purchaseOrders : (isCloudNewer ? (cloudData.purchaseOrders || latestDb.purchaseOrders) : latestDb.purchaseOrders),
          salesOrders: updatedFields.salesOrders !== undefined ? updatedFields.salesOrders : (isCloudNewer ? (cloudData.salesOrders || latestDb.salesOrders) : latestDb.salesOrders),
          expenses: updatedFields.expenses !== undefined ? updatedFields.expenses : (isCloudNewer ? (cloudData.expenses || latestDb.expenses) : latestDb.expenses),
          auditTrails: updatedFields.auditTrails !== undefined ? updatedFields.auditTrails : (isCloudNewer ? (cloudData.auditTrails || latestDb.auditTrails) : latestDb.auditTrails),
          settings: updatedFields.settings !== undefined ? updatedFields.settings : (isCloudNewer ? (cloudData.settings || latestDb.settings) : latestDb.settings),
          rolePermissions: updatedFields.rolePermissions !== undefined ? updatedFields.rolePermissions : (isCloudNewer ? (cloudData.rolePermissions || latestDb.rolePermissions) : latestDb.rolePermissions),
          posShifts: updatedFields.posShifts !== undefined ? updatedFields.posShifts : (isCloudNewer ? (cloudData.posShifts || latestDb.posShifts) : latestDb.posShifts),
          stockTransfers: updatedFields.stockTransfers !== undefined ? updatedFields.stockTransfers : (isCloudNewer ? (cloudData.stockTransfers || latestDb.stockTransfers) : latestDb.stockTransfers),
          lastUpdated: new Date().toISOString()
        };

        // Update React states if cloud was indeed newer and we merged any fields
        if (isCloudNewer) {
          dbStateRef.current = {
            companies: mergedData.companies,
            branches: mergedData.branches,
            stores: mergedData.stores,
            users: mergedData.users,
            categories: mergedData.categories,
            taxes: mergedData.taxes,
            suppliers: mergedData.suppliers,
            customers: mergedData.customers,
            stockItems: mergedData.stockItems,
            purchaseOrders: mergedData.purchaseOrders,
            salesOrders: mergedData.salesOrders,
            expenses: mergedData.expenses,
            auditTrails: mergedData.auditTrails,
            settings: mergedData.settings,
            rolePermissions: mergedData.rolePermissions,
            posShifts: mergedData.posShifts,
            stockTransfers: mergedData.stockTransfers,
          };

          if (updatedFields.companies === undefined && cloudData.companies) setCompanies(cloudData.companies);
          if (updatedFields.branches === undefined && cloudData.branches) setBranches(cloudData.branches);
          if (updatedFields.stores === undefined && cloudData.stores) setStores(cloudData.stores);
          if (updatedFields.users === undefined && cloudData.users) setUsers(cloudData.users);
          if (updatedFields.categories === undefined && cloudData.categories) setCategories(cloudData.categories);
          if (updatedFields.taxes === undefined && cloudData.taxes) setTaxes(cloudData.taxes);
          if (updatedFields.suppliers === undefined && cloudData.suppliers) setSuppliers(cloudData.suppliers);
          if (updatedFields.customers === undefined && cloudData.customers) setCustomers(cloudData.customers);
          if (updatedFields.stockItems === undefined && cloudData.stockItems) setStockItems(cloudData.stockItems);
          if (updatedFields.purchaseOrders === undefined && cloudData.purchaseOrders) setPurchaseOrders(cloudData.purchaseOrders);
          if (updatedFields.salesOrders === undefined && cloudData.salesOrders) setSalesOrders(cloudData.salesOrders);
          if (updatedFields.expenses === undefined && cloudData.expenses) setExpenses(cloudData.expenses);
          if (updatedFields.auditTrails === undefined && cloudData.auditTrails) setAuditTrails(cloudData.auditTrails);
          if (updatedFields.settings === undefined && cloudData.settings) setSettings(cloudData.settings);
          if (updatedFields.rolePermissions === undefined && cloudData.rolePermissions) setRolePermissions(cloudData.rolePermissions);
          if (updatedFields.posShifts === undefined && cloudData.posShifts) setPosShifts(cloudData.posShifts);
          if (updatedFields.stockTransfers === undefined && cloudData.stockTransfers) setStockTransfers(cloudData.stockTransfers);
        }
      }

      // Write final state to localStorage and cloud Firestore
      localStorage.setItem('tradecore_data', JSON.stringify(mergedData));
      await saveSystemDataToCloud(mergedData);
    } catch (err) {
      console.warn('Background cloud merge failed, using local storage. Offline mode.', err);
      await saveSystemDataToCloud(freshDataLocal);
    }
  };

  const restoreFactoryDefaults = () => {
    const defaultState = {
      companies: defaultCompanies,
      branches: defaultBranches,
      stores: defaultStores,
      users: defaultUsers,
      categories: defaultCategories,
      taxes: defaultTaxes,
      suppliers: defaultSuppliers,
      customers: defaultCustomers,
      stockItems: defaultStockItems,
      purchaseOrders: defaultPurchaseOrders,
      salesOrders: defaultSalesOrders,
      expenses: defaultExpenses,
      auditTrails: defaultAuditTrails,
      settings: defaultSettings,
      rolePermissions: defaultRolePermissions,
      lastUpdated: new Date().toISOString()
    };

    localStorage.setItem('tradecore_data', JSON.stringify(defaultState));
    saveSystemDataToCloud(defaultState);

    setCompanies(defaultCompanies);
    setBranches(defaultBranches);
    setStores(defaultStores);
    setUsers(defaultUsers);
    setCategories(defaultCategories);
    setTaxes(defaultTaxes);
    setSuppliers(defaultSuppliers);
    setCustomers(defaultCustomers);
    setStockItems(defaultStockItems);
    setPurchaseOrders(defaultPurchaseOrders);
    setSalesOrders(defaultSalesOrders);
    setExpenses(defaultExpenses);
    setAuditTrails(defaultAuditTrails);
    setSettings(defaultSettings);
    setRolePermissions(defaultRolePermissions);
  };

  const handleExportDatabase = () => {
    try {
      const currentData = {
        companies,
        branches,
        stores,
        users,
        categories,
        taxes,
        suppliers,
        customers,
        stockItems,
        purchaseOrders,
        salesOrders,
        expenses,
        auditTrails,
        settings,
        rolePermissions
      };
      
      const jsonString = JSON.stringify(currentData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.download = `TradeCore_ERP_Database_Backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
      
      logAction('Database Backup', 'Exported complete database JSON file.');
      toast.success(t('Database Backup Downloaded Successfully! You can find it in your downloads folder.'));
    } catch (err) {
      toast.error(t('Failed to export database: ') + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportHTML = () => {
    try {
      const currentData = {
        companies,
        branches,
        stores,
        users,
        categories,
        taxes,
        suppliers,
        customers,
        stockItems,
        purchaseOrders,
        salesOrders,
        expenses,
        auditTrails,
        settings,
        rolePermissions,
        exportedAt: new Date().toISOString()
      };

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Global Tradecore ERP - Interactive Offline Portal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body {
      font-family: 'Inter', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    @media print {
      header, aside, button, select, input {
        display: none !important;
      }
      main {
        padding: 0 !important;
      }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 flex flex-col min-h-screen">

  <!-- HEADER -->
  <header class="bg-slate-900 text-white border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-md">
    <div class="flex items-center gap-3">
      <div class="p-2 bg-blue-600 rounded-lg text-white">
        <i data-lucide="layout-dashboard" class="w-6 h-6"></i>
      </div>
      <div>
        <h1 class="text-lg font-bold tracking-tight">TradeCore ERP Portal</h1>
        <p class="text-xs text-slate-400 font-medium font-mono">Offline Database View & Interactive Reports</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div class="text-right hidden sm:block">
        <p class="text-xs text-slate-400 font-semibold">Active Company</p>
        <p class="text-sm font-bold text-blue-400" id="header-company-name">Global Tradecore</p>
      </div>
      <button onclick="window.print()" class="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 border border-slate-700 transition shadow-xs">
        <i data-lucide="printer" class="w-3.5 h-3.5"></i> Print Page
      </button>
    </div>
  </header>

  <div class="flex flex-1 flex-col md:flex-row">
    <!-- SIDEBAR NAVIGATION -->
    <aside class="w-full md:w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col justify-between">
      <nav class="p-4 space-y-1">
        <button onclick="switchTab('dashboard')" id="btn-dashboard" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition bg-blue-600 text-white">
          <i data-lucide="layout-dashboard" class="w-4 h-4"></i> Dashboard
        </button>
        <button onclick="switchTab('products')" id="btn-products" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="package" class="w-4 h-4"></i> Stock Items
        </button>
        <button onclick="switchTab('sales')" id="btn-sales" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="shopping-cart" class="w-4 h-4"></i> Sales Ledgers
        </button>
        <button onclick="switchTab('purchases')" id="btn-purchases" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="receipt" class="w-4 h-4"></i> Purchase Orders
        </button>
        <button onclick="switchTab('expenses')" id="btn-expenses" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="dollar-sign" class="w-4 h-4"></i> Expenses
        </button>
        <button onclick="switchTab('contacts')" id="btn-contacts" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="users" class="w-4 h-4"></i> Customers & Suppliers
        </button>
        <button onclick="switchTab('logs')" id="btn-logs" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-800 hover:text-white">
          <i data-lucide="file-text" class="w-4 h-4"></i> Audit Trails
        </button>
      </nav>
      <div class="p-4 border-t border-slate-800 text-[10px] text-slate-500 font-semibold space-y-1 bg-slate-950">
        <p>Export Date: <span id="footer-export-date"></span></p>
        <p>License Status: ACTIVE (OFFLINE)</p>
      </div>
    </aside>

    <!-- MAIN CONTAINER -->
    <main class="flex-1 p-6 md:p-8 overflow-y-auto">
      
      <!-- ================= DASHBOARD TAB ================= -->
      <section id="tab-dashboard" class="tab-content space-y-6">
        <div class="border-b pb-4">
          <h2 class="text-xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h2>
          <p class="text-xs text-slate-500 font-medium">Real-time summaries calculated from the active offline backup.</p>
        </div>

        <!-- KPI CARDS -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-xl border shadow-xs flex items-center gap-4">
            <div class="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <i data-lucide="dollar-sign" class="w-6 h-6"></i>
            </div>
            <div>
              <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
              <h3 class="text-lg font-bold text-slate-900 mt-0.5" id="kpi-sales-total">$0.00</h3>
            </div>
          </div>
          <div class="bg-white p-5 rounded-xl border shadow-xs flex items-center gap-4">
            <div class="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <i data-lucide="package" class="w-6 h-6"></i>
            </div>
            <div>
              <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Inventory Value</p>
              <h3 class="text-lg font-bold text-slate-900 mt-0.5" id="kpi-inventory-value">$0.00</h3>
            </div>
          </div>
          <div class="bg-white p-5 rounded-xl border shadow-xs flex items-center gap-4">
            <div class="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <i data-lucide="receipt" class="w-6 h-6"></i>
            </div>
            <div>
              <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Stock SKU Count</p>
              <h3 class="text-lg font-bold text-slate-900 mt-0.5" id="kpi-sku-count">0 Items</h3>
            </div>
          </div>
          <div class="bg-white p-5 rounded-xl border shadow-xs flex items-center gap-4">
            <div class="p-3 bg-rose-50 text-rose-600 rounded-lg">
              <i data-lucide="trending-up" class="w-6 h-6"></i>
            </div>
            <div>
              <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Expenses</p>
              <h3 class="text-lg font-bold text-slate-900 mt-0.5" id="kpi-expenses-total">$0.00</h3>
            </div>
          </div>
        </div>

        <!-- RECENT ACTIVITY AND NOTIFICATIONS -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white rounded-xl border shadow-xs p-5 space-y-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="calendar" class="w-4 h-4 text-blue-600"></i> Recent Sales Orders
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="bg-slate-50 border-b">
                    <th class="p-2.5 font-bold text-slate-600">Order ID</th>
                    <th class="p-2.5 font-bold text-slate-600">Customer</th>
                    <th class="p-2.5 font-bold text-slate-600">Date</th>
                    <th class="p-2.5 font-bold text-slate-600 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody id="recent-sales-tbody">
                  <!-- JS Injection -->
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-white rounded-xl border shadow-xs p-5 space-y-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500"></i> Stock Level Warning
            </h3>
            <div class="space-y-2 max-h-[220px] overflow-y-auto" id="low-stock-list">
              <!-- JS Low stock item cards -->
            </div>
          </div>
        </div>
      </section>

      <!-- ================= PRODUCTS TAB ================= -->
      <section id="tab-products" class="tab-content hidden space-y-6">
        <div class="border-b pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">Active Stock & Inventory</h2>
            <p class="text-xs text-slate-500 font-medium">Browse, search, and audit your stock counts and valuations.</p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <div class="relative flex-1 sm:w-64">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <i data-lucide="search" class="w-4 h-4"></i>
              </span>
              <input type="text" id="search-products" onkeyup="filterProducts()" placeholder="Search Code, Name, Category..." class="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white shadow-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-medium">
            </div>
            <select id="filter-products-category" onchange="filterProducts()" class="py-1.5 px-3 border border-slate-200 rounded-lg text-xs bg-white shadow-xs focus:outline-hidden font-medium">
              <option value="">All Categories</option>
            </select>
          </div>
        </div>

        <div class="bg-white rounded-xl border shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-600 font-bold border-b">
                  <th class="p-3">SKU Code</th>
                  <th class="p-3">Product Description</th>
                  <th class="p-3">Category</th>
                  <th class="p-3">Branch / Store</th>
                  <th class="p-3 text-right">In-Stock Qty</th>
                  <th class="p-3 text-right">Selling Price</th>
                  <th class="p-3 text-right">Total Value</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="products-tbody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- JS Injection -->
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ================= SALES TAB ================= -->
      <section id="tab-sales" class="tab-content hidden space-y-6">
        <div class="border-b pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">Sales Orders & Receipts</h2>
            <p class="text-xs text-slate-500 font-medium">View completed checkout ledgers and generate printable receipts.</p>
          </div>
          <div class="relative w-full sm:w-72">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <i data-lucide="search" class="w-4 h-4"></i>
            </span>
            <input type="text" id="search-sales" onkeyup="filterSales()" placeholder="Search Invoice #, Customer, Date..." class="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white shadow-xs focus:outline-hidden font-medium">
          </div>
        </div>

        <div class="bg-white rounded-xl border shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-600 font-bold border-b">
                  <th class="p-3">Invoice Number</th>
                  <th class="p-3">Date &amp; Time</th>
                  <th class="p-3">Customer</th>
                  <th class="p-3">Branch Layout</th>
                  <th class="p-3">Operator</th>
                  <th class="p-3 text-right">Items Count</th>
                  <th class="p-3 text-right">Total Amount</th>
                  <th class="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody id="sales-tbody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- JS Injection -->
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ================= PURCHASES TAB ================= -->
      <section id="tab-purchases" class="tab-content hidden space-y-6">
        <div class="border-b pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">Purchase Orders (PO)</h2>
            <p class="text-xs text-slate-500 font-medium">Review vendor supplies, inventory acquisitions, and ledger items.</p>
          </div>
          <div class="relative w-full sm:w-72">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <i data-lucide="search" class="w-4 h-4"></i>
            </span>
            <input type="text" id="search-purchases" onkeyup="filterPurchases()" placeholder="Search PO #, Supplier, Code..." class="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white shadow-xs focus:outline-hidden font-medium">
          </div>
        </div>

        <div class="bg-white rounded-xl border shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-600 font-bold border-b">
                  <th class="p-3">PO Number</th>
                  <th class="p-3">Creation Date</th>
                  <th class="p-3">Supplier Name</th>
                  <th class="p-3">Branch Target</th>
                  <th class="p-3 text-right">Subtotal</th>
                  <th class="p-3 text-right">Tax Amount</th>
                  <th class="p-3 text-right">Grand Total</th>
                  <th class="p-3 text-center">Receipt Status</th>
                  <th class="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody id="purchases-tbody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- JS Injection -->
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ================= EXPENSES TAB ================= -->
      <section id="tab-expenses" class="tab-content hidden space-y-6">
        <div class="border-b pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">System Expenses</h2>
            <p class="text-xs text-slate-500 font-medium">Review operational overhead, utility expenditures, and rent files.</p>
          </div>
          <div class="relative w-full sm:w-72">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <i data-lucide="search" class="w-4 h-4"></i>
            </span>
            <input type="text" id="search-expenses" onkeyup="filterExpenses()" placeholder="Search Reference, Category, Notes..." class="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white shadow-xs focus:outline-hidden font-medium">
          </div>
        </div>

        <div class="bg-white rounded-xl border shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-600 font-bold border-b">
                  <th class="p-3">Expense Code</th>
                  <th class="p-3">Billing Date</th>
                  <th class="p-3">Category</th>
                  <th class="p-3">Notes &amp; Description</th>
                  <th class="p-3">Assigned Operator</th>
                  <th class="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody id="expenses-tbody" class="divide-y divide-slate-100 font-medium text-slate-700">
                <!-- JS Injection -->
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ================= CONTACTS TAB ================= -->
      <section id="tab-contacts" class="tab-content hidden space-y-6">
        <div class="border-b pb-4">
          <h2 class="text-xl font-bold text-slate-900 tracking-tight">Suppliers &amp; Customers Directory</h2>
          <p class="text-xs text-slate-500 font-medium">Offline directory of all contact records, email handles, and geographical hubs.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- CUSTOMERS CARD -->
          <div class="bg-white rounded-xl border shadow-xs p-5 space-y-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
              <i data-lucide="users" class="w-4 h-4 text-blue-600"></i> Registered Customers
            </h3>
            <div class="overflow-y-auto max-h-[400px] space-y-2" id="customers-list">
              <!-- JS Customer List -->
            </div>
          </div>

          <!-- SUPPLIERS CARD -->
          <div class="bg-white rounded-xl border shadow-xs p-5 space-y-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5 border-b pb-2">
              <i data-lucide="truck" class="w-4 h-4 text-emerald-600"></i> Active Suppliers
            </h3>
            <div class="overflow-y-auto max-h-[400px] space-y-2" id="suppliers-list">
              <!-- JS Supplier List -->
            </div>
          </div>
        </div>
      </section>

      <!-- ================= AUDIT LOGS TAB ================= -->
      <section id="tab-logs" class="tab-content hidden space-y-6">
        <div class="border-b pb-4 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">Operational Audit Trails</h2>
            <p class="text-xs text-slate-500 font-medium">Chronological registry of platform operations and data mutations.</p>
          </div>
          <span class="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold font-mono">SECURE CHRONO</span>
        </div>

        <div class="bg-slate-900 text-slate-300 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto space-y-2 border border-slate-800 shadow-lg" id="logs-container">
          <!-- JS Logs Injection -->
        </div>
      </section>

    </main>
  </div>

  <!-- DETAILS MODALS -->
  <div id="modal-backdrop" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 hidden">
    <div class="bg-white rounded-xl max-w-2xl w-full shadow-2xl border flex flex-col max-h-[90vh] overflow-hidden transform scale-95 transition-transform duration-200" id="modal-container">
      <div class="p-4 border-b flex justify-between items-center bg-slate-50">
        <h3 class="text-sm font-bold text-slate-900" id="modal-title">Receipt Details</h3>
        <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="p-6 overflow-y-auto text-xs" id="modal-body">
        <!-- JS Injection -->
      </div>
      <div class="p-4 border-t bg-slate-50 flex justify-end gap-2">
        <button onclick="printModal()" class="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-1.5 transition">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i> Print Receipt
        </button>
        <button onclick="closeModal()" class="py-1.5 px-3 border hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <!-- EMBEDDED REAL SYSTEM DATA -->
  <script id="system-data" type="application/json">
    ${JSON.stringify(currentData)}
  </script>

  <!-- PORTAL OPERATIONS SCRIPT -->
  <script>
    // Load embedded system data safely
    const DATA = JSON.parse(document.getElementById('system-data').textContent);
    console.log('[Offline Portal] Loaded Data:', DATA);

    // Populate metadata
    document.getElementById('header-company-name').textContent = DATA.companies[0]?.name || 'Global Tradecore';
    document.getElementById('footer-export-date').textContent = new Date(DATA.exportedAt || Date.now()).toLocaleString();

    // Helper: format money with user's settings
    const currencySym = DATA.settings?.currency === 'TZS' ? 'TSh' : '$';
    function fmtMoney(usdVal) {
      if (DATA.settings?.currency === 'TZS') {
        const rate = DATA.settings?.exchangeRate || 2500;
        const val = Math.round(usdVal * rate);
        return val.toLocaleString() + ' ' + currencySym;
      }
      return currencySym + usdVal.toFixed(2);
    }

    // Tab switching engine
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.getElementById('tab-' + tabId).classList.remove('hidden');

      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('hover:bg-slate-800', 'hover:text-white', 'text-slate-300');
      });
      const activeBtn = document.getElementById('btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.remove('hover:bg-slate-800', 'hover:text-white', 'text-slate-300');
        activeBtn.classList.add('bg-blue-600', 'text-white');
      }
      window.scrollTo(0, 0);
    }

    // 1. Render Dashboard Tab
    function renderDashboard() {
      // KPIs
      let totalSales = 0;
      DATA.salesOrders.filter(so => so.active !== false).forEach(so => totalSales += (so.grandTotal || 0));
      document.getElementById('kpi-sales-total').textContent = fmtMoney(totalSales);

      let totalInvVal = 0;
      DATA.stockItems.filter(p => p.active !== false).forEach(p => totalInvVal += ((p.qty || 0) * (p.costPrice || p.price || 0)));
      document.getElementById('kpi-inventory-value').textContent = fmtMoney(totalInvVal);

      const itemsCount = DATA.stockItems.filter(p => p.active !== false).length;
      document.getElementById('kpi-sku-count').textContent = itemsCount + ' SKU Items';

      let totalExp = 0;
      DATA.expenses.forEach(e => totalExp += (e.usdAmount || 0));
      document.getElementById('kpi-expenses-total').textContent = fmtMoney(totalExp);

      // Recent Sales list
      const recentSales = DATA.salesOrders.filter(so => so.active !== false).slice(0, 5);
      const recentTbody = document.getElementById('recent-sales-tbody');
      recentTbody.innerHTML = '';
      if (recentSales.length === 0) {
        recentTbody.innerHTML = '<tr><td colspan="4" class="p-3 text-slate-400 text-center font-medium">No sales recorded</td></tr>';
      } else {
        recentSales.forEach(so => {
          recentTbody.innerHTML += \`
            <tr class="border-b border-slate-100 hover:bg-slate-50/50">
              <td class="p-2.5 font-semibold text-blue-600 cursor-pointer" onclick="viewSalesDetail('\${so.soNumber}')">\${so.soNumber}</td>
              <td class="p-2.5 font-medium text-slate-700">\${so.customerName || 'Walk-in Customer'}</td>
              <td class="p-2.5 text-slate-400 font-medium">\${new Date(so.date).toLocaleDateString()}</td>
              <td class="p-2.5 text-right font-bold text-slate-900">\${fmtMoney(so.grandTotal)}</td>
            </tr>
          \`;
        });
      }

      // Low Stock warning list
      const lowStockItems = DATA.stockItems.filter(p => p.active !== false && (p.qty || 0) <= (p.minStock || 5));
      const lowStockList = document.getElementById('low-stock-list');
      lowStockList.innerHTML = '';
      if (lowStockItems.length === 0) {
        lowStockList.innerHTML = '<div class="p-3 text-emerald-600 bg-emerald-50 rounded-lg text-center font-bold text-xs">All inventory counts healthy</div>';
      } else {
        lowStockItems.slice(0, 10).forEach(p => {
          lowStockList.innerHTML += \`
            <div class="p-2.5 border rounded-lg bg-amber-50/30 flex items-center justify-between text-xs font-semibold">
              <div class="min-w-0 pr-2">
                <p class="text-slate-900 font-bold truncate">\${p.name}</p>
                <p class="text-slate-400 text-[10px]">\${p.code}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-bold text-[10px]">\${p.qty} left</span>
                <p class="text-[9px] text-slate-400 mt-0.5">Min level: \${p.minStock || 5}</p>
              </div>
            </div>
          \`;
        });
      }
    }

    // 2. Render Products Tab
    function renderProducts() {
      // Fill Category filter options
      const catFilter = document.getElementById('filter-products-category');
      catFilter.innerHTML = '<option value="">All Categories</option>';
      (DATA.categories || []).forEach(c => {
        catFilter.innerHTML += \`<option value="\${c}">\${c}</option>\`;
      });

      const tbody = document.getElementById('products-tbody');
      tbody.innerHTML = '';
      
      const filteredItems = DATA.stockItems.filter(p => p.active !== false);
      if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-slate-400 text-center font-medium">No items registered</td></tr>';
        return;
      }

      filteredItems.forEach(p => {
        const isLow = (p.qty || 0) <= (p.minStock || 5);
        const val = (p.qty || 0) * (p.price || 0);
        tbody.innerHTML += \`
          <tr class="hover:bg-slate-50/50 product-row border-b" data-name="\${(p.name || '').toLowerCase()}" data-code="\${(p.code || '').toLowerCase()}" data-cat="\${(p.category || '').toLowerCase()}">
            <td class="p-3 font-mono font-bold text-slate-900">\${p.code}</td>
            <td class="p-3 font-bold text-slate-700">\${p.name}</td>
            <td class="p-3 text-slate-500 font-semibold">\${p.category || 'N/A'}</td>
            <td class="p-3 text-slate-400 font-medium">\${p.branch || 'Main Branch'}</td>
            <td class="p-3 text-right font-bold \${isLow ? 'text-rose-600 bg-rose-50/50' : 'text-slate-900'}">\${p.qty}</td>
            <td class="p-3 text-right text-slate-700 font-medium">\${fmtMoney(p.price || 0)}</td>
            <td class="p-3 text-right text-slate-900 font-bold">\${fmtMoney(val)}</td>
            <td class="p-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold \${isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}">
                \${isLow ? 'Low stock' : 'Optimal'}
              </span>
            </td>
          </tr>
        \`;
      });
    }

    function filterProducts() {
      const q = document.getElementById('search-products').value.toLowerCase();
      const cat = document.getElementById('filter-products-category').value.toLowerCase();
      
      document.querySelectorAll('.product-row').forEach(row => {
        const rowName = row.getAttribute('data-name');
        const rowCode = row.getAttribute('data-code');
        const rowCat = row.getAttribute('data-cat');
        
        const matchesSearch = rowName.includes(q) || rowCode.includes(q);
        const matchesCategory = !cat || rowCat === cat;

        if (matchesSearch && matchesCategory) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    }

    // 3. Render Sales Tab
    function renderSales() {
      const tbody = document.getElementById('sales-tbody');
      tbody.innerHTML = '';
      
      const sales = DATA.salesOrders.filter(so => so.active !== false);
      if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-slate-400 text-center font-medium">No sales orders found</td></tr>';
        return;
      }

      sales.forEach(so => {
        tbody.innerHTML += \`
          <tr class="hover:bg-slate-50/50 sales-row border-b" data-invoice="\${so.soNumber.toLowerCase()}" data-cust="\${(so.customerName || 'walk-in').toLowerCase()}">
            <td class="p-3 font-mono font-bold text-blue-600 cursor-pointer" onclick="viewSalesDetail('\${so.soNumber}')">\${so.soNumber}</td>
            <td class="p-3 text-slate-500 font-medium">\${new Date(so.date).toLocaleString()}</td>
            <td class="p-3 font-bold text-slate-700">\${so.customerName || 'Walk-in Customer'}</td>
            <td class="p-3 text-slate-400 font-medium">\${so.branch || 'Main Branch'}</td>
            <td class="p-3 text-slate-500 font-semibold">\${so.operator || 'Root User'}</td>
            <td class="p-3 text-right font-medium text-slate-600">\${so.items?.length || 0} items</td>
            <td class="p-3 text-right font-bold text-slate-900">\${fmtMoney(so.grandTotal)}</td>
            <td class="p-3 text-center">
              <button onclick="viewSalesDetail('\${so.soNumber}')" class="py-1 px-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 text-[10px] font-bold transition">
                View Receipt
              </button>
            </td>
          </tr>
        \`;
      });
    }

    function filterSales() {
      const q = document.getElementById('search-sales').value.toLowerCase();
      document.querySelectorAll('.sales-row').forEach(row => {
        const inv = row.getAttribute('data-invoice');
        const cust = row.getAttribute('data-cust');
        if (inv.includes(q) || cust.includes(q)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    }

    // 4. Render Purchases Tab
    function renderPurchases() {
      const tbody = document.getElementById('purchases-tbody');
      tbody.innerHTML = '';
      
      const purchases = DATA.purchaseOrders.filter(po => po.active !== false);
      if (purchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-slate-400 text-center font-medium">No purchase records found</td></tr>';
        return;
      }

      purchases.forEach(po => {
        const isRec = po.status === 'Received';
        tbody.innerHTML += \`
          <tr class="hover:bg-slate-50/50 purchase-row border-b" data-po="\${po.poNumber.toLowerCase()}" data-supplier="\${(po.supplierName || '').toLowerCase()}">
            <td class="p-3 font-mono font-bold text-emerald-600 cursor-pointer" onclick="viewPurchaseDetail('\${po.poNumber}')">\${po.poNumber}</td>
            <td class="p-3 text-slate-500 font-medium">\${new Date(po.date).toLocaleDateString()}</td>
            <td class="p-3 font-bold text-slate-700">\${po.supplierName || 'General Supplier'}</td>
            <td class="p-3 text-slate-400 font-medium">\${po.branch || 'Main Branch'}</td>
            <td class="p-3 text-right text-slate-600 font-medium">\${fmtMoney(po.subtotal)}</td>
            <td class="p-3 text-right text-slate-600 font-medium">\${fmtMoney(po.taxTotal || 0)}</td>
            <td class="p-3 text-right font-bold text-slate-900">\${fmtMoney(po.grandTotal)}</td>
            <td class="p-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold \text-[10px] \${isRec ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                \${po.status}
              </span>
            </td>
            <td class="p-3 text-center">
              <button onclick="viewPurchaseDetail('\${po.poNumber}')" class="py-1 px-2.5 bg-slate-50 text-slate-600 border rounded-lg hover:bg-slate-100 text-[10px] font-bold transition">
                View Ledger
              </button>
            </td>
          </tr>
        \`;
      });
    }

    function filterPurchases() {
      const q = document.getElementById('search-purchases').value.toLowerCase();
      document.querySelectorAll('.purchase-row').forEach(row => {
        const po = row.getAttribute('data-po');
        const supplier = row.getAttribute('data-supplier');
        if (po.includes(q) || supplier.includes(q)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    }

    // 5. Render Expenses Tab
    function renderExpenses() {
      const tbody = document.getElementById('expenses-tbody');
      tbody.innerHTML = '';
      
      const expenses = DATA.expenses || [];
      if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-slate-400 text-center font-medium">No expenses registered</td></tr>';
        return;
      }

      expenses.forEach(e => {
        tbody.innerHTML += \`
          <tr class="hover:bg-slate-50/50 expense-row border-b" data-desc="\${(e.description || '').toLowerCase()}" data-cat="\${(e.category || '').toLowerCase()}" data-code="\${(e.expenseNumber || '').toLowerCase()}">
            <td class="p-3 font-mono font-bold text-rose-600">\${e.expenseNumber}</td>
            <td class="p-3 text-slate-500 font-medium">\${new Date(e.date).toLocaleDateString()}</td>
            <td class="p-3 text-slate-800 font-bold">\${e.category}</td>
            <td class="p-3 text-slate-500 font-medium max-w-xs truncate">\${e.description}</td>
            <td class="p-3 text-slate-400 font-medium">\${e.operator || 'System User'}</td>
            <td class="p-3 text-right font-bold text-rose-600">\${fmtMoney(e.usdAmount)}</td>
          </tr>
        \`;
      });
    }

    function filterExpenses() {
      const q = document.getElementById('search-expenses').value.toLowerCase();
      document.querySelectorAll('.expense-row').forEach(row => {
        const desc = row.getAttribute('data-desc');
        const cat = row.getAttribute('data-cat');
        const code = row.getAttribute('data-code');
        if (desc.includes(q) || cat.includes(q) || code.includes(q)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    }

    // 6. Render Contacts Tab
    function renderContacts() {
      const custDiv = document.getElementById('customers-list');
      custDiv.innerHTML = '';
      const customers = DATA.customers || [];
      if (customers.length === 0) {
        custDiv.innerHTML = '<p class="text-center text-slate-400 py-4 font-semibold">No customer records</p>';
      } else {
        customers.forEach(c => {
          custDiv.innerHTML += \`
            <div class="p-3 border rounded-lg bg-slate-50/50 flex items-start gap-3">
              <div class="p-2 bg-blue-100 text-blue-700 rounded-full flex-shrink-0">
                <i data-lucide="user" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <p class="font-bold text-slate-800 text-xs">\${c.name}</p>
                <p class="text-[10px] text-slate-400 font-medium mt-0.5">Phone: \${c.phone || 'N/A'} | Code: \${c.id}</p>
                <p class="text-[10px] text-slate-400 font-medium">Location: \${c.address || 'N/A'}</p>
              </div>
            </div>
          \`;
        });
      }

      const suppDiv = document.getElementById('suppliers-list');
      suppDiv.innerHTML = '';
      const suppliers = DATA.suppliers || [];
      if (suppliers.length === 0) {
        suppDiv.innerHTML = '<p class="text-center text-slate-400 py-4 font-semibold">No suppliers registered</p>';
      } else {
        suppliers.forEach(s => {
          suppDiv.innerHTML += \`
            <div class="p-3 border rounded-lg bg-emerald-50/20 flex items-start gap-3">
              <div class="p-2 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">
                <i data-lucide="truck" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <p class="font-bold text-slate-800 text-xs">\${s.name}</p>
                <p class="text-[10px] text-slate-400 font-medium mt-0.5">Phone: \${s.phone || 'N/A'} | Contact: \${s.contactPerson || 'N/A'}</p>
                <p class="text-[10px] text-slate-400 font-medium">Hub: \${s.address || 'N/A'}</p>
              </div>
            </div>
          \`;
        });
      }
    }

    // 7. Render Logs Tab
    function renderLogs() {
      const logsContainer = document.getElementById('logs-container');
      logsContainer.innerHTML = '';
      const logs = DATA.auditTrails || [];
      if (logs.length === 0) {
        logsContainer.innerHTML = '<p class="text-slate-500 font-bold">No event logs recorded in system database.</p>';
      } else {
        logs.forEach(log => {
          logsContainer.innerHTML += \`
            <div class="py-1.5 border-b border-slate-800/80 last:border-0 leading-relaxed">
              <span class="text-slate-500">[\${new Date(log.timestamp).toLocaleString()}]</span> 
              <span class="text-amber-400 font-bold">\${log.operator || 'SYSTEM'}:</span> 
              <span class="text-slate-100 font-semibold">\${log.action}</span> - 
              <span class="text-slate-400">\${log.details}</span>
            </div>
          \`;
        });
      }
    }

    // Modal Manager
    function showModal(title, bodyHtml) {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML = bodyHtml;
      document.getElementById('modal-backdrop').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('modal-container').classList.remove('scale-95');
      }, 10);
      lucide.createIcons();
    }

    function closeModal() {
      document.getElementById('modal-container').classList.add('scale-95');
      setTimeout(() => {
        document.getElementById('modal-backdrop').classList.add('hidden');
      }, 150);
    }

    function printModal() {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(\`
        <html>
        <head>
          <title>Print Document</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; font-size: 14px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #eee; padding: 10px; text-align: left; }
            th { background-color: #f9f9f9; font-weight: bold; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .invoice-header { text-align: center; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          \${document.getElementById('modal-body').innerHTML}
        </body>
        </html>
      \`);
      printWindow.document.close();
      printWindow.print();
    }

    function viewSalesDetail(invoiceNum) {
      const so = DATA.salesOrders.find(o => o.soNumber === invoiceNum);
      if (!so) return;

      let itemsHtml = '';
      so.items.forEach(item => {
        itemsHtml += \`
          <tr>
            <td class="py-2 text-slate-800 font-medium">\${item.code} - \${item.name}</td>
            <td class="py-2 text-right font-semibold text-slate-700">\${item.qty}</td>
            <td class="py-2 text-right text-slate-600">\${fmtMoney(item.price)}</td>
            <td class="py-2 text-right font-bold text-slate-900">\${fmtMoney(item.qty * item.price)}</td>
          </tr>
        \`;
      });

      const bodyHtml = \`
        <div class="text-center border-b pb-4 mb-4">
          <h2 class="text-lg font-bold text-slate-900">\${DATA.companies[0]?.name || 'Global Tradecore'}</h2>
          <p class="text-slate-400 font-medium text-xs mt-0.5">Sales Invoice / Checkout Ledger</p>
        </div>
        <div class="grid grid-cols-2 gap-4 border-b pb-4 mb-4 font-semibold text-slate-600">
          <div>
            <p>Invoice #: <span class="font-bold text-slate-900">\${so.soNumber}</span></p>
            <p>Customer: <span class="font-bold text-slate-900">\${so.customerName || 'Walk-in Customer'}</span></p>
            <p>Branch Layout: <span class="font-bold text-slate-900">\${so.branch || 'Main Branch'}</span></p>
          </div>
          <div class="text-right">
            <p>Date: <span class="font-bold text-slate-900">\${new Date(so.date).toLocaleString()}</span></p>
            <p>Cashier ID: <span class="font-bold text-slate-900">\${so.operator || 'Root User'}</span></p>
            <p>Status: <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">COMPLETED</span></p>
          </div>
        </div>
        <table class="w-full text-left border-collapse my-4">
          <thead>
            <tr class="bg-slate-50 border-b">
              <th class="py-2 px-1 text-slate-600 font-bold">Product SKU</th>
              <th class="py-2 text-right text-slate-600 font-bold">Qty</th>
              <th class="py-2 text-right text-slate-600 font-bold">Selling Price</th>
              <th class="py-2 text-right text-slate-600 font-bold">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            \${itemsHtml}
          </tbody>
        </table>
        <div class="w-1/2 ml-auto text-right font-semibold text-slate-700 mt-6 space-y-1">
          <div class="flex justify-between">
            <span>Subtotal</span>
            <span>\${fmtMoney(so.subtotal)}</span>
          </div>
          <div class="flex justify-between">
            <span>Tax Amount</span>
            <span>\${fmtMoney(so.taxTotal || 0)}</span>
          </div>
          <div class="flex justify-between text-base font-bold text-slate-900 border-t pt-2 mt-2">
            <span>Grand Total</span>
            <span>\${fmtMoney(so.grandTotal)}</span>
          </div>
        </div>
      \`;

      showModal('Sales Invoice Details', bodyHtml);
    }

    function viewPurchaseDetail(poNum) {
      const po = DATA.purchaseOrders.find(p => p.poNumber === poNum);
      if (!po) return;

      let itemsHtml = '';
      po.items.forEach(item => {
        itemsHtml += \`
          <tr>
            <td class="py-2 text-slate-800 font-medium">\${item.code} - \${item.name}</td>
            <td class="py-2 text-right font-semibold text-slate-700">\${item.qty}</td>
            <td class="py-2 text-right text-slate-600">\${fmtMoney(item.costPrice || item.price)}</td>
            <td class="py-2 text-right font-bold text-slate-900">\${fmtMoney(item.qty * (item.costPrice || item.price))}</td>
          </tr>
        \`;
      });

      const bodyHtml = \`
        <div class="text-center border-b pb-4 mb-4">
          <h2 class="text-lg font-bold text-slate-900">\${DATA.companies[0]?.name || 'Global Tradecore'}</h2>
          <p class="text-slate-400 font-medium text-xs mt-0.5">Purchase Order Ledger</p>
        </div>
        <div class="grid grid-cols-2 gap-4 border-b pb-4 mb-4 font-semibold text-slate-600">
          <div>
            <p>PO Number: <span class="font-bold text-slate-900">\${po.poNumber}</span></p>
            <p>Supplier Name: <span class="font-bold text-slate-900">\${po.supplierName || 'General Vendor'}</span></p>
            <p>Target Location: <span class="font-bold text-slate-900">\${po.branch || 'Main Branch'}</span></p>
          </div>
          <div class="text-right">
            <p>Date: <span class="font-bold text-slate-900">\${new Date(po.date).toLocaleDateString()}</span></p>
            <p>Status: <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">\${po.status}</span></p>
          </div>
        </div>
        <table class="w-full text-left border-collapse my-4">
          <thead>
            <tr class="bg-slate-50 border-b">
              <th class="py-2 px-1 text-slate-600 font-bold">Acquired SKU</th>
              <th class="py-2 text-right text-slate-600 font-bold">Ordered Qty</th>
              <th class="py-2 text-right text-slate-600 font-bold">Purchase Unit Cost</th>
              <th class="py-2 text-right text-slate-600 font-bold">Total Cost</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            \${itemsHtml}
          </tbody>
        </table>
        <div class="w-1/2 ml-auto text-right font-semibold text-slate-700 mt-6 space-y-1">
          <div class="flex justify-between">
            <span>Subtotal Cost</span>
            <span>\${fmtMoney(po.subtotal)}</span>
          </div>
          <div class="flex justify-between">
            <span>Tax Cost</span>
            <span>\${fmtMoney(po.taxTotal || 0)}</span>
          </div>
          <div class="flex justify-between text-base font-bold text-slate-900 border-t pt-2 mt-2">
            <span>Grand Total Cost</span>
            <span>\${fmtMoney(po.grandTotal)}</span>
          </div>
        </div>
      \`;

      showModal('Purchase Order Details', bodyHtml);
    }

    // Initialize Page
    renderDashboard();
    renderProducts();
    renderSales();
    renderPurchases();
    renderExpenses();
    renderContacts();
    renderLogs();
    lucide.createIcons();
  </script>

</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.download = `TradeCore_ERP_Offline_Portal_${dateStr}.html`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      logAction('Export Offline HTML', 'Downloaded self-contained, interactive HTML web app client.');
      toast.success(t('Interactive HTML File Downloaded Successfully! You can open this file on any device offline to view your reports and logs.'));
    } catch (err) {
      toast.error(t('Failed to generate HTML file: ') + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleImportDatabase = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        if (!json.stockItems || !json.salesOrders || !json.purchaseOrders || !json.users) {
          toast.error(t('Invalid backup file structure. Please ensure you are uploading a valid TradeCore ERP database backup.'));
          return;
        }

        saveAllData({
          companies: json.companies || companies,
          branches: json.branches || branches,
          stores: json.stores || stores,
          users: json.users || users,
          categories: json.categories || categories,
          taxes: json.taxes || taxes,
          suppliers: json.suppliers || suppliers,
          customers: json.customers || customers,
          stockItems: json.stockItems || stockItems,
          purchaseOrders: json.purchaseOrders || purchaseOrders,
          salesOrders: json.salesOrders || salesOrders,
          expenses: json.expenses || expenses,
          settings: json.settings || settings,
          rolePermissions: json.rolePermissions || rolePermissions
        });

        toast.success(t('Database backup restored successfully! Reloading application states...'));
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        toast.error(t('Failed to parse database file: ') + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  };

  // --- SCOPE CONTEXT INITIALIZATION ---
  useEffect(() => {
    if (!currentUser) return;

    // Cross reference user blocks and rules
    const liveUser = users.find(u => u.id === currentUser.id);
    if (liveUser) {
      if (liveUser.status === 'Blocked') {
        handleLogout();
        toast.error(t('Your account access has been blocked by system administration.'));
        return;
      }
      
      // Live sync properties (like allowedPages) to currently active session
      if (
        JSON.stringify(liveUser.allowedPages) !== JSON.stringify(currentUser.allowedPages) ||
        liveUser.name !== currentUser.name ||
        liveUser.role !== currentUser.role ||
        liveUser.companyId !== currentUser.companyId ||
        liveUser.branchId !== currentUser.branchId ||
        liveUser.storeId !== currentUser.storeId
      ) {
        const nextUser = { ...currentUser, ...liveUser };
        localStorage.setItem('tradecore_user', JSON.stringify(nextUser));
        setCurrentUser(nextUser);
      }
    }

    if (currentUser.role === 'Super Admin') {
      const activeCompanies = companies.filter(c => !c.isDeleted);
      const activeBranches = branches.filter(b => !b.isDeleted);
      const activeStores = stores.filter(s => !s.isDeleted);

      let parentCo = currentCompanyId;
      if (!parentCo || !activeCompanies.some(c => c.id === parentCo)) {
        parentCo = activeCompanies[0]?.id || null;
      }

      let activeBrId = currentBranchId;
      if (!activeBrId || !activeBranches.some(b => b.id === activeBrId && b.companyId === parentCo)) {
        const firstActiveBranch = activeBranches.find(b => b.companyId === parentCo);
        activeBrId = firstActiveBranch ? firstActiveBranch.id : null;
      }

      let activeStId = currentStoreId;
      if (!activeStId || !activeStores.some(s => s.id === activeStId && s.branchId === activeBrId)) {
        const firstActiveStore = activeStores.find(s => s.branchId === activeBrId);
        activeStId = firstActiveStore ? firstActiveStore.id : null;
      }
      
      if (currentCompanyId !== parentCo) setCurrentCompanyId(parentCo);
      if (currentBranchId !== activeBrId) setCurrentBranchId(activeBrId);
      if (currentStoreId !== activeStId) setCurrentStoreId(activeStId);
    } else if (currentUser.role === 'Admin') {
      const activeBranches = branches.filter(b => !b.isDeleted);
      const activeStores = stores.filter(s => !s.isDeleted);

      const parentCo = currentUser.companyId || null;

      let activeBrId = currentBranchId;
      if (!activeBrId || !activeBranches.some(b => b.id === activeBrId && b.companyId === parentCo)) {
        const firstActiveBranch = activeBranches.find(b => b.companyId === parentCo);
        activeBrId = firstActiveBranch ? firstActiveBranch.id : null;
      }

      let activeStId = currentStoreId;
      if (!activeStId || !activeStores.some(s => s.id === activeStId && s.branchId === activeBrId)) {
        const firstActiveStore = activeStores.find(s => s.branchId === activeBrId);
        activeStId = firstActiveStore ? firstActiveStore.id : null;
      }

      if (currentCompanyId !== parentCo) setCurrentCompanyId(parentCo);
      if (currentBranchId !== activeBrId) setCurrentBranchId(activeBrId);
      if (currentStoreId !== activeStId) setCurrentStoreId(activeStId);
    } else {
      if (currentCompanyId !== currentUser.companyId) setCurrentCompanyId(currentUser.companyId);
      if (currentBranchId !== currentUser.branchId) setCurrentBranchId(currentUser.branchId);
      if (currentStoreId !== currentUser.storeId) setCurrentStoreId(currentUser.storeId);
    }
  }, [currentUser, companies, branches, stores, currentCompanyId, currentBranchId, currentStoreId, users]);

  // Sync state-managed theme color to document element root style properties smoothly
  useEffect(() => {
    const activeCompany = companies.find(c => c.id === currentCompanyId);
    const activeColor = currentUser && activeCompany ? (activeCompany.themeColor || '#c41e3a') : '#c41e3a';
    
    const root = document.documentElement;
    root.style.setProperty('--brand-color', activeColor);
    root.style.setProperty('--brand-color-hover', adjustColorBrightness(activeColor, -15));
    root.style.setProperty('--brand-color-light', activeColor + '26');
  }, [currentUser, currentCompanyId, companies]);

  // Restrict accessible stores based on soft-deletion, active company selection, and user assignment permissions
  const visibleStores = useMemo(() => {
    let result = stores.filter(s => !s.isDeleted);
    
    if (currentCompanyId) {
      const activeCompanyBranchIds = branches
        .filter(b => b.companyId === currentCompanyId && !b.isDeleted)
        .map(b => b.id);
      result = result.filter(s => activeCompanyBranchIds.includes(s.branchId));
    }
    
    if (currentUser && currentUser.role !== 'Super Admin') {
      const userCompanyBranchIds = branches
        .filter(b => b.companyId === currentUser.companyId && !b.isDeleted)
        .map(b => b.id);
      result = result.filter(s => userCompanyBranchIds.includes(s.branchId));
      
      if (currentUser.role === 'Retailer' || currentUser.role === 'Wholesaler' || currentUser.role === 'Store Admin') {
        if (currentUser.storeId) {
          result = result.filter(s => s.id === currentUser.storeId);
        }
      }
    }
    
    return result;
  }, [stores, branches, currentCompanyId, currentUser]);

  const logAction = (action: string, details: string) => {
    const newLog: AuditTrail = {
      id: Math.random().toString(36).substring(2, 7) + Date.now().toString(36),
      userId: currentUser?.id || 0,
      username: currentUser?.username || 'System',
      role: currentUser?.role || 'Guest',
      action,
      details,
      companyId: currentUser?.companyId,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    saveAllData({ auditTrails: [newLog, ...(dbStateRef.current?.auditTrails || auditTrails)] });
  };

  // --- ACTIONS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let latestUsers = users;
    // Perform an active pre-login sync to ensure we have the latest registered credentials from the cloud
    try {
      const cloudData = await fetchSystemDataFromCloud();
      if (cloudData) {
        applyData(cloudData);
        localStorage.setItem('tradecore_data', JSON.stringify(cloudData));
        if (cloudData.users) {
          latestUsers = cloudData.users;
        }
      }
    } catch (err) {
      console.warn('Pre-login cloud fetch failed, falling back to local credentials', err);
    }

    const found = latestUsers.find(u => 
      u.username.trim().toLowerCase() === loginUsername.trim().toLowerCase() && 
      u.password === loginPassword
    );
    if (found) {
      if (found.status === 'Blocked') {
        toast.error(t('Your access credentials have been blocked.'));
        return;
      }
      
      localStorage.setItem('tradecore_user', JSON.stringify(found));
      setCurrentUser(found);
      
      if (found.firstLogin) {
        setShowForcePasswordModal(true);
      } else {
        setCurrentPage('dashboard');
        logAction('User Login', `Session opened successfully.`);
      }
    } else {
      toast.error(t('Invalid login credentials provided.'));
    }
  };

  const handleLogout = () => {
    logAction('User Logout', 'Session ended safely.');
    localStorage.removeItem('tradecore_user');
    setCurrentUser(null);
    setCurrentPage('dashboard');
  };

  const handleForcePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (forceNewPass.length < 4) {
      toast.error(t('Password must be at least 4 characters long.'));
      return;
    }
    if (forceNewPass !== forceConfirmPass) {
      toast.error(t('New passwords do not match.'));
      return;
    }

    const updatedUsers = users.map(u => {
      if (u.id === currentUser?.id) {
        return { ...u, password: forceNewPass, firstLogin: false };
      }
      return u;
    });

    saveAllData({ users: updatedUsers });
    
    const nextUser = { ...currentUser!, password: forceNewPass, firstLogin: false };
    localStorage.setItem('tradecore_user', JSON.stringify(nextUser));
    setCurrentUser(nextUser);
    setShowForcePasswordModal(false);
    setCurrentPage('dashboard');
    logAction('Forced Password Change', 'Updated default password on first sign-in.');
    toast.success(t('Security updated successfully! Welcome to TradeCore.'));
  };

  const handleContextChange = (level: 'company' | 'branch' | 'store', val: number) => {
    if (level === 'company') {
      setCurrentCompanyId(val);
      const b = branches.find(x => x.companyId === val);
      setCurrentBranchId(b ? b.id : null);
      const s = b ? stores.find(x => x.branchId === b.id) : null;
      setCurrentStoreId(s ? s.id : null);
    } else if (level === 'branch') {
      setCurrentBranchId(val);
      const s = stores.find(x => x.branchId === val);
      setCurrentStoreId(s ? s.id : null);
    } else if (level === 'store') {
      setCurrentStoreId(val);
    }
  };

  const allowedPages = useMemo(() => {
    if (!currentUser) return [];
    
    // Always grant Admin and Super Admin access to user-info and user-access pages if they are administrators
    const defaultPages = rolePermissions[currentUser.role] || [];
    let pages = currentUser.allowedPages && currentUser.allowedPages.length > 0
      ? currentUser.allowedPages
      : defaultPages;
      
    if (currentUser.role === 'Admin' || currentUser.role === 'Super Admin') {
      const adminPages = new Set(pages);
      adminPages.add('user-info');
      adminPages.add('user-access');
      adminPages.add('dashboard'); // Always allow dashboard for Admins
      pages = Array.from(adminPages);
    }
    
    if (pages.includes('report-transaction') && !pages.includes('report-unit-velocity')) {
      pages = [...pages, 'report-unit-velocity'];
    }
    
    return pages;
  }, [currentUser, rolePermissions]);
  const t = (text: string) => translate(text, settings.language);

  // Helper variables for data fetching
  const getStoreName = (id: number) => stores.find(s => s.id === id)?.name || `Store #${id}`;
  const getCustomerName = (id: number) => customers.find(c => c.id === id)?.name || 'Direct Customer';
  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.name || 'Direct Supplier';
  const getProductName = (id: number) => stockItems.find(p => p.id === id)?.name || 'Product Item';

  const formatStockQty = (qty: number, item: StockItem) => {
    if (item.useSubUnitPricing && item.subUnitConversion && item.subUnitConversion > 1) {
      const mainUnits = Math.floor(qty / item.subUnitConversion);
      const subUnits = parseFloat((qty % item.subUnitConversion).toFixed(4));
      
      const mainLabel = item.unit || 'Pkg';
      const subLabel = item.subUnitName || 'pcs';
      
      if (mainUnits > 0 && subUnits > 0) {
        return `${mainUnits} ${mainLabel}, ${subUnits} ${subLabel}`;
      } else if (mainUnits > 0) {
        return `${mainUnits} ${mainLabel}`;
      } else {
        return `${subUnits} ${subLabel}`;
      }
    }
    return `${qty} ${item.unit || 'pcs'}`;
  };

  const isItemLowStock = (p: StockItem, qty: number) => {
    const conversion = p.useSubUnitPricing ? (p.subUnitConversion || 1) : 1;
    return (qty / conversion) <= p.lowStockQty;
  };

  // --- SUB-PANEL RENDERS ---
  
  // 1. Dashboard Segment
  const renderDashboard = () => {
    const storeId = currentStoreId;
    const activeStoreIds = storeId ? [storeId] : visibleStores.map(s => s.id);
    
    const storeStock = (p: StockItem) => {
      if (storeId) {
        return p.stock?.[storeId] || 0;
      }
      return activeStoreIds.reduce((sum, sId) => sum + (p.stock?.[sId] || 0), 0);
    };
    
    const totalStockValue = activeStockItems.reduce((acc, p) => acc + storeStock(p) * p.purchasePrice, 0);
    const lowStockItems = activeStockItems.filter(p => {
      if (storeId) {
        return (p.stock?.[storeId] || 0) <= p.lowStockQty;
      } else {
        return activeStoreIds.some(sId => (p.stock?.[sId] || 0) <= p.lowStockQty) || activeStoreIds.length === 0;
      }
    });
    const lowStockCount = lowStockItems.length;

    const todayStr = new Date().toISOString().split('T')[0];
    const todaySalesAmt = activeSalesOrders
      .filter(so => so.date === todayStr && activeStoreIds.includes(so.storeId))
      .reduce((acc, so) => acc + so.total, 0);

    const todayPurchasesAmt = activePurchaseOrders
      .filter(po => po.date === todayStr && po.status === 'Received' && activeStoreIds.includes(po.storeId))
      .reduce((acc, po) => acc + po.total, 0);

    const receivables = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const payables = activePurchaseOrders
      .filter(po => po.status === 'Pending' && activeStoreIds.includes(po.storeId))
      .reduce((sum, po) => sum + po.total, 0);

    const todayMs = new Date(todayStr).getTime();
    const expiryAlerts: Array<{
      product: StockItem;
      storeName: string;
      expiryDate: string;
      daysRemaining: number;
      status: 'expired' | 'critical' | 'warning' | 'safe';
    }> = [];

    activeStockItems.forEach(p => {
      activeStoreIds.forEach(sId => {
        const qty = p.stock?.[sId] || 0;
        if (qty > 0) {
          const expDate = p.expiryDates?.[sId] || p.expiryDate;
          if (expDate) {
            const expMs = new Date(expDate).getTime();
            const daysRemaining = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
            const status = daysRemaining < 0 ? 'expired' : daysRemaining <= 7 ? 'critical' : daysRemaining <= 30 ? 'warning' : 'safe';
            if (status !== 'safe') {
              const storeObj = visibleStores.find(s => s.id === sId);
              expiryAlerts.push({
                product: p,
                storeName: storeObj ? storeObj.name : `Store #${sId}`,
                expiryDate: expDate,
                daysRemaining,
                status: status as 'expired' | 'critical' | 'warning' | 'safe'
              });
            }
          }
        }
      });
    });

    expiryAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Prepare daily sales chart data for the last 15 days
    const last15Days = Array.from({ length: 15 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const dailySalesData = last15Days.map(date => {
      const sales = activeSalesOrders
        .filter(so => so.date === date && (storeId ? so.storeId === storeId : true))
        .reduce((sum, so) => sum + so.total, 0);
      const profit = activeSalesOrders
        .filter(so => so.date === date && (storeId ? so.storeId === storeId : true))
        .reduce((sum, so) => sum + so.profit, 0);
      return {
        date: date.substring(5), // MM-DD
        Sales: sales,
        Profit: profit
      };
    });

    // Prepare top 5 products by stock value
    const topProductsStockValue = [...activeStockItems]
      .map(p => ({
        name: p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name,
        value: storeStock(p) * p.purchasePrice
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Prepare category expense distribution
    const expenseCategoryTotals: Record<string, number> = {};
    activeExpenses
      .filter(ex => (storeId ? ex.storeId === storeId : true))
      .forEach(ex => {
        expenseCategoryTotals[ex.category] = (expenseCategoryTotals[ex.category] || 0) + ex.amount;
      });

    const expenseCategoryData = Object.keys(expenseCategoryTotals).map(cat => ({
      name: cat,
      value: expenseCategoryTotals[cat]
    }));

    const COLORS = ['#c41e3a', '#1e3a8a', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    const userCompany = companies.find(c => c.id === currentUser?.companyId);

    return (
      <div className="space-y-6">
        {/* Company Logo and Title Banner */}
        {userCompany && (
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 animate-fade-in no-print">
            {userCompany.logoUrl ? (
              <img
                src={userCompany.logoUrl}
                alt={`${userCompany.name} Logo`}
                className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-200 shadow-inner"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand to-brand-hover text-white flex items-center justify-center font-black text-xl shadow-md uppercase">
                {userCompany.name.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="text-[10px] font-bold text-brand tracking-wider uppercase mb-0.5">{t('Enterprise Workspace')}</div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                {userCompany.name}
              </h2>
            </div>
          </div>
        )}

        {/* Expiry Alerts Notification Banner */}
        {expiryAlerts.length > 0 && (
          <div className="bg-red-50/80 border border-red-100 rounded-2xl p-5 shadow-xs animate-fade-in no-print">
            <div className="flex flex-col md:flex-row items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-900 mb-1 flex items-center gap-1.5">
                  {t('Product Expiration Alerts')}
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-red-600 text-white rounded-full uppercase">
                    {expiryAlerts.length} {t('Items')}
                  </span>
                </h3>
                <p className="text-xs text-red-700 font-semibold mb-3">
                  {t('The following registered inventory lines have either crossed their expiry threshold or are within critical 30-day limits.')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {expiryAlerts.map(alert => {
                    const isExpired = alert.status === 'expired';
                    const isCritical = alert.status === 'critical';
                    return (
                      <div 
                        key={`${alert.product.id}-${alert.storeName}`} 
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs transition hover:scale-[1.01] ${
                          isExpired 
                            ? 'bg-red-100 border-red-200 text-red-950' 
                            : isCritical 
                              ? 'bg-amber-100/80 border-amber-200 text-amber-950 animate-pulse' 
                              : 'bg-orange-50 border-orange-200 text-orange-950'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-bold block truncate text-slate-900">{alert.product.name}</span>
                          <span className="text-[10px] font-mono opacity-80 block uppercase tracking-wider">SKU: {alert.product.code} | {alert.storeName}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block font-black text-[10px] uppercase tracking-wider">
                            {isExpired 
                              ? t('EXPIRED') 
                              : `${alert.daysRemaining} ${t('days left')}`}
                          </span>
                          <span className="text-[9px] font-bold opacity-85 block font-mono">{alert.expiryDate}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t('TOTAL INVENTORY VALUE')}</span>
              <span className="text-[26px] font-black text-gray-900 leading-tight">
                {formatMoney(totalStockValue, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">{t('Active store level valuation')}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t('LOW STOCK CRITICALS')}</span>
              <span className="text-[26px] font-black text-red-600 leading-tight">{lowStockCount}</span>
              <span className="text-xs text-amber-500 block mt-2 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {t('Requires immediate purchase')}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t("TODAY'S TURNOVER")}</span>
              <span className="text-[26px] font-black text-emerald-600 leading-tight">
                {formatMoney(todaySalesAmt, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">
                {t('Completed checkout registers')}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t("TODAY'S PURCHASES")}</span>
              <span className="text-[26px] font-black text-purple-600 leading-tight">
                {formatMoney(todayPurchasesAmt, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">{t('Received PO invoices')}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t('TOTAL RECEIVABLES')}</span>
              <span className="text-[26px] font-black text-amber-600 leading-tight">
                {formatMoney(receivables, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">{t('Customer outstanding ledger balances')}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">{t('TOTAL PAYABLES')}</span>
              <span className="text-[26px] font-black text-indigo-600 leading-tight">
                {formatMoney(payables, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">{t('Unresolved supplier invoices')}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
              <DollarIcon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Interactive Visual Analytics Dashboards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
          {/* Daily Sales & Profit Area Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-gray-950 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand" /> {t('Sales & Profit Trendlines (Last 15 Days)')}
                </h4>
                <span className="text-[10px] text-gray-400 font-bold uppercase">{t('Interactive Area Graph')}</span>
              </div>
              <div className="h-72 w-full text-xs font-semibold">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySalesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c41e3a" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#c41e3a" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Area type="monotone" dataKey="Sales" name={t('Turnover')} stroke="#c41e3a" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="Profit" name={t('Profit')} stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Expense Breakdown Pie Chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-gray-950 text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" /> {t('Expense Category Breakdown')}
                </h4>
                <span className="text-[10px] text-gray-400 font-bold uppercase">{t('Donut Chart')}</span>
              </div>
              <div className="h-72 w-full text-xs font-semibold relative flex items-center justify-center">
                {expenseCategoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {expenseCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatMoney(value, settings.currency, settings.exchangeRate)} contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                      <Legend verticalAlign="bottom" height={40} iconType="circle" layout="horizontal" align="center" wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-400 text-[11px] font-bold text-center">
                    {t('No registered expenses to build breakdown visualization.')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Top Products Inventory Valuation */}
        <div className="grid grid-cols-1 gap-6 no-print">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-gray-950 text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" /> {t('Top Products by Capital Asset Value')}
              </h4>
              <span className="text-[10px] text-gray-400 font-bold uppercase">{t('Store Valuation')}</span>
            </div>
            <div className="h-64 w-full text-xs font-semibold">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsStockValue} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
                  <Tooltip formatter={(value: number) => formatMoney(value, settings.currency, settings.exchangeRate)} contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="value" name={t('Asset Valuation')} radius={[6, 6, 0, 0]}>
                    {topProductsStockValue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
                <span className="font-bold text-gray-900 text-sm">Recent Completed Sales</span>
                <button onClick={() => setCurrentPage('report-sales')} className="text-xs font-bold text-brand hover:underline">View Sales Ledger</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider text-[10px] border-b">
                    <tr>
                      <th className="px-6 py-3">Sales Order #</th>
                      <th className="px-6 py-3">Client</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeSalesOrders.filter(so => storeId ? so.storeId === storeId : true).slice(0, 5).map(so => (
                      <tr key={so.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3.5 font-bold text-brand font-mono">{so.soNumber}</td>
                        <td className="px-6 py-3.5 font-semibold text-gray-900">{getCustomerName(so.customerId)}</td>
                        <td className="px-6 py-3.5 text-gray-500">{so.date}</td>
                        <td className="px-6 py-3.5 text-right font-bold text-gray-900">
                          {formatMoney(so.total, settings.currency, settings.exchangeRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex-1">
              <div>
                <div className="flex items-center gap-2 mb-6 text-red-500 border-b pb-4">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-bold text-gray-900 text-sm">{t('Critical Low Stock Alerts') || 'Critical Low Stock Alerts'}</span>
                </div>
                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {lowStockItems.map(p => (
                    <div key={p.id} className="flex items-center justify-between border-b border-gray-50 pb-3">
                      <div>
                        <span className="font-bold text-gray-900 text-xs block">{p.name}</span>
                        <span className="text-[10px] font-mono text-gray-400 tracking-wider uppercase mt-0.5">{p.code}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-red-600 block">{storeStock(p)}</span>
                        <span className="text-[9px] text-gray-400 font-semibold block uppercase">limit: {p.lowStockQty}</span>
                      </div>
                    </div>
                  ))}
                  {lowStockItems.length === 0 && (
                    <div className="text-center py-10 text-gray-400 font-medium text-xs">
                      <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      All stock items sufficiently configured.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex-1">
              <div>
                <div className="flex items-center gap-2 mb-6 text-amber-500 border-b pb-4">
                  <ShieldAlert className="w-5 h-5" />
                  <span className="font-bold text-gray-900 text-sm">{t('Product Expiration Alerts') || 'Product Expiration Alerts'}</span>
                </div>
                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {expiryAlerts.map(alert => {
                    const isExpired = alert.status === 'expired';
                    const isCritical = alert.status === 'critical';
                    return (
                      <div key={`${alert.product.id}-${alert.storeName}`} className="flex items-center justify-between border-b border-gray-50 pb-3">
                        <div>
                          <span className="font-bold text-gray-900 text-xs block">{alert.product.name}</span>
                          <span className="text-[10px] font-mono text-gray-400 tracking-wider uppercase mt-0.5">{alert.product.code} | {alert.storeName}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-black block uppercase ${
                            isExpired ? 'text-red-600' : isCritical ? 'text-amber-600' : 'text-orange-500'
                          }`}>
                            {isExpired ? t('EXPIRED') : `${alert.daysRemaining} ${t('days left')}`}
                          </span>
                          <span className="text-[9px] text-gray-400 font-semibold block font-mono mt-0.5">{alert.expiryDate}</span>
                        </div>
                      </div>
                    );
                  })}
                  {expiryAlerts.length === 0 && (
                    <div className="text-center py-10 text-gray-400 font-medium text-xs">
                      <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      No expiring products in this store.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleApproveShip = (transfer: StockTransfer) => {
    const item = stockItems.find(p => p.id === transfer.productId);
    if (!item) return;
    const conversion = item.useSubUnitPricing ? (item.subUnitConversion || 1) : 1;
    const transferQtyInBaseUnits = transfer.qty * conversion;

    if ((item.stock?.[transfer.fromStoreId] || 0) < transferQtyInBaseUnits) {
      toast.error(t('Insufficient stock weights in the source store.'));
      return;
    }
    // Deduct from source store only!
    const updatedStock = stockItems.map(p => {
      if (p.id === transfer.productId) {
        const nextStockObj = { ...p.stock };
        nextStockObj[transfer.fromStoreId] = (nextStockObj[transfer.fromStoreId] || 0) - transferQtyInBaseUnits;
        return { ...p, stock: nextStockObj };
      }
      return p;
    });
    // Set transfer status to In-Transit
    const updatedTransfers = stockTransfers.map(t => {
      if (t.id === transfer.id) {
        return { ...t, status: 'In-Transit' as const, sentAt: new Date().toISOString().split('T')[0] };
      }
      return t;
    });

    saveAllData({ stockItems: updatedStock, stockTransfers: updatedTransfers });
    logAction('Stock Transfer Dispatched', `Dispatched ${transfer.qty}x ${item.name} from ${stores.find(s => s.id === transfer.fromStoreId)?.name} (In Transit).`);
    toast.success(t('Stock transfer has been dispatched and is now IN-TRANSIT.'));
  };

  const handleReceiveComplete = (transfer: StockTransfer) => {
    const item = stockItems.find(p => p.id === transfer.productId);
    if (!item) return;
    const conversion = item.useSubUnitPricing ? (item.subUnitConversion || 1) : 1;
    const transferQtyInBaseUnits = transfer.qty * conversion;

    // Add to receiving store!
    const updatedStock = stockItems.map(p => {
      if (p.id === transfer.productId) {
        const nextStockObj = { ...p.stock };
        nextStockObj[transfer.toStoreId] = (nextStockObj[transfer.toStoreId] || 0) + transferQtyInBaseUnits;
        return { ...p, stock: nextStockObj };
      }
      return p;
    });

    // Set transfer status to Completed
    const updatedTransfers = stockTransfers.map(t => {
      if (t.id === transfer.id) {
        return { ...t, status: 'Completed' as const, receivedAt: new Date().toISOString().split('T')[0] };
      }
      return t;
    });

    saveAllData({ stockItems: updatedStock, stockTransfers: updatedTransfers });
    logAction('Stock Transfer Completed', `Received ${transfer.qty}x ${item.name} at ${stores.find(s => s.id === transfer.toStoreId)?.name}.`);
    toast.success(t('Stock transfer completed successfully! Inventory updated.'));
  };

  const handleRejectTransfer = (transfer: StockTransfer) => {
    const item = stockItems.find(p => p.id === transfer.productId);
    if (!item) return;

    // Just mark as Rejected (no stock was deducted when pending)
    const updatedTransfers = stockTransfers.map(t => {
      if (t.id === transfer.id) {
        return { ...t, status: 'Rejected' as const };
      }
      return t;
    });

    saveAllData({ stockTransfers: updatedTransfers });
    logAction('Stock Transfer Rejected', `Rejected transfer of ${transfer.qty}x ${item.name}.`);
    toast.success(t('Stock transfer request rejected and cancelled.'));
  };

  const handleDeleteTransfer = (transferId: number) => {
    const updatedTransfers = stockTransfers.filter(t => t.id !== transferId);
    saveAllData({ stockTransfers: updatedTransfers });
    toast.success(t('Stock transfer manifest deleted successfully.'));
  };

  // 2. Stock items component controller
  const renderStockItems = () => {
    const isRetailer = currentUser?.role === 'Retailer';
    const storeId = currentStoreId || 1;
    
    const filteredStockItems = activeStockItems.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) || 
                            p.code.toLowerCase().includes(stockSearchQuery.toLowerCase());
      const matchesCategory = stockFilterCategory === '' || p.category === stockFilterCategory;
      return matchesSearch && matchesCategory;
    });

    const handleExportStockExcel = () => {
      let tableHtml = `
        <h3>${t('Registered Products List')} - ${currentStoreId ? getStoreName(currentStoreId) : 'All Stores'}</h3>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px;">Product Name</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px;">SKU / Code</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px;">Category</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: center;">Total Global Stock</th>
      `;
      
      visibleStores.forEach(s => {
        tableHtml += `
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: center;">${s.name} Stock</th>
        `;
      });
      
      tableHtml += `
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: right;">Cost Price</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: right;">Retail Price</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: right;">Wholesale Price</th>
              <th style="background-color: ${activeCompanyColor}; color: white; padding: 10px; text-align: right;">Total Value</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      filteredStockItems.forEach(p => {
        const allowedStoreIds = visibleStores.map(s => s.id);
        const globalStock = Object.entries(p.stock || {})
          .filter(([sid]) => allowedStoreIds.includes(Number(sid)))
          .reduce((sum, [_, qty]) => sum + (Number(qty) || 0), 0);
        const totalValue = globalStock * p.purchasePrice;
        
        tableHtml += `
          <tr>
            <td style="font-weight: bold; color: #111827; padding: 8px;">${p.name}</td>
            <td style="font-family: monospace; color: #6b7280; padding: 8px;">${p.code}</td>
            <td style="padding: 8px;">${p.category}</td>
            <td style="text-align: center; font-weight: bold; padding: 8px;">${globalStock}</td>
        `;
        
        visibleStores.forEach(s => {
          const itemStock = p.stock?.[s.id] || 0;
          tableHtml += `
            <td style="text-align: center; padding: 8px;">${itemStock}</td>
          `;
        });
        
        tableHtml += `
            <td style="text-align: right; padding: 8px;">${formatMoney(p.purchasePrice, settings.currency, settings.exchangeRate)}</td>
            <td style="text-align: right; color: #2563eb; padding: 8px;">${formatMoney(p.retailPrice, settings.currency, settings.exchangeRate)}</td>
            <td style="text-align: right; color: #d97706; padding: 8px;">${formatMoney(p.wholesalePrice, settings.currency, settings.exchangeRate)}</td>
            <td style="text-align: right; font-weight: bold; background-color: #f0fdf4; color: #15803d; padding: 8px;">${formatMoney(totalValue, settings.currency, settings.exchangeRate)}</td>
          </tr>
        `;
      });
      
      // Add total rows
      const allowedStoreIds = visibleStores.map(s => s.id);
      const grandTotalValue = filteredStockItems.reduce((acc, p) => {
        const globalStock = Object.entries(p.stock || {})
          .filter(([sid]) => allowedStoreIds.includes(Number(sid)))
          .reduce((sum, [_, qty]) => sum + (Number(qty) || 0), 0);
        return acc + (globalStock * p.purchasePrice);
      }, 0);
      
      const totalGlobalStockSum = filteredStockItems.reduce((acc, p) => {
        const globalStock = Object.entries(p.stock || {})
          .filter(([sid]) => allowedStoreIds.includes(Number(sid)))
          .reduce((sum, [_, qty]) => sum + (Number(qty) || 0), 0);
        return acc + globalStock;
      }, 0);
      
      tableHtml += `
            <tr style="background-color: #fef2f2; font-weight: bold;">
              <td colspan="3" style="text-align: right; padding: 10px;">${t('Total Filtered Stock Summary:')}</td>
              <td style="text-align: center; padding: 10px; color: #dc2626;">${totalGlobalStockSum}</td>
      `;
      
      visibleStores.forEach(s => {
        const storeStockSum = filteredStockItems.reduce((acc, p) => acc + (p.stock?.[s.id] || 0), 0);
        tableHtml += `
              <td style="text-align: center; padding: 10px;">${storeStockSum}</td>
        `;
      });
      
      tableHtml += `
              <td colspan="3"></td>
              <td style="text-align: right; color: #15803d; padding: 10px;">${formatMoney(grandTotalValue, settings.currency, settings.exchangeRate)}</td>
            </tr>
          </tbody>
        </table>
      `;
      
      exportToExcel(tableHtml, `Stock_Inventory_Report_${new Date().toISOString().split('T')[0]}`);
    };

    const AIAssistantPanel = () => {
      const [isAiOpen, setIsAiOpen] = useState(false);
      const [aiPrompt, setAiPrompt] = useState('');
      const [aiLoading, setAiLoading] = useState(false);
      const [aiResponse, setAiResponse] = useState<any>(null);

      const handleAskAI = async () => {
        if (!aiPrompt.trim()) return;
        setAiLoading(true);
        setAiResponse(null);
        try {
          const response = await fetch('/api/ai-assist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: aiPrompt,
              products: activeStockItems.map(p => ({
                id: p.id,
                name: p.name,
                code: p.code,
                category: p.category,
                stock_qty: p.stock?.[storeId] || 0,
                useSubUnitPricing: p.useSubUnitPricing,
                unit: p.unit,
                subUnitName: p.subUnitName,
                subUnitConversion: p.subUnitConversion,
                purchasePrice: p.purchasePrice,
                retailPrice: p.retailPrice,
                wholesalePrice: p.wholesalePrice,
                subUnitRetailPrice: p.subUnitRetailPrice,
                subUnitWholesalePrice: p.subUnitWholesalePrice,
              })),
              priceType: 'Retail'
            })
          });
          const data = await response.json();
          setAiResponse(data);
        } catch (err: any) {
          console.error("AI error", err);
          setAiResponse({ success: false, explanation: "Failed to query AI. Ensure server is running and GEMINI_API_KEY is configured." });
        } finally {
          setAiLoading(false);
        }
      };

      const handleApplyAdjustment = () => {
        if (!aiResponse || !aiResponse.actions) return;
        const updatedStockItems = activeStockItems.map(item => {
          const matchingActions = aiResponse.actions.filter((act: any) => act.productId === item.id);
          if (matchingActions.length === 0) return item;

          const nextStock = { ...item.stock };
          matchingActions.forEach((action: any) => {
            const conversion = item.subUnitConversion || 1;
            const deductionInMainUnit = action.unitType === 'sub' ? action.qty / conversion : action.qty;
            nextStock[storeId] = (nextStock[storeId] || 0) - deductionInMainUnit;
          });

          return { ...item, stock: nextStock };
        });

        saveAllData({ stockItems: updatedStockItems });
        logAction('AI Stock Adjustment', `Adjusted inventory via AI Assistant for: ${aiResponse.actions.map((a: any) => a.productName).join(', ')}`);
        toast.success(t('Inventory adjusted successfully based on AI recommendations!'));
        setAiResponse(null);
        setAiPrompt('');
      };

      return (
        <div className="bg-gradient-to-r from-brand/5 to-indigo-50/40 rounded-xl border border-brand/20 shadow-sm p-4 no-print space-y-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsAiOpen(!isAiOpen)}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">
                ✨
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-xs sm:text-sm">{t('AI Stock & Pricing Copilot')}</h4>
                <p className="text-[10px] text-gray-500 font-medium">{t('Ask to process sales, loose units (bread, flour) and check pricing rules')}</p>
              </div>
            </div>
            <button className="text-xs font-semibold text-brand hover:text-brand-hover">
              {isAiOpen ? t('Collapse') : t('Expand Assistant')}
            </button>
          </div>

          {isAiOpen && (
            <div className="pt-2 border-t border-brand/10 space-y-3 animate-fadeIn">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="flex-1">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={t("e.g. 'A retail customer is buying 3 loose loaves of bread individually' or 'A Wholesaler wants 1 full sack and 2 kg of flour'")}
                    className="w-full h-16 p-2.5 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white resize-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 justify-end">
                  <button
                    onClick={handleAskAI}
                    disabled={aiLoading}
                    className="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : '✨'} {t('Ask Copilot')}
                  </button>
                </div>
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{t('Try Examples')}:</span>
                <button
                  onClick={() => setAiPrompt("We have 5 bags of 24kg flour. A customer wants to buy 2 kilograms of flour as a Retail customer.")}
                  className="text-[10px] bg-white border border-gray-200 text-gray-600 hover:border-brand px-2 py-1 rounded font-semibold transition"
                >
                  🌾 Flour 2 kg (Retail)
                </button>
                <button
                  onClick={() => setAiPrompt("A customer is buying 3 loose loaves of Bread.")}
                  className="text-[10px] bg-white border border-gray-200 text-gray-600 hover:border-brand px-2 py-1 rounded font-semibold transition"
                >
                  🍞 Bread 3 Loaves
                </button>
                <button
                  onClick={() => setAiPrompt("A wholesaler wants 2 full sacks of flour.")}
                  className="text-[10px] bg-white border border-gray-200 text-gray-600 hover:border-brand px-2 py-1 rounded font-semibold transition"
                >
                  📦 Flour 2 Sacks (Wholesale)
                </button>
              </div>

              {aiResponse && (
                <div className="p-3 bg-white border border-brand/10 rounded-lg space-y-2.5">
                  <div className="text-xs font-medium text-gray-700 whitespace-pre-line leading-relaxed border-l-2 border-brand pl-2.5 font-mono">
                    {aiResponse.explanation}
                  </div>

                  {aiResponse.success && aiResponse.actions && aiResponse.actions.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row gap-2 items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">{t('Matched Actions')}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {aiResponse.actions.map((act: any, idx: number) => (
                            <span key={idx} className="bg-brand/5 text-brand px-2 py-0.5 rounded text-[10px] font-bold">
                              {act.productName}: {act.qty} {act.unitType === 'sub' ? 'loose' : 'package'} ({formatMoney(act.total, settings.currency, settings.exchangeRate)})
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleApplyAdjustment}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" /> {t('Apply Stock Deduction')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <AIAssistantPanel />
        {/* Search & Category Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between no-print">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('Search product...')}
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand/20 outline-none"
              />
            </div>
            <select
              value={stockFilterCategory}
              onChange={(e) => setStockFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-medium text-gray-700 hover:border-gray-400 focus:border-brand cursor-pointer"
            >
              <option value="">{t('All Categories')}</option>
              {getStoreCategories(categories, currentStoreId).map(c => (
                <option key={c} value={c}>{cleanCategoryName(c)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportStockExcel}
              className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
              title="Export Stock list directly to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> {t('Export Stock')}
            </button>
            <button
              onClick={() => {
                handlePrintWithFallback((title, desc) => {
                  setConfirmModal({
                    isOpen: true,
                    title,
                    description: desc,
                    confirmText: t('Got it'),
                    cancelText: t('Close'),
                    onConfirm: () => {}
                  });
                }, settings.language);
              }}
              className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
              title="Print current stock list"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" /> {t('Print')}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <span className="text-sm font-bold text-gray-900">{t('Registered Products List')} ({filteredStockItems.length})</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setTransferProductId(null); setShowTransferModal(true); }}
                className="border border-gray-300 hover:bg-gray-50 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> {t('Transfer Stock')}
              </button>
              {!isRetailer && (
                <button
                  onClick={() => { setEditingStockItem(null); setFormUseSubUnit(false); setShowStockModal(true); }}
                  className="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
                >
                  <Plus className="w-4 h-4" /> {t('Add Product')}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[1000px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-3">{t('Product Description')}</th>
                  <th className="px-4 py-3">{t('Category')}</th>
                  <th className="px-4 py-3 text-center">{t('Unit')}</th>
                  <th className="px-4 py-3 text-center">{t('Total Global Stock')}</th>
                  {visibleStores.map(s => (
                    <th key={s.id} className="px-4 py-3 text-center">{s.name}</th>
                  ))}
                  <th className="px-4 py-3 text-right">{t('Cost Price')}</th>
                  <th className="px-4 py-3 text-right">{t('Retail price')}</th>
                  <th className="px-4 py-3 text-right">{t('Wholesale price')}</th>
                  <th className="px-4 py-3 text-right text-indigo-600">{t('Partner Price')}</th>
                  <th className="px-4 py-3 text-right text-indigo-700">{t('Total Value')}</th>
                  {!isRetailer && <th className="px-4 py-3 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-semibold">
                {filteredStockItems.map(p => {
                  const allowedStoreIds = visibleStores.map(s => s.id);
                  const globalStock = Object.entries(p.stock || {})
                    .filter(([sid]) => allowedStoreIds.includes(Number(sid)))
                    .reduce((sum, [_, qty]) => sum + (Number(qty) || 0), 0);
                  const isLow = isItemLowStock(p, p.stock?.[storeId] || 0);
                  const isExpanded = expandedStockIds.includes(p.id);
                  const totalCols = 10 + visibleStores.length + (!isRetailer ? 1 : 0);
                  
                  return (
                    <React.Fragment key={p.id}>
                      <tr className={`hover:bg-gray-50/50 ${isLow ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-3 flex items-center gap-3">
                          {p.useSubUnitPricing ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedStockIds(prev => 
                                  prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                );
                              }}
                              className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors shrink-0"
                              title={t('Show Sub-unit Breakdown')}
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          ) : (
                            <div className="w-[22px] shrink-0" />
                          )}
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-brand overflow-hidden border border-gray-200/65 flex-shrink-0">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              'P'
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block">{p.name}</span>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-mono text-gray-400 uppercase">{p.code}</span>
                              {(() => {
                                const expiriesToRender: { storeId?: number; storeName?: string; date: string }[] = [];
                                if (storeId) {
                                  const expD = p.expiryDates?.[storeId] || p.expiryDate;
                                  if (expD) expiriesToRender.push({ storeId, date: expD });
                                } else {
                                  visibleStores.forEach(s => {
                                    if ((p.stock?.[s.id] || 0) > 0) {
                                      const expD = p.expiryDates?.[s.id] || p.expiryDate;
                                      if (expD) {
                                        if (!expiriesToRender.some(x => x.date === expD && x.storeId === s.id)) {
                                          expiriesToRender.push({ storeId: s.id, storeName: s.name, date: expD });
                                        }
                                      }
                                    }
                                  });
                                  if (expiriesToRender.length === 0 && p.expiryDate) {
                                    expiriesToRender.push({ date: p.expiryDate });
                                  }
                                }

                                if (expiriesToRender.length === 0) return null;

                                return expiriesToRender.map((exp, idx) => {
                                  const todayStr = new Date().toISOString().split('T')[0];
                                  const todayMs = new Date(todayStr).getTime();
                                  const expMs = new Date(exp.date).getTime();
                                  const daysRemaining = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
                                  
                                  let badgeClass = "bg-green-50 text-green-700 border-green-200";
                                  let badgeText = `${daysRemaining} ${t('days left')}`;
                                  if (daysRemaining < 0) {
                                    badgeClass = "bg-red-50 text-red-700 border-red-200 animate-pulse font-black";
                                    badgeText = t('EXPIRED');
                                  } else if (daysRemaining <= 7) {
                                    badgeClass = "bg-red-50 text-red-600 border-red-100 font-extrabold";
                                    badgeText = `${daysRemaining} ${t('days!')}`;
                                  } else if (daysRemaining <= 30) {
                                    badgeClass = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
                                  }
                                  
                                  const label = exp.storeName ? `${exp.storeName}: ${badgeText}` : badgeText;
                                  return (
                                    <span key={idx} className={`text-[9px] px-1.5 py-0.5 rounded border ${badgeClass} flex items-center gap-0.5 whitespace-nowrap mt-1`}>
                                      <Calendar className="w-2.5 h-2.5 text-current shrink-0" />
                                      {label} ({exp.date})
                                    </span>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="bg-gray-100 px-2 py-1 rounded text-gray-600 text-[10px]">{p.category}</span></td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                            {p.unit || 'Package'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{formatStockQty(globalStock, p)}</td>
                        {visibleStores.map(s => {
                          const itemStock = p.stock?.[s.id] || 0;
                          return (
                            <td key={s.id} className={`px-4 py-3 text-center font-bold ${isItemLowStock(p, itemStock) ? 'text-amber-600' : 'text-gray-700'}`}>
                              {formatStockQty(itemStock, p)}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right text-gray-500">{formatMoney(p.purchasePrice, settings.currency, settings.exchangeRate)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{formatMoney(p.retailPrice, settings.currency, settings.exchangeRate)}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatMoney(p.wholesalePrice, settings.currency, settings.exchangeRate)}</td>
                        <td className="px-4 py-3 text-right text-indigo-600">{formatMoney(p.partnerPrice || p.retailPrice, settings.currency, settings.exchangeRate)}</td>
                        <td className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/20">
                          {formatMoney(globalStock * p.purchasePrice, settings.currency, settings.exchangeRate)}
                        </td>
                        {!isRetailer && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => { setTransferProductId(p.id); setShowTransferModal(true); }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                title="Transfer Location"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditingStockItem(p); setFormUseSubUnit(p.useSubUnitPricing || false); setShowStockModal(true); }}
                                className="p-1 hover:bg-gray-100 rounded text-blue-600"
                                title="Modify Details"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                                <button
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'Delete Product',
                                      description: `Are you sure you want to globally remove SKU: ${p.code} (${p.name})? This action is irreversible.`,
                                      onConfirm: () => {
                                        const remaining = stockItems.filter(item => item.id !== p.id);
                                        saveAllData({ stockItems: remaining });
                                        logAction('Deleted Product', `Globally removed SKU: ${p.code}`);
                                      }
                                    });
                                  }}
                                  className="p-1 hover:bg-red-50 rounded text-red-600"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {isExpanded && p.useSubUnitPricing && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={totalCols} className="p-5 border-t border-b border-indigo-100">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/60 pb-3 mb-4">
                              <div>
                                <h5 className="font-bold text-gray-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                  <span className="w-1.5 h-3 bg-brand rounded-full"></span>
                                  {t('Sub-Unit Breakdown & Loose Inventory')}
                                </h5>
                                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                                  {t('Detailed loose stocks, conversion ratios, and unit pricing configuration.')}
                                </p>
                              </div>
                              <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-gray-700 flex items-center gap-3 shadow-xs">
                                <span>
                                  {t('Packaging Conversion Ratio')}:{' '}
                                  <span className="text-brand font-black">
                                    1 {p.unit || 'Pkg'} = {p.subUnitConversion || 1} {p.subUnitName || 'pcs'}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                              {/* Detailed Stock by Store */}
                              <div className="lg:col-span-2 space-y-2">
                                <h6 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">{t('Warehouse Inventory Breakdown')}</h6>
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500 border-b">
                                      <tr>
                                        <th className="p-2.5 px-3">{t('Store / Warehouse')}</th>
                                        <th className="p-2.5 px-3 text-center">{t('Formatted Stock')}</th>
                                        <th className="p-2.5 px-3 text-center">{t('Exact Loose Count')}</th>
                                        <th className="p-2.5 px-3 text-center">{t('Equivalent Full Packs')}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                                      {visibleStores.map(s => {
                                        const rawStock = p.stock?.[s.id] || 0;
                                        const conversion = p.subUnitConversion || 1;
                                        const fullPacks = Math.floor(rawStock / conversion);
                                        const looseRemainder = parseFloat((rawStock % conversion).toFixed(4));
                                        
                                        return (
                                          <tr key={s.id} className="hover:bg-gray-50/50">
                                            <td className="p-2.5 px-3 text-gray-900 font-bold">{s.name}</td>
                                            <td className="p-2.5 px-3 text-center text-indigo-700 font-black">{formatStockQty(rawStock, p)}</td>
                                            <td className="p-2.5 px-3 text-center font-mono font-black text-gray-800">
                                              {rawStock} <span className="text-gray-400 font-bold">{p.subUnitName || 'pcs'}</span>
                                            </td>
                                            <td className="p-2.5 px-3 text-center font-mono text-gray-600">
                                              {fullPacks} {p.unit || 'Pkg'} {looseRemainder > 0 ? `+ ${looseRemainder} ${p.subUnitName || 'pcs'}` : ''}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      <tr className="bg-slate-50 font-black text-gray-900 border-t">
                                        <td className="p-2.5 px-3">{t('Global Summary')}</td>
                                        <td className="p-2.5 px-3 text-center text-indigo-700">{formatStockQty(globalStock, p)}</td>
                                        <td className="p-2.5 px-3 text-center font-mono">
                                          {globalStock} <span className="text-gray-500">{p.subUnitName || 'pcs'}</span>
                                        </td>
                                        <td className="p-2.5 px-3 text-center font-mono text-gray-700">
                                          {Math.floor(globalStock / (p.subUnitConversion || 1))} {p.unit || 'Pkg'}
                                          {globalStock % (p.subUnitConversion || 1) > 0 ? ` + ${parseFloat((globalStock % (p.subUnitConversion || 1)).toFixed(4))} ${p.subUnitName || 'pcs'}` : ''}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Unit Pricing Specs Card */}
                              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex flex-col justify-between">
                                <div>
                                  <h6 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-3">{t('Loose Unit Price Matrix')}</h6>
                                  <div className="space-y-2.5">
                                    <div className="flex justify-between items-center text-[11px] font-semibold py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500">{t('Loose Retail Price')} ({t('per')} {p.subUnitName || 'pc'})</span>
                                      <span className="font-bold text-blue-600">{formatMoney(p.subUnitRetailPrice || 0, settings.currency, settings.exchangeRate)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px] font-semibold py-1.5 border-b border-gray-100">
                                      <span className="text-gray-500">{t('Loose Wholesale Price')} ({t('per')} {p.subUnitName || 'pc'})</span>
                                      <span className="font-bold text-amber-600">{formatMoney(p.subUnitWholesalePrice || 0, settings.currency, settings.exchangeRate)}</span>
                                    </div>
                                    {p.subUnitPartnerPrice && (
                                      <div className="flex justify-between items-center text-[11px] font-semibold py-1.5 border-b border-gray-100">
                                        <span className="text-gray-500">{t('Loose Partner Price')} ({t('per')} {p.subUnitName || 'pc'})</span>
                                        <span className="font-bold text-indigo-600">{formatMoney(p.subUnitPartnerPrice || 0, settings.currency, settings.exchangeRate)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between items-center text-[11px] font-semibold py-1.5">
                                      <span className="text-gray-500">{t('Implied Bulk Value')} ({t('calculated')})</span>
                                      <span className="font-black text-gray-900">
                                        {formatMoney((p.subUnitRetailPrice || 0) * (p.subUnitConversion || 1), settings.currency, settings.exchangeRate)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[9px] text-slate-500 font-semibold mt-4">
                                  💡 {t('This breakdown is live. High-velocity retail sales automatically subtract from these exact sub-unit totals.')}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- INTER-STORE TRANSFERS MANIFEST --- */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
          <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-brand/10 text-brand rounded-lg">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-gray-900 text-sm block">{t('Inter-Store Transfers Manifest')}</span>
                <span className="text-[10px] text-gray-500">{t('Track and reconcile physical stock movements between store locations')}</span>
              </div>
            </div>
            {/* Filter tabs */}
            <div className="flex items-center gap-1 overflow-x-auto bg-gray-100 p-1 rounded-lg shrink-0">
              {(['All', 'Pending', 'In-Transit', 'Completed', 'Rejected'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTransferFilter(tab)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition whitespace-nowrap ${
                    transferFilter === tab
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t(tab)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b text-gray-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">{t('Manifest No.')}</th>
                  <th className="p-3">{t('Product')}</th>
                  <th className="p-3">{t('From Location')}</th>
                  <th className="p-3">{t('To Location')}</th>
                  <th className="p-3 text-center">{t('Quantity')}</th>
                  <th className="p-3">{t('Request Date')}</th>
                  <th className="p-3">{t('Transit Timeline')}</th>
                  <th className="p-3">{t('Status')}</th>
                  <th className="p-3 text-right">{t('Reconciliation Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                {stockTransfers
                  .filter(transfer => transferFilter === 'All' || transfer.status === transferFilter)
                  .map(transfer => {
                    const product = stockItems.find(p => p.id === transfer.productId);
                    const sourceStore = stores.find(s => s.id === transfer.fromStoreId);
                    const destStore = stores.find(s => s.id === transfer.toStoreId);

                    return (
                      <tr key={transfer.id} className="hover:bg-gray-50 transition">
                        <td className="p-3 font-mono text-gray-900">{transfer.transferNumber}</td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900">{product?.name || `Product #${transfer.productId}`}</span>
                            <span className="text-[10px] text-gray-400 font-mono">SKU: {product?.code || '-'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 rounded text-[10px] font-bold">
                            {sourceStore?.name || `Store #${transfer.fromStoreId}`}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-brand/5 border border-brand/10 text-brand rounded text-[10px] font-bold">
                            {destStore?.name || `Store #${transfer.toStoreId}`}
                          </span>
                        </td>
                        <td className="p-3 text-center text-gray-900 font-bold">{transfer.qty}</td>
                        <td className="p-3 text-gray-500 font-mono text-[10px]">{transfer.createdAt}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5 text-[10px] text-gray-500 font-mono">
                            {transfer.sentAt && (
                              <span>🚢 {t('Shipped')}: {transfer.sentAt}</span>
                            )}
                            {transfer.receivedAt && (
                              <span>📦 {t('Received')}: {transfer.receivedAt}</span>
                            )}
                            {!transfer.sentAt && !transfer.receivedAt && (
                              <span className="text-gray-400 italic">{t('Not yet dispatched')}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {transfer.status === 'Pending' && (
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                              {t('Pending Dispatch')}
                            </span>
                          )}
                          {transfer.status === 'In-Transit' && (
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-max">
                              <Truck className="w-3 h-3 text-blue-500 animate-bounce" />
                              {t('In-Transit')}
                            </span>
                          )}
                          {transfer.status === 'Completed' && (
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-max">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              {t('Completed')}
                            </span>
                          )}
                          {transfer.status === 'Rejected' && (
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1 w-max">
                              <XCircle className="w-3 h-3 text-red-500" />
                              {t('Rejected')}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {transfer.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproveShip(transfer)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shadow-xs transition"
                                >
                                  {t('Dispatch')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectTransfer(transfer)}
                                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-[10px] font-bold border border-red-200 transition"
                                >
                                  {t('Reject')}
                                </button>
                              </>
                            )}
                            {transfer.status === 'In-Transit' && (
                              <button
                                type="button"
                                onClick={() => handleReceiveComplete(transfer)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-xs transition"
                              >
                                {t('Verify Receipt')}
                              </button>
                            )}
                            {['Completed', 'Rejected'].includes(transfer.status) && (
                              <span className="text-[10px] text-gray-400 italic font-medium">
                                {t('Reconciled')}
                              </span>
                            )}
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTransfer(transfer.id)}
                                className="p-1 text-red-600 hover:bg-red-50 hover:text-red-700 rounded transition border border-transparent hover:border-red-100"
                                title={t('Delete Manifest')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {stockTransfers.filter(transfer => transferFilter === 'All' || transfer.status === transferFilter).length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-400 font-medium">
                      <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      {t('No stock transfers found matching the filter.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // 3. Purchase Order Component Log view
  const renderPurchaseOrders = () => {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-bold text-gray-900 text-sm">Purchase Order Journals</span>
          <button
            onClick={() => setShowPOModal(true)}
            className="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Create PO
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b text-gray-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">PO Number</th>
                <th className="p-3">Store Name</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Date</th>
                <th className="p-3">Product Name</th>
                <th className="p-3 text-right">Grand Total</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-semibold">
              {activePurchaseOrders
                .filter(po => currentStoreId ? po.storeId === currentStoreId : true)
                .map(po => (
                  <tr key={po.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-bold text-brand font-mono">{po.poNumber}</td>
                    <td className="p-3 text-gray-900 font-bold">{getStoreName(po.storeId)}</td>
                    <td className="p-3 text-gray-900">{getSupplierName(po.supplierId)}</td>
                    <td className="p-3 text-gray-500">{po.date}</td>
                    <td className="p-3 text-gray-600 font-medium">
                      {po.items.map(i => `${getProductName(i.productId)} (x${i.qty})`).join(', ')}
                    </td>
                    <td className="p-3 text-right font-bold text-gray-900">
                      {formatMoney(po.total, settings.currency, settings.exchangeRate)}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        po.status === 'Received' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 justify-end">
                        {po.status === 'Pending' && (
                          <button
                            onClick={() => {
                              const updatedPOs = purchaseOrders.map(pOrder => {
                                if (pOrder.id === po.id) return { ...pOrder, status: 'Received' as const };
                                return pOrder;
                              });
                              const updatedStock = stockItems.map(p => {
                                const matchingItems = po.items.filter(i => i.productId === p.id);
                                if (matchingItems.length > 0) {
                                  const nextStockObj = { ...p.stock };
                                  let totalAdded = 0;
                                  matchingItems.forEach(itemPO => {
                                    const conversion = (itemPO.unitType || 'main') === 'main' && p.useSubUnitPricing ? (p.subUnitConversion || 1) : 1;
                                    totalAdded += itemPO.qty * conversion;
                                  });
                                  nextStockObj[po.storeId] = (nextStockObj[po.storeId] || 0) + totalAdded;
                                  return { ...p, stock: nextStockObj };
                                }
                                return p;
                              });
                              saveAllData({ purchaseOrders: updatedPOs, stockItems: updatedStock });
                              logAction('Received PO', `Transferred inventory weights from ${po.poNumber}`);
                            }}
                            className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1 rounded-md transition"
                          >
                            Receive
                          </button>
                        )}
                        {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Purchase Order',
                                description: `Are you sure you want to completely delete purchase order ${po.poNumber}? This action is irreversible.`,
                                onConfirm: () => {
                                  const remaining = purchaseOrders.filter(item => item.id !== po.id);
                                  saveAllData({ purchaseOrders: remaining });
                                  logAction('Deleted PO', `Deleted purchase order: ${po.poNumber}`);
                                }
                              });
                            }}
                            className="p-1 px-2 text-[10px] font-bold rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition flex items-center gap-1"
                            title="Delete PO"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 4. Sales Orders Log view
  const renderSalesOrders = () => {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-bold text-gray-900 text-sm">Completed Sales Ledgers</span>
          <button
            onClick={() => setShowSOModal(true)}
            className="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Monitor className="w-4 h-4" /> POS Terminal
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b text-gray-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Sales Document #</th>
                <th className="p-3">Customer Client</th>
                <th className="p-3">Date</th>
                <th className="p-3">Billing Tier</th>
                <th className="p-3">Checkout Items</th>
                <th className="p-3 text-right">Gross Total</th>
                <th className="p-3 text-right text-emerald-700">Profit Margin</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-semibold">
              {activeSalesOrders
                .filter(so => currentStoreId ? so.storeId === currentStoreId : true)
                .map(so => (
                  <tr key={so.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-bold text-brand font-mono">{so.soNumber}</td>
                    <td className="p-3 text-gray-900">{getCustomerName(so.customerId)}</td>
                    <td className="p-3 text-gray-500">{so.date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        so.priceType === 'Wholesale' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {so.priceType}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600 font-medium">
                      {so.items.map(i => `${getProductName(i.productId)} (x${i.qty})`).join(', ')}
                    </td>
                    <td className="p-3 text-right font-bold text-gray-900">
                      {formatMoney(so.total, settings.currency, settings.exchangeRate)}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600">
                      {formatMoney(so.profit, settings.currency, settings.exchangeRate)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            generateSalesOrderPDF({
                              order: so,
                              customer: customers.find(c => c.id === so.customerId) || null,
                              store: stores.find(s => s.id === so.storeId) || null,
                              stockItems,
                              currentUser,
                              currency: settings.currency,
                              exchangeRate: settings.exchangeRate,
                              language: settings.language,
                              companyDetails: {
                                name: localStorage.getItem('tradecore_receipt_company_name') || 'Singida Grain Millers Ltd',
                                branch: localStorage.getItem('tradecore_receipt_company_branch') || 'Central Depot, Singida-Dodoma Rd',
                                phone: localStorage.getItem('tradecore_receipt_company_phone') || '+255 26 250 1234',
                                email: localStorage.getItem('tradecore_receipt_company_email') || 'logistics@singidagrain.co.tz',
                                logo: localStorage.getItem('tradecore_receipt_custom_logo')
                              }
                            });
                            if (logAction) {
                              logAction('Generated PDF Invoice', `Downloaded PDF invoice for sales ledger ${so.soNumber}`);
                            }
                          }}
                          className="p-1 px-2 text-[10px] font-bold rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition inline-flex items-center gap-1"
                          title="Download professional PDF Invoice"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Details
                        </button>
                        {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Sales Ledger',
                                description: `Are you sure you want to completely delete sales ledger ${so.soNumber}? This action is irreversible.`,
                                onConfirm: () => {
                                  const remaining = salesOrders.filter(item => item.id !== so.id);
                                  saveAllData({ salesOrders: remaining });
                                  logAction('Deleted Sales Ledger', `Deleted sales ledger: ${so.soNumber}`);
                                }
                              });
                            }}
                            className="p-1 px-2 text-[10px] font-bold rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition inline-flex items-center gap-1"
                            title="Delete Sales Ledger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --- RENDERS MAIN BODY ACCORDING TO NAV PAGE ---
  const renderMainContent = () => {
    switch (currentPage) {
      case 'dashboard': return renderDashboard();
      case 'stock-items': return renderStockItems();
      case 'purchase-order': return renderPurchaseOrders();
      case 'sales-order': return renderSalesOrders();
      case 'expenses':
        return (
          <Expenses
            expenses={activeExpenses}
            stores={stores}
            currentStoreId={currentStoreId}
            currency={activeCurrency}
            exchangeRate={activeExchangeRate}
            isAdmin={currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin'}
            logAction={logAction}
            onUpdateExpenses={(newExpenses) => saveAllData({ expenses: newExpenses })}
            translate={t}
          />
        );
      case 'receipts':
        return (
          <Receipts
            salesOrders={activeSalesOrders}
            purchaseOrders={activePurchaseOrders}
            stores={stores}
            customers={customers}
            suppliers={suppliers}
            stockItems={activeStockItems}
            currentStoreId={currentStoreId}
            currency={activeCurrency}
            exchangeRate={activeExchangeRate}
            translate={t}
            currentUser={currentUser}
            language={settings.language}
            onUpdateSalesOrders={(newSales) => saveAllData({ salesOrders: newSales })}
            onUpdatePurchaseOrders={(newPurchases) => saveAllData({ purchaseOrders: newPurchases })}
            onUpdateStockItems={(newStock) => saveAllData({ stockItems: newStock })}
            logAction={logAction}
          />
        );
      case 'report-financial':
        return (
          <FinancialReport
            salesOrders={activeSalesOrders}
            expenses={activeExpenses}
            stockItems={activeStockItems}
            stores={stores}
            currentStoreId={currentStoreId}
            currency={activeCurrency}
            exchangeRate={activeExchangeRate}
          />
        );
      case 'companies':
      case 'branches':
      case 'stores':
      case 'customers':
      case 'suppliers':
      case 'categories':
      case 'taxes':
      case 'data-recovery':
      case 'exchange-rate':
        return (
          <MasterData
            currentPage={currentPage}
            companies={companies}
            branches={branches}
            stores={stores}
            customers={customers}
            suppliers={suppliers}
            categories={categories}
            taxes={taxes}
            stockItems={stockItems}
            users={users}
            currentCompanyId={currentCompanyId}
            currentBranchId={currentBranchId}
            currentStoreId={currentStoreId}
            isAdmin={currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin'}
            isSuperAdmin={currentUser?.role === 'Super Admin'}
            currency={activeCurrency}
            exchangeRate={activeExchangeRate}
            translate={t}
            logAction={logAction}
            saveAllData={saveAllData}
            settings={settings}
            currentUser={currentUser}
            onNavigate={(page) => setCurrentPage(page)}
            salesOrders={salesOrders}
            purchaseOrders={purchaseOrders}
          />
        );
      case 'import-stock':
      case 'import-customers':
      case 'import-suppliers':
        return (
          <ImportData
            currentPage={currentPage}
            stores={stores}
            stockItems={activeStockItems}
            customers={customers}
            suppliers={suppliers}
            translate={t}
            logAction={logAction}
            saveAllData={saveAllData}
            onNavigate={(page) => setCurrentPage(page)}
          />
        );
      case 'report-unit-velocity':
      case 'report-transaction':
      case 'report-daily':
      case 'report-monthly':
      case 'report-sales':
      case 'report-purchase':
      case 'report-sales-outstanding':
      case 'report-purchase-outstanding':
      case 'report-lowstock':
      case 'report-po-details':
      case 'report-shifts':
        return (
          <Reports
            currentPage={currentPage}
            salesOrders={activeSalesOrders}
            purchaseOrders={activePurchaseOrders}
            stockItems={activeStockItems}
            customers={customers}
            suppliers={suppliers}
            stores={stores}
            expenses={expenses}
            currentStoreId={currentStoreId}
            currency={activeCurrency}
            exchangeRate={activeExchangeRate}
            translate={t}
            posShifts={posShifts}
          />
        );
      case 'user-info':
      case 'user-access':
        return (
          <ManageUsers
            currentPage={currentPage}
            users={activeUsers}
            companies={companies}
            branches={branches}
            stores={stores}
            auditTrails={auditTrails}
            rolePermissions={rolePermissions}
            currentUser={currentUser}
            currentCompanyId={currentCompanyId}
            currentBranchId={currentBranchId}
            currentStoreId={currentStoreId}
            isSuperAdmin={currentUser?.role === 'Super Admin'}
            isGlobalSuperAdmin={currentUser?.username === 'superadmin' || currentUser?.username === 'root_mandate'}
            translate={t}
            logAction={logAction}
            saveAllData={saveAllData}
            onNavigate={(page) => setCurrentPage(page)}
          />
        );
      case 'profile':
        return (
          <Profile
            currentUser={currentUser}
            translate={t}
            onLogout={handleLogout}
            saveAllData={saveAllData}
            users={users}
            logAction={logAction}
          />
        );
      // Fallback placeholders for reports, dynamic configurations etc.
      default:
        return (
          <div className="bg-white p-8 rounded-xl border text-center font-semibold text-gray-500">
            <Info className="w-10 h-10 mx-auto mb-3 text-brand" />
            <span className="text-sm block font-bold mb-1">Configuration View: {currentPage}</span>
            <span className="text-xs text-gray-400 font-medium">This module relies on contextual local storage databases and is fully operational.</span>
          </div>
        );
    }
  };

  if (!currentUser) {
    // --- RENDER LOGIN VIEW ---
    const loginStyle = {
      '--brand-color': '#c41e3a',
      '--brand-color-hover': '#a81a32',
      '--brand-color-light': 'rgba(196, 30, 58, 0.15)'
    } as React.CSSProperties;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#1f242d] via-[#2b2f3a] to-[#1f242d]" style={loginStyle}>
        <div className="w-full max-w-5xl grid lg:grid-cols-5 bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/10">
          <div className="lg:col-span-3 bg-[#2d323e] p-10 lg:p-14 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/15 rounded-full blur-3xl -translate-y-20 translate-x-20"></div>
            <div>
              <div className="flex items-center gap-3 mb-12">
                <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center text-brand font-black text-xl shadow-md">T</div>
                <div>
                  <div className="font-black text-lg tracking-tight">Global TradeCore</div>
                  <div className="text-[10px] text-gray-400 tracking-wider font-semibold uppercase mt-0.5">Enterprise commerce ERP</div>
                </div>
              </div>
              <h2 className="text-3xl font-black leading-tight mb-4">Centralized Commerce<br />Management ERP</h2>
              <p className="text-gray-300 text-xs font-semibold max-w-sm leading-relaxed mb-6">
                Centralized cloud and local database directory sync for retailers, wholesalers, inventory valuations, dynamic expense logs, and real-time financial reporting sheets.
              </p>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 max-w-sm">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Apply for System Access</p>
                <p className="text-xs text-white mt-1 font-semibold">Contact Founder Super Admin:</p>
                <a href="mailto:globaltradecore@gmail.com" className="text-brand hover:underline text-xs font-black block mt-0.5">
                  globaltradecore@gmail.com
                </a>
              </div>
            </div>
            <div className="text-[10px] text-gray-500 font-semibold mt-12">
              System Boundary active • 256-bit transactional security.
            </div>
          </div>

          <div className="lg:col-span-2 p-8 lg:p-12 flex flex-col justify-center bg-white">
            <div className="w-full max-w-xs mx-auto space-y-6">
              <div>
                <h3 className="text-xl font-black text-gray-900">Sign In</h3>
                <p className="text-xs text-gray-400 font-semibold mt-1">Access your assigned branch dashboard</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">Username</label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-brand/15"
                    placeholder="Enter username"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">Password</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-brand/15"
                    placeholder="Enter account password"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-lg tracking-wider uppercase shadow transition-all duration-150"
                >
                  Authorize Entry
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate low stock items count
  const lowStockCount = stockItems.filter(item => {
    if (currentStoreId) {
      return (item.stock[currentStoreId] || 0) <= item.lowStockQty;
    } else {
      // If no store is selected, check if any of the stores are low
      return Object.values(item.stock).some(qty => qty <= item.lowStockQty) || Object.keys(item.stock).length === 0;
    }
  }).length;

  // Check if company subscription is expired or unapproved
  const isSubscriptionBlocked = (() => {
    if (!currentUser) return false;
    if (currentUser.role === 'Super Admin') return false; // Super Admins can never be blocked
    if (!currentUser.companyId) return false;

    const userCompany = companies.find(c => c.id === currentUser.companyId);
    if (!userCompany) return false;

    // Check if subscription has not been approved
    if (userCompany.subscriptionApproved === false) {
      return true;
    }

    // Check if subscription has expired
    if (userCompany.subscriptionEnd) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (todayStr > userCompany.subscriptionEnd) {
        return true;
      }
    }

    return false;
  })();

  if (currentUser && isSubscriptionBlocked) {
    const userCompany = companies.find(c => c.id === currentUser.companyId);
    const coColor = userCompany?.themeColor || '#c41e3a';
    const subBlockedStyle = {
      '--brand-color': coColor,
      '--brand-color-hover': adjustColorBrightness(coColor, -15),
      '--brand-color-light': coColor + '26'
    } as React.CSSProperties;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#1f242d] via-[#2b2f3a] to-[#1f242d] text-white" style={subBlockedStyle}>
        <div className="w-full max-w-md bg-[#2d323e] rounded-2xl shadow-2xl p-8 border border-red-500/30 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto border border-red-500/20">
            <AlertTriangle className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">{t('Access Blocked')}</h2>
            <p className="text-sm font-bold text-red-400">{t('Subscription Expired or Deactivated')}</p>
          </div>
          <div className="bg-black/25 p-4 rounded-xl text-left text-xs text-gray-300 space-y-2 font-semibold font-mono">
            <div className="flex justify-between">
              <span>{t('Company')}:</span>
              <span className="text-white font-bold">{userCompany?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('Period End')}:</span>
              <span className="text-white font-bold">{userCompany?.subscriptionEnd || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('Status')}:</span>
              <span className="text-red-400 font-bold uppercase">{t('Blocked')}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed font-semibold">
            {t('Your company\'s subscription period has ended or is awaiting approval. Your account and staff profiles have been temporarily locked until payment details are verified and approved by the Super Admin.')}
          </p>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs">
            <span className="text-gray-400 block mb-0.5">{t('Contact Founder for Active Assistance')}:</span>
            <a href="mailto:globaltradecore@gmail.com" className="text-brand font-black hover:underline">
              globaltradecore@gmail.com
            </a>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg tracking-wider uppercase transition shadow-md"
          >
            {t('Sign Out / Switch Account')}
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER MAIN ERP CLIENT ---
  const activeCompany = companies.find(c => c.id === currentCompanyId);
  const activeCompanyColor = activeCompany?.themeColor || '#c41e3a';

  const rootStyle = {
    '--brand-color': activeCompanyColor,
    '--brand-color-hover': adjustColorBrightness(activeCompanyColor, -15),
    '--brand-color-light': activeCompanyColor + '26' // ~15% opacity
  } as React.CSSProperties;

  return (
    <div className="h-screen overflow-hidden bg-[#f5f6f8] flex font-sans" style={rootStyle}>
      {/* Sidebar - Desktop Layout */}
      <div className={`hidden lg:block transition-all duration-300 flex-shrink-0 ${sidebarCollapsed ? 'w-[70px]' : 'w-64'}`}>
        <Sidebar
          currentPage={currentPage}
          currentUser={currentUser}
          settings={settings}
          allowedPages={allowedPages}
          onNavigate={(page) => { setCurrentPage(page); setMobileSidebarOpen(false); }}
          onLogout={handleLogout}
          lowStockCount={lowStockCount}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapsed}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/55" onClick={() => setMobileSidebarOpen(false)}></div>
          <div className="relative z-50 w-64 bg-[#2d323e]">
            <Sidebar
              currentPage={currentPage}
              currentUser={currentUser}
              settings={settings}
              allowedPages={allowedPages}
              onNavigate={(page) => { setCurrentPage(page); setMobileSidebarOpen(false); }}
              onLogout={handleLogout}
              lowStockCount={lowStockCount}
            />
          </div>
        </div>
      )}

      {/* Main Content Flow Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentPage={currentPage}
          currentUser={currentUser}
          companies={companies}
          branches={branches}
          stores={stores}
          currentCompanyId={currentCompanyId}
          currentBranchId={currentBranchId}
          currentStoreId={currentStoreId}
          settings={settings}
          onContextChange={handleContextChange}
          onOpenSettings={() => setShowSettingsModal(true)}
          onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          pageTitle={currentPage}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin">
          {renderMainContent()}
        </main>
      </div>

      {/* Security enforcement first login Modal overlay */}
      {showForcePasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-11 h-11 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <span className="font-bold text-gray-900 block text-base">First-time Security Check</span>
              <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                For administrative compliance, you must change your default password before unlocking your terminal.
              </p>
            </div>
            <form onSubmit={handleForcePasswordChange} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 tracking-wider block uppercase">New Password</label>
                <input
                  type="password"
                  required
                  value={forceNewPass}
                  onChange={(e) => setForceNewPass(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 tracking-wider block uppercase">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={forceConfirmPass}
                  onChange={(e) => setForceConfirmPass(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-lg tracking-wider uppercase mt-4 block"
              >
                Secure and Open Terminal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* System Settings modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
              <span className="font-bold text-gray-900 text-sm">ERP Core Settings</span>
              <button onClick={() => setShowSettingsModal(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Display Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => saveAllData({ settings: { ...settings, language: e.target.value as 'en' | 'sw' } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium"
                >
                  <option value="en">English (default)</option>
                  <option value="sw">Kiswahili (Glossary)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Display Currency</label>
                <select
                  value={settings.currency}
                  onChange={(e) => saveAllData({ settings: { ...settings, currency: e.target.value as any } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium"
                >
                  <option value="USD">USD ($)</option>
                  <option value="TZS">TZS (TSh)</option>
                  <option value="KES">KES (KSh)</option>
                  <option value="UGD">UGD (USh)</option>
                  <option value="UGX">UGX (USh)</option>
                  <option value="RWF">RWF (RF)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Exchange conversion (1 USD = X Local Units)</label>
                <input
                  type="number"
                  step="any"
                  value={settings.exchangeRate}
                  onChange={(e) => saveAllData({ settings: { ...settings, exchangeRate: parseFloat(e.target.value) || 1 } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-mono"
                />
              </div>

              {/* Secure Database Backup and Restore */}
              <div className="pt-4 border-t space-y-3">
                <span className="text-xs font-bold text-gray-700 block uppercase flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-600" /> Database Backup &amp; Restore
                </span>
                <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                  Download a complete backup of all products, sales, purchases, settings, and logs to your desktop, or upload a previously saved file to restore session data.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportDatabase}
                    className="py-2 px-3 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export JSON
                  </button>
                  <label className="py-2 px-3 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs">
                    <FileUp className="w-4 h-4 text-blue-600" /> Import JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportDatabase}
                      className="hidden"
                    />
                  </label>
                </div>
                <button
                  onClick={handleExportHTML}
                  className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Globe className="w-4 h-4" /> Export Interactive HTML App
                </button>
                <div className="text-[9px] text-green-600 bg-green-50/50 p-2 rounded border border-green-100 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Dynamic Auto-Saving is fully active in local storage.</span>
                </div>
              </div>

              {currentUser?.username === 'root_mandate' && (
                <div className="pt-4 border-t space-y-3">
                  <div>
                    <span className="text-xs font-bold text-brand block uppercase">System State Recovery</span>
                    <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                      Restore default companies, default active demo operators, initial stocks, and system metrics.
                    </p>
                    <button
                      onClick={() => {
                        if (window.confirm('Restore initial database registers? This will wipe your session changes.')) {
                          restoreFactoryDefaults();
                          setShowSettingsModal(false);
                          toast.success(t('Database successfully restored! reloading window...'));
                          setTimeout(() => {
                            window.location.reload();
                          }, 1500);
                        }
                      }}
                      className="w-full mt-2 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs tracking-wider uppercase transition-colors"
                    >
                      Restore Template DB
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POS Checkout Terminal Modal */}
      <POSModal
        isOpen={showSOModal}
        onClose={() => setShowSOModal(false)}
        customers={customers}
        stockItems={activeStockItems}
        salesOrders={activeSalesOrders}
        currentStoreId={currentStoreId}
        stores={stores}
        saveAllData={saveAllData}
        logAction={logAction}
        settings={settings}
        t={t}
        currentUser={currentUser}
        posShifts={posShifts}
      />

      {/* PO order Modal */}
      <PurchaseOrderModal
        isOpen={showPOModal}
        onClose={() => setShowPOModal(false)}
        suppliers={suppliers}
        stockItems={activeStockItems}
        purchaseOrders={activePurchaseOrders}
        currentStoreId={currentStoreId}
        stores={visibleStores}
        saveAllData={saveAllData}
        logAction={logAction}
        settings={settings}
        t={t}
      />

      {/* Product Add/Edit Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 shrink-0">
              <span className="font-bold text-gray-900 text-sm">
                {editingStockItem ? 'Edit Product Parameters' : 'Add New Product'}
              </span>
              <button onClick={() => setShowStockModal(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = fd.get('name') as string;
                const code = fd.get('code') as string;
                const cat = fd.get('category') as string;
                const unit = fd.get('unit') as 'Kg' | 'Litres' | 'Package';
                const pPrice = parseFloat(fd.get('purchasePrice') as string) || 0;
                const rPrice = parseFloat(fd.get('retailPrice') as string) || 0;
                const wPrice = parseFloat(fd.get('wholesalePrice') as string) || 0;
                const partnerPrice = parseFloat(fd.get('partnerPrice') as string) || 0;
                const lowLimit = parseInt(fd.get('lowStockQty') as string) || 5;
                const imageUrl = (fd.get('imageUrl') as string) || '';

                const expiryDate = fd.get('expiryDate') as string || '';

                const expiryDates: Record<number, string> = {};
                visibleStores.forEach(s => {
                  const sExpiry = fd.get(`expiryDate_store_${s.id}`) as string;
                  if (sExpiry) {
                    expiryDates[s.id] = sExpiry;
                  }
                });

                // Adjust rates if not USD (database base is USD)
                const isUSD = settings.currency === 'USD';
                const finalPPrice = !isUSD ? pPrice / settings.exchangeRate : pPrice;
                const finalRPrice = !isUSD ? rPrice / settings.exchangeRate : rPrice;
                const finalWPrice = !isUSD ? wPrice / settings.exchangeRate : wPrice;
                const finalPartnerPrice = !isUSD ? partnerPrice / settings.exchangeRate : partnerPrice;

                const useSubUnitPricing = fd.get('useSubUnitPricing') === 'on';
                const subUnitName = fd.get('subUnitName') as string || '';
                const subUnitConversion = parseFloat(fd.get('subUnitConversion') as string) || 1;
                const subUnitRPriceInput = parseFloat(fd.get('subUnitRetailPrice') as string) || 0;
                const subUnitWPriceInput = parseFloat(fd.get('subUnitWholesalePrice') as string) || 0;
                const subUnitPPriceInput = parseFloat(fd.get('subUnitPartnerPrice') as string) || 0;

                const finalSubRPrice = !isUSD ? subUnitRPriceInput / settings.exchangeRate : subUnitRPriceInput;
                const finalSubWPrice = !isUSD ? subUnitWPriceInput / settings.exchangeRate : subUnitWPriceInput;
                const finalSubPPrice = !isUSD ? subUnitPPriceInput / settings.exchangeRate : subUnitPPriceInput;

                if (editingStockItem) {
                  const updated = stockItems.map(p => {
                    if (p.id === editingStockItem.id) {
                      return {
                        ...p, name, code, category: cat, unit,
                        purchasePrice: finalPPrice, retailPrice: finalRPrice, wholesalePrice: finalWPrice, partnerPrice: finalPartnerPrice,
                        lowStockQty: lowLimit, imageUrl, expiryDate: expiryDate || undefined,
                        expiryDates: Object.keys(expiryDates).length > 0 ? expiryDates : undefined,
                        useSubUnitPricing,
                        subUnitName,
                        subUnitConversion,
                        subUnitRetailPrice: finalSubRPrice,
                        subUnitWholesalePrice: finalSubWPrice,
                        subUnitPartnerPrice: finalSubPPrice
                      };
                    }
                    return p;
                  });
                  saveAllData({ stockItems: updated });
                  logAction('Updated Product', `Modified SKU parameters for ${code}`);
                  toast.success(t('Product parameters updated successfully!'));
                } else {
                  const maxId = stockItems.length > 0 ? Math.max(...stockItems.map(p => p.id)) : 0;
                  const pStockObj: Record<number, number> = {};
                  stores.forEach(s => { pStockObj[s.id] = 0; });
                  
                  const newProduct: StockItem = {
                    id: maxId + 1, name, code, category: cat, unit,
                    stock: pStockObj,
                    purchasePrice: finalPPrice, retailPrice: finalRPrice, wholesalePrice: finalWPrice, partnerPrice: finalPartnerPrice,
                    lowStockQty: lowLimit, imageUrl,
                    expiryDate: expiryDate || undefined,
                    expiryDates: Object.keys(expiryDates).length > 0 ? expiryDates : undefined,
                    useSubUnitPricing,
                    subUnitName,
                    subUnitConversion,
                    subUnitRetailPrice: finalSubRPrice,
                    subUnitWholesalePrice: finalSubWPrice,
                    subUnitPartnerPrice: finalSubPPrice
                  };
                  saveAllData({ stockItems: [...stockItems, newProduct] });
                  logAction('Created Product', `Registered new inventory SKU: ${code}`);
                  toast.success(t('New product registered successfully!'));
                }
                setShowStockModal(false);
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Product Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingStockItem?.name || ''}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Product Image (URL or Upload File)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="imageUrl"
                    id="modal-image-url-input"
                    placeholder="https://images.unsplash.com/..."
                    defaultValue={editingStockItem?.imageUrl || ''}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none"
                  />
                  <label className="bg-gray-100 hover:bg-gray-200 border cursor-pointer text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center transition whitespace-nowrap">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              const input = document.getElementById('modal-image-url-input') as HTMLInputElement;
                              if (input) {
                                input.value = event.target.result as string;
                              }
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">SKU / Barcode</label>
                <input
                  type="text"
                  name="code"
                  required
                  defaultValue={editingStockItem?.code || ''}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Category</label>
                <select
                  name="category"
                  defaultValue={editingStockItem?.category || getStoreCategories(categories, currentStoreId)[0] || categories[0]}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  {getStoreCategories(categories, currentStoreId).map(c => (
                    <option key={c} value={c}>{cleanCategoryName(c)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Selling Unit (Measurement)</label>
                <select
                  name="unit"
                  defaultValue={editingStockItem?.unit || 'Package'}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="Kg">Kilograms (Kg)</option>
                  <option value="Grams">Grams (g)</option>
                  <option value="Litres">Litres (L)</option>
                  <option value="Pcs">Pieces (Pcs)</option>
                  <option value="Package">Package</option>
                  <option value="Sack">Sack / Bag (Sack)</option>
                  <option value="Carton">Carton (Ctn)</option>
                  <option value="Box">Box (Box)</option>
                  <option value="Crate">Crate (Crt)</option>
                  <option value="Dozen">Dozen (Dzn)</option>
                  <option value="Bundle">Bundle (Bndl)</option>
                  <option value="Roll">Roll (Roll)</option>
                  <option value="Gallon">Gallon (Gal)</option>
                  <option value="Pallet">Pallet (Plt)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">{t('Purchase Price')}</label>
                  <input
                    type="number"
                    step="any"
                    name="purchasePrice"
                    required
                    value={formPurchasePrice}
                    onChange={(e) => handleMainPriceChange('purchase', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">{t('Alert Min Quantity')}</label>
                  <input
                    type="number"
                    name="lowStockQty"
                    required
                    defaultValue={editingStockItem?.lowStockQty || 5}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-700 flex flex-wrap items-center">
                    {t('Retail Price')}
                    {getMarginText(formRetailPrice, formPurchasePrice)}
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="retailPrice"
                    required
                    value={formRetailPrice}
                    onChange={(e) => handleMainPriceChange('retail', e.target.value)}
                    className="w-full px-2 py-2 border rounded-lg text-sm bg-white outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-700 flex flex-wrap items-center">
                    {t('Wholesale Price')}
                    {getMarginText(formWholesalePrice, formPurchasePrice)}
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="wholesalePrice"
                    required
                    value={formWholesalePrice}
                    onChange={(e) => handleMainPriceChange('wholesale', e.target.value)}
                    className="w-full px-2 py-2 border rounded-lg text-sm bg-white outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-700 flex flex-wrap items-center">
                    {t('Partner Price')}
                    {getMarginText(formPartnerPrice, formPurchasePrice)}
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="partnerPrice"
                    required
                    value={formPartnerPrice}
                    onChange={(e) => handleMainPriceChange('partner', e.target.value)}
                    className="w-full px-2 py-2 border rounded-lg text-sm bg-white outline-none font-mono"
                  />
                </div>
              </div>

              {/* Fractional Sub-Unit Pricing Section */}
              <div className="border border-brand/20 bg-brand/5 rounded-xl p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="useSubUnitPricing"
                    checked={formUseSubUnit}
                    onChange={(e) => setFormUseSubUnit(e.target.checked)}
                    className="w-4 h-4 text-brand rounded border-gray-300 focus:ring-brand animate-none"
                  />
                  <span className="text-xs font-bold text-gray-800">Enable Fractional & Sub-Unit Pricing</span>
                </label>

                {formUseSubUnit && (
                  <div className="space-y-3 pt-2 border-t border-brand/10">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-600 uppercase">Sub-Unit Name</label>
                        <input
                          type="text"
                          name="subUnitName"
                          placeholder="e.g. Gram, Piece, ml, KG"
                          defaultValue={editingStockItem?.subUnitName || ''}
                          required={formUseSubUnit}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-600 uppercase">Conversion Factor</label>
                        <input
                          type="number"
                          step="any"
                          name="subUnitConversion"
                          placeholder="e.g. 1000, 12"
                          value={formConversionFactor}
                          onChange={(e) => handleConversionChange(e.target.value)}
                          required={formUseSubUnit}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-gray-600 uppercase flex flex-wrap items-center">
                          Retail
                          {getSubMarginText(formSubRetailPrice, formPurchasePrice, formConversionFactor)}
                        </label>
                        <input
                          type="number"
                          step="any"
                          name="subUnitRetailPrice"
                          value={formSubRetailPrice}
                          onChange={(e) => setFormSubRetailPrice(e.target.value)}
                          required={formUseSubUnit}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-gray-600 uppercase flex flex-wrap items-center">
                          Wholesale
                          {getSubMarginText(formSubWholesalePrice, formPurchasePrice, formConversionFactor)}
                        </label>
                        <input
                          type="number"
                          step="any"
                          name="subUnitWholesalePrice"
                          value={formSubWholesalePrice}
                          onChange={(e) => setFormSubWholesalePrice(e.target.value)}
                          required={formUseSubUnit}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-gray-600 uppercase flex flex-wrap items-center">
                          Partner
                          {getSubMarginText(formSubPartnerPrice, formPurchasePrice, formConversionFactor)}
                        </label>
                        <input
                          type="number"
                          step="any"
                          name="subUnitPartnerPrice"
                          value={formSubPartnerPrice}
                          onChange={(e) => setFormSubPartnerPrice(e.target.value)}
                          required={formUseSubUnit}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Default Expiry Date (Optional)</label>
                <input
                  type="date"
                  name="expiryDate"
                  defaultValue={editingStockItem?.expiryDate || ''}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-sans"
                />
              </div>

              {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && visibleStores.length > 0 && (
                <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-slate-50/50 mt-3">
                  <div className="text-[11px] font-bold text-gray-700 tracking-wide uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-brand" />
                    {t('Store-Specific Expiry Dates') || 'Store-Specific Expiry Dates'}
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium">
                    {t('Differentiate expiration dates for individual store entries if required:') || 'Differentiate expiration dates for individual store entries if required:'}
                  </p>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin divide-y divide-gray-100">
                    {visibleStores.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-3 text-xs pt-2 first:pt-0">
                        <span className="font-bold text-gray-700 truncate max-w-[160px]">{s.name}</span>
                        <input
                          type="date"
                          name={`expiryDate_store_${s.id}`}
                          defaultValue={editingStockItem?.expiryDates?.[s.id] || ''}
                          className="px-2 py-1 border rounded-lg text-xs bg-white outline-none font-sans"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg text-sm font-semibold"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 shrink-0">
              <span className="font-bold text-gray-900 text-sm">Inter-Store Stock Transfer</span>
              <button onClick={() => setShowTransferModal(false)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const pid = parseInt(fd.get('productId') as string);
                const fromStore = parseInt(fd.get('fromStore') as string);
                const toStore = parseInt(fd.get('toStore') as string);
                const qty = parseInt(fd.get('qty') as string);

                if (fromStore === toStore) {
                  toast.error(t('Please select two distinct stores.'));
                  return;
                }

                const item = stockItems.find(p => p.id === pid);
                if (!item) return;

                const transferConversion = item.useSubUnitPricing ? (item.subUnitConversion || 1) : 1;
                const requiredBaseUnits = qty * transferConversion;

                if ((item.stock?.[fromStore] || 0) < requiredBaseUnits) {
                  toast.error(t('Insufficient stock weights in the source store.'));
                  return;
                }

                const maxId = stockTransfers.length > 0 ? Math.max(...stockTransfers.map(t => t.id)) : 0;
                const newTransfer: StockTransfer = {
                  id: maxId + 1,
                  transferNumber: `TR-${new Date().getFullYear()}-${5000 + maxId + 1}`,
                  productId: pid,
                  fromStoreId: fromStore,
                  toStoreId: toStore,
                  qty: qty,
                  status: 'Pending',
                  createdAt: new Date().toISOString().split('T')[0]
                };

                saveAllData({ stockTransfers: [...stockTransfers, newTransfer] });
                logAction('Stock Transfer Request', `Requested transfer of ${qty}x ${item.name} from ${stores.find(s => s.id === fromStore)?.name} to ${stores.find(s => s.id === toStore)?.name}.`);
                setShowTransferModal(false);
                toast.success(t('Stock transfer request registered as PENDING. Please dispatch it below.'));
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Select Product</label>
                <select
                  name="productId"
                  defaultValue={transferProductId || ''}
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium"
                >
                  <option value="">Choose item...</option>
                  {stockItems.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">From Store</label>
                  <select name="fromStore" required className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    {stores.filter(s => currentBranchId ? s.branchId === currentBranchId : true).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">To Store</label>
                  <select name="toStore" required className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    {stores.filter(s => currentBranchId ? s.branchId === currentBranchId : true).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Quantity</label>
                <input
                  type="number"
                  min="1"
                  required
                  defaultValue="1"
                  name="qty"
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg text-sm font-semibold"
                >
                  Complete Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
      />

      {/* Toast Notifications Container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map(t => {
          let bgColor = 'bg-white border-gray-200 text-gray-900';
          let Icon = Info;
          let iconColor = 'text-blue-500';

          if (t.type === 'success') {
            bgColor = 'bg-emerald-50 border-emerald-100 text-emerald-950';
            Icon = CheckCircle;
            iconColor = 'text-emerald-500';
          } else if (t.type === 'error') {
            bgColor = 'bg-rose-50 border-rose-100 text-rose-950';
            Icon = XCircle;
            iconColor = 'text-rose-500';
          } else if (t.type === 'warning') {
            bgColor = 'bg-amber-50 border-amber-100 text-amber-950';
            Icon = AlertTriangle;
            iconColor = 'text-amber-500';
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-xl border shadow-lg flex items-start gap-3 transition-all duration-300 transform translate-y-0 opacity-100 ${bgColor}`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${iconColor} mt-0.5`} />
              <div className="flex-1 text-xs font-semibold leading-normal">{t.message}</div>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="text-gray-400 hover:text-gray-600 transition shrink-0 p-0.5 rounded-lg hover:bg-black/5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
