import React, { useState, useMemo } from 'react';
import { X, Calendar, Download, Printer, Send, FileText, ArrowUpRight, ArrowDownLeft, ShieldAlert } from 'lucide-react';
import { Customer, Supplier, SalesOrder, PurchaseOrder, Store, Expense } from '../types';

interface AccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'customer' | 'supplier';
  customer?: Customer | null;
  supplier?: Supplier | null;
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  expenses?: Expense[];
  stores: Store[];
  currencySymbol?: string;
  onOpenWhatsAppModal?: (msgData: any) => void;
}

export const AccountStatementModal: React.FC<AccountStatementModalProps> = ({
  isOpen,
  onClose,
  entityType,
  customer,
  supplier,
  salesOrders,
  purchaseOrders,
  expenses = [],
  stores,
  currencySymbol = '$',
  onOpenWhatsAppModal
}) => {
  if (!isOpen) return null;

  const today = new Date().toISOString().split('T')[0];
  const firstDayOfYear = `${new Date().getFullYear()}-01-01`;

  const [startDate, setStartDate] = useState(firstDayOfYear);
  const [endDate, setEndDate] = useState(today);

  const fmt = (val: number) => `${currencySymbol}${val.toFixed(2)}`;

  const entityName = entityType === 'customer' ? customer?.name : supplier?.name;
  const entityPhone = entityType === 'customer' ? customer?.phone : supplier?.phone;
  const entityEmail = entityType === 'customer' ? customer?.email : supplier?.email;

  // Build Chronological Ledger Entries
  const ledgerEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      date: string;
      docNumber: string;
      type: 'Invoice / Sale' | 'Purchase PO' | 'Payment / Receipt' | 'Return / Credit';
      description: string;
      debit: number; // Charges or Increase in Balance
      credit: number; // Payments or Decrease in Balance
      storeName: string;
    }> = [];

    if (entityType === 'customer' && customer) {
      // Filter sales orders for customer
      const custOrders = salesOrders.filter(so => so.customerId === customer.id && so.status !== 'Voided');
      custOrders.forEach(so => {
        const storeName = stores.find(s => s.id === so.storeId)?.name || 'Main Store';
        // Sales Invoice (Debit: increases customer debt)
        entries.push({
          id: `SO-${so.id}`,
          date: so.date,
          docNumber: so.soNumber || `SO-#${so.id}`,
          type: 'Invoice / Sale',
          description: `Sales Order (${so.priceType} Price)`,
          debit: so.total,
          credit: 0,
          storeName
        });

        // If paid, add payment receipt entry (Credit: reduces customer debt)
        if (so.paymentStatus === 'Paid') {
          entries.push({
            id: `PAY-${so.id}`,
            date: so.date,
            docNumber: `REC-${so.id}`,
            type: 'Payment / Receipt',
            description: `Payment via ${so.paymentMethod || 'Cash'}`,
            debit: 0,
            credit: so.total,
            storeName
          });
        }
      });
    } else if (entityType === 'supplier' && supplier) {
      // Filter purchase orders for supplier
      const suppOrders = purchaseOrders.filter(po => po.supplierId === supplier.id);
      suppOrders.forEach(po => {
        const storeName = stores.find(s => s.id === po.storeId)?.name || 'Main Store';
        // Purchase PO (Credit: increases company debt to supplier)
        entries.push({
          id: `PO-${po.id}`,
          date: po.date,
          docNumber: po.poNumber || `PO-#${po.id}`,
          type: 'Purchase PO',
          description: `Purchase Goods (${po.status})`,
          debit: 0,
          credit: po.total,
          storeName
        });

        // If paid in full, add payment entry (Debit: reduces balance owed)
        if (po.paymentTerms === 'Paid in Full') {
          entries.push({
            id: `PO-PAY-${po.id}`,
            date: po.date,
            docNumber: `VOUCHER-${po.id}`,
            type: 'Payment / Receipt',
            description: `Supplier Payment Voucher`,
            debit: po.total,
            credit: 0,
            storeName
          });
        }
      });
    }

    // Sort chronologically
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance
    let running = 0;
    return entries.map(e => {
      if (entityType === 'customer') {
        running += e.debit - e.credit;
      } else {
        running += e.credit - e.debit;
      }
      return { ...e, runningBalance: running };
    }).filter(e => {
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });
  }, [entityType, customer, supplier, salesOrders, purchaseOrders, stores, startDate, endDate]);

  const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
  const netOutstanding = entityType === 'customer' ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">
                {entityType === 'customer' ? 'Customer Account Statement & Ledger' : 'Supplier Account Statement & Ledger'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {entityName} ({entityPhone || 'No Phone'})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="p-4 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="font-bold text-gray-700">Statement Period:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border rounded-lg bg-white font-medium text-gray-800 outline-none"
            />
            <span className="text-gray-400 font-bold">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border rounded-lg bg-white font-medium text-gray-800 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-100 transition shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
            {onOpenWhatsAppModal && (
              <button
                type="button"
                onClick={() => onOpenWhatsAppModal({
                  mode: entityType === 'customer' ? 'customer_reminder' : 'supplier_po',
                  customer,
                  supplier
                })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Share via WhatsApp</span>
              </button>
            )}
          </div>
        </div>

        {/* Statement Printable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs printable-statement">
          {/* Company & Entity Header */}
          <div className="flex flex-col sm:flex-row justify-between border-b pb-4 gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">ACCOUNT STATEMENT</h1>
              <div className="text-slate-500 text-xs mt-1">Generated on: {today}</div>
              <div className="text-slate-500 text-xs">Period: {startDate} to {endDate}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border text-right">
              <div className="font-bold text-gray-900 text-sm">{entityName}</div>
              <div className="text-gray-600">{entityPhone || 'N/A'}</div>
              <div className="text-gray-600">{entityEmail || 'N/A'}</div>
            </div>
          </div>

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 border rounded-xl">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Invoiced / Charges</div>
              <div className="text-lg font-black text-slate-900">{fmt(totalDebit)}</div>
            </div>
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl">
              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Total Payments / Credits</div>
              <div className="text-lg font-black text-emerald-700">{fmt(totalCredit)}</div>
            </div>
            <div className={`p-3.5 border rounded-xl ${netOutstanding > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50'}`}>
              <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Net Outstanding Balance</div>
              <div className={`text-lg font-black ${netOutstanding > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                {fmt(netOutstanding)}
              </div>
            </div>
          </div>

          {/* Detailed Ledger Table */}
          <div className="border rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Doc #</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Store</th>
                  <th className="p-3 text-right">Debit</th>
                  <th className="p-3 text-right">Credit</th>
                  <th className="p-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                      No transactions found for this account in the selected date range.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-gray-600">{e.date}</td>
                      <td className="p-3 font-bold text-slate-900">{e.docNumber}</td>
                      <td className="p-3 text-gray-700">
                        {e.description}
                        <span className="block text-[10px] text-gray-400">{e.type}</span>
                      </td>
                      <td className="p-3 text-gray-500">{e.storeName}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">
                        {e.debit > 0 ? fmt(e.debit) : '-'}
                      </td>
                      <td className="p-3 text-right font-semibold text-emerald-600">
                        {e.credit > 0 ? fmt(e.credit) : '-'}
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">
                        {fmt(e.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t flex justify-end no-print">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition"
          >
            Close Statement
          </button>
        </div>
      </div>
    </div>
  );
};
