import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  setDoc, 
  getDocFromServer,
  getDocFromCache,
  onSnapshot 
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

let app: any = null;
let db: any = null;
let isFirebaseAvailable = false;

try {
  if (config && config.apiKey && config.projectId) {
    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId
    };

    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

    const dbSettings: any = {
      experimentalForceLongPolling: true,
    };

    // Only enable persistent local cache if we are NOT in an iframe (to prevent "failed to obtain primary lease" in development sandboxes)
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (!isIframe) {
      dbSettings.localCache = persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      });
    }

    db = config.firestoreDatabaseId 
      ? initializeFirestore(app, dbSettings, config.firestoreDatabaseId)
      : initializeFirestore(app, dbSettings);

    isFirebaseAvailable = true;
    console.log('[Firebase] Successfully initialized self-reliant sync database.');
  } else {
    console.warn('[Firebase] No valid API configuration keys found. Operating in pure offline local storage mode.');
  }
} catch (e) {
  console.warn('[Firebase] Initialization skipped (Pure offline local storage mode active). Details:', e);
}

const SYSTEM_COLLECTION = 'system';
const DATA_DOC_ID = 'tradecore_data';

/**
 * Saves the unified system state to Firestore
 */
export async function saveSystemDataToCloud(data: any): Promise<void> {
  if (!isFirebaseAvailable || !db) {
    return;
  }
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
    // Sanitize any undefined properties recursively to prevent Firestore errors
    const sanitized = JSON.parse(JSON.stringify(data));
    if (!sanitized.lastUpdated) {
      sanitized.lastUpdated = new Date().toISOString();
    }
    await setDoc(docRef, sanitized);
  } catch (error) {
    console.error('Error saving system data to cloud:', error);
  }
}

/**
 * Fetches the unified system state from Firestore.
 * Prefers the live server version to ensure multi-device synchronization,
 * but falls back to the local cache if offline or on connection failure.
 */
export async function fetchSystemDataFromCloud(): Promise<any | null> {
  if (!isFirebaseAvailable || !db) {
    return null;
  }
  const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
  try {
    const docSnap = await getDocFromServer(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (serverError) {
    console.warn('Could not fetch from Firestore server, attempting local cache fallback...', serverError);
    try {
      const docSnap = await getDocFromCache(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
    } catch (cacheError) {
      console.error('Error fetching system data from local cache:', cacheError);
    }
    return null;
  }
}

/**
 * Subscribes to real-time changes of the unified system state in Firestore
 */
export function subscribeToSystemDataCloud(callback: (data: any) => void): () => void {
  if (!isFirebaseAvailable || !db) {
    return () => {};
  }
  const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('Error in real-time cloud data subscription:', error);
  });
}

