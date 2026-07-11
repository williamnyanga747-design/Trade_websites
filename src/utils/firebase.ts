import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

// Initialize Firebase App
const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
// Use the custom database ID if provided in the configuration, otherwise default
const db = config.firestoreDatabaseId 
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);

const SYSTEM_COLLECTION = 'system';
const DATA_DOC_ID = 'tradecore_data';

/**
 * Saves the unified system state to Firestore
 */
export async function saveSystemDataToCloud(data: any): Promise<void> {
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
    // Sanitize any undefined properties recursively to prevent Firestore errors
    const sanitized = JSON.parse(JSON.stringify(data));
    await setDoc(docRef, {
      ...sanitized,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Error saving system data to cloud:', error);
  }
}

/**
 * Fetches the unified system state from Firestore once
 */
export async function fetchSystemDataFromCloud(): Promise<any | null> {
  try {
    const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching system data from cloud:', error);
    return null;
  }
}

/**
 * Subscribes to real-time changes of the unified system state in Firestore
 */
export function subscribeToSystemDataCloud(callback: (data: any) => void): () => void {
  const docRef = doc(db, SYSTEM_COLLECTION, DATA_DOC_ID);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    }
  }, (error) => {
    console.error('Error in real-time cloud data subscription:', error);
  });
}
