import React, { useState } from 'react';
import { MessageSquare, Send, X, Printer, Phone, DollarSign, Calendar, Copy, Check, FileText } from 'lucide-react';
import { Customer, SalesOrder, Store, Supplier, PurchaseOrder } from '../types';

interface SmartMessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'receipt' | 'customer_reminder' | 'supplier_po';
  salesOrder?: SalesOrder | null;
  customer?: Customer | null;
  supplier?: Supplier | null;
  purchaseOrder?: PurchaseOrder | null;
  store?: Store | null;
  currencySymbol?: string;
  itemsDetail?: Array<{ name: string; qty: number; price: number }>;
}

export const SmartMessagingModal: React.FC<SmartMessagingModalProps> = ({
  isOpen,
  onClose,
  mode,
  salesOrder,
  customer,
  supplier,
  purchaseOrder,
  store,
  currencySymbol = '$',
  itemsDetail = []
}) => {
  if (!isOpen) return null;

  const [phoneInput, setPhoneInput] = useState<string>(
    customer?.phone || supplier?.phone || salesOrder?.customerId ? (customer?.phone || '') : ''
  );
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'sms' | 'slip_preview'>('whatsapp');

  // Format currency
  const fmt = (val: number) => `${currencySymbol}${val.toFixed(2)}`;

  // Construct Receipt Message
  const buildReceiptText = () => {
    const storeName = store?.name || 'TradeCore Unified Store';
    const storeLoc = store?.location || '';
    const storeTel = store?.phone ? `Tel: ${store.phone}` : '';
    const orderNo = salesOrder?.soNumber || salesOrder?.id || 'SO-000';
    const date = salesOrder?.date || new Date().toISOString().split('T')[0];
    const custName = customer?.name || 'Valued Customer';
    const total = salesOrder?.total || 0;
    const paymentMethod = salesOrder?.paymentMethod || 'Cash';

    let itemLines = itemsDetail.map(i => `• ${i.name} x${i.qty} = ${fmt(i.price * i.qty)}`).join('\n');
    if (!itemLines && salesOrder?.items) {
      itemLines = salesOrder.items.map(i => `• Item #${i.productId} x${i.qty} = ${fmt(i.price * i.qty)}`).join('\n');
    }

    return `🧾 *OFFICIAL DIGITAL RECEIPT*
🏢 *${storeName}*
${storeLoc}
${storeTel}
----------------------------------
📌 *Order #:* ${orderNo}
📅 *Date:* ${date}
👤 *Customer:* ${custName}
----------------------------------
*ITEMS PURCHASED:*
${itemLines || '• Sales Order Items'}
----------------------------------
💰 *TOTAL PAID:* ${fmt(total)}
💳 *PAYMENT METHOD:* ${paymentMethod}
----------------------------------
Thank you for shopping with us! 🙏
_Keep this message as your digital proof of payment._`;
  };

  // Construct Payment Reminder Notice
  const buildReminderText = () => {
    const storeName = store?.name || 'TradeCore Store';
    const storeTel = store?.phone ? `Tel: ${store.phone}` : '';
    const custName = customer?.name || 'Valued Customer';
    const balanceDue = customer?.balance || 0;

    return `⚠️ *PAYMENT DUE REMINDER*
🏢 *${storeName}*
${storeTel}

Dear *${custName}*,

This is a friendly reminder that you have an outstanding credit balance of *${fmt(balanceDue)}* with *${storeName}*.

 Please kindly arrange payment at your earliest convenience or contact us if you have any questions.

Thank you for your prompt attention! 🙏`;
  };

  // Construct Supplier PO Message
  const buildSupplierPOText = () => {
    const storeName = store?.name || 'TradeCore Store';
    const poNo = purchaseOrder?.poNumber || purchaseOrder?.id || 'PO-000';
    const suppName = supplier?.name || 'Valued Supplier';
    const total = purchaseOrder?.total || 0;

    return `📦 *PURCHASE ORDER NOTICE*
🏢 *${storeName}*

Dear *${suppName}*,

Please find details for Purchase Order *#${poNo}*:
📌 *PO Number:* ${poNo}
📅 *Date:* ${purchaseOrder?.date || new Date().toISOString().split('T')[0]}
💰 *Total Amount:* ${fmt(total)}
📋 *Status:* ${purchaseOrder?.status || 'Pending'}

Please confirm receipt and expected delivery date. Thank you!`;
  };

  const currentMessage = mode === 'receipt' 
    ? buildReceiptText() 
    : mode === 'customer_reminder' 
    ? buildReminderText() 
    : buildSupplierPOText();

  // Sanitize phone number for WhatsApp
  const cleanPhone = phoneInput.replace(/[^0-9]/g, '');

  const getWhatsAppUrl = () => {
    const encoded = encodeURIComponent(currentMessage);
    if (cleanPhone) {
      return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
    }
    return `https://api.whatsapp.com/send?text=${encoded}`;
  };

  const getSMSUrl = () => {
    const encoded = encodeURIComponent(currentMessage);
    if (cleanPhone) {
      return `sms:${cleanPhone}?body=${encoded}`;
    }
    return `sms:?body=${encoded}`;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(currentMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] print-card">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-2 font-bold text-base">
            <MessageSquare className="w-5 h-5 text-emerald-200" />
            <span>
              {mode === 'receipt' && 'WhatsApp / SMS Digital Receipt'}
              {mode === 'customer_reminder' && 'Send Payment Due Reminder'}
              {mode === 'supplier_po' && 'Send Supplier Purchase Order'}
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-600">
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-1 py-3 text-center border-b-2 flex items-center justify-center gap-1.5 transition ${
              activeTab === 'whatsapp' ? 'border-emerald-600 text-emerald-700 bg-white' : 'border-transparent hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp Share</span>
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`flex-1 py-3 text-center border-b-2 flex items-center justify-center gap-1.5 transition ${
              activeTab === 'sms' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Phone className="w-4 h-4 text-blue-600" />
            <span>SMS Message</span>
          </button>
          <button
            onClick={() => setActiveTab('slip_preview')}
            className={`flex-1 py-3 text-center border-b-2 flex items-center justify-center gap-1.5 transition ${
              activeTab === 'slip_preview' ? 'border-purple-600 text-purple-700 bg-white' : 'border-transparent hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4 text-purple-600" />
            <span>Receipt Slip Preview</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Recipient Phone Input */}
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Recipient Phone Number (Include Country Code e.g. 254... or 255...):
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. 255712345678 or 254712345678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-xl font-mono text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/30 outline-none"
              />
            </div>
          </div>

          {activeTab !== 'slip_preview' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-700">Formatted Message Content:</span>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                </button>
              </div>
              <textarea
                rows={10}
                readOnly
                value={currentMessage}
                className="w-full p-3 font-mono text-xs border rounded-xl bg-slate-900 text-emerald-400 font-medium leading-relaxed resize-none shadow-inner"
              />
            </div>
          ) : (
            /* Digital Receipt Slip Preview */
            <div className="bg-amber-50/50 p-4 border border-amber-200 rounded-xl font-mono text-gray-800 text-xs shadow-sm space-y-2">
              <div className="text-center font-bold text-sm uppercase tracking-wide border-b pb-2 border-dashed border-amber-300">
                {store?.name || 'TradeCore Store'}
                <div className="text-[10px] font-normal text-gray-500 capitalize">{store?.location || 'Main Branch'}</div>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Doc #: {salesOrder?.soNumber || salesOrder?.id || 'SO-000'}</span>
                <span>Date: {salesOrder?.date || 'Today'}</span>
              </div>
              <div className="text-[11px] font-bold text-gray-700 border-b border-dashed border-amber-300 pb-1">
                Customer: {customer?.name || 'Walk-in Customer'}
              </div>
              <div className="space-y-1 py-1">
                {itemsDetail.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span>{item.name} x{item.qty}</span>
                    <span className="font-bold">{fmt(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-amber-300 pt-2 flex justify-between font-black text-sm text-emerald-800">
                <span>TOTAL DUE:</span>
                <span>{fmt(salesOrder?.total || 0)}</span>
              </div>
              <div className="text-center text-[10px] text-gray-500 pt-2 border-t border-amber-200">
                *** DIGITAL THERMAL SLIP PREVIEW ***
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="bg-gray-50 p-4 border-t border-gray-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>

          {activeTab === 'whatsapp' && (
            <a
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Open in WhatsApp</span>
            </a>
          )}

          {activeTab === 'sms' && (
            <a
              href={getSMSUrl()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all"
            >
              <Phone className="w-4 h-4" />
              <span>Send SMS</span>
            </a>
          )}

          {activeTab === 'slip_preview' && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Print Slip</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
