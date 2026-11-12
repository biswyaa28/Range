import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStateAppPayload,
  STATE_APP_ALLOWED_KEYS,
  STATE_APP_KEYS,
  STATE_APP_MAX_BYTES,
} from '@/sync/appPayload';

const rules = readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');

/** The keys `firestore.rules` accepts in the `state/app` document. */
function allowedStateAppKeys(): string[] {
  const match = /docId == 'app' && d\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(rules);
  if (!match || !match[1]) throw new Error('The rules no longer declare the state/app key list.');
  return match[1]
    .split(',')
    .map((key) => key.trim().replace(/^'|'$/g, ''))
    .filter((key) => key.length > 0);
}

describe('the app state payload and the firestore rules', () => {
  it('writes only the keys the rules allow', () => {
    expect(allowedStateAppKeys()).toEqual([...STATE_APP_ALLOWED_KEYS]);
  });

  it('keeps the payload builder inside the allowed keys', () => {
    for (const key of STATE_APP_KEYS) {
      expect(allowedStateAppKeys()).toContain(key);
    }
  });

  it('drops a key the rules would refuse', () => {
    const payload = buildStateAppPayload({
      profile: { name: 'Ada' },
      secrets: { token: 'x' },
    } as never);

    expect(Object.keys(payload)).toEqual(['profile']);
  });

  it('keeps the serialized document under the Firestore limit', () => {
    // Firestore rejects a document over 1 MiB.
    expect(STATE_APP_MAX_BYTES).toBeLessThan(1024 * 1024);
  });
});
