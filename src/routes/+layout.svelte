<script lang="ts">
  export const ssr = false;

  import { browser } from '$app/environment'; // Import browser check
  import { onMount } from 'svelte';

  onMount(async () => {
    // Register SW only in the browser environment
    if (browser) {
      // Dynamically import the registration module provided by vite-plugin-pwa
      const { registerSW } = await import('virtual:pwa-register');
      // Register the service worker.
      // 'autoUpdate' (set in vite.config.js) handles prompting user for reload on update.
      // 'prompt' would require you to build UI for the update prompt.
      registerSW({
         onNeedRefresh() {
           // Optional: You could show a more custom UI prompt here
           console.log('PWA update available. Refresh needed.');
         },
         onOfflineReady() {
           console.log('PWA ready for offline use.');
         }
      });
    }

  });

  // Your existing layout script logic (if any) goes here
</script>

<slot />
