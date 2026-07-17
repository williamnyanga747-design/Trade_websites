export interface Company {
  id: number;
  name: string;
  logoUrl?: string;
  themeColor?: string; // Hex color string, e.g. "#c41e3a"
  subscriptionEnd?: string; // e.g. "2026-08-01"
  subscriptionApproved?: boolean;
  isDeleted?: boolean;
}

export interface Branch {
  id: number;
  companyId: number;
  name: string;
  isDeleted?: boolean;
}

export interface Store {
  id: number;
  branchId: number;
  name: string;
  location: string;
  phone: string;
  isDeleted?: boolean;
}

export interface User {
  id: number;
  username: string;
  password?: string; // Kept secure or editable
  role: 'Super Admin' | 'Admin' | 'Retailer' | 'Wholesaler';
  name: string;
  email: string;
  companyId: number | null;
  branchId: number | null;
  storeId: number | null;
  firstLogin: boolean;
  status: 'Active' | 'Blocked';
  allowedPages?: string[];
}

export interface StockItem {
  id: number;
  name: string;
  code: string;
  category: string;
  stock: { [storeId: number]: number };
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  lowStockQty: number;
  unit?: 'Kg' | 'Litres' | 'Package';
  imageUrl?: string;
  expiryDate?: string; // Optional Expiry Date field (YYYY-MM-DD)
  expiryDates?: { [storeId: number]: string }; // Store-specific expiry dates (storeId -> YYYY-MM-DD)
}

export interface POItem {
  productId: number;
  qty: number;
  cost: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  storeId: number;
  date: string;
  status: 'Pending' | 'Received';
  items: POItem[];
  total: number;
}

export interface SOItem {
  productId: number;
  qty: number;
  price: number;
  cost: number;
}

export interface SalesOrder {
  id: number;
  soNumber: string;
  customerId: number;
  storeId: number;
  date: string;
  priceType: 'Retail' | 'Wholesale';
  items: SOItem[];
  total: number;
  profit: number;
  status: 'Completed' | 'Voided';
}

export interface Expense {
  id: number;
  expenseNumber: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  storeId: number;
  paymentMethod: 'Cash' | 'Bank' | 'Mobile Money';
}

export interface Tax {
  id: number;
  name: string;
  rate: number;
  type: 'Percentage';
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  email: string;
  contact: string;
}

export interface Customer {
  id: number;
  name: string;
  type: 'Retail' | 'Wholesale';
  phone: string;
  email: string;
  creditLimit: number;
  balance: number;
}

export interface AuditTrail {
  id: string;
  userId: number;
  username: string;
  role: string;
  action: string;
  details: string;
  companyId: number | null | undefined;
  timestamp: string;
}

export interface Settings {
  language: 'en' | 'sw';
  currency: 'USD' | 'TZS';
  exchangeRate: number;
}

export interface PosShift {
  id: number;
  userId: number;
  username: string;
  storeId: number;
  openTime: string;
  closeTime?: string;
  openingFloat: number;
  closingCashActual?: number;
  expectedCashSales?: number;
  salesOrderIds: number[];
  status: 'Open' | 'Closed';
  variance?: number;
  notes?: string;
}

