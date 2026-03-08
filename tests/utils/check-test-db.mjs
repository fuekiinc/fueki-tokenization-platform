#!/usr/bin/env node
const value = process.env.DATABASE_URL || '';
if (!value) {
  console.error('[db-check] DATABASE_URL is not set.');
  process.exit(1);
}

const match = value.match(/\/([^/?]+)(?:\?|$)/);
const dbName = (match?.[1] || '').toLowerCase();
if (!dbName.includes('test')) {
  console.error(`[db-check] Refusing to run destructive DB tests against non-test database: ${dbName || 'unknown'}`);
  process.exit(1);
}

console.log(`[db-check] Safe test database detected: ${dbName}`);
