import React, { useState, useMemo } from 'react';
import { Customer, StockItem, SalesOrder, Store, Settings, SOItem } from '../types';
import { X, Search, Plus, Minus, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Info, Printer } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { ConfirmActionModal } from './ConfirmActionModal';
import { handlePrintWithFallback } from '../utils/printHelper';

interface POSModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  stockItems: StockItem[];
  salesOrders: SalesOrder[];
  currentStoreId: number | null;
  stores: Store[];
  saveAllData: (updatedFields: Partial<{
    salesOrders: SalesOrder[];
    stockItems: StockItem[];
    customers: Customer[];
    auditTrails: any[];
  }>) => void;
  logAction: (action: string, details: string) => void;
  settings: Settings;
  t: (text: string) => string;
}

export default function POSModal({
  isOpen,
  onClose,
  customers,
  stockItems,
  salesOrders,
  currentStoreId,
  stores,
  saveAllData,
  logAction,
  settings,
  t
}: POSModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(customers[0]?.id || 1);
  const activeStores = stores.filter(s => !s.isDeleted);
  const [selectedStoreId, setSelectedStoreId] = useState<number>(currentStoreId || activeStores[0]?.id || 1);
  const [priceType, setPriceType] = useState<'Retail' | 'Wholesale'>('Retail');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<{ productId: number; qty: number; price: number; cost: number }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<SalesOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');

  // Confirm Modal state
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

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    return stockItems.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const codeMatch = item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const categoryMatch = item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return nameMatch || codeMatch || categoryMatch;
    });
  }, [stockItems, searchQuery]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Helper to get active product price
  const getProductPrice = (item: StockItem) => {
    return priceType === 'Wholesale' ? item.wholesalePrice : item.retailPrice;
  };

  // Helper to check stock in current store
  const getStockQty = (item: StockItem, storeId: number) => {
    return item.stock[storeId] || 0;
  };

  // Add to Cart
  const handleAddToCart = (item: StockItem) => {
    setErrorMsg(null);
    const availableStock = getStockQty(item, selectedStoreId);
    if (availableStock <= 0) {
      setErrorMsg(`${t('Product')} "${item.name}" ${t('is out of stock in this store!')}`);
      return;
    }

    const existingCartIndex = cart.findIndex(c => c.productId === item.id);
    const targetPrice = getProductPrice(item);

    if (existingCartIndex > -1) {
      const currentQtyInCart = cart[existingCartIndex].qty;
      if (currentQtyInCart + 1 > availableStock) {
        setErrorMsg(`${t('Cannot add more than available stock')} (${availableStock} ${t('available')})`);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[existingCartIndex].qty += 1;
      // Keep price updated just in case pricing mode changed
      updatedCart[existingCartIndex].price = targetPrice;
      setCart(updatedCart);
    } else {
      setCart([
        ...cart,
        {
          productId: item.id,
          qty: 1,
          price: targetPrice,
          cost: item.purchasePrice
        }
      ]);
    }
  };

  // Update Cart Qty
  const handleUpdateQty = (productId: number, newQty: number) => {
    setErrorMsg(null);
    const item = stockItems.find(p => p.id === productId);
    if (!item) return;

    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }

    const availableStock = getStockQty(item, selectedStoreId);
    if (newQty > availableStock) {
      setErrorMsg(`${t('Only')} ${availableStock} ${t('items are available in stock!')}`);
      return;
    }

    setCart(cart.map(c => {
      if (c.productId === productId) {
        return { ...c, qty: newQty };
      }
      return c;
    }));
  };

  // Remove from Cart
  const handleRemoveItem = (productId: number) => {
    setCart(cart.filter(c => c.productId !== productId));
  };

  // Recalculate cart prices when pricing mode changes
  const handlePriceTypeChange = (newMode: 'Retail' | 'Wholesale') => {
    setPriceType(newMode);
    setCart(cart.map(c => {
      const item = stockItems.find(p => p.id === c.productId);
      if (item) {
        return {
          ...c,
          price: newMode === 'Wholesale' ? item.wholesalePrice : item.retailPrice
        };
      }
      return c;
    }));
  };

  // Totals calculations
  const totals = useMemo(() => {
    let grossTotal = 0;
    let totalCost = 0;
    cart.forEach(c => {
      grossTotal += c.price * c.qty;
      totalCost += c.cost * c.qty;
    });
    return {
      total: grossTotal,
      cost: totalCost,
      profit: grossTotal - totalCost
    };
  }, [cart]);

  // Check customer credit limit validation
  const isCreditExceeded = useMemo(() => {
    if (!selectedCustomer || priceType !== 'Wholesale') return false;
    const currentBalance = selectedCustomer.balance || 0;
    const newTotal = totals.total;
    return (currentBalance + newTotal) > (selectedCustomer.creditLimit || 0);
  }, [selectedCustomer, priceType, totals.total]);

  // Submit checkout order
  const handleCheckout = () => {
    if (cart.length === 0) {
      setErrorMsg(t('Please add at least one product to check out'));
      return;
    }

    // Double check stock validation
    for (const cartItem of cart) {
      const item = stockItems.find(p => p.id === cartItem.productId);
      if (!item) continue;
      const currentStock = getStockQty(item, selectedStoreId);
      if (cartItem.qty > currentStock) {
        setErrorMsg(`${t('Stock changed or insufficient for')} "${item.name}". (${t('Available')}: ${currentStock})`);
        return;
      }
    }

    const maxId = salesOrders.length > 0 ? Math.max(...salesOrders.map(s => s.id)) : 0;
    const newSO: SalesOrder = {
      id: maxId + 1,
      soNumber: `SO-2024-${String(5004 + maxId).padStart(4, '0')}`,
      customerId: selectedCustomerId,
      storeId: selectedStoreId,
      date: new Date().toISOString().split('T')[0],
      priceType: priceType,
      items: cart.map(c => ({
        productId: c.productId,
        qty: c.qty,
        price: c.price,
        cost: c.cost
      })),
      total: totals.total,
      profit: totals.profit,
      status: 'Completed'
    };

    // Subtract stock quantities
    const updatedStockItems = stockItems.map(p => {
      const cartItem = cart.find(c => c.productId === p.id);
      if (cartItem) {
        const nextStockObj = { ...p.stock };
        nextStockObj[selectedStoreId] = Math.max(0, (nextStockObj[selectedStoreId] || 0) - cartItem.qty);
        return { ...p, stock: nextStockObj };
      }
      return p;
    });

    // Update customer outstanding balance if Wholesale pricing mode is used
    const updatedCustomers = customers.map(c => {
      if (c.id === selectedCustomerId) {
        return {
          ...c,
          balance: (c.balance || 0) + (priceType === 'Wholesale' ? totals.total : 0)
        };
      }
      return c;
    });

    saveAllData({
      salesOrders: [newSO, ...salesOrders],
      stockItems: updatedStockItems,
      customers: updatedCustomers
    });

    logAction('POS Checkout', `Created checkout invoice: ${newSO.soNumber} for customer ${selectedCustomer?.name || 'Unknown'}`);
    setCompletedOrder(newSO);
  };

  if (!isOpen) return null;

  if (completedOrder) {
    const cust = customers.find(c => c.id === completedOrder.customerId);
    const storeObj = stores.find(s => s.id === completedOrder.storeId);

    // Retrieve customizable company branding details from localStorage
    const companyName = localStorage.getItem('tradecore_receipt_company_name') || storeObj?.name || 'Singida Grain Millers Ltd';
    const companyBranch = localStorage.getItem('tradecore_receipt_company_branch') || storeObj?.location || 'Central Depot, Singida-Dodoma Rd';
    const companyPhone = localStorage.getItem('tradecore_receipt_company_phone') || storeObj?.phone || '+255 26 250 1234';
    const customLogo = localStorage.getItem('tradecore_receipt_custom_logo');

    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
          {/* Success Title Header */}
          <div className="px-5 py-4 border-b flex items-center justify-between bg-emerald-600 text-white no-print">
            <span className="font-bold flex items-center gap-2 text-sm">
              <CheckCircle className="w-5 h-5 text-white animate-bounce" /> {t('Transaction Success')}
            </span>
            <button onClick={() => { setCompletedOrder(null); setCart([]); onClose(); }} className="p-1 hover:bg-emerald-700 rounded text-emerald-100 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Printable Receipt Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-white font-mono text-xs text-gray-800 space-y-4 print-container">
            <div className="text-center space-y-1">
              {customLogo && (
                <div className="flex justify-center mb-2.5">
                  <img src={customLogo} alt="Logo" className="w-12 h-12 object-contain rounded-lg border border-gray-100 p-0.5" />
                </div>
              )}
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">{companyName}</h2>
              <p className="text-[10px] text-gray-500">{companyBranch}</p>
              {companyPhone && <p className="text-[10px] text-gray-500">Tel: {companyPhone}</p>}
              <div className="border-b border-dashed border-gray-300 my-2"></div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-900">SALES RECEIPT</h3>
              <div className="border-b border-dashed border-gray-300 my-2"></div>
            </div>

            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>BILL NO:</span>
                <span className="font-bold">{completedOrder.soNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>DATE:</span>
                <span>{completedOrder.date}</span>
              </div>
              <div className="flex justify-between">
                <span>CUSTOMER:</span>
                <span className="uppercase">{cust?.name || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span>PRICING TYPE:</span>
                <span className="font-bold uppercase text-red-600">{completedOrder.priceType}</span>
              </div>
            </div>

            <div className="border-b border-dashed border-gray-300 my-2"></div>

            {/* Receipt Items */}
            <table className="w-full text-left text-[11px] font-mono">
              <thead>
                <tr className="border-b border-dashed border-gray-300 text-gray-900 font-bold">
                  <th className="pb-1">ITEM</th>
                  <th className="pb-1 text-center">QTY</th>
                  <th className="pb-1 text-right">PRICE</th>
                  <th className="pb-1 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-gray-200">
                {completedOrder.items.map((item, idx) => {
                  const product = stockItems.find(p => p.id === item.productId);
                  return (
                    <tr key={idx} className="text-gray-700">
                      <td className="py-1.5 max-w-[140px] truncate">{product?.name || `Product #${item.productId}`}</td>
                      <td className="py-1.5 text-center">{item.qty} {product?.unit || 'Package'}</td>
                      <td className="py-1.5 text-right">{formatMoney(item.price, settings.currency, settings.exchangeRate)}</td>
                      <td className="py-1.5 text-right font-bold text-gray-900">{formatMoney(item.price * item.qty, settings.currency, settings.exchangeRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="border-b border-dashed border-gray-300 my-2"></div>

            <div className="space-y-1.5 text-xs font-bold text-gray-900">
              <div className="flex justify-between">
                <span>SUBTOTAL</span>
                <span>{formatMoney(completedOrder.total, settings.currency, settings.exchangeRate)}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-dashed border-gray-300 pt-1.5">
                <span>TOTAL AMOUNT</span>
                <span className="text-brand">{formatMoney(completedOrder.total, settings.currency, settings.exchangeRate)}</span>
              </div>
            </div>

            <div className="border-b border-dashed border-gray-300 my-3"></div>

            <div className="text-center text-[10px] text-gray-500 space-y-1">
              <p className="font-bold uppercase tracking-wider text-gray-700">THANK YOU FOR YOUR PATRONAGE!</p>
              <p>Powered by TradeCore ERP</p>
              <p className="text-[8px] mt-2">Reprint Secure • Digital Audit Logged</p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 bg-gray-50 border-t flex gap-2 no-print">
            <button
              onClick={() => {
                handlePrintWithFallback((title, desc) => {
                  setConfirmModal({
                    isOpen: true,
                    title: t(title),
                    description: t(desc),
                    onConfirm: () => {}
                  });
                });
              }}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print Receipt
            </button>
            <button
              onClick={() => { setCompletedOrder(null); setCart([]); onClose(); }}
              className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs uppercase tracking-wider"
            >
              Done / New Sale
            </button>
          </div>
        </div>
        
        <ConfirmActionModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          description={confirmModal.description}
          confirmText={t('Got it')}
          cancelText={t('Close')}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-900 text-white">
          <span className="font-bold flex items-center gap-2 text-sm">
            <ShoppingBag className="w-5 h-5 text-brand" /> POS Terminal - Active Checkout
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Tab Swapper */}
        <div className="flex border-b md:hidden bg-gray-50 flex-shrink-0">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 py-3 text-center text-xs font-bold border-b-2 transition-all ${
              activeTab === 'catalog' ? 'border-brand text-brand bg-white' : 'border-transparent text-gray-500'
            }`}
          >
            {t('Catalog')}
          </button>
          <button
            onClick={() => setActiveTab('cart')}
            className={`flex-1 py-3 text-center text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'cart' ? 'border-brand text-brand bg-white' : 'border-transparent text-gray-500'
            }`}
          >
            {t('Cart & Checkout')}
            {cart.length > 0 && (
              <span className="bg-brand text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {cart.reduce((sum, item) => sum + item.qty, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Content Container Split Screen */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Panel: Catalog / Products Selector */}
          <div className={`w-full md:w-3/5 p-4 border-r overflow-y-auto flex flex-col space-y-4 ${activeTab === 'catalog' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* Search and Pricing Mode Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('Search product...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-xs outline-none focus:border-brand"
                />
              </div>

              {/* Pricing mode selection toggle */}
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => handlePriceTypeChange('Retail')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    priceType === 'Retail' ? 'bg-brand text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t('Retail Price')}
                </button>
                <button
                  onClick={() => handlePriceTypeChange('Wholesale')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    priceType === 'Wholesale' ? 'bg-amber-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t('Wholesale Price')}
                </button>
              </div>
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2 text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Product Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1">
              {filteredProducts.map(item => {
                const stockQty = getStockQty(item, selectedStoreId);
                const currentPrice = getProductPrice(item);
                const isOutOfStock = stockQty <= 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => !isOutOfStock && handleAddToCart(item)}
                    className={`border rounded-xl p-3 flex flex-col justify-between transition text-left cursor-pointer ${
                      isOutOfStock
                        ? 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed'
                        : 'bg-white hover:border-brand hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-bold text-gray-900 text-xs line-clamp-1">{item.name}</span>
                        <span className="text-[9px] font-bold text-gray-400 font-mono flex-shrink-0">{item.code}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold block">{item.category}</span>
                    </div>

                    <div className="mt-3 pt-2 border-t flex items-center justify-between">
                      <span className="text-xs font-bold text-brand">
                        {formatMoney(currentPrice, settings.currency, settings.exchangeRate)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isOutOfStock ? 'bg-red-100 text-red-600' : stockQty <= item.lowStockQty ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {stockQty} {t('in stock')}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-8 text-center text-gray-400 font-bold text-xs">
                  {t('No records found')}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Active Cart & Billing */}
          <div className={`w-full md:w-2/5 bg-gray-50/50 p-4 overflow-y-auto flex flex-col justify-between border-t md:border-t-0 ${activeTab === 'cart' ? 'flex' : 'hidden md:flex'}`}>
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <span className="font-bold text-gray-800 text-xs tracking-wider uppercase block">{t('Billing & Cart')}</span>

              {/* Store & Customer Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">{t('Store')}</label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => {
                      setSelectedStoreId(Number(e.target.value));
                      setCart([]); // Clear cart to avoid stock mixups when changing stores
                      setErrorMsg(null);
                    }}
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-semibold outline-none"
                  >
                    {activeStores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">{t('Customer')}</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-semibold outline-none"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Customer Financial Summary */}
              {selectedCustomer && (
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-brand" /> {t('Credit Limit')}
                    </span>
                    <span className="font-bold text-gray-900">
                      {formatMoney(selectedCustomer.creditLimit || 0, settings.currency, settings.exchangeRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">{t('Current Outstanding')}</span>
                    <span className="font-bold text-amber-700">
                      {formatMoney(selectedCustomer.balance || 0, settings.currency, settings.exchangeRate)}
                    </span>
                  </div>
                  {priceType === 'Wholesale' && (
                    <div className="pt-2 border-t flex justify-between items-center text-[10px] font-semibold">
                      <span className="text-gray-400">Projected Post-Sale Balance</span>
                      <span className={`font-bold ${isCreditExceeded ? 'text-red-600' : 'text-green-600'}`}>
                        {formatMoney((selectedCustomer.balance || 0) + totals.total, settings.currency, settings.exchangeRate)}
                      </span>
                    </div>
                  )}
                  {isCreditExceeded && (
                    <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded border border-red-100 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{t('Customer credit limit exceeded! Proceed with caution.')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Cart List Items Container */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
                {cart.map(c => {
                  const product = stockItems.find(p => p.id === c.productId);
                  if (!product) return null;

                  return (
                    <div key={c.productId} className="bg-white border rounded-xl p-3 flex justify-between items-center gap-3">
                      <div className="flex-1">
                        <span className="font-bold text-gray-900 text-xs block">{product.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {formatMoney(c.price, settings.currency, settings.exchangeRate)} / unit
                        </span>
                      </div>

                      {/* Qty adjustment buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateQty(c.productId, c.qty - 1)}
                          className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-gray-900 min-w-4 text-center">{c.qty}</span>
                        <button
                          onClick={() => handleUpdateQty(c.productId, c.qty + 1)}
                          className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right min-w-20">
                        <span className="font-bold text-gray-900 text-xs block">
                          {formatMoney(c.price * c.qty, settings.currency, settings.exchangeRate)}
                        </span>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(c.productId)}
                        className="text-gray-400 hover:text-brand"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {cart.length === 0 && (
                  <div className="h-full flex flex-col justify-center items-center text-gray-400 text-center font-bold text-xs space-y-2 py-8">
                    <ShoppingBag className="w-8 h-8 text-gray-300" />
                    <span>{t('Active Cart is Empty')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grand Summary Calculations and Submission */}
            <div className="pt-4 border-t space-y-3 mt-4 bg-gray-50">
              <div className="space-y-1.5 text-xs font-semibold">
                <div className="flex justify-between text-gray-500">
                  <span>{t('Items Count')}</span>
                  <span>{cart.reduce((sum, item) => sum + item.qty, 0)} units</span>
                </div>
                <div className="flex justify-between text-gray-900 font-bold text-sm">
                  <span>{t('GRAND TOTAL')}</span>
                  <span className="text-brand">
                    {formatMoney(totals.total, settings.currency, settings.exchangeRate)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-green-600 font-bold">
                  <span>Estimated Profit</span>
                  <span>+{formatMoney(totals.profit, settings.currency, settings.exchangeRate)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 border rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-100 bg-white"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={cart.length === 0}
                  className="flex-2 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Complete Checkout')}
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
