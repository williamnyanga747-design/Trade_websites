/**
 * Firebase Legacy Interface Stub
 * All database persistence and real-time synchronization have been migrated to the PHP REST API & WebSocket service (src/utils/api.ts).
 */

export const isFirebaseAvailable = false;

export async function saveSystemDataToCloud(data: any): Promise<void> {
  return;
}

export async function fetchSystemDataFromCloud(): Promise<any | null> {
  return null;
}

export function subscribeToSystemDataCloud(callback: (data: any) => void): () => void {
  return () => {};
}
