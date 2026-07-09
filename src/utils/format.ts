export const swahiliDict: Record<string, string> = {
  'Dashboard': 'Dashibodi',
  'Stock Items': 'Bidhaa Ghalani',
  'Purchase Order': 'Oda ya Manunuzi',
  'Sales Order': 'Oda ya Mauzo',
  'Expenses': 'Matumizi',
  'Receipts': 'Risiti na Invois',
  'Master Data': 'Data Kuu',
  'Store Management': 'Usimamizi wa Maduka',
  'Customers': 'Wateja',
  'Suppliers': 'Wauzaji',
  'Stock Categories': 'Kategoria za Bidhaa',
  'Manage Taxes': 'Dhibiti Kodi',
  'Reports': 'Ripoti',
  'Transaction Report': 'Ripoti ya Miamala',
  'Financial Report': 'Ripoti ya Kifedha',
  'Daily Activity Report': 'Ripoti ya Kila Siku',
  'Monthly Report': 'Ripoti ya Mwezi',
  'Sales Report': 'Ripoti ya Mauzo',
  'Purchase Report': 'Ripoti ya Manunuzi',
  'Sales Outstanding': 'Mauzo Yanayodaiwa',
  'Purchase Outstanding': 'Manunuzi Yanayodaiwa',
  'Low Stock Items Report': 'Ripoti ya Bidhaa Chache',
  'Purchase Order Details': 'Maelezo ya Oda ya Manunuzi',
  'Manage User': 'Dhibiti Watumiaji',
  'User Info': 'Taarifa za Watumiaji',
  'User Access': 'Ufikiaji Watumiaji',
  'My Profile': 'Wasifu Wangu',
  'Logout': 'Toka',
  'Total Value': 'Thamani Jumla',
  'Store': 'Duka',
  'Category': 'Kategoria',
  'Status': 'Hali',
  'Qty': 'Idadi',
  'Total': 'Jumla',
  'Product': 'Bidhaa',
  'Products': 'Bidhaa',
  'Settings': 'Mipangilio',
  'Language': 'Lugha',
  'Currency': 'Sarafu',
  'Exchange Rate': 'Kiwango cha Ubadilishaji',
  'Save': 'Hifadhi',
  'Cancel': 'Ghairi',
  'Add Store': 'Ongeza Duka',
  'Add Customer': 'Ongeza Mteja',
  'Add Supplier': 'Ongeza Muuzaji',
  'Overdue': 'Imechelewa',
  'Yes': 'Ndiyo',
  'No': 'Hapana',
  'Date': 'Tarehe',
  'Cost': 'Gharama',
  'Price': 'Bei',
  'Type': 'Aina',
  'Total Sales': 'Jumla ya Mauzo',
  'Total Purchases': 'Jumla ya Manunuzi',
  'Select Month': 'Chagua Mwezi',
  'No records found': 'Hakuna kumbukumbu zilizopatikana',
  'All items sufficiently stocked': 'Bidhaa zote zinatosheleza',
  'Import Data': 'Ingiza Data',
  'Import Stock Items': 'Ingiza Bidhaa Ghalani',
  'Import Customers': 'Ingiza Wateja',
  'Import Suppliers': 'Ingiza Wauzaji',
  'Operating Expenses': 'Gharama za Uendeshaji',
  'Net Profit/Loss': 'Faida/Hasara Halisi',
  'Gross Profit': 'Faida Ghafi',
  'Revenue': 'Mapato ya Mauzo',
  'Cost of Goods Sold': 'Gharama ya Bidhaa Zilizouzwa',
  'Financial Statement Report': 'Ripoti ya Taarifa ya Kifedha',
  'TAX INVOICE': 'INVOIS YA KODI / RISITI',
  'RECEIPT NO': 'NAMBARI YA RISITI',
  'Prepared By': 'Imeandaliwa Na',
  'Checked By': 'Imekaguliwa Na',
  'Received By': 'Imepokelewa Na',
  'Subtotal': 'Jumla Ndogo',
  'VAT Breakdown': 'Mchanganuo wa VAT',
  'GRAND TOTAL': 'JUMLA KUU',
  'Document Type': 'Aina ya Hati',
  'Transaction Date': 'Tarehe ya Muamala',
  'Pricing Mode': 'Mfumo wa Bei',
  'Store Location': 'Mahali pa Duka',
  'Cashier / Staff Name': 'Jina la Mhazibu',
  'Item Description': 'Maelezo ya Bidhaa',
  'SKU / Barcode': 'Sajili / Msimbo',
  'Quantity': 'Idadi',
  'Unit Price': 'Bei ya Unit',
  'Unit Cost': 'Gharama ya Unit',
  'Line Total': 'Jumla ya Mstari',
  'Duplicate Reprint': 'Nakala ya Risiti',
  'Original Receipt': 'Risiti Halisi',
  'Verify Secure Receipt': 'Thibitisha Usalama wa Risiti',
  'Thermal Receipt Template': 'Kiolezo cha Risiti ya Thermal',
  'Corporate A4 Template': 'Kiolezo cha Invois ya A4',
  'Selling Invoices / Receipts': 'Invois na Risiti za Mauzo',
  'Buying Receipts / Purchase Invoices': 'Invois na Risiti za Manunuzi',
  'Showing': 'Inaonyesha',
  'View Receipt': 'Angalia Risiti',
  'Verify': 'Thibitisha',
  'Security Verification Code': 'Msimbo wa Usalama wa Risiti',
  'E-Invoice Verification': 'Uthibitisho wa E-Invois',
  'This receipt has been cryptographically secured.': 'Risiti hii imethibitishwa kwa mifumo thabiti ya kiusalama.',
  'Reprint Audit Secure': 'Uhakiki wa Nakala',
  'POS Slip': 'Stakabadhi ya POS',
  'A4 Corporate': 'Karatasi ya A4',
  'Search product...': 'Tafuta bidhaa...',
  'All Categories': 'Makundi Yote',
  'Registered Products List': 'Orodha ya Bidhaa Zilizosajiliwa',
  'Total Filtered Stock Summary:': 'Jumla ya Muhtasari wa Akiba:',
  'Export Stock': 'Pakua Orodha ya Bidhaa'
};

export function translate(text: string, language: 'en' | 'sw'): string {
  if (language === 'sw' && swahiliDict[text]) {
    return swahiliDict[text];
  }
  return text;
}

export function formatMoney(amount: number, currency: 'USD' | 'TZS', exchangeRate: number): string {
  const rate = currency === 'TZS' ? exchangeRate : 1;
  const convertedAmount = amount * rate;
  const symbol = currency === 'TZS' ? 'TSh ' : '$';
  
  return symbol + convertedAmount.toLocaleString('en-US', {
    minimumFractionDigits: currency === 'TZS' ? 0 : 2,
    maximumFractionDigits: currency === 'TZS' ? 0 : 2
  });
}

export function exportToExcel(htmlTableString: string, filename: string) {
  const template = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Sheet1</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <style>
        table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        th { background-color: #ef4444; color: white; font-weight: bold; border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
        td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .bg-red-50 { background-color: #fef2f2; }
        .text-red-600 { color: #dc2626; }
      </style>
    </head>
    <body>
      ${htmlTableString}
    </body>
    </html>
  `;
  const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

