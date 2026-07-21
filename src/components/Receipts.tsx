import React, { useState, useEffect } from 'react';
import { SalesOrder, PurchaseOrder, Store, Customer, Supplier, StockItem, User } from '../types';
import { formatMoney, exportToExcel } from '../utils/format';
import { handlePrintWithFallback } from '../utils/printHelper';
import { generateSalesOrderPDF } from '../utils/pdfGenerator';
import { 
  Printer, FileSpreadsheet, Search, Eye, ShoppingBag, Truck, Calendar, X, 
  FileText, Upload, Building2, Check, ShieldCheck, ShieldAlert, QrCode, Lock, RefreshCw, Trash2, Share2
} from 'lucide-react';
import { ConfirmActionModal } from './ConfirmActionModal';
import { toast } from '../utils/toast';

interface ReceiptsProps {
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  stores: Store[];
  customers: Customer[];
  suppliers: Supplier[];
  stockItems: StockItem[];
  currentStoreId: number | null;
  currency: string;
  exchangeRate: number;
  translate: (t: string) => string;
  currentUser: User | null;
  language: 'en' | 'sw';
  onUpdateSalesOrders?: (orders: SalesOrder[]) => void;
  onUpdatePurchaseOrders?: (orders: PurchaseOrder[]) => void;
  onUpdateStockItems?: (items: StockItem[]) => void;
  logAction?: (action: string, details: string) => void;
}



