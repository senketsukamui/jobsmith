import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './electron/db/schema.ts',
  out: './electron/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./data.db',
  },
})
