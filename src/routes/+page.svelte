<script lang="ts">
import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
import {onMount} from 'svelte'
import {db, initializationError} from "$lib/firebase"
import {
    collection,
    addDoc,
    getDocs,
    serverTimestamp, // Use server time for consistency
    Timestamp,       // Import Timestamp type if needed for typing
    type DocumentData,
    type QueryDocumentSnapshot
  } from 'firebase/firestore';

let showScanner = false;
  let lastScannedCode: string | null = null;

  function handleScanResult(event: CustomEvent<string>) {
    // This function would be called by an event dispatched from BarcodeScanner
    lastScannedCode = event.detail;
    showScanner = false; // Hide scanner after successful scan
    // TODO: Now do something with the lastScannedCode (e.g., add to inventory)
    console.log("Code received from scanner:", lastScannedCode);
  }

// Reactive state variables for the UI
let items: DocumentData[] = []; // To store items read from Firestore
let isLoading = false;
let errorMessage: string | null = null;
let newItemMessage = `Hello Firestore @ ${new Date().toLocaleTimeString()}`; // Default message

// --- Firestore Write Function ---
  async function addItem() {
    // Ensure db is initialized before using it
    if (!db) {
      errorMessage = "Firestore is not initialized. Check console.";
      console.error("Firestore db instance is null.", { initializationError });
      return;
    }
    isLoading = true;
    errorMessage = null;
    console.log(`Attempting to add: "${newItemMessage}"`);

    try {
      // Get a reference to the 'test_items' collection
      const collectionRef = collection(db, "test_items");

      // Add a new document with auto-generated ID
      const docRef = await addDoc(collectionRef, {
        message: newItemMessage,
        createdAt: serverTimestamp() // Recommended way to set creation time
      });

      console.log("Document written with ID: ", docRef.id);
      newItemMessage = `Another item @ ${new Date().toLocaleTimeString()}`; // Update for next potential add
      await loadItems(); // Refresh the list after adding
    } catch (e) {
      console.error("Error adding document: ", e);
      errorMessage = "Failed to add item. Check console.";
    } finally {
      isLoading = false;
    }
  }

  // --- Firestore Read Function ---
  async function loadItems() {
    // Ensure db is initialized
    if (!db) {
      errorMessage = "Firestore is not initialized. Check console.";
      console.error("Firestore db instance is null.", { initializationError });
      return;
    }
    isLoading = true;
    errorMessage = null;
    console.log("Loading items...");

    try {
      // Get a reference to the 'test_items' collection
      const collectionRef = collection(db, "test_items");

      // Get all documents in the collection
      const querySnapshot = await getDocs(collectionRef);

      const loadedItems: DocumentData[] = [];
      querySnapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
        // doc.data() contains the document content
        loadedItems.push({ id: doc.id, ...doc.data() });
      });

      items = loadedItems; // Update reactive Svelte state
      console.log("Items loaded successfully:", items);
    } catch (e) {
      console.error("Error getting documents: ", e);
      errorMessage = "Failed to load items. Check console.";
      items = []; // Clear items on error
    } finally {
      isLoading = false;
    }
  }

  // --- Load initial data when component mounts ---
  onMount(() => {
    if (initializationError) {
      errorMessage = `Firebase initialization failed: ${initializationError.message}`;
    } else if (!db) {
      // This case might occur if initialization logic had an issue but didn't throw
      errorMessage = "Firestore DB instance is not available after mount.";
    } else {
      // Load items once the component is ready
      loadItems();
    }
  });


</script>

<h1>Welcome to SvelteKit + Firebase hello world</h1>

{#if initializationError}
  <p style="color: red; border: 1px solid red; padding: 10px;">
    <strong>Initialization Error:</strong> {initializationError.message} <br />
    Firestore might not work correctly. Check console and `src/lib/firebase.ts`.
  </p>
{:else if !db && !isLoading}
  <p style="color: orange; border: 1px solid orange; padding: 10px;">
    Warning: Firestore DB instance not available. Check `src/lib/firebase.ts`.
  </p>
{/if}

<div>
  <input type="text" bind:value={newItemMessage} placeholder="Message to add" disabled={!db}/>
  <button on:click={addItem} disabled={isLoading || !db}>
    {isLoading ? 'Adding...' : 'Add Test Item'}
  </button>
  <button on:click={loadItems} disabled={isLoading || !db} style="margin-left: 10px;">
    {isLoading ? 'Loading...' : 'Reload Items'}
  </button>
</div>

{#if errorMessage}
  <p style="color: red;">Error: {errorMessage}</p>
{/if}

<h2>Items in 'test_items' collection:</h2>
{#if isLoading && items.length === 0}
  <p>Loading items...</p>
{:else if items.length > 0}
  <ul>
    {#each items as item (item.id)}
      <li>
        ID: {item.id} | Message: {item.message} | Created: {item.createdAt?.toDate().toLocaleString() ?? 'Timestamp pending...'}
      </li>
    {/each}
  </ul>
{:else if !isLoading && !errorMessage}
   <p>No items found in the collection, or failed to load.</p>
{/if}

<button on:click={() => showScanner = !showScanner}>
  {#if showScanner} Hide Scanner {:else} Show Scanner {/if}
</button>

{#if showScanner}
  <BarcodeScanner />
{/if}

{#if lastScannedCode}
  <p>Last code scanned: {lastScannedCode}</p>
{/if}
