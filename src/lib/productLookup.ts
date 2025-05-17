// Define this in your types file or at the top of inventory.ts / productLookup.ts
export interface ProductMetadata {
  name: string;
  imageUrl?: string; // Optional image URL
  brands?: string;   // Optional brands
  // Add other relevant metadata fields from OFF if needed
}

// Define statuses for caching lookup results
type LookupStatus = 'found' | 'not_found' | 'no_data' | 'lookup_failed' | 'was_offline';

// Define the structure of the cached data in Firestore
interface CachedMetadata extends ProductMetadata {
  barcode: string;
  lookupStatus: LookupStatus;
  lastChecked: import("firebase/firestore").Timestamp | import("firebase/firestore").FieldValue; // For serverTimestamp
}


export interface ProductInfo {
  metadata: ProductMetadata; // Contains name, imageUrl, brands etc.
  quantity: number;
}

// Assuming this is in productLookup.ts or similar
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    Timestamp, // Import Timestamp type if comparing
    FieldValue // Import FieldValue type if using serverTimestamp() directly
} from "firebase/firestore";
import { browser } from '$app/environment'; // Use SvelteKit's browser check
import { db } from './firebase'; // Your initialized db instance

const METADATA_COLLECTION = 'product_metadata'; // Or your collection name

// --- Internal Helper Function ---
/**
 * Fetches data from Open Food Facts API for a barcode and caches the result (success or failure) in Firestore.
 * This should only be called when the cache is missed or invalid.
 * @param barcode The barcode to query.
 * @param docRef The Firestore document reference for caching.
 * @returns The fetched ProductMetadata or null if not found/error/offline.
 */
