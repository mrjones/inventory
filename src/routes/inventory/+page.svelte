<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// Import necessary client-side Firestore functions
	import { collection, query, orderBy, onSnapshot, type Unsubscribe } from 'firebase/firestore';
	import { browser } from '$app/environment'; // Useful for guards
	import { db } from '$lib/firebase'; // Adjust path to your firebase init file

	// Define type for inventory items
	interface InventoryItem {
		barcode: string;
		name: string;
		quantity: number;
		imageUrl?: string;
	}

	const INVENTORY_COLLECTION = 'product_metadata'; // Make sure this matches collection name

	// --- Reactive state variables ---
	let inventoryItems: InventoryItem[] = []; // Holds the data for the table
	let isLoading = true; // Flag to show loading state
	let errorMessage: string | null = null; // To display errors
	let unsubscribeFromInventory: Unsubscribe | null = null; // To clean up the listener

	onMount(() => {
		// Ensure code runs only in the browser
		if (!browser) {
			isLoading = false;
			errorMessage = 'Cannot load inventory outside of a browser environment.';
			return;
		}

		console.log('Inventory page mounted, setting up Firestore listener...');
		isLoading = true; // Set loading state
		errorMessage = null;

		const inventoryCollectionRef = collection(db, INVENTORY_COLLECTION);
		// Query all documents, order by name
		const q = query(inventoryCollectionRef, orderBy('name', 'asc'));

		// Use onSnapshot to listen for real-time updates (and initial data)
		unsubscribeFromInventory = onSnapshot(
			q,
			(querySnapshot) => {
				// This function runs every time data changes (including the first load)
				console.log(`Firestore snapshot received: ${querySnapshot.size} documents.`);
				const items: InventoryItem[] = [];
				querySnapshot.forEach((doc) => {
					const data = doc.data();
					items.push({
						barcode: doc.id,
						name: data.name || 'Name Not Found',
						quantity: typeof data.quantity === 'number' ? data.quantity : 0,
						imageUrl: data.imageUrl || undefined
					});
				});

				inventoryItems = items; // Update the reactive variable, Svelte updates the UI
				isLoading = false; // Data loaded/updated
				errorMessage = null; // Clear any previous error on success
			},
			(error) => {
				// This function runs if the listener fails
				console.error('Error listening to inventory collection:', error);
				errorMessage = 'Failed to load inventory data. Please try again later.';
				isLoading = false;
				// Optionally clear items or show stale data indication
				// inventoryItems = [];
			}
		);

		// --- Cleanup Function ---
		// Svelte runs this when the component is destroyed
		return () => {
			console.log('Inventory page unmounting, unsubscribing listener...');
			if (unsubscribeFromInventory) {
				unsubscribeFromInventory(); // Detach the listener to prevent memory leaks
			}
		};
	}); // End of onMount
</script>

<svelte:head>
	<title>Current Inventory (Client-Side)</title>
</svelte:head>

<div class="inventory-page-container">
	<h1>Current Inventory (Client-Side)</h1>

	{#if isLoading}
		<p>Loading inventory...</p>
	{:else if errorMessage}
		<p class="error">Error: {errorMessage}</p>
	{:else if inventoryItems.length > 0}
		<table class="inventory-table">
			<thead>
				<tr>
					<th>Barcode</th>
					<th>Product Name</th>
					<th class="quantity-col">Quantity</th>
					</tr>
			</thead>
			<tbody>
				{#each inventoryItems as item (item.barcode)}
					<tr>
						<td>{item.barcode}</td>
						<td>{item.name}</td>
						<td class="quantity-col">{item.quantity}</td>
						</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>No inventory items found.</p>
	{/if}
</div>

<style>
	/* Keep the same styles as your previous version */
	.inventory-page-container {
		padding: 1rem 2rem;
		max-width: 900px;
		margin: 0 auto;
	}
	.inventory-table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 1.5rem;
		font-size: 0.95rem;
	}
	.inventory-table th,
	.inventory-table td {
		border: 1px solid #ccc;
		padding: 0.6em 0.8em;
		text-align: left;
		vertical-align: middle;
	}
	.inventory-table th {
		background-color: #f0f0f0;
		font-weight: bold;
	}
	.inventory-table tr:nth-child(even) {
		background-color: #f9f9f9;
	}
	.inventory-table .quantity-col {
		text-align: right;
		width: 80px; /* Give quantity a fixed width */
	}
	.inventory-image {
		max-height: 40px;
		max-width: 60px;
		display: block;
	}
	.error {
		color: hsl(0, 80%, 50%);
		border: 1px solid hsl(0, 80%, 80%);
		padding: 0.8em;
		border-radius: 4px;
		background-color: hsl(0, 80%, 95%);
	}
</style>
