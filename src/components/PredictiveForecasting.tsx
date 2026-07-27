import React, { useState, useMemo } from 'react';
import { TrendingUp, AlertTriangle, ShieldAlert, RefreshCw, Layers, CheckCircle2, PackageCheck, Zap, Sparkles } from 'lucide-react';
import { StockItem, SalesOrder, PosShift, AuditTrail, Store } from '../types';

interface PredictiveForecastingProps {
  stockItems: StockItem[];
  salesOrders: SalesOrder[];
  posShifts?: PosShift[];
  auditLogs?: AuditTrail[];
  stores: Store[];
  currencySymbol?: string;
  onOpenPOModal?: () => void;
}

export const PredictiveForecasting: React.FC<PredictiveForecastingProps> = ({
  stockItems,
  salesOrders,
  posShifts = [],
  auditLogs = [],
  stores,
  currencySymbol = '$',
  onOpenPOModal
}) => {
  const [activeTab, setActiveTab] = useState<'forecasting' | 'fraud_detector'>('forecasting');
  const [leadTimeDays, setLeadTimeDays] = useState<number>(7); // Default 7 days lead time
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');

  const fmt = (val: number) => `${currencySymbol}${val.toFixed(2)}`;

  // 1. Calculate 30-Day Predictive Demand Forecasts
  const forecastData = useMemo(() => {
    // Look back at past 30 days completed sales
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const recentSales = salesOrders.filter(so => so.status === 'Completed' && so.date >= thirtyDaysAgo);

    // Map total quantity sold per product in past 30 days
    const qtySold30Days: Record<number, number> = {};
    recentSales.forEach(so => {
      if (selectedStoreId !== 'all' && so.storeId !== Number(selectedStoreId)) return;
      so.items.forEach(item => {
        qtySold30Days[item.productId] = (qtySold30Days[item.productId] || 0) + item.qty;
      });
    });

    return stockItems.map(item => {
      // Calculate current total stock
      let currentStock = 0;
      if (selectedStoreId === 'all') {
        currentStock = (Object.values(item.stock || {}) as number[]).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
      } else {
        currentStock = item.stock?.[Number(selectedStoreId)] || 0;
      }

      const totalSold = qtySold30Days[item.id] || 0;
      const dailyVelocity = parseFloat((totalSold / 30).toFixed(2)); // avg units / day
      const projected30DayDemand = Math.round(dailyVelocity * 30);

      // Reorder Point = (Daily Sales * Lead Time) + Safety Stock (e.g. 3 days buffer)
      const safetyStock = Math.round(dailyVelocity * 3);
      const reorderPoint = Math.round((dailyVelocity * leadTimeDays) + safetyStock);

      // Estimated Days Until Stockout
      const daysUntilStockout = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : 999;

      // Recommended Reorder Quantity (to cover next 30 days)
      const recommendedReorderQty = Math.max(0, (projected30DayDemand + safetyStock) - currentStock);

      let urgency: 'Urgent Reorder' | 'Reorder Soon' | 'Optimal Stock' = 'Optimal Stock';
      if (currentStock <= reorderPoint || daysUntilStockout <= leadTimeDays) {
        urgency = 'Urgent Reorder';
      } else if (daysUntilStockout <= (leadTimeDays + 7)) {
        urgency = 'Reorder Soon';
      }

      return {
        item,
        currentStock,
        totalSold30Days: totalSold,
        dailyVelocity,
        projected30DayDemand,
        reorderPoint,
        daysUntilStockout,
        recommendedReorderQty,
        urgency
      };
    }).sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [stockItems, salesOrders, selectedStoreId, leadTimeDays]);

  // 2. Fraud & Audit Trail Anomaly Detection Engine
  const anomalies = useMemo(() => {
    const list: Array<{
      id: string;
      risk: 'High' | 'Medium' | 'Low';
      category: 'Excessive Discount' | 'Voided Order Spike' | 'Shift Cash Variance' | 'Negative Inventory Override' | 'Off-Hours Activity';
      title: string;
      details: string;
      userOrShift: string;
      date: string;
    }> = [];

    // Scan Sales Orders for high discounts (>20%) or large voided orders
    salesOrders.forEach(so => {
      // Check for excessive discounts
      if (so.status === 'Completed') {
        const fullRetailTotal = so.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        if (fullRetailTotal > 0 && so.total < fullRetailTotal * 0.8) {
          const discPct = Math.round(((fullRetailTotal - so.total) / fullRetailTotal) * 100);
          list.push({
            id: `ANOM-DISC-${so.id}`,
            risk: discPct >= 35 ? 'High' : 'Medium',
            category: 'Excessive Discount',
            title: `High Discount (${discPct}%) applied on ${so.soNumber || `Order #${so.id}`}`,
            details: `Original value ${fmt(fullRetailTotal)}, but charged ${fmt(so.total)}. Discount: ${discPct}%.`,
            userOrShift: `Order #${so.soNumber}`,
            date: so.date
          });
        }
      }

      // Check for Voided orders
      if (so.status === 'Voided') {
        list.push({
          id: `ANOM-VOID-${so.id}`,
          risk: 'Medium',
          category: 'Voided Order Spike',
          title: `Sales Order #${so.soNumber || so.id} was voided`,
          details: `Voided transaction total: ${fmt(so.total)}. High void frequencies may indicate cash skimming.`,
          userOrShift: `Order #${so.soNumber}`,
          date: so.date
        });
      }
    });

    // Scan POS Shifts for Cash Variances (> $10 / TZS 20,000 equivalent)
    posShifts.forEach(shift => {
      if (shift.status === 'Closed' && shift.variance && Math.abs(shift.variance) > 5) {
        const riskLevel = Math.abs(shift.variance) > 25 ? 'High' : 'Medium';
        list.push({
          id: `ANOM-SHIFT-${shift.id}`,
          risk: riskLevel,
          category: 'Shift Cash Variance',
          title: `Cash Drawer Variance of ${fmt(shift.variance)} in Shift #${shift.id}`,
          details: `Shift closed by ${shift.username}. Expected cash differed from actual count by ${fmt(shift.variance)}.`,
          userOrShift: `Cashier: ${shift.username}`,
          date: shift.openTime ? shift.openTime.split('T')[0] : 'N/A'
        });
      }
    });

    // Scan Stock Items for Negative Inventory Overrides
    stockItems.forEach(item => {
      Object.entries(item.stock || {}).forEach(([stId, qtyVal]) => {
        const qty = Number(qtyVal) || 0;
        if (qty < 0) {
          const storeName = stores.find(s => s.id === Number(stId))?.name || `Store #${stId}`;
          list.push({
            id: `ANOM-STOCK-${item.id}-${stId}`,
            risk: 'High',
            category: 'Negative Inventory Override',
            title: `Negative Stock Level (${qty} units) for ${item.name}`,
            details: `${item.name} (${item.code}) is at ${qty} units in ${storeName}. Stock sold without recorded inventory reception.`,
            userOrShift: `Store: ${storeName}`,
            date: new Date().toISOString().split('T')[0]
          });
        }
      });
    });

    return list.filter(a => filterRisk === 'All' || a.risk === filterRisk);
  }, [salesOrders, posShifts, stockItems, stores, filterRisk]);

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Tabs */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-md">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">AI PREDICTIVE DEMAND & AUDIT DETECTOR</h2>
            <p className="text-xs text-slate-400">Inventory sales velocity forecasting & AI transaction fraud scanner</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-slate-800 p-1 rounded-xl text-xs font-bold text-slate-300">
          <button
            onClick={() => setActiveTab('forecasting')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'forecasting' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>30-Day Demand Forecast</span>
          </button>
          <button
            onClick={() => setActiveTab('fraud_detector')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'fraud_detector' ? 'bg-red-600 text-white shadow-xs' : 'hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Fraud & Audit Detector ({anomalies.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'forecasting' ? (
        /* --- DEMAND FORECASTING VIEW --- */
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold text-gray-700">
                <span>Store Location:</span>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="px-2.5 py-1.5 border rounded-xl font-bold bg-gray-50 outline-none"
                >
                  <option value="all">All Stores</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 font-bold text-gray-700">
                <span>Supplier Lead Time:</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1.5 border rounded-xl font-bold text-center bg-gray-50 outline-none"
                />
                <span className="text-gray-500 font-normal">days</span>
              </div>
            </div>

            {onOpenPOModal && (
              <button
                type="button"
                onClick={onOpenPOModal}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Create Purchase Order</span>
              </button>
            )}
          </div>

          {/* Forecasting Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b">
                <tr>
                  <th className="p-3.5">Product Name & Code</th>
                  <th className="p-3.5 text-center">Current Stock</th>
                  <th className="p-3.5 text-center">30-Day Sales Velocity</th>
                  <th className="p-3.5 text-center">Daily Burn Rate</th>
                  <th className="p-3.5 text-center">Reorder Point</th>
                  <th className="p-3.5 text-center">Est. Stockout</th>
                  <th className="p-3.5 text-center">Rec. Restock Qty</th>
                  <th className="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {forecastData.map(({ item, currentStock, totalSold30Days, dailyVelocity, reorderPoint, daysUntilStockout, recommendedReorderQty, urgency }) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5">
                      <div className="font-bold text-gray-900">{item.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{item.code}</div>
                    </td>
                    <td className="p-3.5 text-center font-bold text-gray-800">{currentStock} {item.unit || 'pcs'}</td>
                    <td className="p-3.5 text-center font-bold text-indigo-700">{totalSold30Days} units</td>
                    <td className="p-3.5 text-center font-mono text-gray-600">{dailyVelocity} / day</td>
                    <td className="p-3.5 text-center font-bold text-amber-700">{reorderPoint} units</td>
                    <td className="p-3.5 text-center font-bold">
                      {daysUntilStockout >= 999 ? (
                        <span className="text-gray-400">Stable</span>
                      ) : (
                        <span className={daysUntilStockout <= leadTimeDays ? 'text-red-600 font-black' : 'text-gray-700'}>
                          ~{daysUntilStockout} days
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-black text-emerald-700">
                      {recommendedReorderQty > 0 ? `+${recommendedReorderQty} units` : '-'}
                    </td>
                    <td className="p-3.5 text-right">
                      {urgency === 'Urgent Reorder' && (
                        <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Urgent Restock
                        </span>
                      )}
                      {urgency === 'Reorder Soon' && (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                          Reorder Soon
                        </span>
                      )}
                      {urgency === 'Optimal Stock' && (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Healthy
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* --- FRAUD & AUDIT DETECTOR VIEW --- */
        <div className="space-y-4">
          {/* Risk Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 flex items-center justify-between text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span className="font-bold text-gray-800">Filter Risk Severity:</span>
              {(['All', 'High', 'Medium', 'Low'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setFilterRisk(r)}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    filterRisk === r ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r} Risk
                </button>
              ))}
            </div>
            <div className="text-gray-500 font-medium">
              Total Anomalies Flagged: <span className="font-bold text-gray-900">{anomalies.length}</span>
            </div>
          </div>

          {/* Anomaly Cards List */}
          {anomalies.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h3 className="font-black text-emerald-900 text-base">All Systems Normal</h3>
              <p className="text-xs text-emerald-700">No suspicious discounts, cash variances, or inventory anomalies detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {anomalies.map(anom => (
                <div
                  key={anom.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
                    anom.risk === 'High' ? 'bg-red-50/70 border-red-200' : 'bg-amber-50/70 border-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        anom.risk === 'High' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                      }`}>
                        {anom.risk} Risk
                      </span>
                      <span className="font-bold text-xs text-gray-800">{anom.category}</span>
                      <span className="text-[10px] text-gray-400 font-mono">• {anom.date}</span>
                    </div>
                    <div className="font-bold text-sm text-gray-900">{anom.title}</div>
                    <div className="text-xs text-gray-600">{anom.details}</div>
                  </div>

                  <div className="text-right font-mono text-xs font-bold text-slate-700 bg-white/80 px-3 py-1.5 rounded-xl border">
                    {anom.userOrShift}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
