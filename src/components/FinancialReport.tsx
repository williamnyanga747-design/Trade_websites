import React, { useState } from 'react';
import { SalesOrder, Expense, StockItem, Store } from '../types';
import { formatMoney, exportToExcel, translate } from '../utils/format';
import { handlePrintWithFallback } from '../utils/printHelper';
import { ConfirmActionModal } from './ConfirmActionModal';
import { 
  Printer, FileSpreadsheet, Calendar, Search, ArrowUpRight, ArrowDownRight, 
  DollarSign, TrendingUp, Briefcase, Mail, Send, CheckCircle2, Loader, Sparkles, AlertCircle, X
} from 'lucide-react';

interface FinancialReportProps {
  salesOrders: SalesOrder[];
  expenses: Expense[];
  stockItems: StockItem[];
  stores: Store[];
  currentStoreId: number | null;
  currency: string;
  exchangeRate: number;
  language?: 'en' | 'sw';
}

export default function FinancialReport({
  salesOrders,
  expenses,
  stockItems,
  stores,
  currentStoreId,
  currency,
  exchangeRate,
  language = 'en'
}: FinancialReportProps) {
  const [periodType, setPeriodType] = useState<'day' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // e.g. "2026-07"

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

  const t = (text: string) => translate(text, language);

  // Email simulation states
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [targetEmail, setTargetEmail] = useState('williamnyanga747@gmail.com');

  const getStoreName = (id: number) => {
    return stores.find(s => s.id === id)?.name || `Store #${id}`;
  };

  const getPeriodSales = () => {
    return salesOrders.filter(so => {
      const matchStore = currentStoreId ? so.storeId === currentStoreId : true;
      const matchDate = periodType === 'day' 
        ? so.date === selectedDate 
        : so.date.startsWith(selectedMonth);
      return matchStore && matchDate;
    });
  };

  const getPeriodExpenses = () => {
    return expenses.filter(exp => {
      const matchStore = currentStoreId ? exp.storeId === currentStoreId : true;
      const matchDate = periodType === 'day' 
        ? exp.date === selectedDate 
        : exp.date.startsWith(selectedMonth);
      return matchStore && matchDate;
    });
  };

  const sales = getPeriodSales();
  const periodExpenses = getPeriodExpenses();

  // CALCULATIONS
  const totalRevenue = sales.reduce((sum, so) => sum + so.total, 0);
  const totalCOGS = sales.reduce((sum, so) => {
    return sum + so.items.reduce((acc, item) => acc + (item.qty * item.cost), 0);
  }, 0);

  const grossProfit = totalRevenue - totalCOGS;
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const totalExpenses = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const expensesByCategory = periodExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  const netProfit = grossProfit - totalExpenses;
  const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // GRAPHICAL PLOTTING DATA GENERATOR (SVG LINE CHART)
  const getChartPoints = () => {
    const isMonth = periodType === 'month';
    const points: { label: string; sales: number; expenses: number; net: number }[] = [];

    if (isMonth) {
      // Month breakdown (days 1-30/31)
      const year = parseInt(selectedMonth.split('-')[0]) || 2026;
      const month = parseInt(selectedMonth.split('-')[1]) || 7;
      const daysInMonth = new Date(year, month, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const daySales = salesOrders.filter(so => 
          (currentStoreId ? so.storeId === currentStoreId : true) && so.date === dayStr
        );
        const dayExps = expenses.filter(exp => 
          (currentStoreId ? exp.storeId === currentStoreId : true) && exp.date === dayStr
        );

        const rev = daySales.reduce((sum, so) => sum + so.total, 0);
        const cogs = daySales.reduce((sum, so) => sum + so.items.reduce((acc, item) => acc + (item.qty * item.cost), 0), 0);
        const exp = dayExps.reduce((sum, e) => sum + e.amount, 0);

        points.push({
          label: `${d}`,
          sales: rev,
          expenses: exp,
          net: (rev - cogs) - exp
        });
      }
    } else {
      // Last 7 days comparison leading up to selectedDate
      const baseDate = new Date(selectedDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

        const daySales = salesOrders.filter(so => 
          (currentStoreId ? so.storeId === currentStoreId : true) && so.date === dayStr
        );
        const dayExps = expenses.filter(exp => 
          (currentStoreId ? exp.storeId === currentStoreId : true) && exp.date === dayStr
        );

        const rev = daySales.reduce((sum, so) => sum + so.total, 0);
        const cogs = daySales.reduce((sum, so) => sum + so.items.reduce((acc, item) => acc + (item.qty * item.cost), 0), 0);
        const exp = dayExps.reduce((sum, e) => sum + e.amount, 0);

        points.push({
          label: dayLabel,
          sales: rev,
          expenses: exp,
          net: (rev - cogs) - exp
        });
      }
    }
    return points;
  };

  const chartData = getChartPoints();

  // Draw Line SVG Math Helper
  const renderSVGLineChart = () => {
    const width = 800;
    const height = 180;
    const paddingLeft = 55;
    const paddingRight = 20;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    // Find Max Value for scaling
    const maxVal = Math.max(
      ...chartData.map(d => Math.max(d.sales, d.expenses, Math.abs(d.net))), 
      100
    );

    const getX = (index: number) => {
      if (chartData.length <= 1) return paddingLeft + chartW / 2;
      return paddingLeft + (index / (chartData.length - 1)) * chartW;
    };

    const getY = (val: number) => {
      // Maps value to SVG space, supports negative values by placing them lower
      const scale = chartH / maxVal;
      return paddingTop + chartH - (val * scale);
    };

    // Construct path segments
    let salesPath = '';
    let expensesPath = '';
    let netPath = '';

    chartData.forEach((d, idx) => {
      const x = getX(idx);
      const ySales = getY(d.sales);
      const yExpenses = getY(d.expenses);
      const yNet = getY(d.net);

      if (idx === 0) {
        salesPath = `M ${x} ${ySales}`;
        expensesPath = `M ${x} ${yExpenses}`;
        netPath = `M ${x} ${yNet}`;
      } else {
        salesPath += ` L ${x} ${ySales}`;
        expensesPath += ` L ${x} ${yExpenses}`;
        netPath += ` L ${x} ${yNet}`;
      }
    });

    const horizontalGridLines = [0.25, 0.5, 0.75, 1.0];

    return (
      <div className="overflow-x-auto select-none">
        <svg className="w-full min-w-[700px] h-[210px]" viewBox={`0 0 ${width} ${height + 30}`}>
          {/* Horizontal Gridlines */}
          {horizontalGridLines.map((ratio, idx) => {
            const y = paddingTop + chartH * (1 - ratio);
            const gridVal = maxVal * ratio;
            return (
              <g key={idx} className="opacity-40">
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={width - paddingRight} 
                  y2={y} 
                  stroke="#e2e8f0" 
                  strokeDasharray="4 4" 
                  strokeWidth="1"
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 4} 
                  className="text-[9px] font-mono font-bold text-gray-400 text-right"
                  textAnchor="end"
                >
                  {formatMoney(gridVal, currency, exchangeRate)}
                </text>
              </g>
            );
          })}

          {/* Zero baseline */}
          <line 
            x1={paddingLeft} 
            y1={getY(0)} 
            x2={width - paddingRight} 
            y2={getY(0)} 
            stroke="#94a3b8" 
            strokeWidth="1.5"
            className="opacity-60"
          />
          <text 
            x={paddingLeft - 8} 
            y={getY(0) + 4} 
            className="text-[9px] font-mono font-bold text-gray-500 text-right"
            textAnchor="end"
          >
            {formatMoney(0, currency, exchangeRate)}
          </text>

          {/* X Axis labels */}
          {chartData.map((d, idx) => {
            // Show all labels for weekly, show every 5th label for monthly to prevent overlapping
            const showLabel = periodType === 'day' || idx === 0 || idx === chartData.length - 1 || (idx + 1) % 5 === 0;
            if (!showLabel) return null;
            const x = getX(idx);
            return (
              <g key={idx}>
                <line x1={x} y1={paddingTop + chartH} x2={x} y2={paddingTop + chartH + 4} stroke="#cbd5e1" strokeWidth="1" />
                <text 
                  x={x} 
                  y={paddingTop + chartH + 16} 
                  className="text-[9px] font-bold text-gray-500 text-center"
                  textAnchor="middle"
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* Render lines */}
          {chartData.length > 1 && (
            <>
              {/* Sales Line */}
              <path d={salesPath} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" className="transition-all duration-300" />
              {/* Expenses Line */}
              <path d={expensesPath} fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" className="transition-all duration-300" />
              {/* Net Profit Line */}
              <path d={netPath} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" className="transition-all duration-300" />
            </>
          )}

          {/* Render interactive data circles */}
          {chartData.map((d, idx) => {
            const x = getX(idx);
            // Hover states circles for active nodes
            const showDetails = periodType === 'day' || idx % 4 === 0;
            if (!showDetails) return null;
            return (
              <g key={idx} className="group cursor-help">
                <circle cx={x} cy={getY(d.sales)} r="3.5" fill="#22c55e" className="hover:r-5 transition-all" />
                <circle cx={x} cy={getY(d.expenses)} r="3.5" fill="#f97316" className="hover:r-5 transition-all" />
                <circle cx={x} cy={getY(d.net)} r="3.5" fill="#ef4444" className="hover:r-5 transition-all" />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  // EXPORT TO EXCEL SHEET (.XLS)
  const handleExportExcel = () => {
    const formattedPeriod = periodType === 'day' ? selectedDate : selectedMonth;
    const storeText = currentStoreId ? stores.find(s => s.id === currentStoreId)?.name : 'All Stores';

    let tableHtml = `
      <table>
        <tr>
          <td colspan="4" style="font-size: 16px; font-weight: bold; color: #ef4444; text-align: center;">
            SINGIDA TRADECORE ERP - COMMERCIAL INCOME STATEMENT REPORT
          </td>
        </tr>
        <tr>
          <td colspan="4" style="text-align: center; color: #475569; font-weight: bold;">
            Statement period: ${formattedPeriod} | Store Depot: ${storeText}
          </td>
        </tr>
        <tr><td colspan="4"></td></tr>
        <tr style="background-color: #ef4444; color: white; font-weight: bold; font-size: 13px;">
          <th style="padding: 10px; border: 1px solid #cbd5e1;">Line Item Category</th>
          <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Debit (Outflow)</th>
          <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Credit (Inflow)</th>
          <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Balance Statement Amount</th>
        </tr>
        
        <tr>
          <td style="font-weight: bold; color: #1e293b; padding-top: 10px; font-size: 12px;" colspan="4">1. OPERATING REVENUES</td>
        </tr>
        <tr>
          <td style="padding-left: 15px; border: 1px solid #e2e8f0;">Gross Sales Credit Revenue</td>
          <td style="border: 1px solid #e2e8f0;"></td>
          <td style="border: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;">${formatMoney(totalRevenue, currency, exchangeRate)}</td>
          <td style="border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #16a34a;">${formatMoney(totalRevenue, currency, exchangeRate)}</td>
        </tr>
        
        <tr>
          <td style="font-weight: bold; color: #1e293b; padding-top: 10px; font-size: 12px;" colspan="4">2. COST OF GOODS SOLD (COGS)</td>
        </tr>
        <tr>
          <td style="padding-left: 15px; border: 1px solid #e2e8f0;">Direct Product Inventory Purchase Cost</td>
          <td style="border: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;">${formatMoney(totalCOGS, currency, exchangeRate)}</td>
          <td style="border: 1px solid #e2e8f0;"></td>
          <td style="border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #dc2626;">-${formatMoney(totalCOGS, currency, exchangeRate)}</td>
        </tr>
        
        <tr style="background-color: #f8fafc; font-weight: bold; border: 1px solid #cbd5e1;">
          <td style="padding: 8px;">3. GROSS TRADING STATEMENT MARGIN</td>
          <td style="padding: 8px;"></td>
          <td style="padding: 8px;"></td>
          <td style="padding: 8px; text-align: right; color: #1e3a8a; font-size: 13px;">${formatMoney(grossProfit, currency, exchangeRate)}</td>
        </tr>
        
        <tr>
          <td style="font-weight: bold; color: #1e293b; padding-top: 10px; font-size: 12px;" colspan="4">4. OPERATING EXPENDITURES (OPEX)</td>
        </tr>
    `;

    Object.entries(expensesByCategory).forEach(([cat, val]) => {
      tableHtml += `
        <tr>
          <td style="padding-left: 15px; border: 1px solid #e2e8f0;">Expense Class: ${cat}</td>
          <td style="border: 1px solid #e2e8f0; text-align: right; color: #dc2626;">${formatMoney(val, currency, exchangeRate)}</td>
          <td style="border: 1px solid #e2e8f0;"></td>
          <td style="border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #dc2626;">-${formatMoney(val, currency, exchangeRate)}</td>
        </tr>
      `;
    });

    tableHtml += `
        <tr style="font-weight: bold; background-color: #f8fafc;">
          <td style="padding-left: 15px; border: 1px solid #e2e8f0;">Total General Operating Expenses</td>
          <td style="border: 1px solid #e2e8f0; text-align: right; color: #dc2626;">${formatMoney(totalExpenses, currency, exchangeRate)}</td>
          <td style="border: 1px solid #e2e8f0;"></td>
          <td style="border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #dc2626;">-${formatMoney(totalExpenses, currency, exchangeRate)}</td>
        </tr>
        <tr><td colspan="4"></td></tr>
        <tr style="background-color: #fef2f2; font-weight: bold; font-size: 13px; border-top: 2px solid #ef4444;">
          <td style="color: #dc2626; padding: 10px; border: 1px solid #cbd5e1;">NET STATEMENT SURPLUS (P&L)</td>
          <td style="border: 1px solid #cbd5e1;"></td>
          <td style="border: 1px solid #cbd5e1;"></td>
          <td style="text-align: right; color: #dc2626; font-size: 14px; padding: 10px; border: 1px solid #cbd5e1;">${formatMoney(netProfit, currency, exchangeRate)}</td>
        </tr>
      </table>
    `;

    exportToExcel(tableHtml, `Commercial_Income_Statement_${formattedPeriod}`);
  };

  const handleSimulateEmailDispatch = () => {
    setEmailSending(true);
    setEmailSent(false);
    setTimeout(() => {
      setEmailSending(false);
      setEmailSent(true);
      setTimeout(() => {
        setEmailSent(false);
        setShowEmailPreview(false);
      }, 3000);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Search Period and controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-end gap-4 no-print animate-fade-in">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Statement Period Scope</label>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setPeriodType('day')}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${
                periodType === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Daily Report
            </button>
            <button
              onClick={() => setPeriodType('month')}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${
                periodType === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Monthly Report
            </button>
          </div>
        </div>

        {periodType === 'day' ? (
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase block tracking-wider">Select Day</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-brand/20 outline-none text-gray-700"
            />
          </div>
        ) : (
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase block tracking-wider">Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-brand/20 outline-none text-gray-700"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Automated monthly email summary trigger */}
          <button
            onClick={() => setShowEmailPreview(true)}
            className="px-4 py-2 bg-brand/10 text-brand hover:bg-brand/15 border border-brand/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            title="Dispatch simulated Monthly P&L to William's Email"
          >
            <Mail className="w-4 h-4 text-brand" /> Automated P&L Email
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel
          </button>
          
          <button
            onClick={() => {
              handlePrintWithFallback((title, desc) => {
                setConfirmModal({
                  isOpen: true,
                  title: t(title),
                  description: t(desc),
                  onConfirm: () => {}
                });
              }, language);
            }}
            className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Printer className="w-4 h-4 text-blue-600" /> Print PDF
          </button>
        </div>
      </div>

      {/* Core Revenue / Net cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-400 block tracking-widest uppercase">Gross Period Revenue</span>
            <span className="text-2xl font-black text-slate-800">{formatMoney(totalRevenue, currency, exchangeRate)}</span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
              {sales.length} Orders Completed
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-400 block tracking-widest uppercase">Total Operating Costs</span>
            <span className="text-2xl font-black text-slate-800">{formatMoney(totalExpenses + totalCOGS, currency, exchangeRate)}</span>
            <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
              COGS + Logged Expenses
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm flex justify-between items-start transition-colors ${
          netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
        }`}>
          <div className="space-y-1">
            <span className={`text-[10px] font-black block tracking-widest uppercase ${
              netProfit >= 0 ? 'text-emerald-800/80' : 'text-red-800/80'
            }`}>
              Net Margin Profit / Loss
            </span>
            <span className={`text-2xl font-black leading-none flex items-center gap-1.5 ${
              netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {netProfit >= 0 ? '+' : ''}{formatMoney(netProfit, currency, exchangeRate)}
              {netProfit >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald-600" /> : <ArrowDownRight className="w-5 h-5 text-red-600" />}
            </span>
            <span className={`text-[10px] block font-extrabold mt-1.5 ${
              netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
              Yield Yield Rate: {netMarginPercent.toFixed(1)}%
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
          }`}>
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* NEW SECTION 1: AUTOMATIC PROFIT/LOSS CHART IN FINANCIAL REPORT */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 animate-fade-in no-print">
        <div className="border-b pb-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand" />
              Interactive Statement Graph
            </h3>
            <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
              Live trendline comparing daily revenue flows for the chosen period scope.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500 block"></span>
              <span className="text-gray-600">Revenues (Green)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-500 block"></span>
              <span className="text-gray-600">Expenses (Orange)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 block"></span>
              <span className="text-gray-600">Net Profits (Red)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Vector SVG Renderer */}
        {renderSVGLineChart()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classical income spreadsheet layout */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 print-card">
          <div className="border-b pb-4 mb-4 flex items-center justify-between">
            <span className="font-bold text-gray-900 text-sm">Income Statement Summary</span>
            <span className="text-[10px] font-mono bg-gray-100 border px-2.5 py-1 rounded font-bold uppercase tracking-wider text-gray-500">
              Period: {periodType === 'day' ? selectedDate : selectedMonth}
            </span>
          </div>

          <div className="space-y-4 text-xs font-semibold">
            {/* 1. Revenues */}
            <div>
              <div className="text-gray-400 font-bold tracking-widest uppercase border-b pb-1 mb-2 text-[10px]">Revenues</div>
              <div className="flex justify-between py-1 text-gray-700">
                <span>Gross Product Sales</span>
                <span className="font-bold text-gray-900">{formatMoney(totalRevenue, currency, exchangeRate)}</span>
              </div>
              <div className="flex justify-between py-1 text-gray-800 font-bold border-t mt-1 text-gray-900 bg-gray-50 px-2 rounded">
                <span>Total Revenue</span>
                <span>{formatMoney(totalRevenue, currency, exchangeRate)}</span>
              </div>
            </div>

            {/* 2. Cost of Goods Sold */}
            <div>
              <div className="text-gray-400 font-bold tracking-widest uppercase border-b pb-1 mb-2 text-[10px]">Cost of Goods Sold (COGS)</div>
              <div className="flex justify-between py-1 text-gray-700">
                <span>Direct Product Inventory Cost</span>
                <span className="font-mono text-gray-900">({formatMoney(totalCOGS, currency, exchangeRate)})</span>
              </div>
              <div className="flex justify-between py-1 font-bold border-t mt-1 text-gray-900 bg-gray-50 px-2 rounded">
                <span>Total Cost of Goods Sold</span>
                <span>({formatMoney(totalCOGS, currency, exchangeRate)})</span>
              </div>
            </div>

            {/* 3. Gross Margin */}
            <div className="flex justify-between items-center py-2 border-y-2 border-double text-gray-900 text-sm bg-slate-50 px-3 rounded font-bold">
              <span>Gross Margin Profit</span>
              <div className="text-right">
                <span>{formatMoney(grossProfit, currency, exchangeRate)}</span>
                <span className="block text-[10px] text-gray-400 mt-0.5 font-bold">Gross Yield: {grossMarginPercent.toFixed(1)}%</span>
              </div>
            </div>

            {/* 4. Operating Expenses */}
            <div>
              <div className="text-gray-400 font-bold tracking-widest uppercase border-b pb-1 mb-2 text-[10px]">Operating Expenditures</div>
              {Object.keys(expensesByCategory).length > 0 ? (
                Object.entries(expensesByCategory).map(([cat, val]) => (
                  <div key={cat} className="flex justify-between py-1 text-gray-700">
                    <span>{cat} expenditure</span>
                    <span className="font-mono text-gray-900">({formatMoney(val, currency, exchangeRate)})</span>
                  </div>
                ))
              ) : (
                <div className="text-gray-400 italic py-1 pl-1 font-medium">No dynamic expenses logged during this statement period.</div>
              )}
              <div className="flex justify-between py-1 font-bold border-t mt-1 text-gray-900 bg-gray-50 px-2 rounded">
                <span>Total Operating Expenditures</span>
                <span>({formatMoney(totalExpenses, currency, exchangeRate)})</span>
              </div>
            </div>

            {/* 5. Net Profit */}
            <div className={`flex justify-between items-center p-3.5 rounded-lg border text-sm font-black transition ${
              netProfit >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'
            }`}>
              <span>NET STATEMENT SURPLUS (P&L)</span>
              <div className="text-right">
                <span className="text-base font-black">{netProfit >= 0 ? '+' : ''}{formatMoney(netProfit, currency, exchangeRate)}</span>
                <span className="block text-[10px] opacity-75 mt-0.5 font-bold">Net Margin Rate: {netMarginPercent.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Visual Column comparison charts */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col justify-between print-hide">
          <div>
            <div className="border-b pb-4 mb-6">
              <span className="font-bold text-gray-900 text-sm">Visual Statement Breakdown</span>
              <p className="text-[11px] text-gray-400 font-semibold mt-1">Graphical comparison of period flow elements.</p>
            </div>

            <div className="space-y-6">
              {/* Gross Sales */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-gray-700">Gross Sales Revenue</span>
                  <span className="font-bold text-gray-900">{formatMoney(totalRevenue, currency, exchangeRate)}</span>
                </div>
                <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden">
                  <div
                    className="bg-green-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(totalRevenue / Math.max(totalRevenue, totalCOGS, totalExpenses, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* COGS */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-gray-700">Cost of Goods Sold (COGS)</span>
                  <span className="font-bold text-gray-900">({formatMoney(totalCOGS, currency, exchangeRate)})</span>
                </div>
                <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden">
                  <div
                    className="bg-orange-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(totalCOGS / Math.max(totalRevenue, totalCOGS, totalExpenses, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Operating Expenses */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-gray-700">Operating Expenses</span>
                  <span className="font-bold text-gray-900">({formatMoney(totalExpenses, currency, exchangeRate)})</span>
                </div>
                <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(totalExpenses / Math.max(totalRevenue, totalCOGS, totalExpenses, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Net Profit */}
              <div className="space-y-1.5 pt-4 border-t">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="font-bold text-gray-800">Net Profit Yield</span>
                  <span className={`font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {netProfit >= 0 ? '+' : ''}{formatMoney(netProfit, currency, exchangeRate)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${netProfit >= 0 ? 'bg-brand' : 'bg-red-500'}`}
                    style={{ width: `${(Math.abs(netProfit) / Math.max(totalRevenue, totalCOGS, totalExpenses, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border rounded-xl p-4 text-[11px] text-gray-500 mt-6 leading-relaxed font-semibold">
            Gross Margin measures how efficiently you buy goods from suppliers relative to sale prices. Operating Expenses measure rent, transport, and utilities. Net Margin represents the real survival liquidity of your commerce branches.
          </div>
        </div>
      </div>

      {/* NEW MODAL 2: AUTOMATIC MONTHLY P&L EMAIL DISPATCH SYSTEM */}
      {showEmailPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700 animate-scale-in text-slate-100">
            {/* Header / Email client shell */}
            <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-1.5 text-brand">
                <Mail className="w-4 h-4 text-red-500" />
                Automated ERP Email Dispatch Pipeline
              </span>
              <button 
                onClick={() => setShowEmailPreview(false)} 
                className="p-1 hover:bg-slate-800 rounded text-slate-400"
                disabled={emailSending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email addressing form */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="w-16 font-bold text-slate-500">Sender:</span>
                <span className="bg-slate-850 px-2.5 py-1 rounded border border-slate-800 font-mono text-slate-300">erp-dispatch-pipeline@tradecore-singida.co.tz</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 font-bold text-slate-500">Recipient:</span>
                <input 
                  type="email" 
                  value={targetEmail} 
                  onChange={(e) => setTargetEmail(e.target.value)}
                  className="bg-slate-850 px-2.5 py-1 rounded border border-slate-700 font-mono text-slate-200 outline-none focus:border-red-500 flex-1"
                  placeholder="Enter email address"
                  disabled={emailSending}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 font-bold text-slate-500">Subject:</span>
                <span className="font-semibold text-slate-300">Global TradeCore Automated Monthly P&L Financial Statement [{selectedMonth}]</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 font-bold text-slate-500">Attachment:</span>
                <span className="bg-green-950/50 border border-green-800 text-green-400 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 font-mono">
                  <FileSpreadsheet className="w-3 h-3" /> P_and_L_Statement_{selectedMonth}.xls (32 KB)
                </span>
              </div>
            </div>

            {/* Gorgeous HTML Email body render */}
            <div className="p-6 bg-slate-900 overflow-y-auto max-h-[350px] space-y-4">
              <div className="bg-white text-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 space-y-4 font-sans text-xs">
                {/* Email Header */}
                <div className="border-b pb-4 flex justify-between items-center">
                  <div>
                    <h1 className="text-base font-black text-slate-900">Global TradeCore Ltd</h1>
                    <p className="text-[10px] text-slate-500 font-medium">Enterprise ERP Dispatch Core • Automated Reporting Service</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] bg-brand/15 text-brand font-bold px-2 py-0.5 rounded">CONFIDENTIAL REPORT</span>
                  </div>
                </div>

                <p className="font-semibold text-slate-700">Dear Stakeholder,</p>
                <p className="leading-relaxed text-slate-600">
                  Please find below the automatically generated commercial P&L and Operating Performance statement for period <strong className="text-slate-900">{selectedMonth}</strong>, compiled by Global TradeCore ERP Workspace.
                </p>

                {/* Simulated P&L mini table */}
                <div className="border border-slate-100 rounded-lg overflow-hidden my-3">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b font-bold text-slate-700">
                        <th className="px-3 py-2">Account Entry Class</th>
                        <th className="px-3 py-2 text-right">Debit (Costs)</th>
                        <th className="px-3 py-2 text-right">Credit (Revenue)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-3 py-2 font-semibold">1. Operating Sales Revenue</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right text-green-600 font-bold">{formatMoney(totalRevenue, currency, exchangeRate)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-red-700">2. Direct Product Cost (COGS)</td>
                        <td className="px-3 py-2 text-right text-red-600">({formatMoney(totalCOGS, currency, exchangeRate)})</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="px-3 py-2">3. Gross Period Margin</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right text-slate-900">{formatMoney(grossProfit, currency, exchangeRate)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-orange-700">4. General Operating Expenditures</td>
                        <td className="px-3 py-2 text-right text-orange-600">({formatMoney(totalExpenses, currency, exchangeRate)})</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                      <tr className="bg-red-50/50 font-black text-xs text-red-800 border-t-2">
                        <td className="px-3 py-2.5">NET MARGIN SURPLUS (P&L)</td>
                        <td className="px-3 py-2.5"></td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatMoney(netProfit, currency, exchangeRate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 text-[10px] text-slate-500 leading-relaxed font-semibold">
                  This report has been compiled and synchronized under secure cryptographic standards. All figures correspond dynamically to active physical warehouse states.
                </div>

                <div className="border-t pt-4 text-center text-[9px] text-slate-400 font-bold">
                  SINGIDA TRADECORE ERP SYSTEM • DODOMA HIGHWAY, SINGIDA TANZANIA
                </div>
              </div>
            </div>

            {/* Simulated Email Controls */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between no-print">
              <div className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                This is a secure simulated transmission panel.
              </div>

              <div className="flex items-center gap-2">
                {emailSending ? (
                  <button className="bg-slate-800 text-slate-400 px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2" disabled>
                    <Loader className="w-4 h-4 animate-spin" /> Dispatching P&L ...
                  </button>
                ) : emailSent ? (
                  <button className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2" disabled>
                    <CheckCircle2 className="w-4 h-4" /> Dispatched Successfully!
                  </button>
                ) : (
                  <button
                    onClick={handleSimulateEmailDispatch}
                    className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-brand/10"
                  >
                    <Send className="w-4 h-4" /> Dispatch Monthly Report
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Confirm modal for print warning */}
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
