import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSetup, setupFailure } from '../../deploy/setup-diagnostics.mjs';

const env = { DATABASE_URL: 'postgresql://owner:secret@example.neon.tech/neondb?sslmode=verify-full', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'long-test-only-password', STORE_APP_PASSWORD: 'long-test-only-database-password-123456' };
test('setup checks credentials and TLS before any database writes', () => {
  validateSetup(env);
  assert.throws(() => validateSetup({ ...env, DATABASE_URL: env.DATABASE_URL.replace('verify-full', 'require') }), /sslmode/);
  assert.throws(() => validateSetup({ ...env, DATABASE_URL: env.DATABASE_URL.replace('example.neon', 'example-pooler.neon') }), /pooler/);
  assert.throws(() => validateSetup({ ...env, STORE_APP_PASSWORD: 'short' }), /32/);
});
test('setup diagnostics never print external error details or connection strings', () => {
  const message = setupFailure('database', { code: '28P01', message: env.DATABASE_URL, detail: env.STORE_APP_PASSWORD, query: env.OWNER_PASSWORD });
  assert.match(message, /28P01/);
  assert.ok(!message.includes(env.DATABASE_URL));
  assert.ok(!message.includes(env.STORE_APP_PASSWORD));
  assert.ok(!message.includes(env.OWNER_PASSWORD));
  assert.ok(!setupFailure('database', { code: env.DATABASE_URL }).includes(env.DATABASE_URL));
  assert.match(setupFailure('database', new Error('Connection terminated due to connection timeout')), /ETIMEDOUT/);
  assert.match(setupFailure('database', { cause: { code: 'ENOTFOUND' } }), /ENOTFOUND/);
});
