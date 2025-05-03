<script lang="ts">
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';

  let showScanner = false;

  let lastScannedCode: string | null = null;

  function handleScanResult(event: CustomEvent<string>) {
    // This function would be called by an event dispatched from BarcodeScanner
    lastScannedCode = event.detail;
    showScanner = false; // Hide scanner after successful scan
    // TODO: Now do something with the lastScannedCode (e.g., add to inventory)
    console.log("Code received from scanner:", lastScannedCode);
  }
</script>

<BarcodeScanner />

{#if lastScannedCode}
  <p>Last code scanned: {lastScannedCode}</p>
{/if}
