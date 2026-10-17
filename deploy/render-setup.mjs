import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db } from '../backend/db.mjs';
import { provisionRuntime } from './render-runtime.mjs';

try {
  if (!process.env.DATABASE_URL || !process.env.OWNER_USERNAME || !process.env.OWNER_PASSWORD) throw new Error('Set admin DATABASE_URL, OWNER_USERNAME and OWNER_PASSWORD in .env.render-admin.');
  const url = new URL(process.env.DATABASE_URL);
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Database connection requires ?sslmode=verify-full.');
  if (url.hostname.includes('-pooler.')) throw new Error('Use the direct database hostname, not the transaction pooler.');
  await db.query(await readFile(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  await provisionRuntime(db, process.env.STORE_APP_PASSWORD);
  const owner = spawnSync(process.execPath, [fileURLToPath(new URL('../backend/admin.mjs', import.meta.url)), 'owner'], { stdio: 'inherit', env: process.env });
  if (owner.status !== 0) throw new Error('Owner setup failed.');
  console.log('Schema, runtime role and owner ready. Use store_app for the API; protect the local admin env file and restrict database network access where available.');
} catch {
  // Connection errors and SQL statements can include credentials. Never print the raw error.
  console.error('Render setup failed. Check required variables, TLS/network access and admin role permissions. Do not use the admin connection for the API.');
  process.exitCode = 1;
} finally { await db.end(); }