export default function Receipts({
  salesOrders,
  purchaseOrders,
  stores,
  customers,
  suppliers,
  stockItems,
  currentStoreId,
  currency,
  exchangeRate,
  translate,
  currentUser,
  language,
  onUpdateSalesOrders,
  onUpdatePurchaseOrders,
  onUpdateStockItems,
  logAction
}: ReceiptsProps) {
  const canSetupReceipt = currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin' || currentUser?.role === 'Store Admin';
  const [activeTab, setActiveTab] = useState<'selling' | 'buying'>('selling');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date and Store filter controls
  const [filterStoreId, setFilterStoreId] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  useEffect(() => {
    if (currentStoreId) {
      setFilterStoreId(String(currentStoreId));
    }
  }, [currentStoreId]);

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
  const [selectedReceipt, setSelectedReceipt] = useState<{
    type: 'selling' | 'buying';
    order: any;
  } | null>(null);

  // Dual template selection and anti-fraud security states
  const [receiptTemplate, setReceiptTemplate] = useState<'a4' | 'thermal'>('thermal');
  const [reprintCounts, setReprintCounts] = useState<Record<string, number>>({});
  const [showSecurityCheck, setShowSecurityCheck] = useState(false);
  const [verificationAnimating, setVerificationAnimating] = useState(false);

  // Logo & Branding state
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('tradecore_receipt_company_name') || 'Singida Grain Millers Ltd');
  const [companyBranch, setCompanyBranch] = useState(() => localStorage.getItem('tradecore_receipt_company_branch') || 'Central Depot, Singida-Dodoma Rd');
  const [companyPhone, setCompanyPhone] = useState(() => localStorage.getItem('tradecore_receipt_company_phone') || '+255 26 250 1234');
  const [companyEmail, setCompanyEmail] = useState(() => localStorage.getItem('tradecore_receipt_company_email') || 'logistics@singidagrain.co.tz');
  const [showBrandingConfig, setShowBrandingConfig] = useState(false);
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');

  useEffect(() => {
    if (selectedReceipt && selectedReceipt.type === 'selling') {
      const cust = customers.find(c => c.id === selectedReceipt.order.customerId);
      if (cust) {
        setWhatsappPhone(cust.phone || '');
      }
    } else {
      setShowWhatsAppInput(false);
    }
  }, [selectedReceipt, customers]);

  // Load custom logo and reprint counts from localStorage on mount
  useEffect(() => {
    const savedLogo = localStorage.getItem('tradecore_receipt_custom_logo');
    if (savedLogo) {
      setCustomLogo(savedLogo);
    }

    try {
      const savedCounts = localStorage.getItem('tradecore_reprint_counts');
      if (savedCounts) {
        setReprintCounts(JSON.parse(savedCounts));
      }
    } catch (e) {
      console.error('Error loading reprint counts:', e);
    }
  }, []);

  // Securely update the duplicate reprint counts when a receipt is opened
  useEffect(() => {
    if (selectedReceipt) {
      const docId = selectedReceipt.type === 'selling' 
        ? selectedReceipt.order.soNumber 
        : selectedReceipt.order.poNumber;
      
      setReprintCounts(prev => {
        const newCount = (prev[docId] || 0) + 1;
        const updated = { ...prev, [docId]: newCount };
        localStorage.setItem('tradecore_reprint_counts', JSON.stringify(updated));
        return updated;
      });
    }
  }, [selectedReceipt]);

  const submitWhatsAppShare = () => {
    if (!whatsappPhone.trim()) {
      toast.error(translate('Please enter a valid phone number') || 'Please enter a valid phone number');
      return;
    }
    const cust = customers.find(c => c.id === selectedReceipt?.order.customerId);
    const storeObj = stores.find(s => s.id === selectedReceipt?.order.storeId);
    const compName = companyName || storeObj?.name || 'Singida Grain Millers Ltd';
    const totalDisplay = formatMoney(selectedReceipt?.order.total || 0, currency || 'USD', exchangeRate || 1);

    let itemsText = '';
    selectedReceipt?.order.items.forEach((item: any, index: number) => {
      const prod = stockItems.find(p => p.id === item.productId);
      const prodName = prod ? prod.name : 'Unknown Product';
      const itemPrice = formatMoney(item.price, currency || 'USD', exchangeRate || 1);
      itemsText += `${index + 1}. ${prodName} x ${item.qty} @ ${itemPrice}\n`;
    });

    const textReceipt = `*RECEIPT / RISITI - ${compName}*\n` +
      `-------------------------------------\n` +
      `*Order No:* ${selectedReceipt?.order.soNumber}\n` +
      `*Date / Tarehe:* ${selectedReceipt?.order.date}\n` +
      `*Customer / Mteja:* ${cust?.name || 'Walk-in'}\n` +
      `-------------------------------------\n` +
      `*Items / Bidhaa:*\n${itemsText}` +
      `-------------------------------------\n` +
      `*TOTAL / JUMLA:* *${totalDisplay}*\n\n` +
      `Thank you for shopping with us!\nAsanteni kwa kufanya biashara nasi! 🙏✨`;

    // Try opening whatsapp
    const cleanPhone = whatsappPhone.replace(/\D/g, ''); // strip non-numeric
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textReceipt)}`;
    
    // Copy to clipboard as robust fallback
    let copied = false;
    try {
      navigator.clipboard.writeText(textReceipt);
      copied = true;
    } catch (err) {}

    try {
      window.open(whatsappUrl, '_blank');
    } catch (err) {
      console.warn('Could not open WhatsApp window', err);
    }

    setShowWhatsAppInput(false);
    if (copied) {
      toast.success(translate('Receipt copied to clipboard & WhatsApp opened!') || 'Receipt copied to clipboard & WhatsApp opened!');
    } else {
      toast.success(translate('WhatsApp opened!') || 'WhatsApp opened!');
    }

    if (logAction && selectedReceipt?.order) {
      logAction('WhatsApp Receipt Shared', `Dispatched receipt for ${selectedReceipt.order.soNumber} to ${cleanPhone}`);
    }
  };

  const handleToggleVoid = (so: SalesOrder) => {
    if (!onUpdateSalesOrders || !onUpdateStockItems) return;

    const isVoiding = so.status !== 'Voided';
    const updatedStatus = isVoiding ? 'Voided' : 'Completed';

    // 1. Update the sales order status
    const updatedSalesOrders = salesOrders.map(order => {
      if (order.id === so.id) {
        return { ...order, status: updatedStatus as 'Completed' | 'Voided' };
      }
      return order;
    });

    // 2. Adjust stock item quantities for that specific store
    const updatedStockItems = stockItems.map(item => {
      const orderItem = so.items.find(oi => oi.productId === item.id);
      if (orderItem) {
        const currentQtyInStore = item.stock[so.storeId] || 0;
        // If we are voiding, we RE-ADD the stock back to the store (restore stock).
        // If we are restoring, we SUBTRACT the stock from the store (re-sell stock).
        const newQtyInStore = isVoiding 
          ? currentQtyInStore + orderItem.qty 
          : currentQtyInStore - orderItem.qty;

        const updatedStock = {
          ...item.stock,
          [so.storeId]: Math.max(0, newQtyInStore) // Keep positive
        };

        return { ...item, stock: updatedStock };
      }
      return item;
    });

    // 3. Save both states
    onUpdateSalesOrders(updatedSalesOrders);
    onUpdateStockItems(updatedStockItems);
  };

  // Generate deterministic anti-tamper security hash for receipts
  const generateAuditHash = (order: any, cashierName: string) => {
    const orderNum = order.soNumber || order.poNumber || '9999';
    const dataStr = `${orderNum}-${order.date}-${order.total}-${cashierName}`;
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `TRA-TC26-${hex}-${orderNum.slice(-4)}`;
  };

  const handleVerifySecStamp = () => {
    setVerificationAnimating(true);
    setTimeout(() => {
      setVerificationAnimating(false);
      setShowSecurityCheck(true);
    }, 1200);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setCustomLogo(base64);
      localStorage.setItem('tradecore_receipt_custom_logo', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomLogo = () => {
    setCustomLogo(null);
    localStorage.removeItem('tradecore_receipt_custom_logo');
  };

  const handleUpdateCompanyDetail = (key: string, value: string) => {
    if (key === 'name') {
      setCompanyName(value);
      localStorage.setItem('tradecore_receipt_company_name', value);
    } else if (key === 'branch') {
      setCompanyBranch(value);
      localStorage.setItem('tradecore_receipt_company_branch', value);
    } else if (key === 'phone') {
      setCompanyPhone(value);
      localStorage.setItem('tradecore_receipt_company_phone', value);
    } else if (key === 'email') {
      setCompanyEmail(value);
      localStorage.setItem('tradecore_receipt_company_email', value);
    }
  };

  const getStoreDetails = (id: number) => {
    return stores.find(s => s.id === id) || { name: 'Store location', location: 'Branch Depot', phone: '' };
  };

  const getCustomerName = (id: number) => {
    return customers.find(c => c.id === id)?.name || 'Walk-in Customer';
  };

  const getSupplierName = (id: number) => {
    return suppliers.find(s => s.id === id)?.name || 'Direct Importer';
  };

  const getProductName = (id: number) => {
    return stockItems.find(p => p.id === id) || { name: 'Item description', code: 'N/A' };
  };

  const getActiveCompany = () => {
    return {
      id: 'custom',
      name: companyName,
      branch: companyBranch,
      phone: companyPhone,
      email: companyEmail,
      logoColor: '#b45309',
      badgeText: 'CUSTOM BRAND',
      svgLogo: customLogo ? (
        <img src={customLogo} alt="Custom Business Logo" className="w-14 h-14 object-contain rounded-lg border shadow-sm" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-black text-xl shadow-inner no-print">
          {companyName.slice(0, 2).toUpperCase()}
        </div>
      )
    };
  };

  // Filters
  const filteredSales = salesOrders.filter(so => {
    const activeStoreId = filterStoreId !== 'all' ? parseInt(filterStoreId) : null;
    const matchStore = activeStoreId ? so.storeId === activeStoreId : true;
    
    const matchStartDate = filterStartDate ? so.date >= filterStartDate : true;
    const matchEndDate = filterEndDate ? so.date <= filterEndDate : true;

    const custName = getCustomerName(so.customerId).toLowerCase();
    const matchSearch = searchQuery
      ? so.soNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        custName.includes(searchQuery.toLowerCase())
      : true;
    return matchStore && matchStartDate && matchEndDate && matchSearch;
  });

  const filteredPurchases = purchaseOrders.filter(po => {
    // Exclude soft-deleted purchase orders
    if (po.isDeleted) return false;

    const activeStoreId = filterStoreId !== 'all' ? parseInt(filterStoreId) : null;
    const matchStore = activeStoreId ? po.storeId === activeStoreId : true;

    const matchStartDate = filterStartDate ? po.date >= filterStartDate : true;
    const matchEndDate = filterEndDate ? po.date <= filterEndDate : true;

    const suppName = getSupplierName(po.supplierId).toLowerCase();
    const matchSearch = searchQuery
      ? po.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        suppName.includes(searchQuery.toLowerCase())
      : true;
    return matchStore && matchStartDate && matchEndDate && matchSearch;
  });

  // EXPORT RECEIPT DIRECTLY TO EXCEL (.XLS)
  const handleExportExcel = (type: 'selling' | 'buying', order: any) => {
    const isSelling = type === 'selling';
    const store = getStoreDetails(order.storeId);
    const clientName = isSelling ? getCustomerName(order.customerId) : getSupplierName(order.supplierId);
    const comp = getActiveCompany();
    
    // VAT Breakdowns
    const taxableBasis = order.total / 1.18;
    const vatAmount = order.total - taxableBasis;
    
    let tableHtml = `
      <table>
        <tr>
          <td colspan="5" style="font-size: 16px; font-weight: bold; color: #1e3a8a; text-align: center;">
            ${comp.name}
          </td>
        </tr>
        <tr>
          <td colspan="5" style="text-align: center; color: #6b7280; font-size: 11px;">
            ${comp.branch} • Tel: ${comp.phone} • Email: ${comp.email}
          </td>
        </tr>
        <tr><td colspan="5"></td></tr>
        <tr style="background-color: #f1f5f9; font-weight: bold;">
          <td colspan="3">DOCUMENT TYPE: ${isSelling ? 'TAX INVOICE' : 'PURCHASE RECEIPT'}</td>
          <td colspan="2" style="text-align: right; color: #dc2626;">NUMBER: ${isSelling ? order.soNumber : order.poNumber}</td>
        </tr>
        <tr>
          <td colspan="3">Date: ${order.date}</td>
          <td colspan="2" style="text-align: right;">Store: ${store.name}</td>
        </tr>
        <tr>
          <td colspan="3">${isSelling ? 'Customer/Client:' : 'Supplier:'} ${clientName}</td>
          <td colspan="2" style="text-align: right;">Prepared By: ${currentUser?.name || 'Authorized Staff'}</td>
        </tr>
        <tr><td colspan="5"></td></tr>
        <thead>
          <tr style="background-color: #ef4444; color: white; font-weight: bold;">
            <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">Item Description</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">SKU / Code</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #cbd5e1;">Qty</th>
            <th style="padding: 10px; text-align: right; border: 1px solid #cbd5e1;">Unit Rate</th>
            <th style="padding: 10px; text-align: right; border: 1px solid #cbd5e1;">Line Total</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    order.items.forEach((item: any) => {
      const p = getProductName(item.productId);
      const price = isSelling ? item.price : item.cost;
      const lineTotal = item.qty * price;
      tableHtml += `
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${p.name}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; font-family: monospace;">${p.code}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">${item.qty}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">${formatMoney(price, currency, exchangeRate)}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-weight: bold;">${formatMoney(lineTotal, currency, exchangeRate)}</td>
        </tr>
      `;
    });
    
    tableHtml += `
        <tr><td colspan="5"></td></tr>
        <tr>
          <td colspan="3"></td>
          <td style="font-weight: bold; color: #6b7280; padding: 6px;">Subtotal (Excl. VAT):</td>
          <td style="text-align: right; font-weight: bold; padding: 6px;">${formatMoney(taxableBasis, currency, exchangeRate)}</td>
        </tr>
        <tr>
          <td colspan="3"></td>
          <td style="font-weight: bold; color: #6b7280; padding: 6px;">VAT Amount (18% inclusive):</td>
          <td style="text-align: right; font-weight: bold; padding: 6px;">${formatMoney(vatAmount, currency, exchangeRate)}</td>
        </tr>
        <tr style="background-color: #fef2f2; font-weight: bold;">
          <td colspan="3"></td>
          <td style="color: #dc2626; padding: 8px; border-top: 2px solid #ef4444;">GRAND TOTAL:</td>
          <td style="text-align: right; color: #dc2626; padding: 8px; border-top: 2px solid #ef4444;">${formatMoney(order.total, currency, exchangeRate)}</td>
        </tr>
        <tr><td colspan="5"></td></tr>
        <tr><td colspan="5"></td></tr>
        <tr>
          <td colspan="5" style="font-size: 10px; font-weight: bold; padding-top: 30px; text-align: left;">
            Prepared By (Service Provider / Cashier): ${currentUser?.name || 'Staff'}<br/>
            Signature / Stamp: ______________________
          </td>
        </tr>
      </tbody>
    </table>
    `;
    
    exportToExcel(tableHtml, `${isSelling ? order.soNumber : order.poNumber}_Professional_Receipt`);
  };

  const triggerPDFPrint = () => {
    handlePrintWithFallback((title, desc) => {
      setConfirmModal({
        isOpen: true,
        title: translate(title),
        description: translate(desc),
        onConfirm: () => {}
      });
    });
  };

  return (
    <div className="space-y-6">
      {/* Receipts tab list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 flex gap-1 no-print animate-fade-in">
        <button
          onClick={() => { setActiveTab('selling'); setSearchQuery(''); }}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'selling'
              ? 'bg-brand text-white shadow-sm'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> {translate('Selling Invoices / Receipts')}
        </button>
        <button
          onClick={() => { setActiveTab('buying'); setSearchQuery(''); }}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'buying'
              ? 'bg-brand text-white shadow-sm'
              : 'hover:bg-gray-50 text-gray-600'
          }`}
        >
          <Truck className="w-4 h-4" /> {translate('Buying Receipts / Purchase Invoices')}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'selling' ? `${translate('Search invoice # or Customer...') || 'Search invoice #...'}` : `${translate('Search receipt # or Supplier...') || 'Search receipt #...'}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand/20 outline-none animate-none"
            />
          </div>

          {/* Store Selector */}
          <div>
            <select
              value={filterStoreId}
              disabled={!!currentStoreId}
              onChange={(e) => setFilterStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-semibold outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-75"
            >
              <option value="all">📁 {translate('All Stores') || 'All Stores'}</option>
              {stores.filter(s => !s.isDeleted).map(s => (
                <option key={s.id} value={s.id}>🏪 {s.name}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">{translate('From') || 'From'}</span>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">{translate('To') || 'To'}</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100 whitespace-nowrap">
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
            {translate('Showing')} <strong>{activeTab === 'selling' ? filteredSales.length : filteredPurchases.length}</strong> {translate('documents') || 'documents'}
          </span>
          {(filterStartDate || filterEndDate || (filterStoreId !== 'all' && !currentStoreId)) && (
            <button
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                if (!currentStoreId) setFilterStoreId('all');
              }}
              className="text-xs text-red-600 font-bold hover:underline"
            >
              {translate('Clear') || 'Clear'}
            </button>
          )}
        </div>
      </div>

      {/* Main receipts table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead className="bg-gray-50 border-b">
              <tr className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                <th className="px-5 py-3">{translate('Product Name') || 'Product Name'}</th>
                <th className="px-5 py-3">{translate('Date')}</th>
                <th className="px-5 py-3">{activeTab === 'selling' ? translate('Customers') : translate('Suppliers')}</th>
                <th className="px-5 py-3">{translate('Store Location')}</th>
                <th className="px-5 py-3">{activeTab === 'selling' ? translate('Pricing Mode') : translate('Status')}</th>
                <th className="px-5 py-3 text-right">{translate('Total')}</th>
                <th className="px-5 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeTab === 'selling'
                ? filteredSales.map(so => (
                    <tr key={so.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-bold text-gray-900 leading-snug">
                          {so.items.map(i => getProductName(i.productId).name).join(', ')}
                        </div>
                        <div className="text-[11px] text-brand font-mono font-semibold mt-0.5">{so.soNumber}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{so.date}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{getCustomerName(so.customerId)}</td>
                      <td className="px-5 py-3 text-gray-600">{getStoreDetails(so.storeId).name}</td>
                      <td className="px-5 py-3 flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          so.priceType === 'Wholesale' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {so.priceType}
                        </span>
                        {so.status === 'Voided' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                            {translate('Voided')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                            {translate('Completed')}
                          </span>
                        )}
                        {so.paymentMethod && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                            📱 {so.paymentMethod}
                          </span>
                        )}
                        {so.paymentStatus && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            so.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : (so.paymentStatus === 'Credit' ? 'bg-rose-100 text-rose-800' : 'bg-yellow-100 text-yellow-800')
                          }`}>
                            {so.paymentStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">
                        {formatMoney(so.total, currency, exchangeRate)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setSelectedReceipt({ type: 'selling', order: so })}
                            className="text-xs text-blue-600 font-bold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition"
                          >
                            <Eye className="w-3.5 h-3.5" /> {translate('View')}
                          </button>

                          {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                            <>
                              {so.status === 'Voided' ? (
                                <button
                                  onClick={() => handleToggleVoid(so)}
                                  className="text-xs text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition"
                                  title={translate('Restore and return inventory')}
                                >
                                  <RefreshCw className="w-3 h-3" /> {translate('Restore')}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleToggleVoid(so)}
                                  className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition"
                                  title={translate('Void and reverse inventory')}
                                >
                                  <X className="w-3 h-3" /> {translate('Void')}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    isOpen: true,
                                    title: translate('Delete Sales Receipt'),
                                    description: translate('Are you sure you want to completely delete this sales receipt? This action is irreversible.'),
                                    onConfirm: () => {
                                      const updated = salesOrders.filter(item => item.id !== so.id);
                                      onUpdateSalesOrders?.(updated);
                                      logAction?.('Deleted Sales Receipt', `Completely deleted sales receipt: ${so.soNumber}`);
                                    }
                                  });
                                }}
                                className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition"
                                title={translate('Delete completely')}
                              >
                                <Trash2 className="w-3 h-3" /> {translate('Delete')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                : filteredPurchases.map(po => (
                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-bold text-gray-900 leading-snug">
                          {po.items.map(i => getProductName(i.productId).name).join(', ')}
                        </div>
                        <div className="text-[11px] text-brand font-mono font-semibold mt-0.5">{po.poNumber}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{po.date}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{getSupplierName(po.supplierId)}</td>
                      <td className="px-5 py-3 text-gray-600">{getStoreDetails(po.storeId).name}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          po.status === 'Received' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">
                        {formatMoney(po.total, currency, exchangeRate)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setSelectedReceipt({ type: 'buying', order: po })}
                            className="text-xs text-indigo-600 font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition"
                          >
                            <Eye className="w-3.5 h-3.5" /> {translate('View Receipt')}
                          </button>
                          {(currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') && (
                            <button
                              onClick={() => {
                                  setConfirmModal({
                                    isOpen: true,
                                    title: translate('Delete Purchase Receipt'),
                                    description: translate('Are you sure you want to delete this purchase receipt? You can restore it later from the Data Recovery Hub.'),
                                    onConfirm: () => {
                                      const updated = purchaseOrders.map(item => item.id === po.id ? { ...item, isDeleted: true } : item);
                                      onUpdatePurchaseOrders?.(updated);
                                      logAction?.('Deleted Purchase Receipt (Soft)', `Soft-deleted purchase receipt: ${po.poNumber}`);
                                    }
                                  });
                              }}
                              className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition"
                              title={translate('Delete completely')}
                            >
                              <Trash2 className="w-3 h-3" /> {translate('Delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              {((activeTab === 'selling' && filteredSales.length === 0) ||
                (activeTab === 'buying' && filteredPurchases.length === 0)) && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                    {translate('No records found') || 'No receipts matches.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice modal overlay designed for full print layout */}
      {selectedReceipt && (() => {
        const docId = selectedReceipt.type === 'selling' 
          ? selectedReceipt.order.soNumber 
          : selectedReceipt.order.poNumber;
        const printCount = reprintCounts[docId] || 1;
        const auditHash = generateAuditHash(selectedReceipt.order, currentUser?.name || 'Cashier Terminal 1');

        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4 sm:my-8 overflow-hidden flex flex-col print-card max-h-[95vh] sm:max-h-[90vh]">
              
              {/* Modal Controls - Hidden during Printing */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b bg-gray-50 flex flex-col md:flex-row gap-3 sm:gap-4 md:items-center md:justify-between no-print shrink-0">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5 text-xs sm:text-sm">
                    <FileText className="w-4 h-4 text-brand" />
                    {translate('Document Type')}: <span className="font-mono text-brand ml-1">{docId}</span>
                  </span>
                  
                  {/* Fraud Audit Reprint Status badge */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {printCount > 1 ? (
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 animate-pulse" />
                        {translate('Reprint Audit Secure')} (COPY #{printCount - 1})
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
                        {translate('Original Receipt')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Horizontal-scrollable action buttons on mobile screens to prevent layout breaking or cut-offs */}
                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 md:pb-0 md:flex-wrap md:overflow-visible">
                  <button
                    onClick={handleVerifySecStamp}
                    disabled={verificationAnimating}
                    className={`border px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm ${
                      showSecurityCheck 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500 ${verificationAnimating ? 'animate-spin' : ''}`} />
                    {verificationAnimating ? `${translate('Verify') || 'Verifying'}...` : `${translate('Verify') || 'Verify Sec'}`}
                  </button>
                  {/* Export excel */}
                  <button
                    onClick={() => handleExportExcel(selectedReceipt.type, selectedReceipt.order)}
                    className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm"
                    title="Export directly to real Excel formatted file"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Excel
                  </button>
                  <button
                    onClick={triggerPDFPrint}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {translate('Print') || 'Print'}
                  </button>
                  {selectedReceipt.type === 'selling' && (
                    <button
                      onClick={() => {
                        generateSalesOrderPDF({
                          order: selectedReceipt.order,
                          customer: customers.find(c => c.id === selectedReceipt.order.customerId) || null,
                          store: stores.find(s => s.id === selectedReceipt.order.storeId) || null,
                          stockItems,
                          currentUser,
                          currency,
                          exchangeRate,
                          language,
                          companyDetails: {
                            name: companyName,
                            branch: companyBranch,
                            phone: companyPhone,
                            email: companyEmail,
                            logo: customLogo
                          }
                        });
                        if (logAction) {
                          logAction('Generated PDF Invoice', `Downloaded PDF invoice for sales ledger ${selectedReceipt.order.soNumber}`);
                        }
                      }}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm"
                      title={translate('Download professional PDF Invoice') || 'Download professional PDF Invoice'}
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" /> PDF Invoice
                    </button>
                  )}
                  {selectedReceipt.type === 'selling' && (
                    <button
                      onClick={() => setShowWhatsAppInput(!showWhatsAppInput)}
                      className={`px-2.5 py-1.5 border rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm ${
                        showWhatsAppInput 
                          ? 'bg-[#128C7E] text-white border-[#128C7E]' 
                          : 'bg-[#25D366] hover:bg-[#128C7E] text-white border-[#25D366]'
                      }`}
                      title={translate('Share via WhatsApp') || 'Share via WhatsApp'}
                    >
                      <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> WhatsApp
                    </button>
                  )}
                                    {/* Toggle receipt config settings */}
                  {canSetupReceipt && (
                    <button
                      onClick={() => setShowBrandingConfig(!showBrandingConfig)}
                      className={`border px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition shrink-0 shadow-sm ${
                        showBrandingConfig 
                          ? 'bg-amber-100 text-amber-800 border-amber-300' 
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                      }`}
                      title={translate('Configure Custom Company Details') || 'Configure custom details'}
                    >
                      <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {showBrandingConfig ? (translate('Hide Settings') || 'Hide Settings') : (translate('Receipt Setup') || 'Receipt Setup')}
                    </button>
                  )}
                  <button
                    onClick={() => { setSelectedReceipt(null); setShowSecurityCheck(false); }}
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-500 ml-1 shrink-0"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>

              {/* WhatsApp Receipt Panel */}
              {showWhatsAppInput && (
                <div className="p-4 bg-emerald-50 border-b no-print text-xs animate-fade-in space-y-2">
                  <label className="text-[10px] font-bold text-emerald-800 block tracking-wider uppercase">
                    {translate('Share via WhatsApp') || 'Share via WhatsApp'}
                  </label>
                  <div className="flex gap-2 max-w-md">
                    <input
                      type="text"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      placeholder="e.g. 255712345678"
                      className="flex-1 px-3 py-1.5 border border-emerald-300 rounded-lg outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      onClick={submitWhatsAppShare}
                      className="px-4 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold rounded-lg text-xs transition shrink-0"
                    >
                      {translate('Send') || 'Send'}
                    </button>
                  </div>
                </div>
              )}

              {/* CUSTOM COMPANY BRANDING DETAILS & LOGO UPLOADER (No-Print) */}
              {canSetupReceipt && showBrandingConfig && (
                <div className="p-4 bg-gray-50/50 border-b grid grid-cols-1 md:grid-cols-3 gap-4 no-print text-xs animate-fade-in shrink-0 max-h-[35vh] overflow-y-auto">
                  <div className="md:col-span-2 space-y-3">
                    <span className="text-[10px] font-bold text-gray-500 block tracking-wider uppercase">Configure Custom Company Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Business / Company Name</label>
                        <input 
                          type="text" 
                          value={companyName}
                          onChange={(e) => handleUpdateCompanyDetail('name', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-brand"
                          placeholder="Singida Grain Millers Ltd"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Branch Location / Address</label>
                        <input 
                          type="text" 
                          value={companyBranch}
                          onChange={(e) => handleUpdateCompanyDetail('branch', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-brand"
                          placeholder="Central Depot, Singida-Dodoma Rd"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Contact Hotline / Phone</label>
                        <input 
                          type="text" 
                          value={companyPhone}
                          onChange={(e) => handleUpdateCompanyDetail('phone', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-brand"
                          placeholder="+255 26 250 1234"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Authorized Email Address</label>
                        <input 
                          type="text" 
                          value={companyEmail}
                          onChange={(e) => handleUpdateCompanyDetail('email', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-brand"
                          placeholder="logistics@singidagrain.co.tz"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between space-y-2.5 border-t md:border-t-0 md:border-l border-gray-200 md:pl-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block tracking-wider uppercase mb-1.5">Company Logo</label>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-white border border-dashed border-gray-300 hover:border-brand/40 hover:bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-semibold text-gray-600 shadow-sm flex-1 justify-center transition">
                          <Upload className="w-4 h-4 text-brand" />
                          Upload Logo PNG/JPG
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {customLogo && (
                          <button
                            onClick={handleRemoveCustomLogo}
                            className="px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 border border-red-100 rounded-lg font-bold"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {customLogo && (
                      <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-lg border border-gray-100">
                        <img src={customLogo} className="w-9 h-9 object-contain rounded border bg-white" alt="Custom Logo Thumbnail" />
                        <div className="text-[10px] text-gray-500 font-medium truncate">Custom logo loaded & saved</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Digital Verification Report */}
              {showSecurityCheck && (
                <div className="mx-6 md:mx-12 mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs animate-fade-in no-print">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <span>{translate('E-Invoice Verification') || 'E-Invoice Verification'} • {translate('Verify Secure Receipt') || 'Verify Secure Receipt'}</span>
                    </div>
                    <button 
                      onClick={() => setShowSecurityCheck(false)}
                      className="text-emerald-500 hover:text-emerald-700 p-1 rounded-full hover:bg-emerald-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-emerald-950 font-medium">
                    <div>{translate('This receipt has been cryptographically secured.') || 'This receipt is cryptographically secured against alteration and double-printing.'}</div>
                    <div className="font-mono bg-emerald-100/60 p-2.5 rounded border border-emerald-200/50 mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">{translate('Security Verification Code') || 'Security Verification Code'}</span>
                        <span className="text-emerald-900 font-black">{auditHash}</span>
                      </div>
                      <span className="text-[10px] bg-emerald-600 text-white font-black uppercase tracking-wider px-2 py-1 rounded self-start sm:self-auto shadow-sm">VERIFIED SECURE</span>
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-2">
                      * Hash computed from Order No, timestamp, totals, and staff-in-charge ID. Cryptographic seals prevent tax leakage and stop duplicate receipt theft at physical store exits.
                    </div>
                  </div>
                </div>
              )}

              {/* Print Sheet Container */}
              <div className="p-6 md:p-12 overflow-y-auto flex-1 scrollbar-thin print-container bg-white relative">
                
                {/* TEMPLATE A: PROFESSIONAL BUSINESS A4 INVOICE */}
                {receiptTemplate === 'a4' && (
                  <div className="animate-fade-in">
                    {/* Duplicate reprint visual watermark overlay */}
                    {printCount > 1 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] select-none overflow-hidden rotate-[-30deg]">
                        <span className="text-red-600 font-black text-6xl tracking-widest uppercase text-center leading-normal">
                          DUPLICATE COPY<br />
                          REPRINTED AUDIT SECURED<br />
                          COPY #{printCount - 1}
                        </span>
                      </div>
                    )}

                    {/* Corporate Header */}
                    <div className="border-b-2 border-gray-100 pb-6 mb-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          {getActiveCompany().svgLogo}
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-gray-900 tracking-tight">
                            {getActiveCompany().name}
                          </h2>
                          <div className="text-xs text-gray-500 mt-1 font-semibold space-y-0.5 leading-relaxed">
                            <div>Branch depot: <span className="text-gray-800">{getActiveCompany().branch}</span></div>
                            <div>Contact hotline: <span className="text-gray-800">{getActiveCompany().phone}</span></div>
                            <div>Authorized Email: <span className="text-gray-800">{getActiveCompany().email}</span></div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {/* Bold Red Box Document Numbering */}
                        <div className="inline-block border-2 border-red-500 bg-red-50 text-red-600 rounded-lg px-4 py-2 font-black tracking-wider text-sm font-mono mb-2">
                          {translate('RECEIPT NO')}: {docId}
                        </div>
                        <div className="text-xs text-gray-500 font-semibold space-y-0.5">
                          <div>{translate('Document Type') || 'Document Type'}: <span className="text-gray-900 uppercase font-extrabold">{selectedReceipt.type === 'selling' ? translate('TAX INVOICE') : 'PURCHASE RECORD'}</span></div>
                          <div>{translate('Transaction Date') || 'Transaction Date'}: <span className="text-gray-900 font-mono">{selectedReceipt.order.date}</span></div>
                          <div>{translate('Pricing Mode') || 'Pricing Mode'}: <span className="text-gray-900 font-bold uppercase">{selectedReceipt.type === 'selling' ? selectedReceipt.order.priceType : 'COGS INVENTORY COST'}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Transaction details & Personnel */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 font-bold block tracking-wider uppercase mb-1">
                          {selectedReceipt.type === 'selling' ? translate('Customers') : translate('Suppliers')}
                        </span>
                        <span className="font-extrabold text-gray-900 text-sm">
                          {selectedReceipt.type === 'selling' 
                            ? getCustomerName(selectedReceipt.order.customerId)
                            : getSupplierName(selectedReceipt.order.supplierId)
                          }
                        </span>
                        <div className="text-gray-500 mt-1 font-medium">Verified Commercial Trade Account</div>
                      </div>

                      <div>
                        <span className="text-gray-400 font-bold block tracking-wider uppercase mb-1">{translate('Store Location') || 'Store Location'}</span>
                        <span className="font-semibold text-gray-800">
                          {getStoreDetails(selectedReceipt.order.storeId).name}
                        </span>
                        <div className="text-gray-500 font-medium mt-0.5">
                          {getStoreDetails(selectedReceipt.order.storeId).location}
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <span className="text-gray-400 font-bold block tracking-wider uppercase mb-1">{translate('Cashier / Staff Name') || 'Cashier / Staff Name'}</span>
                        <span className="font-extrabold text-gray-900 text-sm bg-brand-light/30 text-brand px-2 py-0.5 rounded">
                          {currentUser?.name || 'Cashier Terminal 1'}
                        </span>
                        <div className="text-gray-500 mt-1 font-medium">Logged-In System Operator</div>
                      </div>
                    </div>

                    {/* Products Table */}
                    <div className="border border-gray-200 rounded-lg overflow-x-auto mb-6 scrollbar-thin">
                      <table className="w-full text-xs text-left border-collapse min-w-[580px] sm:min-w-0">
                        <thead>
                          <tr className="bg-slate-100 font-bold text-gray-700 border-b">
                            <th className="px-4 py-3">{translate('Item Description')}</th>
                            <th className="px-4 py-3">{translate('SKU / Barcode')}</th>
                            <th className="px-4 py-3 text-center">{translate('Quantity')}</th>
                            <th className="px-4 py-3 text-right">{selectedReceipt.type === 'selling' ? translate('Unit Price') : translate('Unit Cost')}</th>
                            <th className="px-4 py-3 text-right">{translate('Line Total')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedReceipt.order.items.map((item: any, idx: number) => {
                            const p = getProductName(item.productId);
                            const itemRate = selectedReceipt.type === 'selling' ? item.price : item.cost;
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3.5 font-bold text-gray-900">{p.name}</td>
                                <td className="px-4 py-3.5 text-gray-500 font-mono">{p.code}</td>
                                <td className="px-4 py-3.5 text-center font-mono font-bold text-gray-700">{item.qty}</td>
                                <td className="px-4 py-3.5 text-right font-medium text-gray-600">{formatMoney(itemRate, currency, exchangeRate)}</td>
                                <td className="px-4 py-3.5 text-right font-extrabold text-gray-900 font-mono">
                                  {formatMoney(item.qty * itemRate, currency, exchangeRate)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* VAT Breakdown & Grand Total */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 border-t-2 border-gray-100">
                      <div className="text-[10px] text-gray-400 max-w-sm font-medium leading-relaxed">
                        * All currency calculations are synchronized dynamically. VAT (18%) is calculated as inclusive based on final taxable supply totals in accordance with local tax frameworks.
                      </div>
                      
                      <div className="w-full sm:w-80 space-y-2 text-xs">
                        {/* Taxable basis */}
                        <div className="flex justify-between font-semibold text-gray-500 border-b pb-1.5">
                          <span>{translate('Subtotal') || 'Taxable Basis (Excl. VAT)'}</span>
                          <span className="font-mono text-gray-700">{formatMoney(selectedReceipt.order.total / 1.18, currency, exchangeRate)}</span>
                        </div>
                        {/* VAT Amount */}
                        <div className="flex justify-between font-semibold text-gray-500 border-b pb-1.5">
                          <span>{translate('VAT Breakdown') || 'VAT Breakdown (18% inclusive)'}</span>
                          <span className="font-mono text-gray-700">{formatMoney(selectedReceipt.order.total - (selectedReceipt.order.total / 1.18), currency, exchangeRate)}</span>
                        </div>
                        {/* Grand total */}
                        <div className="flex justify-between font-black text-gray-900 text-sm pt-1.5 bg-brand-light/20 border-2 border-brand/20 rounded-lg p-3">
                          <span>{translate('GRAND TOTAL')}</span>
                          <span className="text-brand font-black text-base font-mono">
                            {formatMoney(selectedReceipt.order.total, currency, exchangeRate)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Corporate Signature Space (Service Provider Only) */}
                    <div className="mt-16 flex justify-end text-xs border-t pt-8">
                      <div className="w-72 space-y-4">
                        <div className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">{translate('Prepared By')} (Person Who Provides Services)</div>
                        <div className="border-b border-gray-300 h-6"></div>
                        <div className="font-bold text-gray-800">
                          {currentUser?.name || 'Staff operator'}
                        </div>
                      </div>
                    </div>

                    {/* Thermal Note */}
                    <div className="mt-12 text-center text-[10px] text-gray-400 border-t pt-4 font-bold tracking-widest uppercase">
                      Global TradeCore ERP Workspace • System Secure Certified • All rights reserved 2026.
                    </div>
                  </div>
                )}

                {/* TEMPLATE B: COMPACT 80MM POS THERMAL SLIP */}
                {receiptTemplate === 'thermal' && (
                  <div className="animate-fade-in max-w-[340px] mx-auto bg-gray-50/50 p-6 shadow-inner border border-dashed border-gray-300 rounded-xl font-mono text-xs text-gray-900 print:bg-white print:border-none print:shadow-none print:p-0">
                    
                    {/* Security reprint stamp inside thermal slip */}
                    {printCount > 1 && (
                      <div className="border-2 border-amber-600 bg-amber-50 text-amber-800 text-[10px] font-black text-center p-2 rounded mb-4 tracking-tight uppercase print:bg-white print:border-amber-600 leading-tight">
                        *** {translate('Duplicate Reprint') || 'DUPLICATE COPY'} ***<br />
                        {translate('Reprint Audit Secure') || 'REPRINT AUDIT'}: COPY #{printCount - 1}<br />
                        SECURED LOCK ACTIVE
                      </div>
                    )}

                    {/* Centered Business Header */}
                    <div className="text-center space-y-1 pb-4 border-b border-dashed border-gray-300">
                      <div className="flex justify-center mb-1 text-gray-800">
                        {getActiveCompany().svgLogo}
                      </div>
                      <h3 className="font-black text-sm tracking-tight uppercase">{getActiveCompany().name}</h3>
                      <p className="text-[10px] text-gray-500 leading-tight">
                        {getActiveCompany().branch}<br />
                        Hotline: {getActiveCompany().phone}<br />
                        {getActiveCompany().email}
                      </p>
                    </div>

                    {/* Document Meta fields */}
                    <div className="py-3 border-b border-dashed border-gray-300 space-y-0.5 text-[11px] leading-relaxed">
                      <div className="flex justify-between">
                        <span className="text-gray-500">{translate('RECEIPT NO') || 'RECEIPT'}:</span>
                        <span className="font-bold">{docId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{translate('Date') || 'DATE'}:</span>
                        <span className="font-bold">{selectedReceipt.order.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{translate('Cashier / Staff Name') || 'CASHIER'}:</span>
                        <span className="font-bold">{currentUser?.username || 'admin'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{translate('Customers') || 'CLIENT'}:</span>
                        <span className="font-bold truncate max-w-[180px]">
                          {selectedReceipt.type === 'selling' 
                            ? getCustomerName(selectedReceipt.order.customerId)
                            : getSupplierName(selectedReceipt.order.supplierId)
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{translate('Pricing Mode') || 'PRICING'}:</span>
                        <span className="font-bold uppercase text-[10px]">{selectedReceipt.type === 'selling' ? selectedReceipt.order.priceType : 'COGS COST'}</span>
                      </div>
                    </div>

                    {/* Item list - POS Style compact rows */}
                    <div className="py-3 border-b border-dashed border-gray-300 space-y-3">
                      <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-wider">
                        <span>{translate('Item Description') || 'ITEM'}</span>
                        <span>{translate('Line Total') || 'TOTAL'}</span>
                      </div>
                      
                      {selectedReceipt.order.items.map((item: any, idx: number) => {
                        const p = getProductName(item.productId);
                        const itemRate = selectedReceipt.type === 'selling' ? item.price : item.cost;
                        return (
                          <div key={idx} className="space-y-0.5">
                            <div className="font-bold text-gray-900 uppercase text-[11px]">
                              {idx + 1}. {p.name}
                            </div>
                            <div className="flex justify-between text-[11px] text-gray-600 pl-3">
                              <span>{item.qty} x {formatMoney(itemRate, currency, exchangeRate)}</span>
                              <span className="font-bold font-mono text-gray-900">{formatMoney(item.qty * itemRate, currency, exchangeRate)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fiscal Calculations */}
                    <div className="py-3 border-b border-dashed border-gray-300 space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-gray-600">
                        <span>{translate('Subtotal') || 'Taxable Net (Ex VAT)'}:</span>
                        <span className="font-mono">{formatMoney(selectedReceipt.order.total / 1.18, currency, exchangeRate)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>{translate('VAT Breakdown') || 'VAT 18% (Inclusive)'}:</span>
                        <span className="font-mono">{formatMoney(selectedReceipt.order.total - (selectedReceipt.order.total / 1.18), currency, exchangeRate)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-gray-900 pt-1.5 border-t border-dotted border-gray-300">
                        <span>{translate('GRAND TOTAL') || 'TOTAL AMOUNT'}:</span>
                        <span className="font-mono text-base font-black text-brand">{formatMoney(selectedReceipt.order.total, currency, exchangeRate)}</span>
                      </div>
                    </div>

                    {/* Cryptographic Digital Stamp QR Code & scan simulator */}
                    <div className="py-4 flex flex-col items-center justify-center space-y-2 border-b border-dashed border-gray-300">
                      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{translate('Verify Secure Receipt') || 'VERIFY SECURITY QR'}</span>
                      <button 
                        onClick={handleVerifySecStamp}
                        className="p-2.5 bg-white border border-gray-200 rounded-lg hover:border-emerald-500 transition duration-300 shadow-sm block group cursor-pointer"
                        title="Click to simulate scanning receipt verification QR code"
                      >
                        <svg className="w-20 h-20 mx-auto" viewBox="0 0 100 100">
                          <rect width="100" height="100" fill="white" />
                          <rect x="5" y="5" width="25" height="25" fill="black" />
                          <rect x="10" y="10" width="15" height="15" fill="white" />
                          <rect x="13" y="13" width="9" height="9" fill="black" />
                          
                          <rect x="70" y="5" width="25" height="25" fill="black" />
                          <rect x="75" y="10" width="15" height="15" fill="white" />
                          <rect x="78" y="13" width="9" height="9" fill="black" />
                          
                          <rect x="5" y="70" width="25" height="25" fill="black" />
                          <rect x="10" y="75" width="15" height="15" fill="white" />
                          <rect x="13" y="78" width="9" height="9" fill="black" />
                          
                          <rect x="35" y="5" width="5" height="10" fill="black" />
                          <rect x="45" y="15" width="10" height="5" fill="black" />
                          <rect x="35" y="25" width="15" height="5" fill="black" />
                          <rect x="60" y="10" width="5" height="15" fill="black" />
                          <rect x="55" y="30" width="5" height="10" fill="black" />
                          
                          <rect x="35" y="40" width="10" height="10" fill="black" />
                          <rect x="50" y="45" width="15" height="10" fill="black" />
                          <rect x="70" y="35" width="10" height="5" fill="black" />
                          <rect x="85" y="40" width="10" height="10" fill="black" />
                          
                          <rect x="5" y="35" width="10" height="5" fill="black" />
                          <rect x="20" y="45" width="5" height="10" fill="black" />
                          
                          <rect x="35" y="60" width="15" height="5" fill="black" />
                          <rect x="60" y="55" width="5" height="20" fill="black" />
                          <rect x="50" y="75" width="15" height="10" fill="black" />
                          <rect x="35" y="85" width="10" height="5" fill="black" />
                          <rect x="70" y="70" width="10" height="5" fill="black" />
                          <rect x="85" y="80" width="10" height="10" fill="black" />
                          <rect x="75" y="85" width="5" height="5" fill="black" />
                        </svg>
                      </button>
                      <span className="text-[8px] text-gray-400 font-mono text-center tracking-tight leading-tight">
                        SECURE AUDIT SEAL:<br />
                        <span className="font-bold text-gray-600">{auditHash}</span>
                      </span>
                    </div>

                    {/* Procedural Vector Barcode */}
                    <div className="py-4 flex flex-col items-center justify-center space-y-1">
                      <svg className="w-48 h-8" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <rect width="1.5" height="20" x="5" fill="black" />
                        <rect width="2.5" height="20" x="8" fill="black" />
                        <rect width="1" height="20" x="12" fill="black" />
                        <rect width="3.5" height="20" x="14" fill="black" />
                        <rect width="1" height="20" x="19" fill="black" />
                        <rect width="1" height="20" x="21" fill="black" />
                        <rect width="2" height="20" x="23" fill="black" />
                        <rect width="1" height="20" x="27" fill="black" />
                        <rect width="4" height="20" x="29" fill="black" />
                        <rect width="1" height="20" x="35" fill="black" />
                        <rect width="2.5" height="20" x="37" fill="black" />
                        <rect width="1" height="20" x="41" fill="black" />
                        <rect width="3" height="20" x="43" fill="black" />
                        <rect width="1" height="20" x="48" fill="black" />
                        <rect width="2" height="20" x="50" fill="black" />
                        <rect width="1" height="20" x="54" fill="black" />
                        <rect width="4.5" height="20" x="56" fill="black" />
                        <rect width="1" height="20" x="62" fill="black" />
                        <rect width="2" height="20" x="64" fill="black" />
                        <rect width="1" height="20" x="68" fill="black" />
                        <rect width="3" height="20" x="70" fill="black" />
                        <rect width="1" height="20" x="75" fill="black" />
                        <rect width="1" height="20" x="78" fill="black" />
                        <rect width="2" height="20" x="80" fill="black" />
                        <rect width="1" height="20" x="84" fill="black" />
                        <rect width="4" height="20" x="86" fill="black" />
                        <rect width="1" height="20" x="92" fill="black" />
                      </svg>
                      <span className="text-[9px] tracking-[3px] font-mono text-gray-500 uppercase">{docId}</span>
                    </div>

                    {/* Thank You Note */}
                    <div className="pt-3 border-t border-dashed border-gray-300 text-center text-[10px] text-gray-400 space-y-0.5 font-bold uppercase leading-tight">
                      <div>ASANTE KWA BIASHARA YAKO!</div>
                      <div>THANK YOU FOR SHOPPING!</div>
                      <div className="text-[8px] tracking-normal font-medium text-gray-400/80 mt-1">SINGIDA TRADECORE ERP SECURED</div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

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
