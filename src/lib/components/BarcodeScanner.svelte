<script lang="ts">
  import { browser } from '$app/environment'; // Import the browser guard
  import { onMount, onDestroy } from 'svelte';
//  import { getProductMetadata, ProductMetadata } from '$lib/productLookup';

  import * as ProductLookup from '$lib/productLookup'
  import * as ZxingBrowser from '@zxing/browser';
  import * as ZxingLibrary from '@zxing/library';
  import * as Inventory from '$lib/inventory'

  let videoElement: HTMLVideoElement; // Bound to the <video> element
  let scannedCode: string | null = null;
  let productMetadataForDisplay: Inventory.RemoteData<ProductLookup.ProductInfo> = Inventory.RemoteData.empty<ProductLookup.ProductInfo>();
//  let quantityForDisplay: Inventory.RemoteData<number> = Inventory.RemoteData.empty<number>();
  let isLookingUp = false; // Add state for lookup process

  let errorMessage: string | null = null;
  let isLoading = false;
  let scannerControls: ZxingBrowser.IScannerControls | null = null; // To store the controls for stopping

  let codeReader: ZxingBrowser.BrowserMultiFormatReader | null = null; // Use let, initialize to null


  // --- Audio Setup ---
  let audioContext: AudioContext | null = null;
  let isAudioContextResumed = false;

  // Function to initialize or resume the AudioContext (needs user gesture)
  function ensureAudioContext() {
    if (!audioContext) {
      try {
         // Handle browser prefixing
         const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
         if (AudioContext) {
           audioContext = new AudioContext();
           console.log('AudioContext created.');
         } else {
           console.error('Web Audio API is not supported in this browser.');
           return false;
         }
      } catch (e) {
         console.error('Failed to create AudioContext:', e);
         return false;
      }
    }

    if (audioContext.state === 'suspended') {
       audioContext.resume().then(() => {
         console.log('AudioContext resumed successfully.');
         isAudioContextResumed = true;
       }).catch(err => {
         console.error('Failed to resume AudioContext:', err);
       });
       // Note: resume() is async, but we might try playing immediately anyway
       // More robust handling might wait for the promise, but often not needed
    } else {
       isAudioContextResumed = true; // Already running
    }
    return true; // Context exists (or was just created)
  }

  // Function to play a beep sound
  function playBeep(frequency = 880, duration = 100, volume = 0.5) {
    if (!audioContext || !isAudioContextResumed) {
      console.warn('AudioContext not ready or not resumed, cannot play beep.');
      // Optionally try to resume again here? Or rely on startScan ensuring it.
      if (audioContext && !isAudioContextResumed) {
        ensureAudioContext(); // Attempt resume again
      }
      // Don't proceed if still not ready
      if (!audioContext || audioContext.state !== 'running') return;
    }

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine'; // or 'square' for a harsher beep

      console.log(`Playing beep: ${frequency}Hz for ${duration}ms`);
      oscillator.start(audioContext.currentTime);
      // Stop after 'duration' milliseconds
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
        console.error("Error playing beep:", e);
    }
  }
  // --- End Audio Setup ---

  async function startScan() {
    // Guard against non-browser environment
    if (!browser) {
      errorMessage = "Scanning requires a browser environment.";
      isLoading = false;
      return;
    }
    // Guard against uninitialized codeReader
    if (!codeReader) {
      errorMessage = "Scanner not yet initialized.";
      isLoading = false;
      console.error("startScan called before codeReader was initialized in onMount.");
      return;
    }

    scannedCode = null; // Reset previous scan
    errorMessage = null;
    isLoading = true;

    // --- Ensure AudioContext is ready after user clicks "Start Scan" ---
    if (!ensureAudioContext()) {
        errorMessage = "Web Audio API not supported.";
        isLoading = false;
        return; // Stop if audio context failed
    }
    // --- End AudioContext Check ---

    try {
      // IMPORTANT: Ask for 'environment' facing camera (rear camera)
      const constraints = {
        video: {
          facingMode: 'environment'
        }
      };
      // Note: getUserMedia MUST be called in a secure context (HTTPS or localhost)
      // Use decodeFromVideoDevice which handles the stream internally
      scannerControls = await codeReader.decodeFromVideoDevice(undefined, videoElement, (result, error, controls) => {
          // This callback fires continuously for each frame processed

          if (result) {
            console.log('Scan successful:', result);
            scannedCode = result.getText();
            errorMessage = null;
            // Stop scanning once found - important!
            controls.stop();
            scannerControls = null; // Clear controls once stopped
            isLoading = false;
            // --- Play Beep on Success ---
            console.log("play beep");
            playBeep(1000, 150, 0.3); // Example: 1000Hz, 150ms, 30% volume
            // --- End Play Beep ---

            // --- Call the lookup function ---
            console.log('Before calling startLoading, productMetadataForDisplay is:', productMetadataForDisplay); // <-- ADD THIS LOG
            productMetadataForDisplay.startLoading();
            productMetadataForDisplay = productMetadataForDisplay;
            ProductLookup.getProductMetadata(scannedCode).then(metadata => {
              if (metadata) {
                  console.log(`Display Name for ${scannedCode}: ${name}`);
                  productMetadataForDisplay.finishLoading(metadata);
                  productMetadataForDisplay = productMetadataForDisplay;
              } else {
                  console.log(`Could not find product name for ${scannedCode}.`);
                  productMetadataForDisplay = {name:`Unknown Product`}; // Provide feedback
                  // TODO: Maybe prompt user to enter name here?
              }

              Inventory.incrementInventoryMutable(scannedCode, 1).then(() => {
                 console.log("updated inventory");
              });
/*
              Inventory.incrementInventoryLog(scannedCode, 1).then(() => {
                 quantityForDisplay.startLoading();
                 quantityForDisplay = quantityForDisplay; // svelte reactivity
                 Inventory.getInventoryLog(scannedCode).then(quantity => {
                   quantityForDisplay.finishLoading(quantity);
                   quantityForDisplay = quantityForDisplay; // svelte reactivity
                   isLookingUp = false;
                 });
              });
              */
            });
          }
          if (error) {
            // NotFoundException means no barcode was found in the frame - this is normal and happens constantly
            if (!(error instanceof ZxingLibrary.NotFoundException)) {
              console.error('Scan Error:', error);
              // Display other types of errors
              // Don't stop scanning on NotFoundException, but maybe on others? Depends on desired UX.
              // errorMessage = `Scan Error: ${error.message}`;
            }
          }
        });
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please grant permission in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No suitable camera found.';
      } else {
        errorMessage = `Failed to start camera: ${err.message}`;
      }
      isLoading = false;


      scannerControls = null; // Ensure controls are null if start failed
    }
  }

  function stopScan() {
    console.log('Stopping scan...');
    isLoading = false; // Set isLoading false immediately

    // Guard against non-browser / uninitialized reader
    if (!browser || !codeReader) {
      console.warn('stopScan called but no codeReader instance available or not in browser.');
      // Attempt to clean up video stream just in case, though less likely needed
      if (videoElement && videoElement.srcObject) {
           const stream = videoElement.srcObject as MediaStream;
           stream.getTracks().forEach(track => track.stop());
           videoElement.srcObject = null;
      }
      return; // Exit if no reader
    }

    try {
      // The primary way to stop and release resources
      codeReader.reset();
      console.log('codeReader.reset() called successfully in stopScan.');
    } catch (e) {
      console.error('Error calling codeReader.reset() in stopScan:', e);
    }

    // Optional: Clear video source explicitly AFTER reset, though reset should handle it.
    if (videoElement && videoElement.srcObject) {
       videoElement.srcObject = null;
    }
    scannerControls = null; // Clear this just in case
  }

  onMount(() => {
    if (browser) {
      // This code only runs in the browser
      console.log('Component mounted in browser, initializing codeReader...');
      codeReader = new ZxingBrowser.BrowserMultiFormatReader();
      console.log('codeReader initialized:', codeReader);
    }

    // Return a cleanup function (runs on onDestroy)
    return () => {
      console.log('onMount cleanup: Resetting scanner if it exists.');
      if (browser && codeReader) {
        codeReader.reset();
        codeReader = null; // Clear reference
      }
    };
  });


