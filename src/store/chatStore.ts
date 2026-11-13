import type { Clock } from '@/domain/dates';
import { defaultClock } from '@/domain/dates';
import {
  CHAT_MAX_CONTENT,
  CHAT_MAX_MESSAGES,
  CHAT_SCHEMA_VERSION,
  CHAT_STORAGE_KEY,
  emptyChat,
  normalizeChat,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatRole,
  type ChatState,
} from '@/domain/chat';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';
import type { StorageAdapter } from '@/platform/types';
import { storage as defaultStorage } from '@/platform';

export type ChatSubscriber = (state: ChatState) => void;

export interface ChatStoreOptions {
  storage?: StorageAdapter;
  clock?: Clock;
  idGen?: IdGen;
  key?: string;
  debounceMs?: number;
}

/**
 * Local-only transcript store. The key is `personalOS_chat_v1`; writes are
 * debounced because streaming appends arrive token by token.
 */
export class ChatStore {
  private data: ChatState;
  private subscribers: ChatSubscriber[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storage: StorageAdapter;
  private readonly clock: Clock;
  private readonly idGen: IdGen;
  private readonly key: string;
  private readonly debounceMs: number;

  constructor(options: ChatStoreOptions = {}) {
    this.storage = options.storage ?? defaultStorage;
    this.clock = options.clock ?? defaultClock;
    this.idGen = options.idGen ?? defaultIdGen;
    this.key = options.key ?? CHAT_STORAGE_KEY;
    this.debounceMs = options.debounceMs ?? 250;
    this.data = this.load();
  }

  private load(): ChatState {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return emptyChat();
      return normalizeChat(JSON.parse(raw));
    } catch {
      return emptyChat();
    }
  }

  private writeNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({ schemaVersion: CHAT_SCHEMA_VERSION, data: this.data }),
      );
    } catch {
      // Keep the in-memory transcript if storage is full or blocked.
    }
  }

  private scheduleFlush(): void {
    if (this.debounceMs <= 0) {
      this.writeNow();
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.writeNow();
    }, this.debounceMs);
  }

  private notify(): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.data);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private commit(): void {
    this.notify();
    this.scheduleFlush();
  }

  get(): ChatState {
    return this.data;
  }

  subscribe(fn: ChatSubscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((subscriber) => subscriber !== fn);
    };
  }

  add(
    role: ChatRole,
    content: string,
    status: ChatMessageStatus = 'complete',
    error: string | null = null,
  ): ChatMessage {
    const message: ChatMessage = {
      id: this.idGen.uuid(),
      role,
      content: content.slice(0, CHAT_MAX_CONTENT),
      createdAt: this.clock.nowISO(),
      status,
      error,
    };
    this.data = {
      messages: [...this.data.messages, message].slice(-CHAT_MAX_MESSAGES),
    };
    this.commit();
    return message;
  }

  append(id: string, delta: string): void {
    if (!delta) return;
    let changed = false;
    const messages = this.data.messages.map((message) => {
      if (message.id !== id) return message;
      changed = true;
      return {
        ...message,
        content: (message.content + delta).slice(0, CHAT_MAX_CONTENT),
      };
    });
    if (!changed) return;
    this.data = { messages };
    this.commit();
  }

  update(
    id: string,
    patch: Partial<Pick<ChatMessage, 'content' | 'status' | 'error'>>,
  ): void {
    let changed = false;
    const messages = this.data.messages.map((message) => {
      if (message.id !== id) return message;
      changed = true;
      return { ...message, ...patch };
    });
    if (!changed) return;
    this.data = { messages };
    this.commit();
  }

  clear(): void {
    this.data = emptyChat();
    this.commit();
  }

  flush(): void {
    this.writeNow();
  }
}

export const chatStore = new ChatStore();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      chatStore.flush();
    } catch {
      // ignore
    }
  });
}
