import React, { useState } from 'react';
import { Expense, Store } from '../types';
import { formatMoney, exportToExcel } from '../utils/format';
import { handlePrintWithFallback } from '../utils/printHelper';
import { Plus, Trash2, Pencil, Search, Calendar, CreditCard, Receipt, AlertCircle, FileSpreadsheet, Printer } from 'lucide-react';
import { ConfirmActionModal } from './ConfirmActionModal';

interface ExpensesProps {
  expenses: Expense[];
  stores: Store[];
  currentStoreId: number | null;
  currency: 'USD' | 'TZS';
  exchangeRate: number;
  isAdmin: boolean;
  logAction: (action: string, details: string) => void;
  onUpdateExpenses: (newExpenses: Expense[]) => void;
  translate: (t: string) => string;
}

export default function Expenses({
  expenses,
  stores,
  currentStoreId,
  currency,
  exchangeRate,
  isAdmin,
  logAction,
  onUpdateExpenses,
  translate
}: ExpensesProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
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
  
  // Form fields
  const [category, setCategory] = useState('Utilities');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const activeStores = stores.filter(s => !s.isDeleted);
  const [storeId, setStoreId] = useState<number>(currentStoreId || (activeStores[0]?.id || 1));
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank' | 'Mobile Money'>('Cash');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const categories = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Packaging', 'Marketing', 'Other'];

  const handleOpenAdd = () => {
    setEditingExpenseId(null);
    setCategory('Utilities');
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    if (currentStoreId) setStoreId(currentStoreId);
    setPaymentMethod('Cash');
    setShowAddForm(true);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpenseId(exp.id);
    setCategory(exp.category);
    setDescription(exp.description);
    // Convert to display amount for edit form
    const displayAmt = currency === 'TZS' ? exp.amount * exchangeRate : exp.amount;
    setAmount(displayAmt.toString());
    setDate(exp.date);
    setStoreId(exp.storeId);
    setPaymentMethod(exp.paymentMethod);
    setShowAddForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount) return;

    // Convert input amount back to USD (base currency)
    const rawAmt = parseFloat(amount);
    const usdAmount = currency === 'TZS' ? rawAmt / exchangeRate : rawAmt;

    if (editingExpenseId !== null) {
      // Edit mode
      const updated = expenses.map(exp => {
        if (exp.id === editingExpenseId) {
          return {
            ...exp,
            category,
            description,
            amount: usdAmount,
            date,
            storeId: Number(storeId),
            paymentMethod
          };
        }
        return exp;
      });
      onUpdateExpenses(updated);
      logAction("Edited Expense", `Modified expense ${editingExpenseId}: ${description} (${usdAmount} USD)`);
    } else {
      // Create mode
      const maxId = expenses.length > 0 ? Math.max(...expenses.map(e => e.id)) : 0;
      const newExp: Expense = {
        id: maxId + 1,
        expenseNumber: `EXP-2026-${String(maxId + 1).padStart(4, '0')}`,
        category,
        description,
        amount: usdAmount,
        date,
        storeId: Number(storeId),
        paymentMethod
      };
      onUpdateExpenses([newExp, ...expenses]);
      logAction("Logged Expense", `Added expense: ${newExp.expenseNumber} - ${description} (${usdAmount} USD)`);
    }

    setShowAddForm(false);
  };

  const handleDelete = (id: number, expNum: string) => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: translate("Confirm Delete Expense"),
      description: translate("Are you sure you want to completely delete this expense?"),
      onConfirm: () => {
        const filtered = expenses.filter(exp => exp.id !== id);
        onUpdateExpenses(filtered);
        logAction("Deleted Expense", `Removed expense item: ${expNum}`);
      }
    });
  };

  const getStoreName = (id: number) => {
    return stores.find(s => s.id === id)?.name || `Store #${id}`;
  };

  // Filter local store and queries
  const filteredExpenses = expenses.filter(exp => {
    const matchStore = currentStoreId ? exp.storeId === currentStoreId : true;
    const matchCat = filterCategory ? exp.category === filterCategory : true;
    const matchSearch = searchQuery
      ? exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.expenseNumber.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchStore && matchCat && matchSearch;
  });

  const totalFilteredAmt = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleExportExcel = () => {
    let tableHtml = `
      <h3>${translate('Expenses')} Report - ${currentStoreId ? getStoreName(currentStoreId) : 'All Stores'}</h3>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th style="background-color: #ef4444; color: white;">Expense ID</th>
            <th style="background-color: #ef4444; color: white;">Date</th>
            <th style="background-color: #ef4444; color: white;">Category</th>
            <th style="background-color: #ef4444; color: white;">Description</th>
            <th style="background-color: #ef4444; color: white;">Store Location</th>
            <th style="background-color: #ef4444; color: white;">Payment Method</th>
            <th style="background-color: #ef4444; color: white; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
    `;
    filteredExpenses.forEach(exp => {
      tableHtml += `
        <tr>
          <td style="font-weight: bold; color: #dc2626; font-family: monospace;">${exp.expenseNumber}</td>
          <td>${exp.date}</td>
          <td>${translate(exp.category)}</td>
          <td>${exp.description}</td>
          <td>${getStoreName(exp.storeId)}</td>
          <td>${exp.paymentMethod}</td>
          <td style="text-align: right; font-weight: bold;">${formatMoney(exp.amount, currency, exchangeRate)}</td>
        </tr>
      `;
    });
    tableHtml += `
          <tr style="background-color: #fef2f2; font-weight: bold;">
            <td colspan="6" style="text-align: right; padding: 10px;">Total Period Outflow:</td>
            <td style="text-align: right; color: #dc2626; padding: 10px;">${formatMoney(totalFilteredAmt, currency, exchangeRate)}</td>
          </tr>
        </tbody>
      </table>
    `;
    exportToExcel(tableHtml, `Expenses_Report_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between no-print">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-medium text-gray-700"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
            title="Export directly to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Export Excel
          </button>
          
          <button
            onClick={() => {
              handlePrintWithFallback((title, desc) => {
                setConfirmModal({
                  isOpen: true,
                  title: translate(title),
                  description: translate(desc),
                  onConfirm: () => {}
                });
              });
            }}
            className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
            title="Print PDF of current view"
          >
            <Printer className="w-3.5 h-3.5 text-blue-600" /> Print PDF
          </button>

          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-1.5 text-right">
            <span className="text-[9px] font-bold text-gray-400 block tracking-wider uppercase">Outflow</span>
            <span className="text-xs font-black text-red-600">{formatMoney(totalFilteredAmt, currency, exchangeRate)}</span>
          </div>
          
          {isAdmin && (
            <button
              onClick={handleOpenAdd}
              className="bg-brand hover:bg-brand-hover text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shadow-sm"
            >
              <Plus className="w-4 h-4" /> Log Expense
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-2xl mx-auto">
          <h3 className="font-bold text-gray-900 text-sm mb-4 border-b pb-2">
            {editingExpenseId ? 'Modify Expense details' : 'Log New Expense'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-medium"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Amount ({currency === 'TZS' ? 'TSh' : 'USD'})</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-mono font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Assigned Store</label>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white font-medium"
                >
                  {activeStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'Bank', 'Mobile Money'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 border rounded-lg text-xs font-semibold transition ${
                        paymentMethod === method
                          ? 'border-brand bg-brand-light text-brand'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Rent payment, electricity grid token, transport cost..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white"
                ></textarea>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-hover"
              >
                Save Log
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                <th className="px-5 py-3">Expense ID</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Store Location</th>
                <th className="px-5 py-3">Payment Method</th>
                <th className="px-5 py-3 text-right">Amount</th>
                {isAdmin && <th className="px-5 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredExpenses.map(exp => (
                <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-bold text-brand font-mono">{exp.expenseNumber}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{exp.date}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      {translate(exp.category)}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-900">{exp.description}</td>
                  <td className="px-5 py-3 text-gray-600">{getStoreName(exp.storeId)}</td>
                  <td className="px-5 py-3 text-gray-600 font-medium">{exp.paymentMethod}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">
                    {formatMoney(exp.amount, currency, exchangeRate)}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => handleOpenEdit(exp)}
                          className="p-1 hover:bg-gray-100 rounded text-blue-600"
                          title="Modify"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id, exp.expenseNumber)}
                          className="p-1 hover:bg-red-50 rounded text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-5 py-8 text-center text-gray-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No expenses logged for current store context.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
