import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')

  return {
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
            define: {
              'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID ?? ''),
              'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? ''),
            },
            build: {
              sourcemap: true,
              rollupOptions: {
                external: [
                  'electron',
                  '@libsql/client',
                  'pino',
                  'pino-pretty',
                  'drizzle-orm',
                  'googleapis',
                  'google-auth-library',
                  'fastify',
                  '@fastify/cors',
                  'node-cron',
                  'ollama',
                  'pdf-parse',
                  'mammoth',
                  'uuidv7',
                  /^node:.*/,
                  /^@libsql\/.*/,
                  /^drizzle-orm\/.*/,
                  /^googleapis\/.*/,
                  /^fastify\/.*/,
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
  }
})
