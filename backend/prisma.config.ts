/**
 * Prisma 7 configuration file.
 * Connection URL is sourced from DATABASE_URL environment variable.
 * See: https://pris.ly/d/config-datasource
 */
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma/schema.prisma'),
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
      }
      return new PrismaPg({ connectionString });
    },
  },
});
