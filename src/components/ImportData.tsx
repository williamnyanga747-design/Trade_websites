import React, { useState } from 'react';
import { StockItem, Customer, Supplier, Store } from '../types';
import { FileUp, HelpCircle, CheckCircle } from 'lucide-react';

interface ImportDataProps {
  currentPage: string;
  stores: Store[];
  stockItems: StockItem[];
  customers: Customer[];
  suppliers: Supplier[];
  translate: (text: string) => string;
  logAction: (action: string, details: string) => void;
  saveAllData: (updatedFields: any) => void;
  onNavigate: (page: string) => void;
}

export default function ImportData({
  currentPage,
  stores,
  stockItems,
  customers,
  suppliers,
  translate: t,
  logAction,
  saveAllData,
  onNavigate
}: ImportDataProps) {
  const [pasteAreaValue, setPasteAreaValue] = useState('');

  const handleImport = () => {
    if (!pasteAreaValue.trim()) {
      alert(t('Paste CSV or CSV data before submitting'));
      return;
    }

    const lines = pasteAreaValue.split('\n');
    let parsedCount = 0;
    let duplicateCount = 0;

    if (currentPage === 'import-stock') {
      const updatedStockItems = [...stockItems];
      lines.forEach(line => {
        const cols = line.split(',').map(c => c.trim());
        if (cols.length >= 7 && cols[0] && cols[1]) {
          const name = cols[0];
          const code = cols[1];
          const cat = cols[2];
          const purchasePrice = parseFloat(cols[3]) || 0;
          const retailPrice = parseFloat(cols[4]) || 0;
          const wholesalePrice = parseFloat(cols[5]) || 0;
          const lowStockQty = parseInt(cols[6]) || 5;

          const exists = updatedStockItems.some(
            item => item.code.toLowerCase() === code.toLowerCase()
          );
          if (exists) {
            duplicateCount++;
          } else {
            const nextId = Math.max(0, ...updatedStockItems.map(x => x.id)) + 1;
            const newItem: StockItem = {
              id: nextId,
              name,
              code,
              category: cat,
              stock: {},
              purchasePrice,
              retailPrice,
              wholesalePrice,
              lowStockQty
            };
            stores.forEach(s => {
              newItem.stock[s.id] = 0;
            });
            updatedStockItems.push(newItem);
            parsedCount++;
          }
        }
      });

      saveAllData({ stockItems: updatedStockItems });
      logAction('Bulk Import Stock Items', `Imported ${parsedCount} items successfully. Found ${duplicateCount} duplicates.`);
      alert(`${t('Import completed')}: ${parsedCount} ${t('added')}. ${duplicateCount} ${t('skipped')}.`);
      onNavigate('stock-items');

    } else if (currentPage === 'import-customers') {
      const updatedCustomers = [...customers];
      lines.forEach(line => {
        const cols = line.split(',').map(c => c.trim());
        if (cols.length >= 6 && cols[0]) {
          const name = cols[0];
          const type = cols[1] === 'Wholesale' ? 'Wholesale' : 'Retail';
          const phone = cols[2];
          const email = cols[3];
          const creditLimit = parseFloat(cols[4]) || 0;
          const balance = parseFloat(cols[5]) || 0;

          const nextId = Math.max(0, ...updatedCustomers.map(x => x.id)) + 1;
          const newCust: Customer = {
            id: nextId,
            name,
            type,
            phone,
            email,
            creditLimit,
            balance
          };
          updatedCustomers.push(newCust);
          parsedCount++;
        }
      });

      saveAllData({ customers: updatedCustomers });
      logAction('Bulk Import Customers', `Imported ${parsedCount} customers successfully.`);
      alert(`${t('Import completed')}: ${parsedCount} ${t('added')}.`);
      onNavigate('customers');

    } else if (currentPage === 'import-suppliers') {
      const updatedSuppliers = [...suppliers];
      lines.forEach(line => {
        const cols = line.split(',').map(c => c.trim());
        if (cols.length >= 4 && cols[0]) {
          const name = cols[0];
          const contact = cols[1];
          const phone = cols[2];
          const email = cols[3];

          const newSupplier: Supplier = {
            id: Math.max(0, ...updatedSuppliers.map(x => x.id)) + 1,
            name,
            contact,
            phone,
            email
          };
          updatedSuppliers.push(newSupplier);
          parsedCount++;
        }
      });

      saveAllData({ suppliers: updatedSuppliers });
      logAction('Bulk Import Suppliers', `Imported ${parsedCount} suppliers successfully.`);
      alert(`${t('Import completed')}: ${parsedCount} ${t('added')}.`);
      onNavigate('suppliers');
    }
  };

  // Setup layout values according to current import type
  let title = '';
  let subtitle = '';
  let placeholder = '';

  if (currentPage === 'import-stock') {
    title = t('Import Stock Items');
    subtitle = t('CSV Template Format: Name, Code, Category, PurchasePrice, RetailPrice, WholesalePrice, LowStockQty');
    placeholder = 'Laptop i7, SK-I7-BL, Electronics, 600, 850, 780, 5\nSingida Rice 25kg, SGR-25K, Cereals, 22, 30, 26, 10';
  } else if (currentPage === 'import-customers') {
    title = t('Import Customers');
    subtitle = t('CSV Template Format: Name, Type (Retail/Wholesale), Phone, Email, CreditLimit, CurrentBalance');
    placeholder = 'Azam Distributors, Wholesale, +255 711 999 888, orders@azam.co.tz, 500000, 1200\nJohn Doe Retail, Retail, +255 688 123 456, john@gmail.com, 100000, 0';
  } else if (currentPage === 'import-suppliers') {
    title = t('Import Suppliers');
    subtitle = t('CSV Template Format: Company Name, Contact Person, Phone, Email');
    placeholder = 'Bakhresa Food Products, Juma Bakari, +255 22 286 0123, bakhresa@food.co.tz\nUniversal Electronics, S. Patel, +255 754 000 111, imports@universal.co.tz';
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm max-w-4xl mx-auto p-6">
      <h3 className="font-bold text-lg text-gray-900 mb-1 flex items-center gap-2">
        <FileUp className="w-5 h-5 text-brand" />
        {title}
      </h3>
      <p className="text-xs text-gray-500 mb-6 font-semibold">{subtitle}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
              {t('Paste CSV Raw Data (Comma Separated)')}
            </label>
            <textarea
              id="import-paste-area"
              rows={8}
              value={pasteAreaValue}
              onChange={(e) => setPasteAreaValue(e.target.value)}
              className="w-full font-mono text-xs p-4 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-brand/15 focus:bg-white transition"
              placeholder={placeholder}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-semibold leading-relaxed max-w-xs">
              {t('Tip: Exclude column headers and keep the sequence exactly as specified.')}
            </span>
            <button
              onClick={handleImport}
              className="bg-brand hover:bg-brand-hover text-white px-6 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
            >
              <CheckCircle className="w-4 h-4" /> {t('Validate and Import')}
            </button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 text-xs text-gray-600 space-y-3">
          <div className="font-bold text-gray-800 flex items-center gap-1.5 border-b pb-2 mb-2">
            <HelpCircle className="w-4 h-4 text-brand" />
            {t('How does it work?')}
          </div>
          <p>1. {t('Copy the expected CSV sequence outlined in the subtitle.')}</p>
          <p>2. {t('Keep one item or record per line.')}</p>
          <p>3. {t('Do not place quotation marks around numbers or prices.')}</p>
          <p>4. {t('Click the validate button to scan, cross-reference SKU duplicates, and register entries.')}</p>
        </div>
      </div>
    </div>
  );
}
