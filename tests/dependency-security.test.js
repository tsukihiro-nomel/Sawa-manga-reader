import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function parseVersion(version) {
  return String(version || '')
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(version, minimum) {
  const actualParts = parseVersion(version);
  const minimumParts = parseVersion(minimum);
  for (let index = 0; index < minimumParts.length; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return actualParts[index] > minimumParts[index];
    }
  }
  return true;
}

describe('production dependency security floors', () => {
  it('keeps fast-xml-parser at or above the patched 5.7.0 release', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8'));
    const installed = lock.packages?.['node_modules/fast-xml-parser']?.version;

    expect(installed).toBeTruthy();
    expect(isAtLeast(installed, '5.7.0')).toBe(true);
  });
});
