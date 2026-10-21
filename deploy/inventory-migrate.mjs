import { readFile } from 'node:fs/promises';
import { db } from '../backend/db.mjs';
import { provisionRuntime } from './render-runtime.mjs';
import { validateSetup, setupFailure } from './setup-diagnostics.mjs';

let stage = 'kiểm tra cấu hình';
try {
  validateSetup(process.env);
  stage = 'cập nhật schema kho';
  await db.query(await readFile(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  stage = 'cấp quyền store_app';
  await provisionRuntime(db, process.env.STORE_APP_PASSWORD);
  console.log('Đã cập nhật schema và quyền quản lý kho. Tài khoản chủ và phiên đăng nhập được giữ nguyên.');
} catch (error) {
  console.error(stage === 'kiểm tra cấu hình' ? error.message : setupFailure(stage,error));
  process.exitCode = 1;
} finally { await db.end(); }
