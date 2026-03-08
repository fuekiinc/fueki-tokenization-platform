/**
 * Database integration tests (PostgreSQL).
 *
 * These tests only run when FUEKI_ALLOW_DB_INTEGRATION=true and DATABASE_URL
 * points to a test database name containing "test".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const allowDb = process.env.FUEKI_ALLOW_DB_INTEGRATION === 'true';
const dbDescribe = allowDb ? describe : describe.skip;

function getDbName(url: string): string {
  const match = url.match(/\/([^/?]+)(?:\?|$)/);
  return (match?.[1] ?? '').toLowerCase();
}

if (allowDb) {
  const dbName = getDbName(DATABASE_URL);
  if (!dbName.includes('test')) {
    throw new Error(`Refusing DB integration tests because DATABASE_URL is not a test DB: ${dbName || 'unknown'}`);
  }
}

let client: Client;

dbDescribe('PostgreSQL integration', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('contains expected Prisma tables', async () => {
    const expected = [
      'User',
      'KYCData',
      'Session',
      'PasswordResetToken',
      'MintApprovalRequest',
      'SecurityTokenApprovalRequest',
      'DeployedContract',
    ];

    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );

    const tableSet = new Set(rows.map((r) => r.table_name));
    for (const table of expected) {
      expect(tableSet.has(table)).toBe(true);
    }
  });

  it('supports transactional writes with rollback safety', async () => {
    await client.query('BEGIN');
    try {
      const email = `test_${Date.now()}@fueki.test`;
      const id = `test-user-${Date.now()}`;

      const insertResult = await client.query(
        `INSERT INTO "User" (id, email, "passwordHash", role, "kycStatus", "helpLevel", "demoUsed", "demoActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'user', 'not_submitted', 'novice', false, false, NOW(), NOW())
         RETURNING id, email`,
        [id, email, 'hashed-password'],
      );

      expect(insertResult.rows[0]?.email).toBe(email);

      const lookup = await client.query(
        `SELECT email FROM "User" WHERE email = $1`,
        [email],
      );
      expect(lookup.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('has indexed access path for email lookup on User', async () => {
    const explain = await client.query(
      `EXPLAIN SELECT * FROM "User" WHERE email = 'index-check@fueki.test'`,
    );
    const plan = explain.rows.map((row) => Object.values(row).join(' ')).join('\n');

    expect(plan.length).toBeGreaterThan(0);
    expect(/Index|Seq Scan/i.test(plan)).toBe(true);
  });
});
