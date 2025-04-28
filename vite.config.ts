import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig(({mode}) => {
    const isDevelopment = mode === 'development';
    console.log(`[vite.config.ts] Mode: '${mode}', PWA Dev Enabled: ${!isDevelopment}`);

  return {
    plugins: [
		sveltekit(),
		VitePWA({ // <--- Add the plugin configuration here
			registerType: 'autoUpdate', // Automatically update service worker when new content is available
			// injectRegister: null, // Set to null to prevent auto-injection if doing manual registration (recommended)
			manifest: {
				// --- Customize these ---
				name: 'Basement Inventory Tracker',
				short_name: 'InventoryApp',
				description: 'An app to track items in the basement storage unit.',
				theme_color: '#ffffff', // Example theme color
				background_color: '#ffffff',
				display: 'standalone', // Makes the PWA feel more like a native app
			        start_url: '/', // Or the main entry point of your app
                                scope: '/',
				// --- Add your icons ---
				icons: [
					{
						src: '/icons/icon-192x192.png', // Path relative to 'static' folder
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any maskable' // 'maskable' allows adaptive icons on Android
					},
					{
						src: '/icons/icon-512x512.png', // Path relative to 'static' folder
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					},
					// Add more sizes if needed (e.g., 144x144 for older devices)
				]
			},
			// --- Service Worker Configuration (Workbox) ---
			workbox: {
				// Default 'generateSW' strategy caches assets automatically.
				// You might need to customize this later for more complex offline needs
				// or network strategies.
				// Example: Cache external fonts
				// runtimeCaching: [
				//  {
				//    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
				//    handler: 'CacheFirst',
				//    options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } } // Cache for a year
				//  }
			  // ]
                          runtimeCaching: [],
			},
			// --- Development Options ---
		  devOptions: {
                                enabled: !isDevelopment, // Set enabled to false if mode is 'development'
				type: 'module', // Use module type for service worker in dev
			}
		})
        ],
        build: { target: 'es2022' },
	test: {
		workspace: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
  };
});
