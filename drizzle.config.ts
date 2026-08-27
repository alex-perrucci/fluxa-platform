import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './libs/database/src/schema.ts',
    './libs/database/src/subscriptions.schema.ts',
  ],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
