import React, { useState, useEffect, useMemo } from 'react';
import {
  Company, Branch, Store, User, StockItem, PurchaseOrder, SalesOrder, Expense, Tax, Supplier, Customer, AuditTrail, Settings
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

// Icons
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, DollarSign, FileText, Database, FileUp,
  BarChart3, Users, UserCircle, LogOut, Settings as SettingsIcon, Search, Plus, ArrowLeftRight,
  Pencil, Trash2, Printer, FileSpreadsheet, Copy, CheckCircle, AlertTriangle, AlertCircle, X,
  ShieldAlert, DollarSign as DollarIcon, CreditCard, Monitor, Barcode, Store as StoreIcon,
  Calendar, TrendingUp, Info, ShieldCheck, Lock
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

  // --- OPERATIONAL STATES ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [currentCompanyId, setCurrentCompanyId] = useState<number | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<number | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<number | null>(null);

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
  });

  // --- AUTH / SECURITY STATES ---
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showForcePasswordModal, setShowForcePasswordModal] = useState(false);
  const [forceNewPass, setForceNewPass] = useState('');
  const [forceConfirmPass, setForceConfirmPass] = useState('');

  // --- INTERACTIVE UI MODALS STATES ---
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProductId, setTransferProductId] = useState<number | null>(null);
  
  // Stock list filters
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockFilterCategory, setStockFilterCategory] = useState('');
  
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

    return () => {
      unsubscribe();
    };
  }, []);

  // --- SYNC TO STORAGE & CLOUD ---
  const saveAllData = async (updatedFields: Partial<{
    companies: Company[]; branches: Branch[]; stores: Store[]; users: User[];
    categories: string[]; taxes: Tax[]; suppliers: Supplier[]; customers: Customer[];
    stockItems: StockItem[]; purchaseOrders: PurchaseOrder[]; salesOrders: SalesOrder[];
    expenses: Expense[]; auditTrails: AuditTrail[]; settings: Settings;
    rolePermissions: Record<string, string[]>;
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
      alert('Database Backup Downloaded Successfully! You can find it in your downloads folder.');
    } catch (err) {
      alert('Failed to export database: ' + (err instanceof Error ? err.message : String(err)));
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
          alert('Invalid backup file structure. Please ensure you are uploading a valid TradeCore ERP database backup.');
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

        alert('Database backup restored successfully! Reloading application states...');
        window.location.reload();
      } catch (err) {
        alert('Failed to parse database file: ' + (err instanceof Error ? err.message : String(err)));
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
        alert('Your account access has been blocked by system administration.');
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
      
      if (currentUser.role === 'Retailer' || currentUser.role === 'Wholesaler') {
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
    saveAllData({ auditTrails: [newLog, ...auditTrails] });
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
        alert('Your access credentials have been blocked.');
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
      alert('Invalid login credentials provided.');
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
      alert('Password must be at least 4 characters long.');
      return;
    }
    if (forceNewPass !== forceConfirmPass) {
      alert('New passwords do not match.');
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
    alert('Security updated successfully! Welcome to TradeCore.');
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
    
    return pages;
  }, [currentUser, rolePermissions]);
  const t = (text: string) => translate(text, settings.language);

  // Helper variables for data fetching
  const getStoreName = (id: number) => stores.find(s => s.id === id)?.name || `Store #${id}`;
  const getCustomerName = (id: number) => customers.find(c => c.id === id)?.name || 'Direct Customer';
  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.name || 'Direct Supplier';
  const getProductName = (id: number) => stockItems.find(p => p.id === id)?.name || 'Product Item';

  // --- SUB-PANEL RENDERS ---
  
  // 1. Dashboard Segment
  const renderDashboard = () => {
    const storeId = currentStoreId;
    const storeStock = (p: StockItem) => p.stock?.[storeId || 1] || 0;
    
    const totalStockValue = activeStockItems.reduce((acc, p) => acc + storeStock(p) * p.purchasePrice, 0);
    const lowStockItems = activeStockItems.filter(p => storeStock(p) <= p.lowStockQty);
    const lowStockCount = lowStockItems.length;

    const todayStr = new Date().toISOString().split('T')[0];
    const todaySalesAmt = activeSalesOrders
      .filter(so => so.date === todayStr && (storeId ? so.storeId === storeId : true))
      .reduce((acc, so) => acc + so.total, 0);

    const todayPurchasesAmt = activePurchaseOrders
      .filter(po => po.date === todayStr && po.status === 'Received' && (storeId ? po.storeId === storeId : true))
      .reduce((acc, po) => acc + po.total, 0);

    const receivables = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const payables = activePurchaseOrders
      .filter(po => po.status === 'Pending' && (storeId ? po.storeId === storeId : true))
      .reduce((sum, po) => sum + po.total, 0);

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">TOTAL INVENTORY VALUE</span>
              <span className="text-[26px] font-black text-gray-900 leading-tight">
                {formatMoney(totalStockValue, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">Active store level valuation</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">LOW STOCK CRITICALS</span>
              <span className="text-[26px] font-black text-red-600 leading-tight">{lowStockCount}</span>
              <span className="text-xs text-amber-500 block mt-2 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Requires immediate purchase
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">TODAY'S TURNOVER</span>
              <span className="text-[26px] font-black text-emerald-600 leading-tight">
                {formatMoney(todaySalesAmt, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">
                Completed checkout registers
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">TODAY'S PURCHASES</span>
              <span className="text-[26px] font-black text-purple-600 leading-tight">
                {formatMoney(todayPurchasesAmt, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">Received PO invoices</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">TOTAL RECEIVABLES</span>
              <span className="text-[26px] font-black text-amber-600 leading-tight">
                {formatMoney(receivables, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">Customer outstanding ledger balances</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-1">TOTAL PAYABLES</span>
              <span className="text-[26px] font-black text-indigo-600 leading-tight">
                {formatMoney(payables, settings.currency, settings.exchangeRate)}
              </span>
              <span className="text-xs text-gray-400 block mt-2 font-semibold">Unresolved supplier invoices</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
              <DollarIcon className="w-5 h-5" />
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-6 text-red-500 border-b pb-4">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-bold text-gray-900 text-sm">Critical Low Stock Alerts</span>
              </div>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
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
        </div>
      </div>
    );
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
        const globalStock = (Object.values(p.stock || {}) as number[]).reduce((a, b) => a + b, 0);
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
      const grandTotalValue = filteredStockItems.reduce((acc, p) => {
        const globalStock = (Object.values(p.stock || {}) as number[]).reduce((a, b) => a + b, 0);
        return acc + (globalStock * p.purchasePrice);
      }, 0);
      
      const totalGlobalStockSum = filteredStockItems.reduce((acc, p) => {
        const globalStock = (Object.values(p.stock || {}) as number[]).reduce((a, b) => a + b, 0);
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

    return (
      <div className="space-y-4">
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
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
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
                  onClick={() => { setEditingStockItem(null); setShowStockModal(true); }}
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
                  <th className="px-4 py-3 text-right text-indigo-700">{t('Total Value')}</th>
                  {!isRetailer && <th className="px-4 py-3 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-semibold">
                {filteredStockItems.map(p => {
                  const globalStock = (Object.values(p.stock || {}) as number[]).reduce((a, b) => a + b, 0);
                  const isLow = (p.stock?.[storeId] || 0) <= p.lowStockQty;
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50/50 ${isLow ? 'bg-red-50/20' : ''}`}>
                      <td className="px-4 py-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-brand overflow-hidden border border-gray-200/65 flex-shrink-0">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            'P'
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-gray-900 block">{p.name}</span>
                          <span className="text-[10px] font-mono text-gray-400 mt-0.5">{p.code}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="bg-gray-100 px-2 py-1 rounded text-gray-600 text-[10px]">{p.category}</span></td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                          {p.unit || 'Package'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">{globalStock}</td>
                      {visibleStores.map(s => {
                        const itemStock = p.stock?.[s.id] || 0;
                        return (
                          <td key={s.id} className={`px-4 py-3 text-center font-bold ${itemStock <= p.lowStockQty ? 'text-amber-600' : 'text-gray-700'}`}>
                            {itemStock}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right text-gray-500">{formatMoney(p.purchasePrice, settings.currency, settings.exchangeRate)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{formatMoney(p.retailPrice, settings.currency, settings.exchangeRate)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatMoney(p.wholesalePrice, settings.currency, settings.exchangeRate)}</td>
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
                              onClick={() => { setEditingStockItem(p); setShowStockModal(true); }}
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
                  );
                })}
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
                                const itemPO = po.items.find(i => i.productId === p.id);
                                if (itemPO) {
                                  const nextStockObj = { ...p.stock };
                                  nextStockObj[po.storeId] = (nextStockObj[po.storeId] || 0) + itemPO.qty;
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
            currency={settings.currency}
            exchangeRate={settings.exchangeRate}
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
            currency={settings.currency}
            exchangeRate={settings.exchangeRate}
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
            currency={settings.currency}
            exchangeRate={settings.exchangeRate}
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
            currency={settings.currency}
            exchangeRate={settings.exchangeRate}
            translate={t}
            logAction={logAction}
            saveAllData={saveAllData}
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
      case 'report-transaction':
      case 'report-daily':
      case 'report-monthly':
      case 'report-sales':
      case 'report-purchase':
      case 'report-sales-outstanding':
      case 'report-purchase-outstanding':
      case 'report-lowstock':
      case 'report-po-details':
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
            currency={settings.currency}
            exchangeRate={settings.exchangeRate}
            translate={t}
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
                <a href="mailto:williamnyanga747@gmail.com" className="text-brand hover:underline text-xs font-black block mt-0.5">
                  williamnyanga747@gmail.com
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
            <a href="mailto:williamnyanga747@gmail.com" className="text-brand font-black hover:underline">
              williamnyanga747@gmail.com
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
                  onChange={(e) => saveAllData({ settings: { ...settings, currency: e.target.value as 'USD' | 'TZS' } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium"
                >
                  <option value="USD">USD ($)</option>
                  <option value="TZS">TZS (TSh)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Exchange conversion (1 USD = X TZS)</label>
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
                          alert('Database successfully restored! reloading window...');
                          window.location.reload();
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
      />

      {/* PO order Modal */}
      <PurchaseOrderModal
        isOpen={showPOModal}
        onClose={() => setShowPOModal(false)}
        suppliers={suppliers}
        stockItems={activeStockItems}
        purchaseOrders={activePurchaseOrders}
        currentStoreId={currentStoreId}
        stores={stores}
        saveAllData={saveAllData}
        logAction={logAction}
        settings={settings}
        t={t}
      />

      {/* Product Add/Edit Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
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
                const lowLimit = parseInt(fd.get('lowStockQty') as string) || 5;
                const imageUrl = (fd.get('imageUrl') as string) || '';

                // Adjust rates if in TZS
                const finalPPrice = settings.currency === 'TZS' ? pPrice / settings.exchangeRate : pPrice;
                const finalRPrice = settings.currency === 'TZS' ? rPrice / settings.exchangeRate : rPrice;
                const finalWPrice = settings.currency === 'TZS' ? wPrice / settings.exchangeRate : wPrice;

                if (editingStockItem) {
                  const updated = stockItems.map(p => {
                    if (p.id === editingStockItem.id) {
                      return {
                        ...p, name, code, category: cat, unit,
                        purchasePrice: finalPPrice, retailPrice: finalRPrice, wholesalePrice: finalWPrice,
                        lowStockQty: lowLimit, imageUrl
                      };
                    }
                    return p;
                  });
                  saveAllData({ stockItems: updated });
                  logAction('Updated Product', `Modified SKU parameters for ${code}`);
                } else {
                  const maxId = stockItems.length > 0 ? Math.max(...stockItems.map(p => p.id)) : 0;
                  const pStockObj: Record<number, number> = {};
                  stores.forEach(s => { pStockObj[s.id] = 0; });
                  
                  const newProduct: StockItem = {
                    id: maxId + 1, name, code, category: cat, unit,
                    stock: pStockObj,
                    purchasePrice: finalPPrice, retailPrice: finalRPrice, wholesalePrice: finalWPrice,
                    lowStockQty: lowLimit, imageUrl
                  };
                  saveAllData({ stockItems: [...stockItems, newProduct] });
                  logAction('Created Product', `Registered new inventory SKU: ${code}`);
                }
                setShowStockModal(false);
              }}
              className="p-5 space-y-4"
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
                  defaultValue={editingStockItem?.category || categories[0]}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
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
                  <option value="Litres">Litres</option>
                  <option value="Package">Package</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Purchase Price</label>
                  <input
                    type="number"
                    step="any"
                    name="purchasePrice"
                    required
                    defaultValue={editingStockItem ? (settings.currency === 'TZS' ? editingStockItem.purchasePrice * settings.exchangeRate : editingStockItem.purchasePrice) : ''}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Alert Min Quantity</label>
                  <input
                    type="number"
                    name="lowStockQty"
                    required
                    defaultValue={editingStockItem?.lowStockQty || 5}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Retail Price</label>
                  <input
                    type="number"
                    step="any"
                    name="retailPrice"
                    required
                    defaultValue={editingStockItem ? (settings.currency === 'TZS' ? editingStockItem.retailPrice * settings.exchangeRate : editingStockItem.retailPrice) : ''}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Wholesale Price</label>
                  <input
                    type="number"
                    step="any"
                    name="wholesalePrice"
                    required
                    defaultValue={editingStockItem ? (settings.currency === 'TZS' ? editingStockItem.wholesalePrice * settings.exchangeRate : editingStockItem.wholesalePrice) : ''}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 outline-none font-mono"
                  />
                </div>
              </div>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
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
                  alert('Please select two distinct stores.');
                  return;
                }

                const item = stockItems.find(p => p.id === pid);
                if (!item) return;

                if ((item.stock?.[fromStore] || 0) < qty) {
                  alert('Insufficient stock weights in the source store.');
                  return;
                }

                const updatedStock = stockItems.map(p => {
                  if (p.id === pid) {
                    const nextStockObj = { ...p.stock };
                    nextStockObj[fromStore] = (nextStockObj[fromStore] || 0) - qty;
                    nextStockObj[toStore] = (nextStockObj[toStore] || 0) + qty;
                    return { ...p, stock: nextStockObj };
                  }
                  return p;
                });

                saveAllData({ stockItems: updatedStock });
                logAction('Stock Transfer', `Transferred ${qty}x ${item.name} inside active branch layout.`);
                setShowTransferModal(false);
                alert('Stock transfer completed successfully!');
              }}
              className="p-5 space-y-4"
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
    </div>
  );
}
