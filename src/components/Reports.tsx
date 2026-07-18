import React, { useState } from 'react';
import { SalesOrder, PurchaseOrder, StockItem, Customer, Supplier, Store, Expense, PosShift } from '../types';
import { formatMoney } from '../utils/format';
import { toast } from '../utils/toast';
import {
  FileSpreadsheet, Printer, Clock, User, Store as StoreIcon, TrendingUp, Coins, FileText, AlertCircle, Calendar
} from 'lucide-react';
import { ConfirmActionModal } from './ConfirmActionModal';
import { handlePrintWithFallback } from '../utils/printHelper';

interface ReportsProps {
  currentPage: string;
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  stockItems: StockItem[];
  customers: Customer[];
  suppliers: Supplier[];
  stores: Store[];
  expenses?: Expense[];
  currentStoreId: number | null;
  currency: string;
  exchangeRate: number;
  translate: (text: string) => string;
  posShifts?: PosShift[];
}

export default function Reports({
  currentPage,
  salesOrders,
  purchaseOrders,
  stockItems,
  customers,
  suppliers,
  stores,
  expenses = [],
  currentStoreId,
  currency,
  exchangeRate,
  translate: t,
  posShifts = []
}: ReportsProps) {
  const storeId = currentStoreId || 1;

  // Date states for Transaction Search
  const todayStr = new Date().toISOString().split('T')[0];
  const endDefault = new Date();
  const startDefault = new Date();
  startDefault.setDate(endDefault.getDate() - 30);

  const [txStartDate, setTxStartDate] = useState(startDefault.toISOString().split('T')[0]);
  const [txEndDate, setTxEndDate] = useState(endDefault.toISOString().split('T')[0]);

  // Month state for Monthly report
  const [selectedMonth, setSelectedMonth] = useState(todayStr.substring(0, 7));

  // Shift ledger states
  const [selectedShiftStoreId, setSelectedShiftStoreId] = useState<string>('all');
  const [selectedShiftUserId, setSelectedShiftUserId] = useState<string>('all');
  const [selectedShiftStatus, setSelectedShiftStatus] = useState<string>('all');
  const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null);

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

  // Helper for money formatting
  const fmt = (amt: number) => formatMoney(amt, currency, exchangeRate);

  // Helper getters
  const getProductName = (id: number) => stockItems.find(x => x.id === id)?.name || t('Unknown Product');
  const getStoreName = (id: number) => stores.find(x => x.id === id)?.name || t('Unknown Store');
  const getCustomerName = (id: number) => customers.find(x => x.id === id)?.name || t('Unknown Customer');
  const getSupplierName = (id: number) => suppliers.find(x => x.id === id)?.name || t('Unknown Supplier');

  // Generic CSV Exporter
  const handleExportCSV = (tableId: string, title: string) => {
    const table = document.getElementById(tableId);
    if (!table) {
      toast.warning(t('No data table found to export'));
      return;
    }

    const csv: string[] = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(r => {
      const row: string[] = [];
      const cols = r.querySelectorAll('td, th');
      cols.forEach(c => {
        let text = (c as HTMLElement).innerText.replace(/(\r\n|\n|\r)/gm, ' ').replace(/(\s\s+)/gm, ' ');
        text = text.replace(/"/g, '""');
        row.push('"' + text + '"');
      });
      csv.push(row.join(','));
    });

    const csvContent = '\ufeff' + csv.join('\n'); // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    handlePrintWithFallback((title, desc) => {
      setConfirmModal({
        isOpen: true,
        title: t(title),
        description: t(desc),
        onConfirm: () => {}
      });
    });
  };

  // --- REPORT VIEW COMPUTATIONS & GENERATIONS ---

  // 1. Transaction Report (Date range ledger)
  const renderReportTransaction = () => {
    const filterByRange = (order: any) => {
      return order.storeId === storeId &&
             order.date >= txStartDate &&
             order.date <= txEndDate;
    };

    const sales = salesOrders.filter(filterByRange);
    const purchases = purchaseOrders.filter(o => o.status === 'Received' && filterByRange(o));

    const totalSalesVal = sales.reduce((sum, s) => sum + s.total, 0);
    const totalProfitVal = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalPurchasesVal = purchases.reduce((sum, p) => sum + p.total, 0);

    return (
      <div className="space-y-6">
        <div className="bg-gray-50 border p-5 rounded-xl flex flex-col md:flex-row items-end gap-4 no-print shadow-sm">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{t('From Date')}</label>
            <input
              type="date"
              value={txStartDate}
              onChange={(e) => setTxStartDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand/15 outline-none font-semibold"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{t('To Date')}</label>
            <input
              type="date"
              value={txEndDate}
              onChange={(e) => setTxEndDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand/15 outline-none font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-1">{t('Total Sales (Period)')}</div>
              <div className="text-2xl font-black text-emerald-700">{fmt(totalSalesVal)}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1">From {sales.length} transactions</div>
            </div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-purple-800 uppercase tracking-wider mb-1">{t('Total Purchases (Period)')}</div>
              <div className="text-2xl font-black text-purple-700">{fmt(totalPurchasesVal)}</div>
              <div className="text-[10px] text-purple-600 font-semibold mt-1">From {purchases.length} invoices</div>
            </div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-indigo-800 uppercase tracking-wider mb-1">{t('Net Period Profit')}</div>
              <div className="text-2xl font-black text-indigo-700">{fmt(totalProfitVal)}</div>
              <div className="text-[10px] text-indigo-600 font-semibold mt-1">Calculated Margin</div>
            </div>
          </div>
        </div>

        <h4 className="font-bold text-gray-800 text-sm mb-3">Period Ledger Log</h4>
        <div className="overflow-x-auto border border-gray-200/60 rounded-xl">
          <table id="report-tx-table" className="w-full text-[13px] text-left">
            <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3">Doc #</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer / Supplier</th>
                <th className="px-4 py-3">Product / Items</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right text-emerald-700">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
              {sales.flatMap(s => s.items.map((i, idx) => (
                <tr key={`${s.id}-${idx}`} className="hover:bg-emerald-50/15">
                  <td className="px-4 py-3 font-bold text-brand">{s.soNumber}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-black bg-green-100 text-green-800 uppercase">SALE</span></td>
                  <td className="px-4 py-3 text-gray-500 font-semibold">{s.date}</td>
                  <td className="px-4 py-3 font-bold text-gray-700">{getCustomerName(s.customerId || 0)}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{getProductName(i.productId)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{i.qty}</td>
                  <td className="px-4 py-3 text-right font-black text-gray-900">{fmt(i.qty * i.price)}</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt((i.price - i.cost) * i.qty)}</td>
                </tr>
              )))}

              {purchases.flatMap(p => p.items.map((i, idx) => (
                <tr key={`${p.id}-${idx}`} className="hover:bg-purple-50/15">
                  <td className="px-4 py-3 font-bold text-brand">{p.poNumber}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 uppercase">PURCHASE</span></td>
                  <td className="px-4 py-3 text-gray-500 font-semibold">{p.date}</td>
                  <td className="px-4 py-3 font-bold text-gray-700">{getSupplierName(p.supplierId || 0)}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{getProductName(i.productId)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{i.qty}</td>
                  <td className="px-4 py-3 text-right font-black text-gray-900">{fmt(i.qty * i.cost)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono">-</td>
                </tr>
              )))}

              {sales.length === 0 && purchases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 font-semibold">
                    No matching period transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 2. Daily Activity Report (Today)
  const renderReportDaily = () => {
    const sales = salesOrders.filter(o => o.date === todayStr && o.storeId === storeId);
    const pos = purchaseOrders.filter(o => o.date === todayStr && o.status === 'Received' && o.storeId === storeId);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">{t('Total Sales')}</div>
            <div className="text-2xl font-black text-emerald-600">{fmt(sales.reduce((sum, o) => sum + o.total, 0))}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-1">{t('Total Purchases')}</div>
            <div className="text-2xl font-black text-purple-600">{fmt(pos.reduce((sum, o) => sum + o.total, 0))}</div>
          </div>
        </div>

        <h4 className="font-bold text-gray-800 text-sm mb-3 mt-6">{t('Total Sales')}</h4>
        <div className="overflow-x-auto border rounded-xl">{buildSalesTableHTML('daily-sales-table', sales)}</div>

        <h4 className="font-bold text-gray-800 text-sm mb-3">{t('Total Purchases')}</h4>
        <div className="overflow-x-auto border rounded-xl">{buildPurchasesTableHTML('daily-purchases-table', pos)}</div>
      </div>
    );
  };

  // 3. Monthly Report
  const renderReportMonthly = () => {
    const filterByMonth = (order: any) => {
      return order.storeId === storeId && order.date.substring(0, 7) === selectedMonth;
    };

    const sales = salesOrders.filter(filterByMonth);
    const pos = purchaseOrders.filter(o => o.status === 'Received' && filterByMonth(o));
    const monthExpenses = (expenses || []).filter(e => e.storeId === storeId && e.date.substring(0, 7) === selectedMonth);
    const totalMonthExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    return (
      <div className="space-y-6">
        <div className="mb-2 flex items-center gap-3 no-print">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('Select Month')}:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-xs outline-none focus:border-brand bg-white font-bold text-gray-800 shadow-xs"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm">
            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Total Sales for {selectedMonth}</div>
            <div className="text-2xl font-black text-emerald-600">{fmt(sales.reduce((sum, o) => sum + o.total, 0))}</div>
            <div className="text-[10px] text-emerald-500 font-semibold mt-1">Gross Period Revenue</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 shadow-sm">
            <div className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-1">Total Purchases for {selectedMonth}</div>
            <div className="text-2xl font-black text-purple-700">{fmt(pos.reduce((sum, o) => sum + o.total, 0))}</div>
            <div className="text-[10px] text-purple-500 font-semibold mt-1">Inbound Goods Cost</div>
          </div>
          <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 shadow-sm">
            <div className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">Operating Expenses for {selectedMonth}</div>
            <div className="text-2xl font-black text-rose-600">{fmt(totalMonthExpenses)}</div>
            <div className="text-[10px] text-rose-500 font-semibold mt-1">Incurred Operational Cost</div>
          </div>
        </div>

        {/* Presentable Expenditures Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="border-b pb-3 flex justify-between items-center">
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Operating Expenditures Breakdown</h4>
              <p className="text-[11px] text-gray-400 font-semibold mt-0.5">Summary of all logged business expenditures for the month.</p>
            </div>
            <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2.5 py-1 rounded-full">
              Total Spent: {fmt(totalMonthExpenses)}
            </span>
          </div>

          {monthExpenses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category Summary */}
              <div>
                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Spend by Category</h5>
                <div className="border border-gray-100 rounded-lg overflow-hidden divide-y">
                  {Object.entries(
                    monthExpenses.reduce((acc, curr) => {
                      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between p-2.5 text-xs font-semibold hover:bg-gray-50/50">
                      <span className="text-gray-700">{cat}</span>
                      <span className="font-bold text-gray-900">{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Ledger List */}
              <div>
                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Detailed Expense Log</h5>
                <div className="border border-gray-100 rounded-lg overflow-hidden divide-y max-h-[220px] overflow-y-auto">
                  {monthExpenses.map(exp => (
                    <div key={exp.id} className="p-2.5 hover:bg-gray-50/50 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-gray-800 block">{exp.description}</span>
                        <span className="text-[9px] text-gray-400 font-mono">{exp.date} &bull; {exp.paymentMethod}</span>
                      </div>
                      <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[10px] font-mono">
                        {fmt(exp.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 font-semibold italic text-xs">
              No operating expenditures logged for this month.
            </div>
          )}
        </div>

        <h4 className="font-bold text-gray-800 text-sm mb-3 mt-6">Monthly Sales Details</h4>
        <div className="overflow-x-auto border rounded-xl">{buildSalesTableHTML('monthly-sales-table', sales)}</div>

        <h4 className="font-bold text-gray-800 text-sm mb-3">Monthly Purchases Details</h4>
        <div className="overflow-x-auto border rounded-xl">{buildPurchasesTableHTML('monthly-purchases-table', pos)}</div>
      </div>
    );
  };

  // 4. Sales Report
  const renderReportSales = () => {
    const sales = salesOrders.filter(so => so.storeId === storeId);
    const totalSales = sales.reduce((sum, o) => sum + o.total, 0);
    const totalProfit = sales.reduce((sum, o) => sum + o.profit, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="text-xs font-bold text-gray-400 mb-1">{t('Total Sales')}</div>
            <div className="text-2xl font-black text-gray-900">{fmt(totalSales)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="text-xs font-bold text-gray-400 mb-1">Total Profit</div>
            <div className="text-2xl font-black text-emerald-600">{fmt(totalProfit)}</div>
          </div>
        </div>
        <div className="overflow-x-auto border rounded-xl">
          {buildSalesTableHTML('sales-report-table', sales)}
        </div>
      </div>
    );
  };

  // 5. Purchase Report
  const renderReportPurchase = () => {
    const pos = purchaseOrders.filter(po => po.storeId === storeId);
    const total = pos.reduce((sum, o) => sum + o.total, 0);

    return (
      <div className="space-y-6">
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 w-full md:w-1/2">
          <div className="text-xs font-bold text-gray-400 mb-1">{t('Total Purchases')}</div>
          <div className="text-2xl font-black text-gray-900">{fmt(total)}</div>
        </div>
        <div className="overflow-x-auto border rounded-xl">
          {buildPurchasesTableHTML('purchase-report-table', pos)}
        </div>
      </div>
    );
  };

  // 6. Sales Outstanding (Receivables)
  const renderReportSalesOutstanding = () => {
    const out = customers.filter(c => c.balance > 0);

    const getCustomerProductsBought = (customerId: number) => {
      const customerOrders = salesOrders.filter(so => so.customerId === customerId);
      const productIds = new Set<number>();
      customerOrders.forEach(so => so.items.forEach(i => productIds.add(i.productId)));
      if (productIds.size === 0) return 'None';
      return Array.from(productIds).map(pid => getProductName(pid)).join(', ');
    };

    return (
      <div className="overflow-x-auto border rounded-xl">
        <table id="sales-out-table" className="w-full text-[13px] text-left">
          <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="p-3">{t('Customer')}</th>
              <th className="p-3">{t('Type')}</th>
              <th className="p-3">Product Name</th>
              <th className="p-3 text-right">Credit Limit</th>
              <th className="p-3 text-right">Outstanding Balance</th>
              <th className="p-3 text-center">{t('Overdue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
            {out.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/50">
                <td className="p-3 font-bold text-gray-900">{c.name}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'Wholesale' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    {t(c.type)}
                  </span>
                </td>
                <td className="p-3 text-gray-600 font-medium">{getCustomerProductsBought(c.id)}</td>
                <td className="p-3 text-right">{fmt(c.creditLimit)}</td>
                <td className="p-3 text-right font-black text-red-600">{fmt(c.balance)}</td>
                <td className={`p-3 text-center font-bold ${c.balance > c.creditLimit ? 'text-red-600' : 'text-green-600'}`}>
                  {c.balance > c.creditLimit ? t('Yes') : t('No')}
                </td>
              </tr>
            ))}
            {out.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400 font-semibold">{t('No records found')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 7. Purchase Outstanding (Payables)
  const renderReportPurchaseOutstanding = () => {
    const out = purchaseOrders.filter(po => po.status === 'Pending' && po.storeId === storeId);

    return (
      <div className="overflow-x-auto border rounded-xl">
        <table id="purchase-out-table" className="w-full text-[13px] text-left">
          <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="p-3">PO #</th>
              <th className="p-3">{t('Supplier')}</th>
              <th className="p-3">Product Name</th>
              <th className="p-3 text-right">Amount Payable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
            {out.map(po => (
              <tr key={po.id} className="hover:bg-gray-50/50">
                <td className="p-3 font-bold text-brand">{po.poNumber}</td>
                <td className="p-3 font-bold text-gray-900">{getSupplierName(po.supplierId)}</td>
                <td className="p-3 text-gray-600 font-medium">
                  {po.items.map(i => `${getProductName(i.productId)} (x${i.qty})`).join(', ')}
                </td>
                <td className="p-3 text-right font-black text-orange-600">{fmt(po.total)}</td>
              </tr>
            ))}
            {out.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400 font-semibold">{t('No records found')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 8. Low Stock Items Report
  const renderReportLowStock = () => {
    const lowStockItems = stockItems.filter(p => (p.stock?.[storeId] || 0) <= p.lowStockQty);

    return (
      <div className="overflow-x-auto border rounded-xl">
        <table id="lowstock-table" className="w-full text-[13px] text-left">
          <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="p-3">{t('Product')}</th>
              <th className="p-3">Code</th>
              <th className="p-3">{t('Category')}</th>
              <th className="p-3 text-center font-bold">Alert Qty</th>
              <th className="p-3 text-center font-bold">Current Stock</th>
              <th className="p-3 text-right">{t('Total Value')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
            {lowStockItems.map(p => {
              const qty = p.stock?.[storeId] || 0;
              const value = qty * p.purchasePrice;
              return (
                <tr key={p.id} className="hover:bg-red-50/30">
                  <td className="p-3 font-bold text-gray-900">{p.name}</td>
                  <td className="p-3 font-mono font-bold text-gray-500">{p.code}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold">
                      {p.category}
                    </span>
                  </td>
                  <td className="p-3 text-center font-bold text-gray-500">{p.lowStockQty}</td>
                  <td className="p-3 text-center font-black text-red-600">{qty}</td>
                  <td className="p-3 text-right font-black text-gray-900">{fmt(value)}</td>
                </tr>
              );
            })}
            {lowStockItems.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400 font-semibold">{t('All items sufficiently stocked')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 9. Purchase Order Details Report
  const renderReportPODetails = () => {
    const pos = purchaseOrders.filter(po => po.storeId === storeId);

    return (
      <div className="overflow-x-auto border rounded-xl">
        <table id="po-details-table" className="w-full text-[13px] text-left">
          <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="p-3">PO Number</th>
              <th className="p-3">{t('Product')}</th>
              <th className="p-3">{t('Supplier')}</th>
              <th className="p-3">{t('Store')}</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">{t('Cost')}</th>
              <th className="p-3 text-right">{t('Total')}</th>
              <th className="p-3">{t('Status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
            {pos.flatMap(po => po.items.map((item, idx) => (
              <tr key={`${po.id}-${idx}`} className="hover:bg-gray-50/50">
                <td className="p-3 font-bold text-brand">{po.poNumber}</td>
                <td className="p-3 font-bold text-gray-900">{getProductName(item.productId)}</td>
                <td className="p-3 font-bold text-gray-700">{getSupplierName(po.supplierId)}</td>
                <td className="p-3 text-gray-500">{getStoreName(po.storeId)}</td>
                <td className="p-3 text-center font-mono font-bold">{item.qty}</td>
                <td className="p-3 text-right">{fmt(item.cost)}</td>
                <td className="p-3 text-right font-black text-gray-900">{fmt(item.qty * item.cost)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${po.status === 'Received' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                    {t(po.status)}
                  </span>
                </td>
              </tr>
            )))}
            {pos.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400 font-semibold">{t('No records found')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // --- GENERAL INNER HTML TABLE BUILDERS ---

  function buildSalesTableHTML(tableId: string, orders: SalesOrder[]) {
    return (
      <table id={tableId} className="w-full text-[13px] text-left">
        <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
          <tr>
            <th className="p-3">SO Number</th>
            <th className="p-3">{t('Product')}</th>
            <th className="p-3">{t('Date')}</th>
            <th className="p-3">{t('Customer')}</th>
            <th className="p-3">{t('Type')}</th>
            <th className="p-3 text-center">{t('Qty')}</th>
            <th className="p-3 text-right">{t('Price')}</th>
            <th className="p-3 text-right">{t('Total')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
          {orders.flatMap(so => so.items.map((item, idx) => (
            <tr key={`${so.id}-${idx}`} className="hover:bg-gray-50/50">
              <td className="p-3 font-bold text-brand">{so.soNumber}</td>
              <td className="p-3 font-bold text-gray-900">{getProductName(item.productId)}</td>
              <td className="p-3 text-gray-500 font-semibold">{so.date}</td>
              <td className="p-3 text-gray-700">{getCustomerName(so.customerId)}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${so.priceType === 'Wholesale' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {t(so.priceType)}
                </span>
              </td>
              <td className="p-3 text-center font-mono font-bold">{item.qty}</td>
              <td className="p-3 text-right">{fmt(item.price)}</td>
              <td className="p-3 text-right font-black text-emerald-600">{fmt(item.qty * item.price)}</td>
            </tr>
          )))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-8 text-gray-500">{t('No records found')}</td>
            </tr>
          )}
        </tbody>
    </table>
    );
  }

  function buildPurchasesTableHTML(tableId: string, orders: PurchaseOrder[]) {
    return (
      <table id={tableId} className="w-full text-[13px] text-left">
        <thead className="bg-gray-50 border-b text-gray-500 text-[10px] uppercase font-bold tracking-wider">
          <tr>
            <th className="p-3">PO Number</th>
            <th className="p-3">{t('Product')}</th>
            <th className="p-3">{t('Date')}</th>
            <th className="p-3">{t('Supplier')}</th>
            <th className="p-3 text-center">Qty</th>
            <th className="p-3 text-right">{t('Cost')}</th>
            <th className="p-3 text-right">{t('Total')}</th>
            <th className="p-3">{t('Status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
          {orders.flatMap(po => po.items.map((item, idx) => (
            <tr key={`${po.id}-${idx}`} className="hover:bg-gray-50/50">
              <td className="p-3 font-bold text-brand">{po.poNumber}</td>
              <td className="p-3 font-bold text-gray-900">{getProductName(item.productId)}</td>
              <td className="p-3 text-gray-500 font-semibold">{po.date}</td>
              <td className="p-3 text-gray-700">{getSupplierName(po.supplierId)}</td>
              <td className="p-3 text-center font-mono font-bold">{item.qty}</td>
              <td className="p-3 text-right">{fmt(item.cost)}</td>
              <td className="p-3 text-right font-black text-gray-900">{fmt(item.qty * item.cost)}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${po.status === 'Received' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                  {t(po.status)}
                </span>
              </td>
            </tr>
          )))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-8 text-gray-500">{t('No records found')}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  const renderReportShifts = () => {
    const filteredShifts = posShifts.filter(s => {
      const storeMatch = selectedShiftStoreId === 'all' || s.storeId === Number(selectedShiftStoreId);
      const userMatch = selectedShiftUserId === 'all' || s.userId === Number(selectedShiftUserId);
      const statusMatch = selectedShiftStatus === 'all' || s.status === selectedShiftStatus;
      return storeMatch && userMatch && statusMatch;
    });

    const totalSessions = filteredShifts.length;
    const totalOpeningFloat = filteredShifts.reduce((sum, s) => sum + s.openingFloat, 0);
    const totalExpectedSales = filteredShifts.reduce((sum, s) => sum + (s.expectedCashSales || 0), 0);
    const totalActualCollected = filteredShifts.reduce((sum, s) => {
      if (s.status === 'Closed') {
        return sum + (s.closingCashActual || 0);
      }
      return sum + s.openingFloat + (s.expectedCashSales || 0); // theoretical for open
    }, 0);
    const totalVariance = filteredShifts.reduce((sum, s) => sum + (s.variance || 0), 0);

    return (
      <div className="space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
          <div className="bg-slate-50 border p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Total Shift Sessions</span>
              <span className="text-xl font-black text-slate-800 mt-1 block">{totalSessions}</span>
            </div>
            <div className="bg-slate-200/50 text-slate-600 p-2.5 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Expected Drawer Cash</span>
              <span className="text-xl font-black text-emerald-800 mt-1 block">
                {formatMoney(totalOpeningFloat + totalExpectedSales, currency, exchangeRate)}
              </span>
            </div>
            <div className="bg-emerald-100/50 text-emerald-600 p-2.5 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">Actual Cash Counted</span>
              <span className="text-xl font-black text-indigo-800 mt-1 block">
                {formatMoney(totalActualCollected, currency, exchangeRate)}
              </span>
            </div>
            <div className="bg-indigo-100/50 text-indigo-600 p-2.5 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className={`border p-4 rounded-xl flex items-center justify-between ${
            totalVariance < 0 ? 'bg-red-50/50 border-red-100' : totalVariance > 0 ? 'bg-amber-50/50 border-amber-100' : 'bg-green-50/50 border-green-100'
          }`}>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider block ${
                totalVariance < 0 ? 'text-red-500' : totalVariance > 0 ? 'text-amber-600' : 'text-green-600'
              }`}>Net Cash Variance</span>
              <span className={`text-xl font-black mt-1 block ${
                totalVariance < 0 ? 'text-red-700' : totalVariance > 0 ? 'text-amber-700' : 'text-green-700'
              }`}>
                {totalVariance > 0 ? '+' : ''}{formatMoney(totalVariance, currency, exchangeRate)}
              </span>
            </div>
            <div className={`p-2.5 rounded-lg ${
              totalVariance < 0 ? 'bg-red-100/50 text-red-600' : totalVariance > 0 ? 'bg-amber-100/50 text-amber-600' : 'bg-green-100/50 text-green-600'
            }`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 p-4 rounded-xl border no-print">
          <div className="w-full sm:w-1/3 space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Filter Store</label>
            <select
              value={selectedShiftStoreId}
              onChange={(e) => setSelectedShiftStoreId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border rounded-lg text-xs font-semibold outline-none text-gray-800"
            >
              <option value="all">All Stores / Depots</option>
              {stores.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-1/3 space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Filter Status</label>
            <select
              value={selectedShiftStatus}
              onChange={(e) => setSelectedShiftStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border rounded-lg text-xs font-semibold outline-none text-gray-800"
            >
              <option value="all">All Sessions</option>
              <option value="Open">Active (Open)</option>
              <option value="Closed">Reconciled (Closed)</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left border-collapse" id="report-shifts-table">
            <thead>
              <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-wider">
                <th className="py-3 px-4">Session Ref</th>
                <th className="py-3 px-4">Store / Depot</th>
                <th className="py-3 px-4">Cashier / User</th>
                <th className="py-3 px-4">Opened / Closed</th>
                <th className="py-3 px-4 text-right">Float</th>
                <th className="py-3 px-4 text-right">Sales</th>
                <th className="py-3 px-4 text-right">Actual Count</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs font-semibold text-gray-700 font-sans">
              {filteredShifts.map((s) => {
                const storeObj = stores.find(st => st.id === s.storeId);
                const theoreticalTotal = s.openingFloat + (s.expectedCashSales || 0);
                const isExpanded = expandedShiftId === s.id;

                return (
                  <React.Fragment key={s.id}>
                    <tr className="hover:bg-slate-50/50 transition duration-150">
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-900">#SH-{String(s.id).padStart(4, '0')}</td>
                      <td className="py-3.5 px-4">{storeObj?.name || `Store #${s.storeId}`}</td>
                      <td className="py-3.5 px-4">
                        <span className="flex items-center gap-1.5 mt-0.5">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{s.username}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-gray-500">
                        <div className="flex flex-col">
                          <span>O: {new Date(s.openTime).toLocaleDateString()} {new Date(s.openTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {s.closeTime && (
                            <span>C: {new Date(s.closeTime).toLocaleDateString()} {new Date(s.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-900">{formatMoney(s.openingFloat, currency, exchangeRate)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 font-bold">+{formatMoney(s.expectedCashSales || 0, currency, exchangeRate)}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                        {s.status === 'Closed' ? formatMoney(s.closingCashActual || 0, currency, exchangeRate) : formatMoney(theoreticalTotal, currency, exchangeRate)}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-mono font-black ${
                        s.status === 'Open' ? 'text-gray-400' : (s.variance || 0) < 0 ? 'text-red-600 bg-red-50/30' : (s.variance || 0) > 0 ? 'text-amber-600 bg-amber-50/30' : 'text-green-600 bg-green-50/30'
                      }`}>
                        {s.status === 'Open' ? '-' : `${(s.variance || 0) > 0 ? '+' : ''}${formatMoney(s.variance || 0, currency, exchangeRate)}`}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          s.status === 'Open' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center no-print">
                        <button
                          onClick={() => setExpandedShiftId(isExpanded ? null : s.id)}
                          className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded transition"
                        >
                          {isExpanded ? 'Hide Details' : 'View Ledger'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Drawer row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="bg-slate-50/60 p-5 border-t border-b border-slate-200/80">
                          <div className="space-y-4 max-w-4xl">
                            <h5 className="font-black text-gray-900 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                              <FileText className="w-4 h-4 text-indigo-600" /> Compiled Shift Invoice Log
                            </h5>
                            
                            {s.notes && (
                              <div className="bg-white p-3 rounded-xl border text-[11px] text-gray-600 italic">
                                <strong className="font-bold uppercase tracking-wider block text-[9px] text-gray-400 mb-1">Session Closure Notes:</strong>
                                "{s.notes}"
                              </div>
                            )}

                            <div className="bg-white rounded-xl border overflow-hidden">
                              <table className="w-full text-left">
                                <thead className="bg-slate-100/80 text-[10px] font-black text-slate-600 uppercase tracking-wider border-b">
                                  <tr>
                                    <th className="py-2.5 px-3">Order Ref</th>
                                    <th className="py-2.5 px-3">Date</th>
                                    <th className="py-2.5 px-3">Billing Mode</th>
                                    <th className="py-2.5 px-3 text-right">Total Invoice</th>
                                    <th className="py-2.5 px-3 text-right text-green-700">Estimated Profit</th>
                                  </tr>
                                </thead>
                                <tbody className="text-xs font-semibold text-gray-700 divide-y">
                                  {salesOrders.filter(so => s.salesOrderIds?.includes(so.id)).map((so) => (
                                    <tr key={so.id} className="hover:bg-slate-50">
                                      <td className="py-2 px-3 font-mono font-bold text-gray-900">{so.soNumber}</td>
                                      <td className="py-2 px-3">{so.date}</td>
                                      <td className="py-2 px-3">
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${
                                          so.priceType === 'Wholesale' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}>
                                          {so.priceType}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono font-bold">{formatMoney(so.total, currency, exchangeRate)}</td>
                                      <td className="py-2 px-3 text-right font-mono text-green-600 font-bold">+{formatMoney(so.profit, currency, exchangeRate)}</td>
                                    </tr>
                                  ))}
                                  {(!s.salesOrderIds || s.salesOrderIds.length === 0) && (
                                    <tr>
                                      <td colSpan={5} className="py-4 text-center text-gray-400 font-bold text-xs">{t('No transaction was registered in this shift.')}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredShifts.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-400 font-black text-xs">{t('No drawer shift sessions match your query.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Determine active table ID for CSV export
  let currentTableId = 'report-tx-table';
  let reportTitle = '';

  if (currentPage === 'report-transaction') {
    currentTableId = 'report-tx-table';
    reportTitle = t('Transaction Report');
  } else if (currentPage === 'report-daily') {
    currentTableId = 'daily-sales-table'; // will export sales by default or daily tables
    reportTitle = t('Daily Activity Report (Today)');
  } else if (currentPage === 'report-monthly') {
    currentTableId = 'monthly-sales-table';
    reportTitle = t('Monthly Report');
  } else if (currentPage === 'report-sales') {
    currentTableId = 'sales-report-table';
    reportTitle = t('Sales Report');
  } else if (currentPage === 'report-purchase') {
    currentTableId = 'purchase-report-table';
    reportTitle = t('Purchase Report');
  } else if (currentPage === 'report-sales-outstanding') {
    currentTableId = 'sales-out-table';
    reportTitle = t('Sales Outstanding');
  } else if (currentPage === 'report-purchase-outstanding') {
    currentTableId = 'purchase-out-table';
    reportTitle = t('Purchase Outstanding');
  } else if (currentPage === 'report-lowstock') {
    currentTableId = 'lowstock-table';
    reportTitle = t('Low Stock Items Report');
  } else if (currentPage === 'report-po-details') {
    currentTableId = 'po-details-table';
    reportTitle = t('Purchase Order Details');
  } else if (currentPage === 'report-shifts') {
    currentTableId = 'report-shifts-table';
    reportTitle = t('POS Shift & Drawer Ledger');
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'report-transaction': return renderReportTransaction();
      case 'report-daily': return renderReportDaily();
      case 'report-monthly': return renderReportMonthly();
      case 'report-sales': return renderReportSales();
      case 'report-purchase': return renderReportPurchase();
      case 'report-sales-outstanding': return renderReportSalesOutstanding();
      case 'report-purchase-outstanding': return renderReportPurchaseOutstanding();
      case 'report-lowstock': return renderReportLowStock();
      case 'report-po-details': return renderReportPODetails();
      case 'report-shifts': return renderReportShifts();
      default: return null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 w-full">
      <h3 className="font-bold text-lg text-gray-900 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span>{reportTitle}</span>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={() => handleExportCSV(currentTableId, reportTitle)}
            className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5" /> Export PDF / Print
          </button>
        </div>
      </h3>
      <div>
        {renderContent()}
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
