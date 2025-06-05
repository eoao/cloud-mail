import {defineConfig,loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE')
  return {
    server: {
      host: true,
      port: 3001,
      hmr: true,
    },
    base: env.VITE_STATIC_URL || '/',
    plugins: [vue()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    build: {
      target: 'es2022',
      outDir: '../mail-worker/dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: () => 'all-in-one'
        }
      },
      assetsInclude: ['**/*.json'],
    }
  }
})
