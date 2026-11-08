import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist', 'assets');
const cssFiles = readdirSync(assetsDir).filter((file) => file.endsWith('.css'));
if (cssFiles.length === 0) {
  throw new Error('No built CSS files found. Run npm run build first.');
}

const forbidden = /\b(width|height|left|top|right|bottom|margin(?:-[a-z]+)?)\b/i;
const violations = [];
for (const file of cssFiles) {
  const css = readFileSync(join(assetsDir, file), 'utf8');
  for (const match of css.matchAll(/transition(?:-property)?\s*:[^;}]+/gi)) {
    if (forbidden.test(match[0])) violations.push(`${file}: ${match[0]}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Layout transitions found:\n${violations.join('\n')}`);
}

console.log(`Motion CSS check passed for ${cssFiles.length} built stylesheet(s).`);
