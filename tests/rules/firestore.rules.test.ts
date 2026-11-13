import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-range-rules';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8180;
const UID = 'user-1';
const OTHER_UID = 'user-2';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
      rules,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

/** A client that is signed in as `uid`. */
function clientFor(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

/** A client with no signed-in user. */
function anonymousClient() {
  return testEnv.unauthenticatedContext().firestore();
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-1',
    title: 'Write the report',
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T10:00:00.000Z',
    deleted: false,
    deviceId: 'device-1',
    ...overrides,
  };
}

describe('firestore.rules', () => {
  describe('authentication', () => {
    it('refuses a write from a signed-out client', async () => {
      await assertFails(
        setDoc(doc(anonymousClient(), 'users', UID, 'tasks', 'task-1'), record()),
      );
    });

    it('allows a write to the signed-in user own collection', async () => {
      await assertSucceeds(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'), record()),
      );
    });

    it('refuses a write to another user collection', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', OTHER_UID, 'tasks', 'task-1'), record()),
      );
    });

    it('refuses a read of another user collection', async () => {
      await assertFails(getDoc(doc(clientFor(UID), 'users', OTHER_UID, 'tasks', 'task-1')));
    });
  });

  describe('paths', () => {
    it('refuses a write to the unused user root', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID), { anything: true }),
      );
    });

    it('refuses a write to a collection outside the allowlist', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'secrets', 'key-1'), { value: 'x' }),
      );
    });

    it('refuses a read of a collection outside the allowlist', async () => {
      await assertFails(
        getDoc(doc(clientFor(UID), 'users', UID, 'secrets', 'key-1')),
      );
    });

    it('allows a read of the state documents', async () => {
      await assertSucceeds(getDoc(doc(clientFor(UID), 'users', UID, 'state', 'app')));
      await assertSucceeds(getDoc(doc(clientFor(UID), 'users', UID, 'state', 'stats')));
      await assertSucceeds(
        getDoc(doc(clientFor(UID), 'users', UID, 'state', 'preferences')),
      );
    });
  });

  describe('record shape', () => {
    it('refuses a record whose id does not match the document id', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'), record({ id: 'other' })),
      );
    });

    it('refuses a record without an id', async () => {
      const { id: _id, ...withoutId } = record();
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'), withoutId),
      );
    });

    it('refuses a record without an updatedAt', async () => {
      const { updatedAt: _updatedAt, ...withoutStamp } = record();
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'), withoutStamp),
      );
    });

    it('refuses a record whose updatedAt is not a string', async () => {
      await assertFails(
        setDoc(
          doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'),
          record({ updatedAt: 12345 }),
        ),
      );
    });

    it('refuses a record whose deleted flag is not a boolean', async () => {
      await assertFails(
        setDoc(
          doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'),
          record({ deleted: 'yes' }),
        ),
      );
    });

    it('refuses a record with too many fields', async () => {
      const wide: Record<string, unknown> = {};
      for (let index = 0; index < 45; index += 1) wide[`field${index}`] = index;
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1'), wide),
      );
    });

    it('allows a well formed record', async () => {
      await assertSucceeds(
        setDoc(doc(clientFor(UID), 'users', UID, 'notes', 'note-1'), {
          id: 'note-1',
          body: 'Hello',
          createdAt: '2026-04-13T10:00:00.000Z',
          updatedAt: '2026-04-13T10:00:00.000Z',
          deleted: false,
          deviceId: 'device-1',
        }),
      );
    });
  });

  describe('size limits', () => {
    it('refuses a record with more fields than the shape allows', async () => {
      const wide: Record<string, unknown> = {};
      for (let index = 0; index < 45; index += 1) wide[`field${index}`] = index;
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'big-1'), wide),
      );
    });

    it('refuses a day map with more days than the shape allows', async () => {
      const days: Record<string, unknown> = {};
      for (let index = 0; index < 4001; index += 1) days[`2020-01-${index}`] = index;
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'stats'), days),
      );
    });
  });

  describe('state documents', () => {
    it('allows the app state singletons', async () => {
      await assertSucceeds(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'app'), {
          profile: { name: 'Ada' },
          layout: { columns: 3 },
          settings: { theme: 'dark' },
        }),
      );
    });

    it('refuses an unknown key in the app state', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'app'), {
          profile: { name: 'Ada' },
          secrets: { token: 'x' },
        }),
      );
    });

    it('refuses an extra state document outside the allowlist', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'secrets'), {
          token: 'x',
        }),
      );
    });

    it('allows the day map in the stats document', async () => {
      await assertSucceeds(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'stats'), {
          '2026-04-13': {
            date: '2026-04-13',
            blocksDone: 1,
            blocksTotal: 2,
            tasksDone: 3,
            focusMinutes: 30,
            updatedAt: '2026-04-13T10:00:00.000Z',
          },
        }),
      );
    });
  });

  describe('preferences', () => {
    it('allows preferences without an AI key', async () => {
      await assertSucceeds(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'preferences'), {
          theme: 'dark',
          updatedAt: '2026-04-13T10:00:00.000Z',
        }),
      );
    });

    it('refuses preferences that carry a plaintext AI key', async () => {
      await assertFails(
        setDoc(doc(clientFor(UID), 'users', UID, 'state', 'preferences'), {
          theme: 'dark',
          ai: { apiKey: 'sk-secret' },
          updatedAt: '2026-04-13T10:00:00.000Z',
        }),
      );
    });
  });

  describe('deletes', () => {
    it('allows the owner to hard delete a record (cloud wipe)', async () => {
      await assertSucceeds(
        deleteDoc(doc(clientFor(UID), 'users', UID, 'tasks', 'task-1')),
      );
    });

    it('allows the owner to hard delete a state document', async () => {
      await assertSucceeds(
        deleteDoc(doc(clientFor(UID), 'users', UID, 'state', 'app')),
      );
    });

    it('refuses a delete from another user', async () => {
      await assertFails(
        deleteDoc(doc(clientFor(UID), 'users', OTHER_UID, 'tasks', 'task-1')),
      );
    });

    it('refuses a delete from a signed-out client', async () => {
      await assertFails(
        deleteDoc(doc(anonymousClient(), 'users', UID, 'notes', 'note-1')),
      );
    });
  });

  describe('tombstone expiry', () => {
    it('allows a tombstone with a Firestore timestamp', async () => {
      await assertSucceeds(
        setDoc(
          doc(clientFor(UID), 'users', UID, 'tasks', 'task-2'),
          record({
            id: 'task-2',
            deleted: true,
            expireAt: Timestamp.fromDate(new Date('2026-07-12T10:00:00.000Z')),
          }),
        ),
      );
    });

    it('refuses a tombstone whose expiry is not a timestamp', async () => {
      await assertFails(
        setDoc(
          doc(clientFor(UID), 'users', UID, 'tasks', 'task-3'),
          record({
            id: 'task-3',
            deleted: true,
            expireAt: '2026-07-12T10:00:00.000Z',
          }),
        ),
      );
    });

    it('allows a live record that carries an expiry timestamp', async () => {
      // Only the TTL policy reads `expireAt`; a client that restores a record
      // without clearing it still writes a valid document.
      await assertSucceeds(
        setDoc(
          doc(clientFor(UID), 'users', UID, 'tasks', 'task-4'),
          record({
            id: 'task-4',
            deleted: false,
            expireAt: Timestamp.fromDate(new Date('2026-07-12T10:00:00.000Z')),
          }),
        ),
      );
    });
  });

  describe('collections', () => {
    it('allows reads of the record collections', async () => {
      await assertSucceeds(getDocs(collection(clientFor(UID), 'users', UID, 'blocks')));
      await assertSucceeds(getDocs(collection(clientFor(UID), 'users', UID, 'tasks')));
      await assertSucceeds(getDocs(collection(clientFor(UID), 'users', UID, 'notes')));
      await assertSucceeds(getDocs(collection(clientFor(UID), 'users', UID, 'deadlines')));
    });

    it('refuses reads of a collection outside the allowlist', async () => {
      await assertFails(getDocs(collection(clientFor(UID), 'users', UID, 'secrets')));
    });
  });
});
