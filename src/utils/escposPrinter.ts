// ESC/POS Thermal Printer Utility for Web Bluetooth and USB/Serial Printers
// Supports both 58mm (32 characters/line) and 80mm (48 characters/line) thermal paper

export interface PrinterOptions {
  paperWidth: '58mm' | '80mm';
  printerName?: string;
  autoCut?: boolean;
  openCashDrawer?: boolean;
}

// Global active Bluetooth device & characteristic reference
let activeBluetoothDevice: any = null;
let activeGattServer: any = null;
let activeCharacteristic: any = null;

// ESC/POS Commands
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: [ESC, 0x40], // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  TEXT_NORMAL: [GS, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [GS, 0x21, 0x01],
  TEXT_DOUBLE_WIDTH: [GS, 0x21, 0x10],
  TEXT_DOUBLE_SIZE: [GS, 0x21, 0x11],
  FEED_3_LINES: [ESC, 0x64, 0x03],
  PAPER_CUT: [GS, 0x56, 0x41, 0x00], // Full cut
  PAPER_PARTIAL_CUT: [GS, 0x56, 0x01],
  CASH_DRAWER: [ESC, 0x70, 0x00, 0x19, 0xfa], // Pulse to open cash drawer
};

// Convert string to ASCII byte array
function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // Basic UTF-8 or fall back to ?
      bytes.push(0x3f); // '?'
    }
  }
  return bytes;
}

// Pad or truncate string to fit column width
function formatLine(left: string, right: string, maxLen: number): string {
  const leftLen = left.length;
  const rightLen = right.length;
  const spaceNeeded = maxLen - (leftLen + rightLen);

  if (spaceNeeded > 0) {
    return left + ' '.repeat(spaceNeeded) + right;
  } else if (spaceNeeded === 0) {
    return left + right;
  } else {
    // Truncate left text to fit
    const availLeft = Math.max(1, maxLen - rightLen - 1);
    return left.slice(0, availLeft) + ' ' + right;
  }
}

/**
 * Connects to a Web Bluetooth ESC/POS Thermal Printer
 */
export async function connectBluetoothPrinter(): Promise<string> {
  const navBluetooth = (navigator as any).bluetooth;
  if (!navBluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Android Chrome.');
  }

  try {
    const device = await navBluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer service
        '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile (SPP)
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Custom Thermal Printer UUIDs
        '49535343-fe7d-4ae5-8fa9-9fafd205e455'
      ]
    });

    if (!device || !device.gatt) {
      throw new Error('Could not connect to selected Bluetooth device.');
    }

    activeBluetoothDevice = device;
    const server = await device.gatt.connect();
    activeGattServer = server;

    // Discover services
    const services = await server.getPrimaryServices();
    if (services.length === 0) {
      throw new Error('No Bluetooth services found on device.');
    }

    let char: any = null;
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const c of characteristics) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          char = c;
          break;
        }
      }
      if (char) break;
    }

    if (!char) {
      throw new Error('No writable characteristic found for ESC/POS printer.');
    }

    activeCharacteristic = char;
    return device.name || 'Bluetooth ESC/POS Printer';
  } catch (err: any) {
    console.error('Bluetooth Printer Error:', err);
    if (
      err?.name === 'SecurityError' ||
      err?.message?.includes('permissions policy') ||
      err?.message?.includes('disallowed')
    ) {
      throw new Error('Bluetooth is disallowed in embedded preview frames. Please open this app in a new tab to use Bluetooth ESC/POS Thermal Printing.');
    }
    if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled') || err?.message?.includes('canceled')) {
      throw new Error('Bluetooth device selection was cancelled.');
    }
    throw new Error(err?.message || 'Failed to connect Bluetooth printer.');
  }
}

export function isBluetoothPrinterConnected(): boolean {
  return !!(activeBluetoothDevice && activeGattServer && activeGattServer.connected && activeCharacteristic);
}

export function disconnectBluetoothPrinter() {
  if (activeGattServer && activeGattServer.connected) {
    activeGattServer.disconnect();
  }
  activeBluetoothDevice = null;
  activeGattServer = null;
  activeCharacteristic = null;
}

