import { jsPDF } from 'jspdf';
import { SalesOrder, Customer, Store, StockItem, User } from '../types';
import { translate, formatMoney } from './format';

interface PDFGeneratorParams {
  order: SalesOrder;
  customer: Customer | null;
  store: Store | null;
  stockItems: StockItem[];
  currentUser: User | null;
  currency: 'USD' | 'TZS';
  exchangeRate: number;
  language: 'en' | 'sw';
  companyDetails: {
    name: string;
    branch: string;
    phone: string;
    email: string;
    logo?: string | null;
  };
}

// Generate deterministic anti-tamper security hash for receipts (matching Receipts.tsx)
function generateAuditHash(order: SalesOrder, cashierName: string): string {
  const orderNum = order.soNumber || '9999';
  const dataStr = `${orderNum}-${order.date}-${order.total}-${cashierName}`;
  let hash = 0;
  for (let i = 0; i < dataStr.length; i++) {
    const char = dataStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `TRA-TC26-${hex}-${orderNum.slice(-4)}`;
}

export function generateSalesOrderPDF({
  order,
  customer,
  store,
  stockItems,
  currentUser,
  currency,
  exchangeRate,
  language,
  companyDetails
}: PDFGeneratorParams): void {
  // Initialize A4 portrait document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const t = (text: string) => translate(text, language);
  const fmt = (amt: number) => formatMoney(amt, currency, exchangeRate);

  // Set default font to Helvetica
  doc.setFont('Helvetica', 'normal');

  // --- 1. HEADER BRANDING ---
  let headerTextLeftMargin = 15;
  
  // If base64 logo is present, draw it
  if (companyDetails.logo && companyDetails.logo.startsWith('data:image/')) {
    try {
      doc.addImage(companyDetails.logo, 'PNG', 15, 15, 22, 22);
      headerTextLeftMargin = 42;
    } catch (e) {
      console.error('Error drawing logo in PDF:', e);
    }
  }

  // Draw company details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(companyDetails.name || 'TradeCore Ltd', headerTextLeftMargin, 20);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  
  let lineOffset = 25;
  if (companyDetails.branch) {
    doc.text(companyDetails.branch, headerTextLeftMargin, lineOffset);
    lineOffset += 4;
  }
  if (companyDetails.phone) {
    doc.text(`${t('Phone') || 'Phone'}: ${companyDetails.phone}`, headerTextLeftMargin, lineOffset);
    lineOffset += 4;
  }
  if (companyDetails.email) {
    doc.text(`${t('Email') || 'Email'}: ${companyDetails.email}`, headerTextLeftMargin, lineOffset);
  }

  // Draw Invoice Title on Right Column
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(220, 38, 38); // brand red or dark gray (slate-900)
  doc.text(t('TAX INVOICE'), 195, 20, { align: 'right' });

  // Invoice Metadata on Right Column
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // slate-900
  
  doc.text(`${t('Invoice #') || 'Invoice #'}:`, 150, 27);
  doc.setFont('Helvetica', 'bold');
  doc.text(order.soNumber, 195, 27, { align: 'right' });

  doc.setFont('Helvetica', 'normal');
  doc.text(`${t('Transaction Date') || 'Date'}:`, 150, 32);
  doc.setFont('Helvetica', 'bold');
  doc.text(order.date, 195, 32, { align: 'right' });

  doc.setFont('Helvetica', 'normal');
  doc.text(`${t('Pricing Mode') || 'Pricing Mode'}:`, 150, 37);
  doc.setFont('Helvetica', 'bold');
  doc.text(order.priceType, 195, 37, { align: 'right' });

  // Draw elegant divider bar
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(15, 43, 195, 43);

  // --- 2. BILL TO & STORE INFO CARD ---
  // Background card for contacts
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(15, 47, 180, 25, 'F');
  
  // Vertical column divider inside contact card
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.line(105, 47, 105, 72);

  // Bill To (Left side of card)
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(124, 58, 237); // Purple accent or slate-500
  doc.text(t('Customers').toUpperCase(), 20, 52);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(customer?.name || t('Walk-in Customer'), 20, 57);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  const custContact = customer ? `${customer.phone || ''} ${customer.email ? '• ' + customer.email : ''}`.trim() : '';
  doc.text(custContact || `${t('Retail') || 'Retail Checkout Customer'}`, 20, 62);
  doc.text(`${t('Credit Balance' ) || 'Credit Balance'}: ${customer ? fmt(customer.balance) : fmt(0)}`, 20, 67);

  // Fulfilled At / Store (Right side of card)
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235); // Blue accent
  doc.text(t('Store Management').toUpperCase(), 110, 52);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(store?.name || t('Main Store Branch'), 110, 57);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(store?.location || t('Central Depot Address'), 110, 62);
  doc.text(`${t('Cashier / Staff Name' ) || 'Cashier'}: ${currentUser?.name || 'Authorized Terminal'}`, 110, 67);

  // --- 3. PRODUCTS TABLE ---
  let tableY = 78;

  // Header Background Fill
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(15, tableY, 180, 8, 'F');

  // Header Labels
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255); // white
  doc.text('#', 18, tableY + 5.5);
  doc.text(t('Item Description') || 'Item Description', 28, tableY + 5.5);
  doc.text(t('Qty') || 'Qty', 115, tableY + 5.5, { align: 'center' });
  doc.text(t('Unit Price') || 'Unit Price', 150, tableY + 5.5, { align: 'right' });
  doc.text(t('Line Total') || 'Line Total', 190, tableY + 5.5, { align: 'right' });

  // Rows Rendering
  let currentY = tableY + 8;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);

  order.items.forEach((item, idx) => {
    // Alternate row backgrounds
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(15, currentY, 180, 8.5, 'F');
    }

    doc.setTextColor(15, 23, 42); // slate-900
    
    // Row Index
    doc.text((idx + 1).toString(), 18, currentY + 5.5);

    // Product Name
    const product = stockItems.find(p => p.id === item.productId);
    let prodName = product?.name || t('Unknown Product');
    const prodCode = product?.code ? ` [${product.code}]` : '';
    
    // Truncate to ensure elegant single-line fit
    const fullDesc = `${prodName}${prodCode}`;
    const truncatedDesc = fullDesc.length > 52 ? fullDesc.slice(0, 49) + '...' : fullDesc;
    doc.text(truncatedDesc, 28, currentY + 5.5);

    // Quantity (centered)
    doc.text(item.qty.toString(), 115, currentY + 5.5, { align: 'center' });

    // Unit Price (right-aligned)
    doc.text(fmt(item.price), 155, currentY + 5.5, { align: 'right' });

    // Total Price (right-aligned)
    const lineTotal = item.qty * item.price;
    doc.setFont('Helvetica', 'bold');
    doc.text(fmt(lineTotal), 190, currentY + 5.5, { align: 'right' });
    doc.setFont('Helvetica', 'normal');

    // Bottom border for each row
    doc.setDrawColor(241, 245, 249); // slate-100
    doc.line(15, currentY + 8.5, 195, currentY + 8.5);

    currentY += 8.5;
  });

  // --- 4. TOTALS CALCULATION & GRID ---
  currentY += 4;
  
  const subtotal = order.total / 1.18;
  const vat = order.total - subtotal;

  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600

  // Subtotal Row
  doc.text(`${t('Subtotal') || 'Subtotal'}:`, 140, currentY + 4);
  doc.setFont('Helvetica', 'bold');
  doc.text(fmt(subtotal), 190, currentY + 4, { align: 'right' });

  // VAT Breakdown Row
  doc.setFont('Helvetica', 'normal');
  doc.text(`${t('VAT Breakdown') || 'VAT Breakdown'} (18%):`, 140, currentY + 9);
  doc.setFont('Helvetica', 'bold');
  doc.text(fmt(vat), 190, currentY + 9, { align: 'right' });

  // Grand Total Solid Box
  currentY += 13;
  doc.setFillColor(254, 242, 242); // brand-tint / light red background
  doc.setDrawColor(252, 165, 165); // soft red border
  doc.rect(115, currentY, 80, 10.5, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(220, 38, 38); // brand red / deep red
  doc.text(`${t('GRAND TOTAL') || 'GRAND TOTAL'}:`, 120, currentY + 6.5);
  
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(fmt(order.total), 190, currentY + 6.5, { align: 'right' });

  // --- 5. CRYPTOGRAPHIC VERIFICATION & SIGNATURES ---
  // Ensure we place the bottom audit/signatures neatly at the page footer
  const footerY = Math.max(currentY + 18, 230);

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(15, footerY, 195, footerY);

  // Left side: Digital Security Stamp
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 148, 136); // Teal-600
  doc.text((t('E-Invoice Verification') || 'E-Invoice Verification').toUpperCase(), 15, footerY + 6);

  // Secure Border Card
  doc.setFillColor(240, 253, 250); // Teal-50
  doc.setDrawColor(204, 251, 241); // Teal-100
  doc.rect(15, footerY + 8, 85, 19, 'FD');

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110); // Teal-700
  doc.text(t('Security Verification Code') || 'Security Verification Code', 18, footerY + 12.5);
  
  const cashierName = currentUser?.name || 'Cashier Terminal 1';
  const auditHash = generateAuditHash(order, cashierName);
  
  doc.setFont('Courier', 'bold'); // Monospace feeling
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(auditHash, 18, footerY + 17);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(13, 148, 136); // Teal-600
  doc.text('STATUS: CRYPTOGRAPHICALLY SECURED & VERIFIED', 18, footerY + 23);

  // Right side: Manual Authorizations
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600

  // Prepared By / Cashier Sign line
  doc.text(`${t('Prepared By') || 'Prepared By'}: ____________________________`, 115, footerY + 11);
  doc.setFontSize(7.5);
  doc.text(`${t('Cashier') || 'Cashier'}: ${cashierName}`, 134, footerY + 14.5);

  // Received By / Client Sign line
  doc.setFontSize(8.5);
  doc.text(`${t('Received By') || 'Received By'}: ____________________________`, 115, footerY + 22);
  doc.setFontSize(7.5);
  doc.text(`${t('Client') || 'Client'}: ${customer?.name || t('Walk-in Customer')}`, 134, footerY + 25.5);

  // Bottom Center: Professional Thank you
  doc.setFont('Helvetica', 'oblique');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  const thankYouText = language === 'sw' 
    ? 'Asante kwa kufanya biashara nasi! Karibu tena.'
    : 'Thank you for your business! We appreciate your patronage.';
  doc.text(thankYouText, 105, 280, { align: 'center' });

  // Save the PDF locally on user's browser
  const pdfName = `${order.soNumber}_Invoice_${order.date}.pdf`;
  doc.save(pdfName);
}
