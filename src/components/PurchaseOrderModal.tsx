import React, { useState, useMemo } from 'react';
import { Supplier, StockItem, PurchaseOrder, Store, Settings, POItem } from '../types';
import { X, Search, Plus, Minus, Trash2, FileText, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { toast } from '../utils/toast';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  stockItems: StockItem[];
  purchaseOrders: PurchaseOrder[];
  currentStoreId: number | null;
  stores: Store[];
  saveAllData: (updatedFields: Partial<{
    purchaseOrders: PurchaseOrder[];
    stockItems: StockItem[];
    auditTrails: any[];
  }>) => void;
  logAction: (action: string, details: string) => void;
  settings: Settings;
  t: (text: string) => string;
}

export default function PurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
  stockItems,
  purchaseOrders,
  currentStoreId,
  stores,
  saveAllData,
  logAction,
  settings,
  t
}: PurchaseOrderModalProps) {
  const activeStores = stores.filter(s => !s.isDeleted);
  const [selectedStoreId, setSelectedStoreId] = useState<number>(currentStoreId || activeStores[0]?.id || 1);

  const activeSuppliersForStore = useMemo(() => {
    return suppliers.filter(s => !s.storeId || s.storeId === selectedStoreId);
  }, [suppliers, selectedStoreId]);

  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(activeSuppliersForStore[0]?.id || 1);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedStoreId(currentStoreId || activeStores[0]?.id || 1);
      setPoItems([]);
      setSearchQuery('');
      setErrorMsg(null);
      setReceiveImmediately(false);
    }
  }, [isOpen, currentStoreId]);

  React.useEffect(() => {
    if (activeSuppliersForStore.length > 0 && !activeSuppliersForStore.some(s => s.id === selectedSupplierId)) {
      setSelectedSupplierId(activeSuppliersForStore[0].id);
    }
  }, [activeSuppliersForStore, selectedSupplierId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [poItems, setPoItems] = useState<{ productId: number; qty: number; cost: number; discount?: number; unitType?: 'main' | 'sub'; subUnitName?: string }[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<string>('Paid in Full');
  const [receiveImmediately, setReceiveImmediately] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    return stockItems.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const codeMatch = item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const categoryMatch = item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return nameMatch || codeMatch || categoryMatch;
    });
  }, [stockItems, searchQuery]);

  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  // Add Item to PO
  const handleAddItem = (item: StockItem) => {
    setErrorMsg(null);
    const existingIndex = poItems.findIndex(p => p.productId === item.id && (p.unitType || 'main') === 'main');

    if (existingIndex > -1) {
      const updated = [...poItems];
      updated[existingIndex].qty += 10; // Default increment by 10
      setPoItems(updated);
    } else {
      setPoItems([
        ...poItems,
        {
          productId: item.id,
          qty: 50, // Default batch size
          cost: item.purchasePrice,
          discount: 0,
          unitType: 'main',
          subUnitName: item.subUnitName
        }
      ]);
    }
  };

  // Toggle unitType
  const handleUpdateUnitType = (productId: number, currentUnitType: 'main' | 'sub', newUnitType: 'main' | 'sub') => {
    const item = stockItems.find(p => p.id === productId);
    if (!item) return;

    setPoItems(poItems.map(p => {
      if (p.productId === productId && (p.unitType || 'main') === currentUnitType) {
        let nextCost = p.cost;
        if (newUnitType === 'sub') {
          // If changing to sub-unit, divide purchasePrice by conversion
          nextCost = item.purchasePrice / (item.subUnitConversion || 1);
        } else {
          nextCost = item.purchasePrice;
        }
        return {
          ...p,
          unitType: newUnitType,
          cost: nextCost
        };
      }
      return p;
    }));
  };

  // Update PO line Qty
  const handleUpdateQty = (productId: number, unitType: 'main' | 'sub', qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(productId, unitType);
      return;
    }
    setPoItems(poItems.map(p => {
      if (p.productId === productId && (p.unitType || 'main') === unitType) {
        return { ...p, qty };
      }
      return p;
    }));
  };

  // Update PO line Cost Price
  const handleUpdateCost = (productId: number, unitType: 'main' | 'sub', cost: number) => {
    if (cost < 0) return;
    setPoItems(poItems.map(p => {
      if (p.productId === productId && (p.unitType || 'main') === unitType) {
        return { ...p, cost };
      }
      return p;
    }));
  };

  // Update PO line Discount
  const handleUpdateDiscount = (productId: number, unitType: 'main' | 'sub', discount: number) => {
    if (discount < 0) return;
    setPoItems(poItems.map(p => {
      if (p.productId === productId && (p.unitType || 'main') === unitType) {
        return { ...p, discount };
      }
      return p;
    }));
  };

  // Remove item from PO
  const handleRemoveItem = (productId: number, unitType: 'main' | 'sub' = 'main') => {
    setPoItems(poItems.filter(p => !(p.productId === productId && (p.unitType || 'main') === unitType)));
  };

  // Grand Total calculation
  const grandTotal = useMemo(() => {
    return poItems.reduce((sum, item) => sum + ((item.cost - (item.discount || 0)) * item.qty), 0);
  }, [poItems]);

  // Submit purchase order
  const handleSubmit = () => {
    if (poItems.length === 0) {
      setErrorMsg(t('Please add at least one product to the purchase order'));
      return;
    }

    const maxId = purchaseOrders.length > 0 ? Math.max(...purchaseOrders.map(p => p.id)) : 0;
    const poNum = `PO-2024-${String(1003 + maxId).padStart(4, '0')}`;

    const newPO: PurchaseOrder = {
      id: maxId + 1,
      poNumber: poNum,
      supplierId: selectedSupplierId,
      storeId: selectedStoreId,
      date: new Date().toISOString().split('T')[0],
      status: receiveImmediately ? 'Received' : 'Pending',
      items: poItems.map(p => ({
        productId: p.productId,
        qty: p.qty,
        cost: p.cost,
        discount: p.discount || 0,
        unitType: p.unitType || 'main',
        subUnitName: p.unitType === 'sub' ? p.subUnitName : undefined
      })),
      total: grandTotal,
      paymentTerms
    };

    let updatedStockItems = [...stockItems];
    if (receiveImmediately) {
      // Add items immediately to store inventory, taking conversion into account
      updatedStockItems = stockItems.map(p => {
        const matchingPOItems = poItems.filter(item => item.productId === p.id);
        if (matchingPOItems.length > 0) {
          const nextStockObj = { ...p.stock };
          let totalAddedBaseUnits = 0;
          matchingPOItems.forEach(poItem => {
            const conversion = (poItem.unitType || 'main') === 'main' && p.useSubUnitPricing ? (p.subUnitConversion || 1) : 1;
            totalAddedBaseUnits += poItem.qty * conversion;
          });
          nextStockObj[selectedStoreId] = (nextStockObj[selectedStoreId] || 0) + totalAddedBaseUnits;
          return { ...p, stock: nextStockObj };
        }
        return p;
      });
    }

    saveAllData({
      purchaseOrders: [newPO, ...purchaseOrders],
      stockItems: updatedStockItems
    });

    logAction('Created PO', `${receiveImmediately ? 'Logged and Received' : 'Drafted'} Purchase Order ${poNum} for supplier ${selectedSupplier?.name || 'Unknown'}`);
    
    if (receiveImmediately) {
      toast.success(`${t('Purchase Order registered and inventory values successfully added!')} Code: ${poNum}`);
    } else {
      toast.success(`${t('Purchase Invoice drafted successfully!')} Code: ${poNum}. ${t('Click \'Receive\' inside the Purchase tab to transfer items to stock.')}`);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 text-gray-900">
          <span className="font-bold flex items-center gap-2 text-sm">
            <FileText className="w-5 h-5 text-brand" /> Purchase Order Invoice logging Terminal
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Container Split Screen */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Panel: Catalog / Products Selector */}
          <div className="w-full md:w-3/5 p-4 border-r overflow-y-auto flex flex-col space-y-4">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('Search product...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-xs outline-none focus:border-brand"
              />
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2 text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1">
              {filteredProducts.map(item => {
                const stockQty = item.stock[selectedStoreId] || 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="border rounded-xl p-3 flex flex-col justify-between bg-white hover:border-brand hover:shadow-sm transition text-left cursor-pointer"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-bold text-gray-900 text-xs line-clamp-1">{item.name}</span>
                        <span className="text-[9px] font-bold text-gray-400 font-mono flex-shrink-0">{item.code}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold block">{item.category}</span>
                    </div>

                    <div className="mt-3 pt-2 border-t flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">{t('Est. Cost')}</span>
                        <span className="text-xs font-bold text-gray-900">
                          {formatMoney(item.purchasePrice, settings.currency, settings.exchangeRate)}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
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

          {/* Right Panel: Purchase Invoice Items & Logging Details */}
          <div className="w-full md:w-2/5 bg-gray-50/50 p-4 overflow-y-auto flex flex-col justify-between border-t md:border-t-0">
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <span className="font-bold text-gray-800 text-xs tracking-wider uppercase block">{t('Invoice Layout')}</span>

              {/* Supplier & Store Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">{t('Store')}</label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => {
                      setSelectedStoreId(Number(e.target.value));
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
                  <label className="text-[10px] font-bold text-gray-500 uppercase">{t('Supplier')}</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-semibold outline-none"
                  >
                    {activeSuppliersForStore.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Terms Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">{t('Payment Terms')}</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-semibold outline-none"
                >
                  <option value="Paid in Full">{t('Paid in Full')}</option>
                  <option value="Credit / On Account">{t('Credit / On Account')}</option>
                  <option value="Partial Deposit">{t('Partial Deposit')}</option>
                </select>
              </div>

              {/* Instant Stock Receipt Toggle Option */}
              <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-gray-900 block">{t('Immediate Stock Inbound')}</span>
                  <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                    Check-in values directly to available stock now, bypassing the 'Pending' receipt step.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveImmediately}
                    onChange={(e) => setReceiveImmediately(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>

              {/* PO Items List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
                {poItems.map(p => {
                  const product = stockItems.find(item => item.id === p.productId);
                  if (!product) return null;

                  const unitType = p.unitType || 'main';
                  const unitLabel = unitType === 'sub' ? (product.subUnitName || t('pcs')) : (product.unit || t('Package'));

                  return (
                    <div key={`${p.productId}-${unitType}`} className="bg-white border rounded-xl p-3 space-y-2.5">
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <span className="font-bold text-gray-900 text-xs block">{product.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-gray-400 font-bold uppercase">{product.category}</span>
                            <span className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-bold uppercase">
                              {unitLabel}
                            </span>
                          </div>

                          {/* Unit Selection Toggle */}
                          {product.useSubUnitPricing && (
                            <div className="flex gap-1 mt-2 bg-gray-100 p-0.5 rounded-lg w-fit">
                              <button
                                type="button"
                                onClick={() => handleUpdateUnitType(p.productId, unitType, 'main')}
                                className={`px-2 py-1 rounded text-[9px] font-extrabold uppercase transition-all ${
                                  unitType === 'main'
                                    ? 'bg-brand text-white shadow-xs'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
                                }`}
                              >
                                📦 {product.unit || t('Bulk')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateUnitType(p.productId, unitType, 'sub')}
                                className={`px-2 py-1 rounded text-[9px] font-extrabold uppercase transition-all ${
                                  unitType === 'sub'
                                    ? 'bg-brand text-white shadow-xs'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
                                }`}
                              >
                                ⚖️ {product.subUnitName || t('Sub-unit')}
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveItem(p.productId, unitType)}
                          className="text-gray-400 hover:text-brand p-1 rounded-lg hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Quantity')}</label>
                          <div className="flex items-center border rounded-lg">
                            <button
                              onClick={() => handleUpdateQty(p.productId, unitType, p.qty - 10)}
                              className="px-1.5 py-1 bg-gray-50 hover:bg-gray-100 border-r text-gray-600 font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={p.qty}
                              onChange={(e) => handleUpdateQty(p.productId, unitType, parseInt(e.target.value) || 0)}
                              className="w-full text-center text-xs font-bold font-mono outline-none py-1 bg-transparent"
                            />
                            <button
                              onClick={() => handleUpdateQty(p.productId, unitType, p.qty + 10)}
                              className="px-1.5 py-1 bg-gray-50 hover:bg-gray-100 border-l text-gray-600 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Unit Cost')} ({settings.currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={settings.currency === 'TZS' ? Math.round(p.cost * settings.exchangeRate) : p.cost}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const normalizedVal = settings.currency === 'TZS' ? val / settings.exchangeRate : val;
                              handleUpdateCost(p.productId, unitType, normalizedVal);
                            }}
                            className="w-full border rounded-lg px-2 py-1 text-xs font-bold font-mono text-gray-900 outline-none focus:border-brand"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase">{t('Unit Disc')} ({settings.currency})</label>
                          <input
                            type="number"
                            step="any"
                            value={settings.currency === 'TZS' ? Math.round((p.discount || 0) * settings.exchangeRate) : (p.discount || 0)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const normalizedVal = settings.currency === 'TZS' ? val / settings.exchangeRate : val;
                              handleUpdateDiscount(p.productId, unitType, normalizedVal);
                            }}
                            className="w-full border rounded-lg px-2 py-1 text-xs font-bold font-mono text-gray-900 outline-none focus:border-brand"
                          />
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-gray-400 font-bold">
                        {t('Line Total')}: <span className="text-gray-900 font-extrabold">{formatMoney((p.cost - (p.discount || 0)) * p.qty, settings.currency, settings.exchangeRate)}</span>
                      </div>
                    </div>
                  );
                })}

                {poItems.length === 0 && (
                  <div className="h-full flex flex-col justify-center items-center text-gray-400 text-center font-bold text-xs space-y-2 py-8">
                    <FileText className="w-8 h-8 text-gray-300" />
                    <span>{t('No products added to invoice')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grand Summary & Actions */}
            <div className="pt-4 border-t space-y-3 mt-4 bg-gray-50">
              <div className="space-y-1.5 text-xs font-semibold">
                <div className="flex justify-between text-gray-500">
                  <span>{t('Total Items')}</span>
                  <span>{poItems.reduce((sum, item) => sum + item.qty, 0)} units</span>
                </div>
                <div className="flex justify-between text-gray-900 font-bold text-sm">
                  <span>{t('GRAND TOTAL')}</span>
                  <span className="text-brand">
                    {formatMoney(grandTotal, settings.currency, settings.exchangeRate)}
                  </span>
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
                  onClick={handleSubmit}
                  disabled={poItems.length === 0}
                  className="flex-2 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {receiveImmediately ? t('Log & Receive Stock') : t('Save Purchase Order')}
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
