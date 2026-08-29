import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'VITE')
    return {
        server: {
            host: true,
            port: 3001,
            hmr: true,
        },
        base: env.VITE_STATIC_URL || '/',
        plugins: [vue(),
            VitePWA({
                injectRegister: 'script-defer',
                manifest: {
                    name: env.VITE_PWA_NAME,
                    short_name: env.VITE_PWA_NAME,
                    background_color: '#FFFFFF',
                    theme_color: '#FFFFFF',
                    icons: [
                        {
                            src: 'mail-pwa.png',
                            sizes: '192x192',
                            type: 'image/png',
                        }
                    ],
                },
                workbox: {
                    disableDevLogs: true,
                    // Precache the shell so the app opens offline. Caching was
                    // switched off entirely before, which made the app
                    // installable but useless without a connection.
                    globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
                    // The worker serves the SPA, so an unknown path is the app.
                    navigateFallback: '/index.html',
                    // Never serve a cached page for the API - a stale mailbox
                    // is worse than an honest network error.
                    navigateFallbackDenylist: [/^\/api\//, /^\/attachments\//, /^\/static\//],
                    cleanupOutdatedCaches: true,
                    // The bundle is over the 2 MiB default.
                    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                    runtimeCaching: [
                        {
                            // Attachments and inline images are immutable once
                            // written - their key is a hash of the content.
                            urlPattern: /\/attachments\//,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'mail-attachments',
                                expiration: {maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30},
                                cacheableResponse: {statuses: [0, 200]}
                            }
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts',
                                expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365},
                                cacheableResponse: {statuses: [0, 200]}
                            }
                        }
                    ]
                }
            }),
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            })
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
        },
        build: {
            target: 'es2022',
            outDir: env.VITE_OUT_DIR || 'dist',
            emptyOutDir: true,
            assetsInclude: ['**/*.json']
        }
    }
})