async function _fetchAndCacheProductMetadata(barcode: string, docRef: import("firebase/firestore").DocumentReference): Promise<ProductMetadata | null> {
    // 1. Check if online (use SvelteKit's browser guard which implies online)
    if (!browser || !navigator.onLine) {
        console.log(`Offline or not in browser: Cannot look up new barcode ${barcode} via API.`);
        // Cache offline status only if doc doesn't exist or has no status? Avoid overwriting valid data.
        // For simplicity now, we just return null. Caching 'was_offline' could be added more carefully.
        // await setDoc(docRef, { barcode, lookupStatus: 'was_offline', lastChecked: serverTimestamp() }, { merge: true });
        return null;
    }

    // 2. Call Open Food Facts API
    console.log(`Workspaceing ${barcode} from Open Food Facts API...`);
    const apiUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,image_url`; // Request specific fields
    let statusToCache: LookupStatus = 'lookup_failed'; // Default to failure
    let dataToCache: Partial<CachedMetadata> = { // Use Partial for building cache data
        barcode: barcode,
        lastChecked: serverTimestamp()
    };
    let resultMetadata: ProductMetadata | null = null;

    try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
            statusToCache = response.status === 404 ? 'not_found' : 'lookup_failed';
            console.log(`API request for ${barcode} failed with status ${response.status}. Status to cache: ${statusToCache}`);
            dataToCache.name = `Unknown (${statusToCache})`; // Add placeholder name for failed lookups
        } else {
            const data = await response.json();
            if (data.status === 0 || !data.product || !data.product.product_name) {
                console.log(`Barcode ${barcode} found but no product name available.`);
                statusToCache = 'no_data';
                dataToCache.name = `Unknown (${statusToCache})`;
            } else {
                // Success! Extract data
                const productName = data.product.product_name;
                const brands = data.product.brands || '';
                const imageUrl = data.product.image_url || null; // Store null if empty
                const displayName = (brands ? `${brands} - ${productName}` : productName).trim();

                console.log(`API lookup success for ${barcode}: ${displayName}`);
                statusToCache = 'found';
                resultMetadata = { name: displayName, imageUrl: imageUrl, brands: brands }; // Build result
                // Prepare cache data from successful result
                dataToCache = { ...dataToCache, ...resultMetadata }; // Add metadata fields
            }
        }
    } catch (error) {
        console.error(`Network error fetching ${barcode}:`, error);
        statusToCache = 'lookup_failed';
        dataToCache.name = `Unknown (Network Error)`;
    }

    // 3. Update Firestore Cache (always update status and lastChecked)
    dataToCache.lookupStatus = statusToCache;
    try {
        await setDoc(docRef, dataToCache, { merge: true });
        console.log(`Cached result for ${barcode} with status: ${statusToCache}`);
    } catch (cacheError) {
        console.error(`Failed to update cache for ${barcode}:`, cacheError);
        // Decide if you want to return potentially stale data or null if cache fails
    }

    return resultMetadata; // Return the successfully fetched metadata, or null on any failure/not found
}


// --- Public API Function ---

/**
 * Gets product metadata AND quantity for a barcode, checking Firestore cache first,
 * then fetching metadata from Open Food Facts API and caching if necessary.
 * Returns ProductInfo (metadata + quantity) or null if not found/error/offline.
 */
export async function getProductMetadata(barcode: string): Promise<ProductInfo | null> {
    if (!barcode) {
        console.warn("Empty barcode passed to getProductMetadata.");
        return null;
    }
    if (!db) {
        console.error("Firestore DB not initialized in getProductMetadata.");
        return null;
    }

    const docRef = doc(db, METADATA_COLLECTION, barcode);

    // 1. Check Firestore cache
    try {
        console.log(`getProductMetadata: Checking cache for ${barcode}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data() as CachedMetadata; // Cast to expected type
            const status = data.lookupStatus;
            const cachedQuantity = typeof data.quantity === 'number' ? data.quantity : 0; // Default quantity to 0 if missing

          console.log(`Cache check for ${barcode}. Status: ${status || 'N/A'}, Quantity: ${cachedQuantity} JSON: ${JSON.stringify(data)}`);

            // If successfully found previously, return cached data + quantity
            if (status === 'found' && data.name) {
                console.log(`Cache hit for ${barcode}: ${data.name}`);
                // Implement TTL / re-check logic here if desired later
                const metadata: ProductMetadata = { name: data.name, imageUrl: data.imageUrl, brands: data.brands };
                return { metadata: metadata, quantity: cachedQuantity }; // <-- Return ProductInfo
            }

            // If previously failed or offline, respect that status (don't retry immediately)
            if (status === 'not_found' || status === 'no_data' || status === 'lookup_failed' || status === 'was_offline') {
                 console.log(`Skipping API lookup for ${barcode} due to previous status: ${status}`);
                 // Implement TTL / re-check logic here if desired later
                 return null;
            }
            // If doc exists but status is missing or indicates retry, proceed to fetch
        }
        // If doc doesn't exist, proceed to fetch
    } catch (error) {
        console.error(`Error reading metadata cache for ${barcode}:`, error);
        // Proceed to fetch even if cache read fails? Or return null? Let's proceed.
    }

    // 2. Cache miss or needs update: Fetch from API and update cache
    console.log(`getProductMetadata: Cache miss or invalid state for ${barcode}. Calling helper...`);
    const fetchedMetadata = await _fetchAndCacheProductMetadata(barcode, docRef);

    // 3. Process result from helper
    if (fetchedMetadata === null) {
        console.log(`getProductMetadata: Helper returned null for ${barcode}.`);
        return null; // Fetch/cache failed or item not found via API
    } else {
        // 4. SUCCESS from API: Helper updated cache. Re-read doc to get final state (including quantity).
        try {
            console.log(`getProductMetadata: Helper succeeded for ${barcode}. Re-reading doc for final quantity...`);
            const finalDocSnap = await getDoc(docRef); // Read the doc AGAIN after cache update
            if (finalDocSnap.exists()) {
                 const finalData = finalDocSnap.data();
                 const finalQuantity = typeof finalData?.quantity === 'number' ? finalData.quantity : 0; // Default to 0
                 console.log(`getProductMetadata: Final quantity for ${barcode} is ${finalQuantity}.`);
                 return { metadata: fetchedMetadata, quantity: finalQuantity }; // <-- Return ProductInfo
            } else {
                 // Should not happen if helper succeeded, but handle defensively
                 console.warn(`getProductMetadata: Document ${barcode} not found after successful cache update? Returning quantity 0.`);
                 return { metadata: fetchedMetadata, quantity: 0 };
            }
        } catch (error) {
             console.error(`Error re-reading document ${barcode} after cache update:`, error);
             // Return metadata but indicate quantity might be stale (or return null)
             console.warn(`getProductMetadata: Returning metadata for ${barcode} but quantity might be missing due to read error.`);
             return { metadata: fetchedMetadata, quantity: 0 }; // Fallback quantity
        }
    }
}
