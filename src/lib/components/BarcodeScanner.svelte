<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
//  import { getProductName, ProductMetadata } from '$lib/productLookup';

  import * as ProductLookup from '$lib/productLookup'
  import * as ZxingBrowser from '@zxing/browser';
  import * as ZxingLibrary from '@zxing/library';

  let videoElement: HTMLVideoElement; // Bound to the <video> element
  let scannedCode: string | null = null;
  let productMetadataForDisplay: ProductMetadatata | null = null; // Add state for the name
  let isLookingUp = false; // Add state for lookup process

  let errorMessage: string | null = null;
  let isLoading = false;
  let scannerControls: ZxingBrowser.IScannerControls | null = null; // To store the controls for stopping

  const codeReader = new ZxingBrowser.BrowserMultiFormatReader();

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
            ProductLookup.getProductName(scannedCode).then(metadata => {
              if (metadata) {
                  console.log(`Display Name for ${scannedCode}: ${name}`);
                  productMetadataForDisplay = metadata;
                  isLookingUp = false; // Indicate lookup finished
              } else {
                  console.log(`Could not find product name for ${scannedCode}.`);
                  productMetadataForDisplay = {name:`Unknown Product`}; // Provide feedback
                  isLookingUp = false; // Indicate lookup finished
                  // TODO: Maybe prompt user to enter name here?
              }
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
//      catch(err) {
//          // Handle errors from getProductName itself if any unhandled ones occur
//          console.error("Error in getProductName promise:", err);
//          productNameForDisplay = "Lookup Error";
//          isLookingUp = false;
//      };
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
    if (scannerControls) {
      scannerControls.stop(); // Use the controls object from the decode callback
      scannerControls = null;
    } else {
      // Fallback if controls weren't captured or start failed early
      codeReader.reset(); // Resets the code reader instance
      if (videoElement && videoElement.srcObject) {
         // Manually stop tracks if needed (though controls.stop() should handle this)
         const stream = videoElement.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
         videoElement.srcObject = null;
      }
    }
    isLoading = false;
  }

  // Ensure scanner is stopped when component is destroyed
  onDestroy(() => {
    stopScan();
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
  <p class="result">
    Scanned Code: <strong>{scannedCode}</strong><br/>
    {#if isLookingUp}
      Product Name: <em>Looking up...</em>
    {:else if productMetadataForDisplay}
      Product Name: <strong>{productMetadataForDisplay.name}</strong>
      {#if productMetadataForDisplay.imageUrl != null}
        <img src='{productMetadataForDisplay.imageUrl}'/>
      {/if}
    {:else}
      Product Name: <em>Not found or offline</em>
    {/if}
  </p>
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
