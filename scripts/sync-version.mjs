import { readFileSync, writeFileSync } from 'node:fs';

/**
 * package.json is the single version source. This script copies it to
 * Cargo.toml, tauri.conf.json and Android's versionName/versionCode.
 * `node scripts/sync-version.mjs --check` fails when anything drifted.
 */
const check = process.argv.includes('--check');
const root = new URL('..', import.meta.url);
const path = (file) => new URL(file, root);

const pkg = JSON.parse(readFileSync(path('package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json version must be MAJOR.MINOR.PATCH, found "${version}"`);
  process.exit(1);
}
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10_000 + minor * 100 + patch;

const edits = [
  {
    file: 'src-tauri/Cargo.toml',
    pattern: /^(version\s*=\s*)"[^"]*"/m,
    replacement: `$1"${version}"`,
    expected: `version = "${version}"`,
  },
  {
    file: 'src-tauri/tauri.conf.json',
    pattern: /"version":\s*"[^"]*"/,
    replacement: `"version": "${version}"`,
    expected: `"version": "${version}"`,
  },
  {
    file: 'android/app/build.gradle',
    pattern: /^(\s*versionCode\s+)\d+/m,
    replacement: `$1${versionCode}`,
    expected: `versionCode ${versionCode}`,
  },
  {
    file: 'android/app/build.gradle',
    pattern: /^(\s*versionName\s+)"[^"]*"/m,
    replacement: `$1"${version}"`,
    expected: `versionName "${version}"`,
  },
];

let failed = false;
for (const edit of edits) {
  const file = path(edit.file);
  const contents = readFileSync(file, 'utf8');
  if (check) {
    if (!contents.includes(edit.expected)) {
      console.error(`${edit.file}: expected ${edit.expected}`);
      failed = true;
    }
    continue;
  }
  const next = contents.replace(edit.pattern, edit.replacement);
  if (next === contents && !contents.includes(edit.expected)) {
    console.error(`${edit.file}: could not apply ${edit.expected}`);
    process.exit(1);
  }
  writeFileSync(file, next);
}

if (failed) process.exit(1);
console.log(
  check
    ? `Version ${version} is in sync (Android versionCode ${versionCode}).`
    : `Synced version ${version} (Android versionCode ${versionCode}).`,
);
