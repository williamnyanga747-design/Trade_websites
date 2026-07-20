import { Company, Branch, Store, User, StockItem, PurchaseOrder, SalesOrder, Expense, Tax, Supplier, Customer, AuditTrail, Settings } from './types';

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const expIn12Days = new Date(Date.now() + 12 * 86400000).toISOString().split('T')[0];
const expIn3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
const exp2DaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
const expIn25Days = new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0];

export const defaultSettings: Settings = {
  language: 'en',
  currency: 'USD',
  exchangeRate: 1
};

export const defaultRolePermissions: Record<string, string[]> = {
  'Super Admin': [
    'dashboard', 'stock-items', 'purchase-order', 'sales-order', 'expenses', 'receipts',
    'companies', 'branches', 'stores', 'customers', 'suppliers', 'categories', 'taxes', 'data-recovery', 'exchange-rate',
    'import-stock', 'import-customers', 'import-suppliers',
    'report-transaction', 'report-financial', 'report-daily', 'report-monthly', 'report-sales', 'report-purchase',
    'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details', 'report-shifts',
    'user-info', 'user-access'
  ],
  'Admin': [
    'dashboard', 'stock-items', 'purchase-order', 'sales-order', 'expenses', 'receipts',
    'branches', 'stores', 'customers', 'suppliers', 'categories', 'taxes', 'data-recovery', 'exchange-rate',
    'import-stock', 'import-customers', 'import-suppliers',
    'report-transaction', 'report-financial', 'report-daily', 'report-monthly', 'report-sales', 'report-purchase',
    'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details', 'report-shifts',
    'user-info'
  ],
  'Retailer': [
    'dashboard', 'stock-items', 'sales-order', 'expenses', 'receipts',
    'report-transaction', 'report-daily', 'report-sales', 'report-sales-outstanding', 'report-lowstock', 'report-shifts'
  ],
  'Wholesaler': [
    'dashboard', 'stock-items', 'purchase-order', 'sales-order', 'expenses', 'receipts',
    'import-stock', 'import-customers', 'import-suppliers',
    'report-transaction', 'report-daily', 'report-sales', 'report-purchase',
    'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details', 'report-shifts'
  ],
  'Store Admin': [
    'dashboard', 'stock-items', 'purchase-order', 'sales-order', 'expenses', 'receipts',
    'report-transaction', 'report-daily', 'report-sales', 'report-purchase',
    'report-sales-outstanding', 'report-purchase-outstanding', 'report-lowstock', 'report-po-details', 'report-shifts',
    'user-info'
  ]
};

