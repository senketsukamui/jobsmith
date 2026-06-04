import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            sourcemap: true,
            rollupOptions: {
              external: [
                'electron',
                '@libsql/client',
                'pino',
                'pino-pretty',
                /^node:.*/,
                /^@libsql\/.*/,
              ],
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, '../../packages/shared/src'),
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
})
