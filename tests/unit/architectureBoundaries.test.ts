import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findFiles(dir: string, ext: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Storage boundary and no direct localStorage rule', () => {
  it('ensures no direct localStorage calls exist in src/ outside platform/web.ts', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const files = findFiles(srcDir, '.ts').concat(findFiles(srcDir, '.tsx'));

    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      if (file.endsWith('platform/web.ts')) {
        continue; // Permitted adapter
      }
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((lineText, idx) => {
        // match localStorage access not commented out
        if (/\blocalStorage\b/.test(lineText) && !/^\s*\/\//.test(lineText)) {
          violations.push({
            file: path.relative(srcDir, file),
            line: idx + 1,
            text: lineText.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('ensures domain layer contains zero DOM/React references', () => {
    const domainDir = path.resolve(__dirname, '../../src/domain');
    const files = findFiles(domainDir, '.ts');

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\b(?:window|document|HTMLElement|React|useSyncExternalStore)\b/.test(content)) {
        violations.push(path.basename(file));
      }
    }

    expect(violations).toEqual([]);
  });
});