export const defaultCompanies: Company[] = [
  { id: 1, name: "Alpha Global Retail Corp", logoUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=120&auto=format&fit=crop&q=60", subscriptionEnd: "2027-12-31", subscriptionApproved: true, themeColor: "#c41e3a" },
  { id: 2, name: "Beta Distributors Ltd", logoUrl: "https://images.unsplash.com/photo-1542744094-3a31f103e35f?w=120&auto=format&fit=crop&q=60", subscriptionEnd: "2026-11-30", subscriptionApproved: true, themeColor: "#1e3a8a" }
];

export const defaultBranches: Branch[] = [
  { id: 1, companyId: 1, name: "DSM HQ Main Branch" },
  { id: 2, companyId: 1, name: "DSM Northern Hub" },
  { id: 3, companyId: 2, name: "Beta Arusha Depot" }
];

export const defaultStores: Store[] = [
  { id: 1, branchId: 1, name: "DSM Store Alpha", location: "Downtown", phone: "+255 22 1234" },
  { id: 2, branchId: 2, name: "DSM Store Beta", location: "Uptown", phone: "+255 22 5678" },
  { id: 3, branchId: 3, name: "Arusha Warehouse", location: "Industrial Block", phone: "+255 27 9876" }
];

export const defaultUsers: User[] = [
  { id: 4, username: 'root_mandate', password: 'absolute_security_core_2026', role: 'Super Admin', name: 'Founder Super Admin', email: 'founder@tradecore.com', companyId: null, branchId: null, storeId: null, firstLogin: true, status: 'Active' },
  { id: 5, username: 'superadmin', password: 'superadmin123', role: 'Super Admin', name: 'Global Super Admin', email: 'superadmin@tradecore.com', companyId: null, branchId: null, storeId: null, firstLogin: true, status: 'Active' },
  { id: 1, username: 'admin', password: 'admin123', role: 'Admin', name: 'Alpha Manager', email: 'admin@tradecore.com', companyId: 1, branchId: null, storeId: null, firstLogin: true, status: 'Active' },
  { id: 2, username: 'retailer', password: 'retail123', role: 'Retailer', name: 'Sarah Chen', email: 'retail@tradecore.com', companyId: 1, branchId: 1, storeId: 1, firstLogin: true, status: 'Active' },
  { id: 3, username: 'wholesaler', password: 'whole123', role: 'Wholesaler', name: 'Mike Wilson', email: 'wholesale@tradecore.com', companyId: 1, branchId: 2, storeId: 2, firstLogin: true, status: 'Active' }
];

export const defaultCategories: string[] = ['Cereals', 'Oil', 'Household', 'Building', 'Electronics'];

export const defaultTaxes: Tax[] = [
  { id: 1, name: 'VAT', rate: 18, type: 'Percentage' },
  { id: 2, name: 'Withholding', rate: 2, type: 'Percentage' }
];

export const defaultSuppliers: Supplier[] = [
  { id: 1, name: 'Singida Grain Millers', phone: '+255 26 250 1001', email: 'orders@singidagrain.co.tz', contact: 'Juma M.' },
  { id: 2, name: 'Twiga Cement Distributors', phone: '+255 22 286 5000', email: 'sales@twiga.co.tz', contact: 'Asha K.' }
];

export const defaultCustomers: Customer[] = [
  { id: 1, name: 'BestBuy Wholesale Ltd', type: 'Wholesale', phone: '+255 711 000 111', email: 'info@bestbuy.co.tz', creditLimit: 200000, balance: 4700.5 },
  { id: 2, name: 'TechWorld Retail', type: 'Retail', phone: '+255 688 222 333', email: 'sales@techworld.com', creditLimit: 100000, balance: 5000 },
  { id: 3, name: 'MobileHub Distributors', type: 'Wholesale', phone: '+255 754 444 555', email: 'orders@mobilehub.co.tz', creditLimit: 500000, balance: 0 }
];

export const defaultStockItems: StockItem[] = [
  { id: 1, name: 'Sony WH-1000XM5', code: 'SONY-WH5-BLK', category: 'Electronics', stock: { 1: 8, 2: 5, 3: 2 }, purchasePrice: 280, retailPrice: 399, wholesalePrice: 349, lowStockQty: 10, unit: 'Package', expiryDate: expIn12Days },
  { id: 2, name: 'Mahindi (Maize) 50kg', code: 'MAZ-50', category: 'Cereals', stock: { 1: 120, 2: 80, 3: 200 }, purchasePrice: 18, retailPrice: 25, wholesalePrice: 22, lowStockQty: 5, unit: 'Kg' },
  { id: 3, name: 'Mafuta ya Alizeti 20L', code: 'MAF-20', category: 'Oil', stock: { 1: 45, 2: 30, 3: 60 }, purchasePrice: 24, retailPrice: 32, wholesalePrice: 29, lowStockQty: 5, unit: 'Litres', expiryDate: expIn3Days },
  { id: 4, name: 'Mchele Singida 25kg', code: 'MCH-25', category: 'Cereals', stock: { 1: 1000, 2: 50, 3: 110 }, purchasePrice: 22, retailPrice: 30, wholesalePrice: 26, lowStockQty: 5, unit: 'Kg', expiryDate: exp2DaysAgo },
  { id: 5, name: 'Sukari 50kg', code: 'SUK-50', category: 'Household', stock: { 1: 3500, 2: 25, 3: 40 }, purchasePrice: 50, retailPrice: 65, wholesalePrice: 58, lowStockQty: 5, unit: 'Kg', expiryDate: expIn25Days },
  { id: 6, name: 'Cement Twiga 50kg', code: 'CEM-TW', category: 'Building', stock: { 1: 5200, 2: 150, 3: 300 }, purchasePrice: 7, retailPrice: 9.5, wholesalePrice: 8.5, lowStockQty: 5, unit: 'Package' }
];

export const defaultPurchaseOrders: PurchaseOrder[] = [
  { id: 1, poNumber: 'PO-2024-1001', supplierId: 1, storeId: 1, date: today, status: 'Received', items: [{ productId: 1, qty: 100, cost: 280 }, { productId: 4, qty: 225, cost: 22 }], total: 32970 },
  { id: 2, poNumber: 'PO-2024-1002', supplierId: 2, storeId: 1, date: yesterday, status: 'Received', items: [{ productId: 6, qty: 500, cost: 7 }], total: 3500 }
];

export const defaultSalesOrders: SalesOrder[] = [
  { id: 1, soNumber: 'SO-2024-5001', customerId: 1, storeId: 1, date: today, priceType: 'Wholesale', items: [{ productId: 1, qty: 70, price: 349, cost: 280 }, { productId: 4, qty: 173, price: 26, cost: 22 }], total: 28930, profit: 3500, status: 'Completed' },
  { id: 2, soNumber: 'SO-2024-5002', customerId: 2, storeId: 1, date: today, priceType: 'Retail', items: [{ productId: 1, qty: 3, price: 399, cost: 280 }, { productId: 3, qty: 3, price: 32, cost: 24 }], total: 1293, profit: 340, status: 'Completed' },
  { id: 3, soNumber: 'SO-2024-5003', customerId: 3, storeId: 1, date: yesterday, priceType: 'Wholesale', items: [{ productId: 1, qty: 30, price: 349, cost: 280 }, { productId: 3, qty: 52, price: 29, cost: 24 }], total: 11990, profit: 1000, status: 'Completed' }
];

export const defaultExpenses: Expense[] = [
  { id: 1, expenseNumber: 'EXP-2026-0001', category: 'Rent', description: 'Store Premises Rent (January 2026)', amount: 450, date: today, storeId: 1, paymentMethod: 'Bank' },
  { id: 2, expenseNumber: 'EXP-2026-0002', category: 'Utilities', description: 'Electricity and Power Supply Grid', amount: 85, date: today, storeId: 1, paymentMethod: 'Cash' },
  { id: 3, expenseNumber: 'EXP-2026-0003', category: 'Transport', description: 'Transporting grain from depot', amount: 150, date: yesterday, storeId: 1, paymentMethod: 'Mobile Money' }
];

export const defaultAuditTrails: AuditTrail[] = [];
