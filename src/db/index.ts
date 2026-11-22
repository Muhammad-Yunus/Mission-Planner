import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

function buildPoolConfig() {
  const host = process.env.PGHOST || 'localhost';
  const sslMode = process.env.PGSSL?.toLowerCase();
  const useSsl =
    sslMode === 'disable'
      ? false
      : sslMode === 'require' || (host !== 'localhost' && host !== '127.0.0.1');

  return {
    host,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool client error:', err.message);
});

export const db = drizzle(pool, { schema });
