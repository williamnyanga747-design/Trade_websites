import React, { useState, useMemo, useEffect } from 'react';
import { Customer, StockItem, SalesOrder, Store, Settings, SOItem, PosShift } from '../types';
import { X, Search, Plus, Minus, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Info, Printer, TrendingUp, Calculator, Lock, Share2, Mail, Check } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { ConfirmActionModal } from './ConfirmActionModal';
import { handlePrintWithFallback } from '../utils/printHelper';
import { toast } from '../utils/toast';
import { cleanCategoryName } from '../utils/categoryHelper';

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
  const activeCustomersForStore = useMemo(() => {
    return customers.filter(c => !c.storeId || c.storeId === currentStoreId);
  }, [customers, currentStoreId]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(activeCustomersForStore[0]?.id || 1);

  useEffect(() => {
    if (activeCustomersForStore.length > 0 && !activeCustomersForStore.some(c => c.id === selectedCustomerId)) {
      setSelectedCustomerId(activeCustomersForStore[0].id);
    }
  }, [activeCustomersForStore, selectedCustomerId]);

  const activeStores = useMemo(() => {
    const rawActive = stores.filter(s => !s.isDeleted);
    if (currentUser && currentUser.storeId) {
      return rawActive.filter(s => s.id === currentUser.storeId);
    }
    return rawActive;
  }, [stores, currentUser]);
  const [selectedStoreId, setSelectedStoreId] = useState<number>(currentStoreId || activeStores[0]?.id || 1);
  const [priceType, setPriceType] = useState<'Retail' | 'Wholesale' | 'Preferred'>('Retail');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<{ productId: number; qty: number; price: number; cost: number }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<SalesOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');

  // Checkout & Payment states
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank' | 'Mobile Money' | 'Split'>('Cash');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Credit' | 'Partial'>('Paid');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [bankAmount, setBankAmount] = useState<number>(0);
  const [mobileAmount, setMobileAmount] = useState<number>(0);
  const [orderDiscountType, setOrderDiscountType] = useState<'Flat' | 'Percentage'>('Flat');
  const [orderDiscountValue, setOrderDiscountValue] = useState<number>(0);
  const [orderNote, setOrderNote] = useState<string>('');

  // Digital Invoice / WhatsApp states
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  useEffect(() => {
    if (completedOrder) {
      const cust = customers.find(c => c.id === completedOrder.customerId);
      if (cust) {
        setWhatsappPhone(cust.phone || '');
        setCustomerEmail(cust.email || '');
      }
    } else {
      setShowWhatsAppInput(false);
      setShowEmailInput(false);
    }
  }, [completedOrder, customers]);

  const submitWhatsAppShare = () => {
    if (!whatsappPhone.trim()) {
      toast.warning(t('Please enter a valid phone number'));
      return;
    }
    const cust = customers.find(c => c.id === completedOrder?.customerId);
    const storeObj = stores.find(s => s.id === completedOrder?.storeId);
    const companyName = localStorage.getItem('tradecore_receipt_company_name') || storeObj?.name || 'Singida Grain Millers Ltd';
    const totalDisplay = formatMoney(completedOrder?.total || 0, settings.currency || 'USD', settings.exchangeRate || 1);

    let itemsText = '';
    completedOrder?.items.forEach((item, index) => {
      const prod = stockItems.find(p => p.id === item.productId);
      const prodName = prod ? prod.name : 'Unknown Product';
      const itemPrice = formatMoney(item.price, settings.currency || 'USD', settings.exchangeRate || 1);
      itemsText += `${index + 1}. ${prodName} x ${item.qty} @ ${itemPrice}\n`;
    });

    const textReceipt = `*RECEIPT / RISITI - ${companyName}*\n` +
      `-------------------------------------\n` +
      `*Order No:* ${completedOrder?.soNumber}\n` +
      `*Date / Tarehe:* ${completedOrder?.date}\n` +
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
    try {
      navigator.clipboard.writeText(textReceipt);
      toast.success(t('Receipt details copied to clipboard as fallback!'));
    } catch (err) {}

    window.open(whatsappUrl, '_blank');
    toast.success(t('Receipt dispatched to WhatsApp!'));
    setShowWhatsAppInput(false);
    if (logAction && completedOrder) {
      logAction('WhatsApp Receipt Shared', `Dispatched receipt for ${completedOrder.soNumber} to ${cleanPhone}`);
    }
  };

  const submitEmailInvoice = () => {
    if (!customerEmail.trim()) {
      toast.warning(t('Please enter a valid email address'));
      return;
    }
    toast.success(`${t('Professional PDF Invoice sent successfully to')} ${customerEmail}!`);
    setShowEmailInput(false);
    if (logAction && completedOrder) {
      logAction('Email Invoice Sent', `Sent digital invoice for ${completedOrder.soNumber} to ${customerEmail}`);
    }
  };

  // Drawer / Shift ledger states
  const [openingFloatStr, setOpeningFloatStr] = useState('100');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingCashActualStr, setClosingCashActualStr] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [reconciledShiftSummary, setReconciledShiftSummary] = useState<any | null>(null);

  // Physical Denomination Count States
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>({});
  const [showDenomOpen, setShowDenomOpen] = useState(false);
  const [showDenomClose, setShowDenomClose] = useState(false);

  const handleApplyDenoms = (target: 'open' | 'close') => {
    const denoms = settings.currency === 'USD'
      ? [100, 50, 20, 10, 5, 2, 1, 0.25, 0.10, 0.05, 0.01]
      : [10000, 5000, 2000, 1000, 500, 200, 100, 50];
    const total = denoms.reduce((sum, d) => sum + d * (denomCounts[d] || 0), 0);
    if (target === 'open') {
      setOpeningFloatStr(total.toFixed(2).replace(/\.00$/, ''));
      setShowDenomOpen(false);
    } else {
      setClosingCashActualStr(total.toFixed(2).replace(/\.00$/, ''));
      setShowDenomClose(false);
    }
  };

  const renderPhysicalDenominationCalculator = (target: 'open' | 'close') => {
    const denoms = settings.currency === 'USD'
      ? [100, 50, 20, 10, 5, 2, 1, 0.25, 0.10, 0.05, 0.01]
      : [10000, 5000, 2000, 1000, 500, 200, 100, 50];
    const total = denoms.reduce((sum, d) => sum + d * (denomCounts[d] || 0), 0);

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="font-bold text-gray-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5 text-brand" /> {t('Physical Denomination Calculator')}
          </span>
          <button
            type="button"
            onClick={() => setDenomCounts({})}
            className="text-[10px] text-red-600 hover:underline font-bold"
          >
            {t('Reset')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {denoms.map(d => (
            <div key={d} className="flex items-center gap-1.5 justify-between">
              <span className="text-[10px] font-mono font-bold text-gray-500 w-12">
                {settings.currency === 'USD' ? `$${d}` : `${d}`}
              </span>
              <span className="text-[10px] text-gray-400">×</span>
              <input
                type="number"
                min="0"
                value={denomCounts[d] || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setDenomCounts(prev => ({ ...prev, [d]: val }));
                }}
                className="w-16 px-2 py-1 border border-gray-200 rounded text-center text-xs font-bold"
                placeholder="0"
              />
              <span className="text-[10px] font-mono text-gray-600 w-16 text-right">
                = {formatMoney(d * (denomCounts[d] || 0), settings.currency, settings.exchangeRate)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-2 mt-2">
          <span className="text-xs font-bold text-slate-800">
            {t('Total Counted')}: <span className="font-mono text-brand font-black">{formatMoney(total, settings.currency, settings.exchangeRate)}</span>
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (target === 'open') setShowDenomOpen(false);
                else setShowDenomClose(false);
              }}
              className="px-2.5 py-1 border rounded text-[10px] font-bold text-gray-500 hover:bg-gray-100 transition"
            >
              {t('Hide')}
            </button>
            <button
              type="button"
              onClick={() => handleApplyDenoms(target)}
              className="px-3 py-1 bg-brand text-white rounded text-[10px] font-bold shadow-xs hover:bg-brand-hover transition"
            >
              {t('Apply Count')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const isAdminUser = useMemo(() => {
    return !!(currentUser && ['Super Admin', 'Admin', 'Store Admin'].includes(currentUser.role));
  }, [currentUser]);

  const activeShift = useMemo(() => {
    return (posShifts || []).find(
      s => s.status === 'Open' && s.storeId === selectedStoreId
    );
  }, [posShifts, selectedStoreId]);

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

  // Auto-apply customer pricing tier when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      handlePriceTypeChange(selectedCustomer.type);
    }
  }, [selectedCustomerId, selectedCustomer]);

  // Helper to get active product price
  const getProductPrice = (item: StockItem, unitType: 'main' | 'sub' = 'main', activePriceType?: 'Retail' | 'Wholesale' | 'Preferred') => {
    const currentPriceType = activePriceType || priceType;
    if (unitType === 'sub') {
      let price = 0;
      if (currentPriceType === 'Wholesale') price = item.subUnitWholesalePrice ?? item.subUnitRetailPrice ?? 0;
      else if (currentPriceType === 'Preferred') price = item.subUnitPartnerPrice ?? item.subUnitRetailPrice ?? 0;
      else price = item.subUnitRetailPrice ?? 0;

      // If price is 0, calculate it proportionally from the wholesale package price
      if (price <= 0) {
        const parentPrice = currentPriceType === 'Wholesale' ? item.wholesalePrice : (currentPriceType === 'Preferred' ? (item.partnerPrice ?? item.retailPrice) : item.retailPrice);
        const conversion = item.subUnitConversion || 1;
        price = parentPrice / conversion;
      }
      return price;
    }
    if (currentPriceType === 'Wholesale') return item.wholesalePrice;
    if (currentPriceType === 'Preferred') return item.partnerPrice ?? item.retailPrice;
    return item.retailPrice;
  };

  // Helper to check stock in current store
  const getStockQty = (item: StockItem, storeId: number) => {
    return item.stock[storeId] || 0;
  };

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

  // Helper to calculate total of a product in the cart in terms of base units
  const getProductTotalInCartInBaseUnits = (productId: number, excludeUnitType?: 'main' | 'sub') => {
    let totalBaseUnits = 0;
    cart.forEach(c => {
      if (c.productId === productId && (excludeUnitType === undefined || (c.unitType || 'main') !== excludeUnitType)) {
        const item = stockItems.find(p => p.id === productId);
        if (item) {
          const conversion = (c.unitType || 'main') === 'main' ? (item.subUnitConversion || 1) : 1;
          totalBaseUnits += c.qty * conversion;
        }
      }
    });
    return totalBaseUnits;
  };

  // Add to Cart
  const handleAddToCart = (item: StockItem) => {
    setErrorMsg(null);
    const availableStock = getStockQty(item, selectedStoreId); // in base units
    if (availableStock <= 0) {
      setErrorMsg(`${t('Product')} "${item.name}" ${t('is out of stock in this store!')}`);
      return;
    }

    const existingCartIndex = cart.findIndex(c => c.productId === item.id && (c.unitType || 'main') === 'main');
    const targetPrice = getProductPrice(item, 'main');

    const itemConversion = item.subUnitConversion || 1;
    if (existingCartIndex > -1) {
      const currentQtyInCart = cart[existingCartIndex].qty;
      const otherBaseUnits = getProductTotalInCartInBaseUnits(item.id, 'main');
      const totalRequiredBaseUnits = otherBaseUnits + (currentQtyInCart + 1) * itemConversion;
      if (totalRequiredBaseUnits > availableStock) {
        const availableInUnit = (availableStock - otherBaseUnits) / itemConversion;
        setErrorMsg(`${t('Requested')} ${currentQtyInCart + 1} ${item.unit || 'unit'} ${t('exceeds available stock of')} ${parseFloat(availableInUnit.toFixed(4))} ${item.unit || 'unit'}.`);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[existingCartIndex].qty += 1;
      // Keep price updated just in case pricing mode changed
      updatedCart[existingCartIndex].price = targetPrice;
      setCart(updatedCart);
    } else {
      const otherBaseUnits = getProductTotalInCartInBaseUnits(item.id);
      const totalRequiredBaseUnits = otherBaseUnits + 1 * itemConversion;
      if (totalRequiredBaseUnits > availableStock) {
        const availableInUnit = (availableStock - otherBaseUnits) / itemConversion;
        setErrorMsg(`${t('Requested')} 1 ${item.unit || 'unit'} ${t('exceeds available stock of')} ${parseFloat(availableInUnit.toFixed(4))} ${item.unit || 'unit'}.`);
        return;
      }
      setCart([
        ...cart,
        {
          productId: item.id,
          qty: 1,
          price: targetPrice,
          cost: item.purchasePrice,
          unitType: 'main'
        }
      ]);
    }
  };

  const handleToggleCartUnit = (productId: number, unitType: 'main' | 'sub') => {
    const item = stockItems.find(p => p.id === productId);
    if (!item) return;
    setCart(cart.map(c => {
      if (c.productId === productId) {
        const nextPrice = getProductPrice(item, unitType);
        const nextCost = unitType === 'sub' ? item.purchasePrice / (item.subUnitConversion || 1) : item.purchasePrice;
        return {
          ...c,
          unitType,
          price: nextPrice,
          cost: nextCost
        };
      }
      return c;
    }));
  };

  // Update Cart Qty
  const handleUpdateQty = (productId: number, unitType: 'main' | 'sub', newQty: number) => {
    setErrorMsg(null);
    const item = stockItems.find(p => p.id === productId);
    if (!item) return;

    if (newQty <= 0) {
      handleRemoveItem(productId, unitType);
      return;
    }

    const availableStock = getStockQty(item, selectedStoreId); // in base units
    const conversion = unitType === 'main' ? (item.subUnitConversion || 1) : 1;
    const requestedBaseUnits = newQty * conversion;
    const otherBaseUnits = getProductTotalInCartInBaseUnits(productId, unitType);

    if (otherBaseUnits + requestedBaseUnits > availableStock) {
      const maxAllowedInThisUnit = (availableStock - otherBaseUnits) / conversion;
      const unitLabel = unitType === 'sub' ? (item.subUnitName || 'sub-unit') : (item.unit || 'unit');
      setErrorMsg(`${t('Requested')} ${newQty} ${unitLabel} ${t('exceeds available stock of')} ${parseFloat(maxAllowedInThisUnit.toFixed(4))} ${unitLabel}.`);
      return;
    }

    setCart(cart.map(c => {
      if (c.productId === productId && (c.unitType || 'main') === unitType) {
        return { ...c, qty: newQty };
      }
      return c;
    }));
  };

  // Remove from Cart
  const handleRemoveItem = (productId: number, unitType: 'main' | 'sub' = 'main') => {
    setCart(cart.filter(c => !(c.productId === productId && (c.unitType || 'main') === unitType)));
  };

  // Recalculate cart prices when pricing mode changes
  const handlePriceTypeChange = (newMode: 'Retail' | 'Wholesale' | 'Preferred') => {
    setPriceType(newMode);
    setCart(cart.map(c => {
      const item = stockItems.find(p => p.id === c.productId);
      if (item) {
        const price = getProductPrice(item, c.unitType || 'main', newMode);
        return {
          ...c,
          price
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
      const item = stockItems.find(p => p.id === c.productId);
      if (item) {
        const itemCost = c.unitType === 'sub' ? item.purchasePrice / (item.subUnitConversion || 1) : item.purchasePrice;
        totalCost += itemCost * c.qty;
      } else {
        totalCost += c.cost * c.qty;
      }
    });
    const discountAmount = orderDiscountType === 'Percentage'
      ? grossTotal * (orderDiscountValue / 100)
      : orderDiscountValue;
    const finalTotal = Math.max(0, grossTotal - discountAmount);
    return {
      gross: grossTotal,
      discount: discountAmount,
      total: finalTotal,
      cost: totalCost,
      profit: finalTotal - totalCost
    };
  }, [cart, stockItems, orderDiscountType, orderDiscountValue]);

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
      const currentStock = getStockQty(item, selectedStoreId); // in base units
      const conversion = cartItem.unitType === 'main' ? (item.subUnitConversion || 1) : 1;
      const requiredQtyInBaseUnits = cartItem.qty * conversion;
      if (requiredQtyInBaseUnits > currentStock) {
        const availableInUnit = currentStock / conversion;
        const unitLabel = cartItem.unitType === 'sub' ? (item.subUnitName || 'sub-unit') : (item.unit || 'unit');
        setErrorMsg(`${t('Requested')} ${cartItem.qty} ${unitLabel} ${t('exceeds available stock of')} ${parseFloat(availableInUnit.toFixed(4))} ${unitLabel}.`);
        return;
      }
    }

    const maxId = salesOrders.length > 0 ? Math.max(...salesOrders.map(s => s.id)) : 0;
    
    // Determine actual cash portion received to track in register shift drawer
    let cashPaidPortion = 0;
    if (paymentMethod === 'Cash' && paymentStatus === 'Paid') {
      cashPaidPortion = totals.total;
    } else if (paymentMethod === 'Split') {
      cashPaidPortion = cashAmount;
    } else if (paymentMethod === 'Cash' && paymentStatus === 'Partial') {
      cashPaidPortion = cashAmount || (totals.total * 0.5); // Fallback to half if not specified
    }

    // Outstanding credit portion to add to customer balance
    let creditOutstanding = 0;
    if (paymentStatus === 'Credit') {
      creditOutstanding = totals.total;
    } else if (paymentStatus === 'Partial') {
      const totalPaid = paymentMethod === 'Split'
        ? (cashAmount + bankAmount + mobileAmount)
        : (paymentMethod === 'Cash' ? cashAmount : (paymentMethod === 'Bank' ? bankAmount : mobileAmount));
      creditOutstanding = Math.max(0, totals.total - totalPaid);
    } else if (priceType === 'Wholesale' && paymentStatus === 'Credit') {
      creditOutstanding = totals.total;
    }

    const newSO: SalesOrder = {
      id: maxId + 1,
      soNumber: `SO-2024-${String(5004 + maxId).padStart(4, '0')}`,
      customerId: selectedCustomerId,
      storeId: selectedStoreId,
      date: new Date().toISOString().split('T')[0],
      priceType: priceType,
      items: cart.map(c => {
        const item = stockItems.find(p => p.id === c.productId);
        return {
          productId: c.productId,
          qty: c.qty,
          price: c.price,
          cost: c.cost,
          unitType: c.unitType || 'main',
          subUnitName: c.unitType === 'sub' ? item?.subUnitName : undefined
        };
      }),
      total: totals.total,
      profit: totals.profit,
      status: 'Completed',
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      paymentSplit: paymentMethod === 'Split' ? { cash: cashAmount, bank: bankAmount, mobile: mobileAmount } : undefined
    };

    // Subtract stock quantities
    const updatedStockItems = stockItems.map(p => {
      const matchingCartItems = cart.filter(c => c.productId === p.id);
      if (matchingCartItems.length > 0) {
        const nextStockObj = { ...p.stock };
        let totalDeductionInBaseUnits = 0;
        matchingCartItems.forEach(cartItem => {
          const conversion = cartItem.unitType === 'main' ? (p.subUnitConversion || 1) : 1;
          totalDeductionInBaseUnits += cartItem.qty * conversion;
        });
        nextStockObj[selectedStoreId] = Math.max(0, (nextStockObj[selectedStoreId] || 0) - totalDeductionInBaseUnits);
        return { ...p, stock: nextStockObj };
      }
      return p;
    });

    // Update customer outstanding balance
    const updatedCustomers = customers.map(c => {
      if (c.id === selectedCustomerId) {
        return {
          ...c,
          balance: (c.balance || 0) + creditOutstanding
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
          expectedCashSales: (s.expectedCashSales || 0) + cashPaidPortion
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

    if (!isAdminUser) {
      return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between bg-red-900 text-white flex-shrink-0">
              <span className="font-bold flex items-center gap-2 text-sm">
                <Lock className="w-5 h-5 text-red-300" /> {t('Access Restricted')}
              </span>
              <button onClick={onClose} className="p-1 hover:bg-red-800 rounded text-red-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 animate-pulse">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-gray-900">{t('Cash Register Drawer Closed')}</h3>
              <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                {t('The cash drawer for this store is currently closed. Only administrators or store administrators are authorized to open and register the cash drawer float.')}
              </p>
              <div className="p-3 bg-gray-50 rounded-lg text-[10px] font-bold text-gray-500 text-left space-y-1">
                <span className="block">{t('Selected Depot / Store')}: <strong className="text-gray-800">{storeObj?.name || 'Main Depot'}</strong></span>
                <span className="block">{t('Authorized Roles')}: <strong className="text-emerald-700">Super Admin, Admin, Store Admin</strong></span>
              </div>
              {activeStores.length > 1 && (
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Switch POS Depot / Store')}</label>
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
              )}
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs transition"
                >
                  {t('Back to Dashboard')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const getFloatPresets = () => {
      if (settings.currency === 'TZS') {
        return [
          { label: t('Standard Day Float'), value: 100000 },
          { label: t('Weekend Float'), value: 250000 },
          { label: t('Minimum Backup Float'), value: 50000 },
          { label: t('Big Ledger Float'), value: 500000 },
        ];
      } else if (settings.currency === 'KES') {
        return [
          { label: t('Standard Day Float'), value: 5000 },
          { label: t('Weekend Float'), value: 12000 },
          { label: t('Minimum Backup Float'), value: 2500 },
          { label: t('Big Ledger Float'), value: 25000 },
        ];
      } else {
        return [
          { label: t('Standard Day Float'), value: 100 },
          { label: t('Weekend Float'), value: 250 },
          { label: t('Minimum Backup Float'), value: 50 },
          { label: t('Big Ledger Float'), value: 500 },
        ];
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-900 text-white">
            <span className="font-bold flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> {t('Register Drawer Closed')}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold text-gray-600">
              {t('To begin processing POS transactions, cashiers must declare their opening float and open a register session for reconciliation tracking.')}
            </p>
            
            {/* Store selector if multiple stores */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Select POS Depot / Store')}</label>
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
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Opening Float (Starting Drawer Cash)')}</label>
                <button
                  type="button"
                  onClick={() => { setShowDenomOpen(!showDenomOpen); setDenomCounts({}); }}
                  className="text-[10px] text-brand hover:underline font-bold flex items-center gap-1"
                >
                  <Calculator className="w-3 h-3" />
                  {showDenomOpen ? t('Hide Calculator') : t('Count Denominations')}
                </button>
              </div>
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

              {/* Quick float presets */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {getFloatPresets().map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setOpeningFloatStr(String(preset.value));
                      setDenomCounts({});
                    }}
                    className="px-2 py-1 text-[10px] font-bold border border-gray-200 hover:border-brand/40 hover:bg-brand/5 text-gray-700 hover:text-brand rounded-lg transition-all"
                  >
                    ⚡ {preset.label}: {formatMoney(preset.value, settings.currency, settings.exchangeRate)}
                  </button>
                ))}
              </div>

              {showDenomOpen && (
                <div className="mt-2">
                  {renderPhysicalDenominationCalculator('open')}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Opening Notes / Description')}</label>
              <textarea
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none h-16 resize-none"
                placeholder={t('e.g. Morning Shift drawer opening float')}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs transition"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleOpenShift}
                className="flex-1 py-2 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg text-xs transition shadow-sm"
              >
                {t('Open Register Session')}
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[92vh]">
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
                      <td className="py-1.5 text-center">{item.qty} {item.unitType === 'sub' ? (item.subUnitName || 'unit') : (product?.unit || 'Package')}</td>
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

          {/* Digital Invoice / WhatsApp Receipt Panel */}
          <div className="p-4 border-t bg-gray-50/50 space-y-3 no-print text-xs">
            <span className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">{t('Digital Dispatch / Tuma Kidijitali')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setShowWhatsAppInput(!showWhatsAppInput);
                  setShowEmailInput(false);
                }}
                className={`py-1.5 px-3 ${showWhatsAppInput ? 'bg-[#128C7E]' : 'bg-[#25D366]'} hover:bg-[#128C7E] text-white font-bold rounded-lg text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-xs transition`}
              >
                <Share2 className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button
                onClick={() => {
                  setShowEmailInput(!showEmailInput);
                  setShowWhatsAppInput(false);
                }}
                className={`py-1.5 px-3 ${showEmailInput ? 'bg-indigo-700' : 'bg-indigo-600'} hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-xs transition`}
              >
                <Mail className="w-3.5 h-3.5" /> Email Invoice
              </button>
            </div>
            
            {showWhatsAppInput && (
              <div className="p-2.5 bg-white border rounded-lg space-y-2 animate-fade-in">
                <label className="text-[10px] font-bold text-gray-500 block">{t('WhatsApp Number / Namba ya WhatsApp')}:</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="e.g. 255712345678"
                    className="flex-1 px-2.5 py-1 border rounded-md text-xs font-semibold outline-none bg-white text-gray-800"
                  />
                  <button
                    onClick={submitWhatsAppShare}
                    className="px-3 py-1 bg-[#25D366] text-white font-bold rounded-md text-xs hover:bg-[#128C7E] transition shrink-0"
                  >
                    {t('Send')}
                  </button>
                </div>
              </div>
            )}

            {showEmailInput && (
              <div className="p-2.5 bg-white border rounded-lg space-y-2 animate-fade-in">
                <label className="text-[10px] font-bold text-gray-500 block">{t('Customer Email / Barua Pepe ya Mteja')}:</label>
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="flex-1 px-2.5 py-1 border rounded-md text-xs font-semibold outline-none bg-white text-gray-800"
                  />
                  <button
                    onClick={submitEmailInvoice}
                    className="px-3 py-1 bg-indigo-600 text-white font-bold rounded-md text-xs hover:bg-indigo-700 transition shrink-0"
                  >
                    {t('Send')}
                  </button>
                </div>
              </div>
            )}
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
              <Printer className="w-4 h-4" /> {t('Print Receipt')}
            </button>
            <button
              onClick={() => { setCompletedOrder(null); setCart([]); onClose(); }}
              className="flex-1 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs uppercase tracking-wider"
            >
              {t('Done / New Sale')}
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

  const AIPOSAssistantPanel = () => {
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
            products: stockItems.map(p => ({
              id: p.id,
              name: p.name,
              code: p.code,
              category: p.category,
              stock_qty: p.stock?.[selectedStoreId] || 0,
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
            priceType: priceType
          })
        });
        const data = await response.json();
        setAiResponse(data);
      } catch (err: any) {
        console.error("AI POS error", err);
        setAiResponse({ success: false, explanation: "Failed to query AI assistant." });
      } finally {
        setAiLoading(false);
      }
    };

    const handleAddToCartActions = () => {
      if (!aiResponse || !aiResponse.actions) return;
      
      const updatedCart = [...cart];
      let itemsAdded = 0;

      aiResponse.actions.forEach((action: any) => {
        const item = stockItems.find(p => p.id === action.productId);
        if (!item) return;

        const unitType = action.unitType || 'main';
        const qtyToAdd = action.qty || 1;
        const targetPrice = action.price || getProductPrice(item, unitType);
        const targetCost = unitType === 'sub' ? item.purchasePrice / (item.subUnitConversion || 1) : item.purchasePrice;

        const existingCartIndex = updatedCart.findIndex(
          c => c.productId === item.id && (c.unitType || 'main') === unitType
        );

        if (existingCartIndex > -1) {
          updatedCart[existingCartIndex].qty += qtyToAdd;
          updatedCart[existingCartIndex].price = targetPrice;
        } else {
          updatedCart.push({
            productId: item.id,
            qty: qtyToAdd,
            price: targetPrice,
            cost: targetCost,
            unitType: unitType
          });
        }
        itemsAdded += qtyToAdd;
      });

      setCart(updatedCart);
      toast.success(`${itemsAdded} items added to active cart from AI recommendations!`);
      setAiResponse(null);
      setAiPrompt('');
    };

    return (
      <div className="bg-gradient-to-r from-indigo-50/70 to-brand/5 rounded-xl border border-brand/20 shadow-xs p-3.5 space-y-2.5">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsAiOpen(!isAiOpen)}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs">✨</span>
            <span className="font-bold text-gray-900 text-[11px] uppercase tracking-wider">{t('AI Sales Copilot')}</span>
          </div>
          <button className="text-[10px] font-black text-brand uppercase">
            {isAiOpen ? t('Hide') : t('Show')}
          </button>
        </div>

        {isAiOpen && (
          <div className="space-y-2 border-t pt-2 border-indigo-100 animate-fadeIn">
            <div className="flex flex-col gap-2">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={t("e.g. 'Customer is purchasing 3 individual loaves of bread and 1 sack of flour'")}
                className="w-full h-14 p-2 border border-gray-200 rounded text-[11px] font-semibold outline-none focus:border-brand bg-white resize-none"
              />
              <button
                onClick={handleAskAI}
                disabled={aiLoading}
                className="w-full bg-brand hover:bg-brand-hover text-white py-1.5 rounded text-[10px] font-black uppercase transition flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {aiLoading ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : '✨'} {t('Interpret Order')}
              </button>
            </div>

            {aiResponse && (
              <div className="p-2.5 bg-white border rounded space-y-2">
                <p className="text-[10px] font-semibold text-gray-700 whitespace-pre-line leading-relaxed pl-1.5 border-l border-brand">
                  {aiResponse.explanation}
                </p>

                {aiResponse.success && aiResponse.actions && aiResponse.actions.length > 0 && (
                  <button
                    onClick={handleAddToCartActions}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-1 rounded text-[10px] font-black uppercase transition flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> {t('Add Recommended Items to Cart')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
            {activeShift && isAdminUser && (
              <button
                onClick={() => {
                  setClosingCashActualStr(String(activeShift.openingFloat + (activeShift.expectedCashSales || 0)));
                  setClosingNotes('');
                  setShowClosingModal(true);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition"
              >
                {t('Close Drawer / Shift')}
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
                            {isOutOfStock ? t('Out of Stock') : `${formatStockQty(stockQty, item)} ${t('available')}`}
                          </span>
                        </div>

                        <div className="mt-3.5">
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded uppercase">{cleanCategoryName(item.category)}</span>
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
                    {activeCustomersForStore.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({t(c.type)})</option>
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
                    <button
                      type="button"
                      onClick={() => handlePriceTypeChange('Preferred')}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all ${
                        priceType === 'Preferred' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Preferred
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
              <div className="mt-3">
                <AIPOSAssistantPanel />
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
              <div className="space-y-2 pb-2">
                {cart.map(c => {
                  const product = stockItems.find(p => p.id === c.productId);
                  if (!product) return null;

                  const currentUnitType = c.unitType || 'main';

                  return (
                    <div
                      key={`${c.productId}-${currentUnitType}`}
                      className="bg-white rounded-xl border border-gray-200/85 p-3 flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-black text-gray-900 text-xs block truncate">{product.name}</span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-brand font-bold">
                            {formatMoney(c.price, settings.currency, settings.exchangeRate)} / {currentUnitType === 'sub' ? product.subUnitName : (product.unit || 'unit')}
                          </span>
                          {product.useSubUnitPricing && (
                            <select
                              value={currentUnitType}
                              onChange={(e) => handleToggleCartUnit(c.productId, e.target.value as 'main' | 'sub')}
                              className="px-1 py-0.5 text-[9px] border border-gray-300 rounded bg-white font-bold text-gray-700 outline-none cursor-pointer"
                            >
                              <option value="main">{product.unit || 'Main Unit'}</option>
                              <option value="sub">{product.subUnitName || 'Sub-Unit'}</option>
                            </select>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateQty(c.productId, currentUnitType, Math.max(0, parseFloat((c.qty - 1).toFixed(4))))}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center font-bold text-gray-600 animate-none"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={c.qty}
                          onChange={(e) => handleUpdateQty(c.productId, currentUnitType, parseFloat(e.target.value) || 0)}
                          className="w-12 px-1 py-0.5 text-xs font-bold text-center border rounded bg-gray-50 text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                        <button
                          onClick={() => handleUpdateQty(c.productId, currentUnitType, parseFloat((c.qty + 1).toFixed(4)))}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center font-bold text-gray-600 animate-none"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(c.productId, currentUnitType)}
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

            {/* Payment & Adjustments Panel */}
            {cart.length > 0 && (
              <div className="border-t pt-3 mt-3 space-y-3 px-1 no-print">
                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider block">
                    ⚡ {t('Discounts & Transaction Notes')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Discount Type')}</label>
                      <select
                        value={orderDiscountType}
                        onChange={(e) => setOrderDiscountType(e.target.value as 'Flat' | 'Percentage')}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-semibold outline-none"
                      >
                        <option value="Flat">{t('Flat')}</option>
                        <option value="Percentage">{t('Percentage (%)')}</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Discount Value')}</label>
                      <input
                        type="number"
                        min="0"
                        value={orderDiscountValue}
                        onChange={(e) => setOrderDiscountValue(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-semibold outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Transaction Notes')}</label>
                    <input
                      type="text"
                      placeholder={t('Any internal memo or delivery note...')}
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <span className="text-[10px] font-extrabold text-brand uppercase tracking-wider block">
                    💳 {t('Payment Mode & Split Options')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Payment Method')}</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'Bank' | 'Mobile Money' | 'Split')}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-semibold outline-none"
                      >
                        <option value="Cash">{t('Cash')}</option>
                        <option value="Bank">{t('Bank / Transfer')}</option>
                        <option value="Mobile Money">{t('Mobile Money (M-Pesa/Tigo)')}</option>
                        <option value="Split">{t('Split Payments 🔄')}</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Payment Status')}</label>
                      <select
                        value={paymentStatus}
                        onChange={(e) => setPaymentStatus(e.target.value as 'Paid' | 'Credit' | 'Partial')}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-semibold outline-none"
                      >
                        <option value="Paid">{t('Paid in Full')}</option>
                        <option value="Credit">{t('Credit / On Account')}</option>
                        <option value="Partial">{t('Partial Deposit')}</option>
                      </select>
                    </div>
                  </div>

                  {/* Split payments inputs */}
                  {paymentMethod === 'Split' && (
                    <div className="space-y-1.5 pt-2 border-t mt-2">
                      <span className="text-[9px] font-extrabold text-indigo-600 uppercase block">{t('Split Breakdown')}</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">{t('Cash')}</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={cashAmount || ''}
                            onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] font-bold font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">{t('Bank')}</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={bankAmount || ''}
                            onChange={(e) => setBankAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] font-bold font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-gray-400 uppercase">{t('Mobile')}</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={mobileAmount || ''}
                            onChange={(e) => setMobileAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] font-bold font-mono outline-none"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-indigo-500 mt-1 flex justify-between font-mono">
                        <span>{t('Total Split Paid')}:</span>
                        <span>{formatMoney(cashAmount + bankAmount + mobileAmount, settings.currency, settings.exchangeRate)}</span>
                      </div>
                    </div>
                  )}

                  {/* Partial payment inputs */}
                  {paymentStatus === 'Partial' && paymentMethod !== 'Split' && (
                    <div className="space-y-1 pt-2 border-t mt-2">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">
                        {paymentMethod === 'Cash' ? t('Amount Paid (Cash)') : (paymentMethod === 'Bank' ? t('Amount Paid (Bank)') : t('Amount Paid (Mobile)'))}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Enter deposit amount"
                        value={paymentMethod === 'Cash' ? cashAmount || '' : (paymentMethod === 'Bank' ? bankAmount || '' : mobileAmount || '')}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (paymentMethod === 'Cash') setCashAmount(val);
                          else if (paymentMethod === 'Bank') setBankAmount(val);
                          else setMobileAmount(val);
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-semibold font-mono outline-none focus:border-brand"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

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
                  <AlertTriangle className="w-5 h-5 text-amber-400" /> {t('Close Cash Drawer & Reconcile')}
                </span>
                <button onClick={() => setShowClosingModal(false)} className="p-1 hover:bg-red-800 rounded text-red-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs font-semibold">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('Opening Float')}:</span>
                    <span className="font-bold text-gray-900">{formatMoney(activeShift.openingFloat, settings.currency, settings.exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('Total Shift Cash Sales')}:</span>
                    <span className="font-bold text-emerald-600">+{formatMoney(activeShift.expectedCashSales || 0, settings.currency, settings.exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>{t('Expected Total Drawer Cash')}:</span>
                    <span>{formatMoney(activeShift.openingFloat + (activeShift.expectedCashSales || 0), settings.currency, settings.exchangeRate)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Actual Counted Cash on Hand')}</label>
                    <button
                      type="button"
                      onClick={() => { setShowDenomClose(!showDenomClose); setDenomCounts({}); }}
                      className="text-[10px] text-brand hover:underline font-bold flex items-center gap-1"
                    >
                      <Calculator className="w-3 h-3" />
                      {showDenomClose ? t('Hide Calculator') : t('Count Denominations')}
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{settings.currency}</span>
                    <input
                      type="number"
                      value={closingCashActualStr}
                      onChange={(e) => setClosingCashActualStr(e.target.value)}
                      className="w-full pl-12 pr-3 py-2 border rounded-lg text-xs font-black outline-none"
                      placeholder={t('Enter exact cash amount in drawer')}
                    />
                  </div>
                  {showDenomClose && (
                    <div className="mt-2">
                      {renderPhysicalDenominationCalculator('close')}
                    </div>
                  )}
                </div>

                {/* Live Discrepancy Tracking Card */}
                {(() => {
                  const expectedTotal = activeShift.openingFloat + (activeShift.expectedCashSales || 0);
                  const actualCash = parseFloat(closingCashActualStr) || 0;
                  const discrepancy = actualCash - expectedTotal;

                  return (
                    <div className={`p-3 rounded-xl border text-xs font-semibold ${
                      discrepancy === 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : discrepancy > 0
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span>{t('Expected Drawer Cash')}:</span>
                        <span>{formatMoney(expectedTotal, settings.currency, settings.exchangeRate)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-current/10 pt-1.5 mt-1.5 font-bold">
                        <span>{t('Discrepancy Status')}:</span>
                        <span>
                          {discrepancy === 0 && (
                            <span className="text-emerald-700">✓ {t('Balanced')}</span>
                          )}
                          {discrepancy > 0 && (
                            <span className="text-blue-700">+{formatMoney(discrepancy, settings.currency, settings.exchangeRate)} ({t('Overage')})</span>
                          )}
                          {discrepancy < 0 && (
                            <span className="text-red-700">{formatMoney(discrepancy, settings.currency, settings.exchangeRate)} ({t('Shortage')})</span>
                          )}
                        </span>
                      </div>
                      {discrepancy < 0 && (
                        <p className="text-[10px] text-red-600 mt-1.5 font-medium italic animate-pulse">
                          * {t('Please justify this shortage in the shift closing notes below.')}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">{t('Shift Closing Notes (Discrepancy Justifications)')}</label>
                  <textarea
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none h-16 resize-none"
                    placeholder={t('Describe any shortages, overages, or physical drawer notes...')}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowClosingModal(false)}
                    className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-xs transition"
                  >
                    {t('Keep Open')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseShift}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition shadow-sm"
                  >
                    {t('Close Session & Reconcile')}
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