</script>

<div class="scanner-container">
  <h2>Barcode Scanner</h2>

  <video bind:this={videoElement} playsinline muted></video>

  <div class="controls">
    <button on:click={startScan} disabled={isLoading}>
      {#if isLoading && !scannedCode} Scanning... {:else} Start Scan {/if}
    </button>
    {#if isLoading}
      <button on:click={stopScan} disabled={!isLoading}>Stop Scan</button>
    {/if}
  </div>

  {#if errorMessage}
    <p class="error">Error: {errorMessage}</p>
  {/if}

{#if scannedCode}
    <ul>
      <li>Scanned Code: <strong>{scannedCode}</strong></li>
      {#if productMetadataForDisplay.state == Inventory.State.LOADING}
        <li>Product Name: <em>Looking up...</em></li>
      {:else if productMetadataForDisplay.state == Inventory.State.VALID}
        <li> Product Name: <strong>{productMetadataForDisplay.data.metadata.name}</strong></li>
        <li> Quantity: <strong>{(productMetadataForDisplay.data.quantity || 0) + 1}</strong></li>
      {:else}
        <li>Product Name: N/A</li>
      {/if}
      <!--
      {#if quantityForDisplay.state == Inventory.State.VALID}
        <li>Quantity: {quantityForDisplay.data}</li>
      {:else if quantityForDisplay.state == Inventory.State.LOADING}
        <li>Quantity: Loading...</li>
      {:else}
        <li>Quantity: N/A</li>
      {/if}
      -->
    </ul>
    {#if productMetadataForDisplay.satte == Inventory.State.VALID && productMetadataForDisplay.data.imageUrl != null}
      <img src='{productMetadataForDisplay.imageUrl}'/>
    {/if}
{/if}
</div>

<style>
  .scanner-container {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ccc;
    border-radius: 5px;
    max-width: 500px; /* Adjust as needed */
  }
  video {
    width: 100%;
    max-width: 400px; /* Limit size */
    height: auto;
    border: 1px solid #eee;
    margin-bottom: 10px;
    background-color: #333; /* Placeholder background */
  }
  .controls button {
    margin-right: 10px;
    padding: 8px 15px;
    cursor: pointer;
  }
  .error {
    color: red;
    margin-top: 10px;
  }
  .result {
    margin-top: 10px;
    font-weight: bold;
    background-color: #e0ffe0;
    padding: 5px;
  }
</style>
