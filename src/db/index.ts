import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

function buildPoolConfig() {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl:
      process.env.PGHOST && process.env.PGHOST !== 'localhost'
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

export const pool = new Pool(buildPoolConfig());
export const db = drizzle(pool, { schema });
