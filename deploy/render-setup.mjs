import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db } from '../backend/db.mjs';
import { provisionRuntime } from './render-runtime.mjs';
import { validateSetup, setupFailure } from './setup-diagnostics.mjs';

let stage = 'kiểm tra cấu hình';
try {
  validateSetup(process.env);
  console.log('Cấu hình hợp lệ (không hiển thị thông tin bí mật).');
  if (process.argv.includes('--check')) process.exitCode = 0;
  else {
  stage = 'kết nối database';
  await db.query('SELECT 1');
  console.log('Kết nối database thành công.');
  stage = 'tạo schema';
  await db.query(await readFile(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  stage = 'cấp quyền store_app';
  await provisionRuntime(db, process.env.STORE_APP_PASSWORD);
  stage = 'tạo tài khoản chủ';
  const owner = spawnSync(process.execPath, [fileURLToPath(new URL('../backend/admin.mjs', import.meta.url)), 'owner'], { stdio: 'pipe', env: process.env });
  if (owner.error) throw owner.error;
  if (owner.status !== 0) throw new Error('Owner setup failed.');
  console.log('Schema, runtime role and owner ready. Use store_app for the API; protect the local admin env file and restrict database network access where available.');
  }
} catch (error) {
  // Connection errors and SQL statements can include credentials. Never print the raw error.
  console.error(stage === 'kiểm tra cấu hình' ? error.message : setupFailure(stage, error));
  process.exitCode = 1;
} finally { await db.end(); }
