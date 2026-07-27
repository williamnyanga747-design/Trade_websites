// Progressive Offline Storage & Auto-Sync Manager for POS Sales Orders

const OFFLINE_QUEUE_KEY = 'tradecore_offline_sales_queue';

export interface OfflineSaleOrder {
  id: string; // temporary UUID or timestamp
  soNumber: string;
  storeId: number;
  customerId: number;
  priceType: 'Retail' | 'Wholesale' | 'Preferred';
  items: Array<{
    productId: number;
    qty: number;
    price: number;
    cost: number;
    unitType?: 'main' | 'sub';
    subUnitName?: string;
  }>;
  total: number;
  profit: number;
  date: string;
  status: 'Completed';
  paymentMethod: 'Cash' | 'Bank' | 'Mobile Money' | 'Split';
  paymentStatus: 'Paid' | 'Credit' | 'Partial';
  createdAt: string;
  notes?: string;
}

/**
 * Get all pending sales stored locally while browser was offline
 */
export function getOfflineSalesQueue(): OfflineSaleOrder[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading offline queue from localStorage:', err);
    return [];
  }
}

/**
 * Save an offline sale order to localStorage queue
 */
export function enqueueOfflineSale(sale: Omit<OfflineSaleOrder, 'id' | 'createdAt'>): OfflineSaleOrder {
  const queue = getOfflineSalesQueue();
  const newSale: OfflineSaleOrder = {
    ...sale,
    id: 'OFFLINE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    createdAt: new Date().toISOString()
  };

  queue.push(newSale);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  return newSale;
}

/**
 * Remove a single sale from offline queue by ID
 */
export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineSalesQueue().filter(s => s.id !== id);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Clear entire offline sales queue
 */
export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

/**
 * Sync all pending offline sales to the database/state callback
 */
export async function syncOfflineSalesQueue(
  saveSaleOrderFn: (order: OfflineSaleOrder) => Promise<boolean> | boolean
): Promise<{ syncedCount: number; errorsCount: number }> {
  const queue = getOfflineSalesQueue();
  if (queue.length === 0) return { syncedCount: 0, errorsCount: 0 };

  let syncedCount = 0;
  let errorsCount = 0;
  const remainingQueue: OfflineSaleOrder[] = [];

  for (const item of queue) {
    try {
      const success = await saveSaleOrderFn(item);
      if (success) {
        syncedCount++;
      } else {
        errorsCount++;
        remainingQueue.push(item);
      }
    } catch (err) {
      console.error('Failed to sync offline sale order:', item, err);
      errorsCount++;
      remainingQueue.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
  return { syncedCount, errorsCount };
}
