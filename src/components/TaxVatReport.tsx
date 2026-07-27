import React, { useState } from 'react';
import { Building2, Calendar, Download, Printer, ShieldCheck, DollarSign, Calculator, ChevronRight } from 'lucide-react';
import { SalesOrder, PurchaseOrder, Store, Tax } from '../types';

interface TaxVatReportProps {
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  stores: Store[];
  taxes: Tax[];
  currencySymbol?: string;
}

export const TaxVatReport: React.FC<TaxVatReportProps> = ({
  salesOrders,
  purchaseOrders,
  stores,
  taxes,
  currencySymbol = '$'
}) => {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = `${today.substring(0, 7)}-01`;

  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);

  const fmt = (val: number) => `${currencySymbol}${val.toFixed(2)}`;

  // Default VAT rate if not specified (e.g. 18%)
  const defaultVatRate = taxes.length > 0 ? (taxes[0].rate / 100) : 0.18;

  // Filter Sales & Purchases
  const filteredSales = salesOrders.filter(so => {
    if (so.status === 'Voided') return false;
    const storeMatch = selectedStoreId === 'all' || so.storeId === Number(selectedStoreId);
    const dateMatch = so.date >= startDate && so.date <= endDate;
    return storeMatch && dateMatch;
  });

  const filteredPurchases = purchaseOrders.filter(po => {
    const storeMatch = selectedStoreId === 'all' || po.storeId === Number(selectedStoreId);
    const dateMatch = po.date >= startDate && po.date <= endDate;
    return storeMatch && dateMatch;
  });

  // Gross Calculations
  const grossSalesTotal = filteredSales.reduce((sum, o) => sum + o.total, 0);
  const grossPurchasesTotal = filteredPurchases.reduce((sum, o) => sum + o.total, 0);

  // Net & VAT calculations (Assuming total includes VAT)
  // Total = Net + (Net * VatRate) => Net = Total / (1 + VatRate)
  const netSalesAmount = grossSalesTotal / (1 + defaultVatRate);
  const outputVatAmount = grossSalesTotal - netSalesAmount;

  const netPurchasesAmount = grossPurchasesTotal / (1 + defaultVatRate);
  const inputVatAmount = grossPurchasesTotal - netPurchasesAmount;

  const netTaxPayable = outputVatAmount - inputVatAmount;

  return (
    <div className="space-y-6">
      {/* Top Header & Store Selector */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">TAX & VAT RETURN SUMMARY</h2>
            <p className="text-xs text-slate-400">Official tax compliance and VAT breakdown for tax filings</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-800 p-2 rounded-xl border border-slate-700">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-transparent font-bold text-white outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Store Locations</option>
              {stores.map(s => (
                <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800 p-2 rounded-xl border border-slate-700">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-white font-medium outline-none cursor-pointer"
            />
            <span className="text-slate-500 font-bold">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-white font-medium outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print Tax Return</span>
          </button>
        </div>
      </div>

      {/* Tax Summary Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Output VAT (Sales) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Output VAT (Sales)</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px]">Tax Collected</span>
          </div>
          <div className="text-2xl font-black text-slate-900">{fmt(outputVatAmount)}</div>
          <div className="text-xs text-gray-500 border-t pt-2 flex justify-between">
            <span>Gross Sales Total:</span>
            <span className="font-bold text-gray-800">{fmt(grossSalesTotal)}</span>
          </div>
        </div>

        {/* Input VAT (Purchases) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Input VAT (Purchases)</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px]">Tax Claimable</span>
          </div>
          <div className="text-2xl font-black text-slate-900">{fmt(inputVatAmount)}</div>
          <div className="text-xs text-gray-500 border-t pt-2 flex justify-between">
            <span>Gross Purchases Total:</span>
            <span className="font-bold text-gray-800">{fmt(grossPurchasesTotal)}</span>
          </div>
        </div>

        {/* Net Tax Payable / Refundable */}
        <div className={`p-5 rounded-2xl border shadow-xs space-y-2 ${
          netTaxPayable >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span className={netTaxPayable >= 0 ? 'text-amber-900' : 'text-emerald-900'}>
              {netTaxPayable >= 0 ? 'NET TAX PAYABLE TO AUTHORITY' : 'NET TAX REFUNDABLE'}
            </span>
            <ShieldCheck className="w-4 h-4 text-amber-700" />
          </div>
          <div className={`text-2xl font-black ${netTaxPayable >= 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            {fmt(Math.abs(netTaxPayable))}
          </div>
          <div className="text-xs text-gray-600 border-t border-amber-200/60 pt-2">
            Applied VAT Rate: <span className="font-bold">{(defaultVatRate * 100).toFixed(0)}% Standard</span>
          </div>
        </div>
      </div>

      {/* Tax Class Breakdown Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between font-bold text-xs text-gray-800">
          <span>VAT / Tax Return Calculation Schedule</span>
          <span>Period: {startDate} ~ {endDate}</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b">
            <tr>
              <th className="p-3.5">Tax Category / Classification</th>
              <th className="p-3.5 text-right">Gross Amount</th>
              <th className="p-3.5 text-right">Net Taxable Base</th>
              <th className="p-3.5 text-right">VAT Amount (Tax)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium">
            {/* Sales Section */}
            <tr className="bg-emerald-50/50 font-bold text-emerald-900">
              <td colSpan={4} className="p-2.5">1. OUTPUT TAX SCHEDULE (SALES & REVENUE)</td>
            </tr>
            <tr>
              <td className="p-3.5 pl-6">Standard Rated Supplies (VAT {(defaultVatRate * 100).toFixed(0)}%)</td>
              <td className="p-3.5 text-right font-bold">{fmt(grossSalesTotal)}</td>
              <td className="p-3.5 text-right font-semibold">{fmt(netSalesAmount)}</td>
              <td className="p-3.5 text-right font-black text-emerald-700">{fmt(outputVatAmount)}</td>
            </tr>

            {/* Purchases Section */}
            <tr className="bg-blue-50/50 font-bold text-blue-900">
              <td colSpan={4} className="p-2.5">2. INPUT TAX SCHEDULE (PURCHASES & EXPENSES)</td>
            </tr>
            <tr>
              <td className="p-3.5 pl-6">Standard Rated Purchases (VAT {(defaultVatRate * 100).toFixed(0)}%)</td>
              <td className="p-3.5 text-right font-bold">{fmt(grossPurchasesTotal)}</td>
              <td className="p-3.5 text-right font-semibold">{fmt(netPurchasesAmount)}</td>
              <td className="p-3.5 text-right font-black text-blue-700">{fmt(inputVatAmount)}</td>
            </tr>

            {/* Net Tax Summary Row */}
            <tr className="bg-slate-900 text-white font-black text-sm">
              <td className="p-4" colSpan={3}>3. NET VAT DUE / (REFUND CLAIM) FOR THE PERIOD:</td>
              <td className="p-4 text-right text-emerald-400">{fmt(netTaxPayable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
