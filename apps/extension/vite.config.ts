import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        linkedin: resolve(__dirname, 'src/content/linkedin.ts'),
        lever: resolve(__dirname, 'src/content/lever.ts'),
        greenhouse: resolve(__dirname, 'src/content/greenhouse.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background/service-worker.js'
          if (['linkedin', 'lever', 'greenhouse'].includes(chunk.name)) {
            return `content/${chunk.name}.js`
          }
          return '[name]/[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'esnext',
    minify: false,
  },
})
