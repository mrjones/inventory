import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  // These belong in a file called ".env" in the root directory
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};


// --- Firebase Initialization ---
let app;
let db: Firestore | null = null; // Initialize db as potentially null
let persistenceEnabled = false;
let initializationError: Error | null = null;

try {
  console.log(JSON.stringify(firebaseConfig));

    // Initialize Firebase App (ensure only once)
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase App Initialized");
    } else {
        app = getApp(); // Get existing app if already initialized (e.g., during HMR)
        console.log("Firebase App Re-used");
    }

    // Get Firestore instance IMMEDIATELY before trying to enable persistence
    const firestoreInstance = getFirestore(app);

    // Attempt to enable persistence
    // NOTE: During HMR, this might fail with the "already started" error.
    // We try to enable it, but if it fails in a way suggesting it's already running,
    // we proceed assuming persistence might have been enabled previously or accept memory cache.
    try {
        await enableIndexedDbPersistence(firestoreInstance);
        persistenceEnabled = true;
        console.log("Firebase persistence enabled.");
    } catch (err: any) {
        if (err.code === 'failed-precondition') {
            console.warn('Firebase persistence failed precondition (multiple tabs?). Using memory persistence.');
        } else if (err.code === 'unimplemented') {
            console.warn('Firebase persistence not supported. Using memory persistence.');
        } else if (err.message?.includes("already been started")) {
            // Gracefully handle the HMR scenario
            console.warn('Firestore persistence could not be enabled (likely due to HMR). Assuming prior success or using memory persistence for this session.');
            // We can often assume persistence *was* enabled successfully on the initial load before HMR.
            // We might set persistenceEnabled = true here if we're confident, or leave it false
            // depending on how critical knowing the exact status is during dev.
            // For simplicity, let's assume it likely worked before HMR:
            persistenceEnabled = true; // Optimistic assumption for HMR case
        } else {
            // Log other unexpected persistence errors
            console.error('Firebase persistence error:', err);
            initializationError = err;
        }
    }

    // Assign the instance to our export variable
    db = firestoreInstance;

} catch (error: any) {
    console.error("Error initializing Firebase:", error);
    initializationError = error;
    // Ensure db remains null or handle error appropriately
    db = null;
}

// --- Exports ---
export { db, persistenceEnabled, initializationError };

// Optional: Export a function to ensure DB is ready if needed elsewhere
// export async function getDbInstance(): Promise<Firestore> {
//    if (!db) {
//       throw new Error("Firestore failed to initialize.");
//    }
//    // You might add checks here if you need guaranteed persistence
//    return db;
// }
