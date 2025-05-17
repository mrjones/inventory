import { addDoc, collection, doc, getDocs, increment, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '$lib/firebase'; // Your initialized Firestore instance

const METADATA_COLLECTION = 'product_metadata';
const INVENTORY_LOG = 'inventory_log';

export enum State {
  EMPTY,
  LOADING,
  VALID,
};

export class RemoteData<T> {
  state: State;
  data: T | null;

  static empty<T>(): RemoteData<T> {
    console.log("empty");
    let d = new RemoteData<T>();
    d.state = State.EMPTY;
    d.data = null;
    return d;
  }

  public startLoading() {
    console.log("startLoading");
    this.state = State.LOADING;
  }

  public finishLoading(value: T) {
    console.log("finishLoading <- " + JSON.stringify(value));
    this.state = State.VALID;
    this.data = value;
  }
}

export async function incrementInventoryMutable(barcode: string, delta: number) {
  if (!db) {
    console.error("Firestore DB not initialized.");
    return;
  }
  if (!barcode) {
    console.error("Empty barcode passed to incrementInventory.");
    return;
  }
  console.log("incrementInventoryMutable(" + barcode + ", " + delta + ")");

  const itemRef = doc(db, METADATA_COLLECTION, barcode);
  await updateDoc(itemRef, {
    quantity: increment(delta),
    updated: serverTimestamp(),
  });
}

export async function incrementInventoryLog(barcode: string, delta: number) {
  if (!db) {
    console.error("Firestore DB not initialized.");
    return;
  }
  if (!barcode) {
    console.error("Empty barcode passed to incrementInventory.");
    return;
  }
  console.log("incrementInventoryLog(" + barcode + ", " + delta + ")");

  await addDoc(collection(db, INVENTORY_LOG), {
    barcode: barcode,
    delta: delta,
    timestamp: serverTimestamp(),
  });
}

export async function getInventoryLog(barcode: string) {
  if (!db) {
    console.error("Firestore DB not initialized.");
    return;
  }
  if (!barcode) {
    console.error("Empty barcode passed to incrementInventory.");
    return;
  }

  let q = query(collection(db, INVENTORY_LOG), where("barcode", "==", barcode))

  let calculatedQuantity = 0;
  try {
    // 3. Execute the query
    const querySnapshot = await getDocs(q);
    // 4. Process the results
    if (querySnapshot.empty) {
      console.log(`No log entries found for barcode ${barcode}.`);
    } else {
      console.log(`Found ${querySnapshot.size} log entries for ${barcode}. Summing deltas...`);
      querySnapshot.forEach((doc) => {
        // doc.data() is never undefined for query doc snapshots
        const data = doc.data();
        const delta = data.delta; // Get the delta value

        // Basic check to ensure delta is a number
        if (typeof delta === 'number') {
          calculatedQuantity += delta;
        } else {
          console.warn(`Log entry ${doc.id} for barcode ${barcode} has missing or invalid delta:`, delta);
        }
        // You could also access other fields here, like timestamp:
        // const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null;
        // console.log(`  - Doc ID: ${doc.id}, Delta: ${delta}, Timestamp: ${timestamp}`);
      });
    }
  } catch (error) {
    console.error(`Error getting inventory log for barcode ${barcode}: `, error);
    // Depending on requirements, you might want to re-throw or return an error state
  }

  console.log(`Final calculated quantity for ${barcode}: ${calculatedQuantity}`);
  return calculatedQuantity;
}

export function tsFunc(): string {
  return "from ts xyc!"
}
