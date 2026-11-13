import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Health Connect is read-only in Personal OS. The @capgo/capacitor-health
 * manifest declares every scope it supports, and android/app/src/main/
 * AndroidManifest.xml removes everything outside this allowlist during the
 * Android manifest merge. This guard fails the build if that merge regresses.
 */
const ALLOWED = new Set([
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
]);

const intermediatesDir = join(process.cwd(), 'android', 'app', 'build', 'intermediates');

function findManifestFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findManifestFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'AndroidManifest.xml') {
      found.push(fullPath);
    }
  }
  return found;
}

function mergedManifests() {
  let entries;
  try {
    entries = readdirSync(intermediatesDir, { withFileTypes: true });
  } catch {
    throw new Error(
      `No Android build output at ${relative(process.cwd(), intermediatesDir)}. ` +
        'Run `npx cap sync android && cd android && ./gradlew assembleDebug` first.',
    );
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('merged_manifest'))
    .flatMap((entry) => findManifestFiles(join(intermediatesDir, entry.name)));
}

/**
 * The Health Connect privacy policy URL must be a real hosted page. The Android
 * build generates it from PRIVACY_POLICY_URL, so a placeholder can only come
 * from a stray source resource or a stale generated value.
 */
const PRIVACY_URL_SOURCES = [
  join('android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
  join('android', 'app', 'build', 'generated', 'res', 'resValues', 'debug', 'values', 'gradleResValues.xml'),
];

for (const relativePath of PRIVACY_URL_SOURCES) {
  let contents;
  try {
    contents = readFileSync(join(process.cwd(), relativePath), 'utf8');
  } catch {
    continue;
  }
  if (contents.includes('example.com')) {
    throw new Error(
      `Placeholder privacy policy URL found in ${relativePath}. ` +
        'Set PRIVACY_POLICY_URL for the Android build and delete the example.com value.',
    );
  }
}

const manifests = mergedManifests();
if (manifests.length === 0) {
  throw new Error(
    'No merged Android manifest found. Run `./gradlew assembleDebug` in android/ first.',
  );
}

const candidates = manifests.filter(
  (candidate) => relative(intermediatesDir, candidate).split(sep)[1] === 'debug',
);
const newest = (candidates.length > 0 ? candidates : manifests).reduce((latest, candidate) =>
  statSync(candidate).mtimeMs > statSync(latest).mtimeMs ? candidate : latest,
);
const manifest = readFileSync(newest, 'utf8');
const actual = new Set(
  [...manifest.matchAll(/android:name="(android\.permission\.health\.[^"]+)"/g)].map(
    (match) => match[1],
  ),
);

const missing = [...ALLOWED].filter((permission) => !actual.has(permission));
const unexpected = [...actual].filter((permission) => !ALLOWED.has(permission));

if (missing.length > 0 || unexpected.length > 0) {
  const details = [
    missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
    unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  throw new Error(
    `Health Connect manifest mismatch in ${relative(process.cwd(), newest)}.\n${details}\n` +
      'Only the three READ scopes may be present. Update the tools:node="remove" ' +
      'rules in android/app/src/main/AndroidManifest.xml for any new plugin scope.',
  );
}

console.log(
  `Health manifest check passed: ${[...ALLOWED].length} read-only permissions, no writes ` +
    `(${relative(process.cwd(), newest)}).`,
);