/**
 * Sends ESC/POS byte array to connected Bluetooth printer
 */
export async function sendEscPosBytes(data: Uint8Array): Promise<boolean> {
  if (!isBluetoothPrinterConnected()) {
    throw new Error('No Bluetooth printer connected. Please pair printer first.');
  }

  // Send in chunks of 100 bytes to avoid BLE throughput limits
  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (activeCharacteristic.properties.writeWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
  }
  return true;
}

/**
 * Builds ESC/POS Byte Buffer for a Sales Order Receipt
 */
export function buildReceiptEscPosBuffer(
  salesOrder: any,
  store: { name: string; location?: string; phone?: string },
  customer: { name: string; phone?: string; balance?: number },
  currencySymbol: string = '$',
  options: PrinterOptions = { paperWidth: '80mm', autoCut: true, openCashDrawer: true }
): Uint8Array {
  const maxChars = options.paperWidth === '58mm' ? 32 : 48;
  const buffer: number[] = [];

  const push = (...cmdArrays: number[][]) => {
    cmdArrays.forEach(arr => buffer.push(...arr));
  };

  const printStr = (str: string) => {
    buffer.push(...stringToBytes(str + '\n'));
  };

  // 1. Initialize
  push(CMD.INIT);

  // Cash Drawer
  if (options.openCashDrawer) {
    push(CMD.CASH_DRAWER);
  }

  // Header (Centered, Bold, Double Size)
  push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.TEXT_DOUBLE_SIZE);
  printStr(store.name || 'STORE RECEIPT');
  push(CMD.TEXT_NORMAL, CMD.BOLD_OFF);

  if (store.location) printStr(store.location);
  if (store.phone) printStr(`Tel: ${store.phone}`);
  printStr('-'.repeat(maxChars));

  // Receipt Info
  push(CMD.ALIGN_LEFT);
  printStr(formatLine(`Order #: ${salesOrder.soNumber || salesOrder.id}`, `Date: ${salesOrder.date}`, maxChars));
  printStr(formatLine(`Customer: ${customer.name || 'Walk-in'}`, `Type: ${salesOrder.priceType || 'Retail'}`, maxChars));
  if (customer.phone) printStr(`Tel: ${customer.phone}`);
  printStr('-'.repeat(maxChars));

  // Table Items
  push(CMD.BOLD_ON);
  printStr(formatLine('ITEM', 'TOTAL', maxChars));
  push(CMD.BOLD_OFF);
  printStr('-'.repeat(maxChars));

  if (salesOrder.items && Array.isArray(salesOrder.items)) {
    salesOrder.items.forEach((item: any) => {
      const itemTitle = `${item.name || item.productId} x${item.qty}${item.unitType === 'sub' ? ' (sub)' : ''}`;
      const itemTotalStr = `${currencySymbol}${(item.price * item.qty).toFixed(2)}`;
      printStr(formatLine(itemTitle, itemTotalStr, maxChars));
    });
  }

  printStr('='.repeat(maxChars));

  // Totals
  push(CMD.ALIGN_RIGHT, CMD.BOLD_ON);
  printStr(`SUBTOTAL: ${currencySymbol}${(salesOrder.total || 0).toFixed(2)}`);
  
  if (salesOrder.paymentMethod) {
    printStr(`PAYMENT METHOD: ${salesOrder.paymentMethod}`);
  }

  printStr(`TOTAL DUE: ${currencySymbol}${(salesOrder.total || 0).toFixed(2)}`);
  push(CMD.BOLD_OFF, CMD.ALIGN_CENTER);

  printStr('-'.repeat(maxChars));
  printStr('Thank you for your business!');
  printStr('Please keep this receipt for reference.');
  printStr('-'.repeat(maxChars));

  // Feed & Cut
  push(CMD.FEED_3_LINES);
  if (options.autoCut) {
    push(CMD.PAPER_CUT);
  }

  return new Uint8Array(buffer);
}
