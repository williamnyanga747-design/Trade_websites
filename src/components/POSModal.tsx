import React, { useState, useMemo } from 'react';
import { Customer, StockItem, SalesOrder, Store, Settings, SOItem, PosShift } from '../types';
import { X, Search, Plus, Minus, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Info, Printer, TrendingUp } from 'lucide-react';
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
    posShifts: PosShift[];
  }>) => void;
  logAction: (action: string, details: string) => void;
  settings: Settings;
  t: (text: string) => string;
  currentUser: any;
  posShifts: PosShift[];
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
  t,
  currentUser,
  posShifts = []
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

  // Drawer / Shift ledger states
  const [openingFloatStr, setOpeningFloatStr] = useState('100');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingCashActualStr, setClosingCashActualStr] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [reconciledShiftSummary, setReconciledShiftSummary] = useState<any | null>(null);

  const activeShift = useMemo(() => {
    return (posShifts || []).find(
      s => s.status === 'Open' && s.userId === (currentUser?.id || 1) && s.storeId === selectedStoreId
    );
  }, [posShifts, currentUser, selectedStoreId]);

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

    if (!activeShift) {
      setErrorMsg(t('Please open register drawer session before checkout'));
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

    // Update POS active shift statistics
    const updatedShifts = posShifts.map(s => {
      if (s.id === activeShift.id) {
        return {
          ...s,
          salesOrderIds: [...(s.salesOrderIds || []), newSO.id],
          expectedCashSales: (s.expectedCashSales || 0) + newSO.total
        };
      }
      return s;
    });

    saveAllData({
      salesOrders: [newSO, ...salesOrders],
      stockItems: updatedStockItems,
      customers: updatedCustomers,
      posShifts: updatedShifts
    });

    logAction('POS Checkout', `Created checkout invoice: ${newSO.soNumber} for customer ${selectedCustomer?.name || 'Unknown'}`);
    setCompletedOrder(newSO);
  };

  // Open POS register shift
  const handleOpenShift = () => {
    const floatAmount = parseFloat(openingFloatStr) || 0;
    const newShift: PosShift = {
      id: posShifts.length > 0 ? Math.max(...posShifts.map(s => s.id)) + 1 : 1,
      userId: currentUser?.id || 1,
      username: currentUser?.name || 'Cashier',
      storeId: selectedStoreId,
      openTime: new Date().toISOString(),
      openingFloat: floatAmount,
      expectedCashSales: 0,
      salesOrderIds: [],
      status: 'Open'
    };

    saveAllData({
      posShifts: [newShift, ...posShifts]
    });

    logAction('Open POS Shift', `Opened register shift for cashier ${currentUser?.name || 'Cashier'} with float amount ${floatAmount}`);
  };

  // Close POS register shift
  const handleCloseShift = () => {
    if (!activeShift) return;
    const actualCash = parseFloat(closingCashActualStr) || 0;
    const expectedTotal = activeShift.openingFloat + (activeShift.expectedCashSales || 0);
    const variance = actualCash - expectedTotal;

    const updatedShifts = posShifts.map(s => {
      if (s.id === activeShift.id) {
        return {
          ...s,
          closeTime: new Date().toISOString(),
          closingCashActual: actualCash,
          variance: variance,
          notes: closingNotes,
          status: 'Closed' as const
        };
      }
      return s;
    });

    const reconciledShift = {
      ...activeShift,
      closeTime: new Date().toISOString(),
      closingCashActual: actualCash,
      variance,
      notes: closingNotes,
      status: 'Closed' as const
    };

    saveAllData({
      posShifts: updatedShifts
    });

    logAction('Close POS Shift', `Closed register shift with variance: ${variance}`);
    setReconciledShiftSummary(reconciledShift);
    setShowClosingModal(false);
  };

  if (!isOpen) return null;

  // Render finalized shift summary slip
  if (reconciledShiftSummary) {
    const storeObj = stores.find(s => s.id === reconciledShiftSummary.storeId);
    const expectedTotal = reconciledShiftSummary.openingFloat + (reconciledShiftSummary.expectedCashSales || 0);
    const varAmount = reconciledShiftSummary.variance || 0;
    
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
          <div className="px-5 py-4 border-b flex items-center justify-between bg-emerald-700 text-white">
            <span className="font-bold flex items-center gap-2 text-sm">
              <CheckCircle className="w-5 h-5 text-emerald-400" /> Shift Reconciled Successfully
            </span>
            <button 
              onClick={() => {
                setReconciledShiftSummary(null);
                onClose();
              }} 
              className="p-1 hover:bg-emerald-800 rounded text-emerald-200 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]" id="shift-summary-print-area">
            <div className="text-center pb-4 border-b border-dashed">
              <h4 className="font-black text-gray-900 text-base">SINGIDA TRADECORE ERP</h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Drawer Session Close Out Ledger</p>
              <p className="text-xs text-gray-500 font-semibold mt-1">Store Depot: {storeObj?.name || 'Store'}</p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Cashier Session</span>
                <span className="font-bold text-gray-900">{reconciledShiftSummary.username}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Opened At</span>
                <span className="font-mono text-gray-900">{new Date(reconciledShiftSummary.openTime).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Closed At</span>
                <span className="font-mono text-gray-900">{new Date(reconciledShiftSummary.closeTime).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Opening Float</span>
                <span className="font-bold text-gray-900">{formatMoney(reconciledShiftSummary.openingFloat, settings.currency, settings.exchangeRate)}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Expected Register Cash Sales</span>
                <span className="font-bold text-emerald-700">+{formatMoney(reconciledShiftSummary.expectedCashSales || 0, settings.currency, settings.exchangeRate)}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2">
                <span className="text-gray-400">Theoretical Drawer Cash (Expected)</span>
                <span className="font-bold text-gray-900">{formatMoney(expectedTotal, settings.currency, settings.exchangeRate)}</span>
              </div>
              <div className="flex justify-between font-semibold border-b pb-2 bg-slate-50 p-2 rounded">
                <span className="text-slate-500 font-bold">Actual Counted Cash (Declared)</span>
                <span className="font-black text-slate-900">{formatMoney(reconciledShiftSummary.closingCashActual || 0, settings.currency, settings.exchangeRate)}</span>
              </div>
              
              <div className={`flex justify-between font-black border-b pb-2 p-2 rounded ${
                varAmount < 0 ? 'bg-red-50 text-red-700' : varAmount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
              }`}>
                <span>Cash Reconciliation Variance</span>
                <span>{varAmount > 0 ? '+' : ''}{formatMoney(varAmount, settings.currency, settings.exchangeRate)}</span>
              </div>
              
              {reconciledShiftSummary.notes && (
                <div className="bg-gray-50 p-2.5 rounded text-[11px] font-semibold text-gray-600">
                  <span className="font-bold block text-gray-400 uppercase tracking-wider text-[9px] mb-1">Cashier Closing Remarks:</span>
                  {reconciledShiftSummary.notes}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 no-print">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print Audit Slip
              </button>
              <button
                onClick={() => {
                  setReconciledShiftSummary(null);
                  onClose();
                }}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition"
              >
                Complete Shift
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render open register screen if session is closed
  if (!activeShift) {
    const storeObj = stores.find(s => s.id === selectedStoreId);
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-900 text-white">
            <span className="font-bold flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Register Drawer Closed
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold text-gray-600">
              To begin processing POS transactions, cashiers must declare their opening float and open a register session for reconciliation tracking.
            </p>
            
            {/* Store selector if multiple stores */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Select POS Depot / Store</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none bg-white"
              >
                {activeStores.map(s => (
                  <option key={s.id} value={s.id}>{s.name} - {s.location}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Opening Float (Starting Drawer Cash)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{settings.currency}</span>
                <input
                  type="number"
                  value={openingFloatStr}
                  onChange={(e) => setOpeningFloatStr(e.target.value)}
                  className="w-full pl-12 pr-3 py-2 border rounded-lg text-xs font-black outline-none"
                  placeholder="e.g. 100"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Opening Notes / Description</label>
              <textarea
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none h-16 resize-none"
                placeholder="e.g. Morning Shift drawer opening float"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenShift}
                className="flex-1 py-2 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg text-xs transition shadow-sm"
              >
                Open Register Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-900 text-white flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="font-bold flex items-center gap-2 text-sm">
              <ShoppingBag className="w-5 h-5 text-brand" /> POS Terminal - Active Checkout
            </span>
            {activeShift && (
              <span className="text-[10px] bg-brand/20 border border-brand/50 text-brand px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                Shift: {activeShift.username} | Float: {formatMoney(activeShift.openingFloat, settings.currency, settings.exchangeRate)} | Drawer: {formatMoney(activeShift.openingFloat + (activeShift.expectedCashSales || 0), settings.currency, settings.exchangeRate)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeShift && (
              <button
                onClick={() => {
                  setClosingCashActualStr(String(activeShift.openingFloat + (activeShift.expectedCashSales || 0)));
                  setClosingNotes('');
                  setShowClosingModal(true);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition"
              >
                Close Drawer / Shift
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
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
          <div className={`flex-1 overflow-hidden flex flex-col p-5 border-r ${activeTab !== 'catalog' ? 'hidden md:flex' : 'flex'}`}>
            {/* Catalog search/filters header */}
            <div className="space-y-3 mb-4 flex-shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('Search products by name, category, or code...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{t('Store Depot')}:</span>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => {
                      setSelectedStoreId(Number(e.target.value));
                      setCart([]); // Clear cart when store changes
                    }}
                    className="bg-white border px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-700 outline-none"
                  >
                    {activeStores.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border border-red-100">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Catalog Items Grid */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-4">
                {filteredProducts.map(item => {
                  const stockQty = getStockQty(item, selectedStoreId);
                  const currentPrice = getProductPrice(item);
                  const isOutOfStock = stockQty <= 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isOutOfStock && handleAddToCart(item)}
                      className={`group border border-gray-200/80 hover:border-brand rounded-xl overflow-hidden cursor-pointer transition-all duration-150 flex flex-col justify-between bg-white ${
                        isOutOfStock ? 'opacity-55 cursor-not-allowed bg-gray-50' : 'hover:shadow-sm'
                      }`}
                    >
                      <div className="p-3">
                        <div className="h-28 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center relative">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-2xl font-black text-gray-200">ERP</span>
                          )}
                          <span className={`absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                            isOutOfStock ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
                          }`}>
                            {isOutOfStock ? t('Out of Stock') : `${stockQty} ${t('available')}`}
                          </span>
                        </div>

                        <div className="mt-3.5">
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded uppercase">{item.category}</span>
                          <h4 className="font-black text-gray-900 text-xs mt-1 block truncate">{item.name}</h4>
                          <span className="text-[9px] font-mono text-gray-400 mt-0.5 block tracking-widest">SKU: {item.code}</span>
                        </div>
                      </div>

                      <div className="p-3 border-t bg-gray-50/50 flex items-center justify-between">
                        <span className="text-[13px] font-black text-brand">
                          {formatMoney(currentPrice, settings.currency, settings.exchangeRate)}
                        </span>
                        <button
                          disabled={isOutOfStock}
                          className="bg-brand group-hover:bg-brand-hover text-white p-1 rounded transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <div className="col-span-full py-16 text-center text-gray-400 font-bold text-xs">
                    {t('No registered catalog item match the filters')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Shopping Cart Details & Invoice Summary */}
          <div className={`w-full md:w-96 overflow-hidden flex flex-col p-5 bg-gray-50 flex-shrink-0 border-t md:border-t-0 ${activeTab !== 'cart' ? 'hidden md:flex' : 'flex'}`}>
            <div className="flex-shrink-0 space-y-3.5 mb-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 text-xs uppercase tracking-wider">{t('Cart Summary')}</span>
                <button
                  onClick={() => setCart([])}
                  className="text-[10px] text-gray-400 hover:text-red-600 font-bold"
                >
                  {t('Clear Cart')}
                </button>
              </div>

              {/* Client and pricing selectors */}
              <div className="space-y-2 bg-white p-3.5 rounded-xl border border-gray-200/75">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">{t('Client Client')}</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-md text-xs font-semibold outline-none bg-white text-gray-800"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.type === 'Wholesale' ? `(${t('Wholesale')})` : `(${t('Retail')})`}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{t('Billing Mode')}:</span>
                  <div className="flex bg-gray-100 p-0.5 rounded-md">
                    <button
                      type="button"
                      onClick={() => handlePriceTypeChange('Retail')}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all ${
                        priceType === 'Retail' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Retail
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePriceTypeChange('Wholesale')}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all ${
                        priceType === 'Wholesale' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Wholesale
                    </button>
                  </div>
                </div>

                {selectedCustomer && priceType === 'Wholesale' && (
                  <div className="pt-2 border-t text-[10px] space-y-0.5 font-bold">
                    <div className="flex justify-between">
                      <span className="text-gray-400">CREDIT LIMIT:</span>
                      <span className="text-gray-900">{formatMoney(selectedCustomer.creditLimit, settings.currency, settings.exchangeRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">CURRENT BAL:</span>
                      <span className="text-amber-600">{formatMoney(selectedCustomer.balance, settings.currency, settings.exchangeRate)}</span>
                    </div>
                    {isCreditExceeded && (
                      <div className="bg-red-50 text-red-700 p-1.5 rounded mt-1.5 border border-red-100 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Credit Limit Exceeded!</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
              <div className="space-y-2 pb-2">
                {cart.map(c => {
                  const product = stockItems.find(p => p.id === c.productId);
                  if (!product) return null;

                  return (
                    <div
                      key={c.productId}
                      className="bg-white rounded-xl border border-gray-200/85 p-3 flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-black text-gray-900 text-xs block truncate">{product.name}</span>
                        <span className="text-[10px] text-brand font-bold mt-0.5 block">
                          {formatMoney(c.price, settings.currency, settings.exchangeRate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleUpdateQty(c.productId, c.qty - 1)}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center font-bold text-gray-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-black w-6 text-center text-gray-900">{c.qty}</span>
                        <button
                          onClick={() => handleUpdateQty(c.productId, c.qty + 1)}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center font-bold text-gray-600"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
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
                  disabled={cart.length === 0 || isCreditExceeded}
                  className="flex-2 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Complete Checkout')}
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* Close shift submodal form */}
        {showClosingModal && activeShift && (
          <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b flex items-center justify-between bg-red-900 text-white">
                <span className="font-bold flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-400" /> Close Cash Drawer & Reconcile
                </span>
                <button onClick={() => setShowClosingModal(false)} className="p-1 hover:bg-red-800 rounded text-red-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs font-semibold">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Opening Float:</span>
                    <span className="font-bold text-gray-900">{formatMoney(activeShift.openingFloat, settings.currency, settings.exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Shift Cash Sales:</span>
                    <span className="font-bold text-emerald-600">+{formatMoney(activeShift.expectedCashSales || 0, settings.currency, settings.exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Expected Total Drawer Cash:</span>
                    <span>{formatMoney(activeShift.openingFloat + (activeShift.expectedCashSales || 0), settings.currency, settings.exchangeRate)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Actual Counted Cash on Hand</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{settings.currency}</span>
                    <input
                      type="number"
                      value={closingCashActualStr}
                      onChange={(e) => setClosingCashActualStr(e.target.value)}
                      className="w-full pl-12 pr-3 py-2 border rounded-lg text-xs font-black outline-none"
                      placeholder="Enter exact cash amount in drawer"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Shift Closing Notes (Discrepancy Justifications)</label>
                  <textarea
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none h-16 resize-none"
                    placeholder="Describe any shortages, overages, or physical drawer notes..."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowClosingModal(false)}
                    className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs transition"
                  >
                    Keep Open
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseShift}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition shadow-sm"
                  >
                    Close Session & Reconcile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
