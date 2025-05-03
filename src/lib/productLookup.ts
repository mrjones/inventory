import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '$lib/firebase'; // Your initialized Firestore instance

const METADATA_COLLECTION = 'product_metadata'; // Firestore collection to cache results

export type ProductMetadata = {
  name: string;
  imageUrl: string | null,
};

/**
 * Gets product name for a barcode, checking cache first, then Open Food Facts API.
 * Returns the product name string, or null if not found or offline (for new codes).
 */
export async function getProductMetadata(barcode: string): Promise<ProductMetadata | null> {
  if (!db) {
    console.error("Firestore DB not initialized.");
    return `Error: DB Not Ready (${barcode})`; // Return barcode if DB fails
  }
  if (!barcode) {
    console.warn("Empty barcode passed to getProductMetadata.");
    return null;
  }

  const docRef = doc(db, METADATA_COLLECTION, barcode);
  let cachedName: string | null = null;

  // 1. Check Firestore cache first
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data?.name) { // Check if 'name' exists and is truthy
        console.log(`Firebase cache hit for ${barcode}: ${data.name}`);

        // TODO: if lastChecked is old enough, re check?

        return {name: data.name, imageUrl: data.imageUrl};
      } else if (data?.lookupStatus === 'not_found' || data?.lookupStatus === 'no_data' || data?.lookupStatus === 'lookup_failed') {
         console.log(`Barcode ${barcode} previously marked as not found/failed.`);
         return null; // Don't re-query if previously failed/not found
      }
      // If document exists but has no name or known failure status, proceed to API lookup
    }
  } catch (error) {
    console.error("Error reading metadata cache:", error);
    // Decide if you want to proceed to API lookup even if cache read fails
  }

  // 2. Check if online (basic check)
  if (!navigator.onLine) {
    console.log(`Offline: Cannot look up new barcode ${barcode} via API.`);
    return null; // Cannot fetch new names offline
  }

  // 3. Call Open Food Facts API
  console.log(`Cache miss for ${barcode}. Fetching from Open Food Facts API...`);
    // Request specific fields to minimize data transfer
    const apiUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,image_url,quantity`;
    const response = await fetch(apiUrl, {
        method: 'GET',
        // Open Food Facts API generally doesn't require auth, but good practice to identify your app
        // headers: { 'User-Agent': 'YourAppName - Web - Version 1.0' }
    });

    if (!response.ok) {
      let statusToCache: 'not_found' | 'lookup_failed' = 'lookup_failed';
      if (response.status === 404) {
         console.log(`Barcode ${barcode} not found in Open Food Facts (404).`);
         statusToCache = 'not_found';
      } else {
          console.error(`API request failed for ${barcode} with status ${response.status}`);
      }
      // Cache the failure status
      await setDoc(docRef, { name: null, imageUrl: null, lookupStatus: statusToCache, lastChecked: serverTimestamp() }, { merge: true });
      return null;
    }

    const data = await response.json();

    // 4. Process Response
    if (data.status === 0 || !data.product || !data.product.product_name) {
       console.log(`Barcode ${barcode} found but no product name available.`);
       // Cache the no_data status
      await setDoc(docRef, { name: null, imageUrl: null, lookupStatus: 'no_data', lastChecked: serverTimestamp() }, { merge: true });
       return null;
    }

    const productName = data.product.product_name;
    const brands = data.product.brands || ''; // Handle potentially missing brands
    const displayName = (brands ? `${brands} - ${productName}` : productName)

    console.log(`API lookup success for ${barcode}: ${displayName}`);

    const imageUrl = data.product.image_url || '';

    // 5. Update Firestore Cache
    await setDoc(docRef, { name: displayName, imageUrl: imageUrl, lookupStatus: 'found', lastChecked: serverTimestamp() }, { merge: true });

    return {name: displayName, imageUrl: data.product.image_url};

}
