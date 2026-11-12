import { spawnSync } from 'node:child_process';

/**
 * Runs the Firestore rules tests against the local emulator.
 *
 * The emulator needs a Java runtime (21 or newer for the current Firebase
 * CLI) and the Firebase CLI itself. Neither is required to build or ship the
 * app, so a machine without them skips the run instead of failing it.
 */

const PROJECT_ID = 'demo-range-rules';
const TEST_COMMAND = 'npx vitest run --config vitest.rules.config.ts';
function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function javaMajorVersion() {
  const result = run('java', ['-version']);
  if (result.error || result.status !== 0) return null;
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  const match = output.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

function hasFirebaseCli() {
  const result = run('firebase', ['--version']);
  return !result.error && result.status === 0;
}

const major = javaMajorVersion();
if (major === null) {
  console.log('Skipping the Firestore rules tests: no Java runtime was found.');
  process.exit(0);
}
if (major < 21) {
  console.log(
    `Skipping the Firestore rules tests: the Firestore emulator needs Java 21 or newer (found ${major}).`,
  );
  process.exit(0);
}
if (!hasFirebaseCli()) {
  console.log('Skipping the Firestore rules tests: the Firebase CLI was not found.');
  process.exit(0);
}

const emulator = run('firebase', [
  'emulators:exec',
  '--only',
  'firestore',
  '--project',
  PROJECT_ID,
  '--config',
  'tests/rules/firebase.json',
  TEST_COMMAND,
]);

if (emulator.stdout) process.stdout.write(emulator.stdout);
if (emulator.stderr) process.stderr.write(emulator.stderr);
process.exit(emulator.status ?? 1);
