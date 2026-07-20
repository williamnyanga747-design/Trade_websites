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
  role: 'Super Admin' | 'Admin' | 'Store Admin' | 'Retailer' | 'Wholesaler';
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
  partnerPrice?: number;
  lowStockQty: number;
  unit?: string;
  imageUrl?: string;
  expiryDate?: string; // Optional Expiry Date field (YYYY-MM-DD)
  expiryDates?: { [storeId: number]: string }; // Store-specific expiry dates (storeId -> YYYY-MM-DD)
  useSubUnitPricing?: boolean;
  subUnitName?: string;
  subUnitConversion?: number;
  subUnitRetailPrice?: number;
  subUnitWholesalePrice?: number;
  subUnitPartnerPrice?: number;
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
  unitType?: 'main' | 'sub';
  subUnitName?: string;
}

export interface SalesOrder {
  id: number;
  soNumber: string;
  customerId: number;
  storeId: number;
  date: string;
  priceType: 'Retail' | 'Wholesale' | 'Preferred';
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
  storeId?: number | null;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  email: string;
  contact: string;
  storeId?: number | null;
}

export interface Customer {
  id: number;
  name: string;
  type: 'Retail' | 'Wholesale' | 'Preferred';
  phone: string;
  email: string;
  creditLimit: number;
  balance: number;
  storeId?: number | null;
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

export type CurrencyType = 'USD' | 'TZS' | 'KES' | 'UGD' | 'UGX' | 'RWF' | 'EUR' | 'GBP';

export interface Settings {
  language: 'en' | 'sw';
  currency: CurrencyType;
  exchangeRate: number;
  companyCurrencies?: Record<number, CurrencyType>;
  companyExchangeRates?: Record<number, number>;
  userCurrencies?: Record<string, CurrencyType>;
  userExchangeRates?: Record<string, number>;
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

export interface StockTransfer {
  id: number;
  transferNumber: string;
  productId: number;
  fromStoreId: number;
  toStoreId: number;
  qty: number;
  status: 'Pending' | 'In-Transit' | 'Completed' | 'Rejected';
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
}

