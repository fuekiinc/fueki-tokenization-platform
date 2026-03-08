/**
 * Security smoke checks.
 *
 * Guards against accidental secret leakage and validates critical input
 * sanitization helpers behave as expected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../../src/lib/utils/validation';

function walk(dir: string, collected: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', 'dist', 'artifacts', 'cache', 'out', 'out-foundry'].includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, collected);
    } else if (/\.(ts|tsx|js|jsx|sol)$/.test(entry.name)) {
      collected.push(full);
    }
  }
  return collected;
}

describe('security smoke checks', () => {
  it('escapes script injection payloads', () => {
    const escaped = sanitizeInput('<img src=x onerror=alert(1)>');
    expect(escaped).toContain('&lt;img');
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&gt;');
  });

  it('does not include obvious private-key literals in tracked source', () => {
    const files = walk(path.resolve('src')).concat(walk(path.resolve('backend/src')));
    const privateKeyPattern =
      /(?:PRIVATE_KEY|DEPLOYER_PRIVATE_KEY|MNEMONIC)\s*[:=]\s*['"][^'"]+['"]|BEGIN (?:RSA |EC )?PRIVATE KEY/;

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/hardhat|anvil|test fixture/i.test(file)) {
        continue;
      }
      if (privateKeyPattern.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
