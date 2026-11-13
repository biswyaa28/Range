import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_MESSAGES,
  CHAT_SCHEMA_VERSION,
  CHAT_STORAGE_KEY,
  normalizeChat,
} from '@/domain/chat';
import { FixedClock } from '@/domain/dates';
import { SequenceIdGen } from '@/domain/id';
import { ChatStore } from '@/store/chatStore';
import { MemoryStorage } from './memoryStorage';

function makeStore(storage = new MemoryStorage(), debounceMs = 0): ChatStore {
  return new ChatStore({
    storage,
    clock: new FixedClock(),
    idGen: new SequenceIdGen('chat'),
    debounceMs,
  });
}

describe('ChatStore', () => {
  it('persists a versioned transcript and reloads it', () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    const user = store.add('user', 'Plan my week');
    const assistant = store.add('assistant', '', 'streaming');
    store.append(assistant.id, 'Sure, ');
    store.append(assistant.id, 'let us start.');
    store.update(assistant.id, { status: 'complete' });
    store.flush();

    expect(user.id).toBe('chat-1');
    expect(assistant.id).toBe('chat-2');

    const raw = storage.getItem(CHAT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as {
      schemaVersion: number;
      data: unknown;
    };
    expect(envelope.schemaVersion).toBe(CHAT_SCHEMA_VERSION);
    expect(normalizeChat(envelope.data).messages).toHaveLength(2);

    const reloaded = makeStore(storage);
    expect(reloaded.get().messages.map((message) => message.content)).toEqual([
      'Plan my week',
      'Sure, let us start.',
    ]);
    expect(reloaded.get().messages[1]?.status).toBe('complete');
  });

  it('stops an interrupted stream on reload instead of showing a cursor', () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    const assistant = store.add('assistant', '', 'streaming');
    store.append(assistant.id, 'Half an answer');
    store.flush();

    const reloaded = makeStore(storage);
    expect(reloaded.get().messages[0]?.status).toBe('stopped');
    expect(reloaded.get().messages[0]?.content).toBe('Half an answer');
  });

  it('updates errors, clears history and caps the message count', () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    const failed = store.add('assistant', '', 'streaming');
    store.update(failed.id, {
      status: 'error',
      error: 'Limit reached. Try again in 30s.',
    });
    expect(store.get().messages[0]).toMatchObject({
      status: 'error',
      error: 'Limit reached. Try again in 30s.',
    });

    store.clear();
    store.flush();
    expect(store.get().messages).toEqual([]);

    for (let index = 0; index < CHAT_MAX_MESSAGES + 3; index++) {
      store.add('user', `message ${index}`);
    }
    expect(store.get().messages).toHaveLength(CHAT_MAX_MESSAGES);
    expect(store.get().messages[0]?.content).toBe('message 3');
  });

  it('recovers from corrupt stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem(CHAT_STORAGE_KEY, '{not json');
    expect(makeStore(storage).get().messages).toEqual([]);
  });

  it('notifies subscribers and unsubscribes cleanly', () => {
    const store = makeStore(new MemoryStorage());
    const seen: number[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.messages.length));

    store.add('user', 'one');
    store.add('user', 'two');
    unsubscribe();
    store.add('user', 'three');

    expect(seen).toEqual([1, 2]);
  });
});
