import type { StorageAdapter } from '@/platform/types';

/**
 * Sync bookkeeping that lives on the device but outside the app save:
 * which account is signed in, how far the last pull reached, and which
 * records the remote already confirmed.
 */
export const SYNC_ACCOUNT_KEY = 'personalOS_sync_account_v1';
export const SYNC_CURSOR_KEY = 'personalOS_sync_cursor_v1';
export const SYNC_PUSH_LEDGER_KEY = 'personalOS_sync_ledger_v1';
export const SYNC_PULL_CHECKPOINT_KEY = 'personalOS_sync_pull_checkpoint_v1';
export const SYNC_READS_KEY = 'personalOS_sync_reads_v1';

/** Where an interrupted paged pull stopped. */
export interface PullCheckpoint {
  schema: number;
  accountUid: string;
  collection: 'blocks' | 'tasks' | 'notes' | 'deadlines';
  updatedAt: string;
  id: string;
}

/** Firestore's free tier allows 50,000 document reads per day. */
export const DAILY_READ_BUDGET = 50_000;

export interface DailyReads {
  date: string;
  count: number;
}

export interface SyncCursor {
  /** Schema the cursor was written under; a change invalidates it. */
  schema: number;
  /** Account the cursor belongs to. */
  accountUid: string | null;
  /** Start of the last pull, so a write during a pull is not skipped. */
  lastPullAt: string | null;
  /** Start of the last full pull. */
  lastFullPullAt: string | null;
}

/** Record key to the `updatedAt` the remote confirmed. */
export type PushLedger = Record<string, string>;

export function pushLedgerKey(collection: string, id: string): string {
  return `${collection}/${id}`;
}

/**
 * Reads and writes the sync bookkeeping. Every value is best-effort: a
 * missing or corrupt entry only costs a full pull or a repeated push.
 */
export class SyncStateStore {
  constructor(private readonly storage: StorageAdapter | null) {}

  readAccountUid(): string | null {
    const value = this.read(SYNC_ACCOUNT_KEY);
    return value && value.trim() ? value.trim() : null;
  }

  writeAccountUid(uid: string): void {
    this.write(SYNC_ACCOUNT_KEY, uid);
  }

  readCursor(schema: number): SyncCursor | null {
    const raw = this.read(SYNC_CURSOR_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SyncCursor>;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        schema: typeof parsed.schema === 'number' ? parsed.schema : schema,
        accountUid: typeof parsed.accountUid === 'string' ? parsed.accountUid : null,
        lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
        lastFullPullAt:
          typeof parsed.lastFullPullAt === 'string' ? parsed.lastFullPullAt : null,
      };
    } catch {
      return null;
    }
  }

  writeCursor(cursor: SyncCursor): void {
    this.write(SYNC_CURSOR_KEY, JSON.stringify(cursor));
  }

  readCheckpoint(schema: number, accountUid: string): PullCheckpoint | null {
    const raw = this.read(SYNC_PULL_CHECKPOINT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<PullCheckpoint>;
      if (
        parsed.schema !== schema ||
        parsed.accountUid !== accountUid ||
        typeof parsed.collection !== 'string' ||
        typeof parsed.updatedAt !== 'string' ||
        typeof parsed.id !== 'string'
      ) {
        return null;
      }
      return parsed as PullCheckpoint;
    } catch {
      return null;
    }
  }

  writeCheckpoint(checkpoint: PullCheckpoint): void {
    this.write(SYNC_PULL_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  }

  clearCheckpoint(): void {
    this.remove(SYNC_PULL_CHECKPOINT_KEY);
  }

  readDailyReads(today: string): DailyReads {
    const raw = this.read(SYNC_READS_KEY);
    if (!raw) return { date: today, count: 0 };
    try {
      const parsed = JSON.parse(raw) as Partial<DailyReads>;
      if (parsed.date !== today || typeof parsed.count !== 'number') {
        return { date: today, count: 0 };
      }
      return { date: today, count: Math.max(0, Math.floor(parsed.count)) };
    } catch {
      return { date: today, count: 0 };
    }
  }

  addDailyReads(today: string, count: number): DailyReads {
    const current = this.readDailyReads(today);
    const next = { date: today, count: current.count + Math.max(0, Math.floor(count)) };
    this.write(SYNC_READS_KEY, JSON.stringify(next));
    return next;
  }

  readLedger(): PushLedger {
    const raw = this.read(SYNC_PUSH_LEDGER_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const ledger: PushLedger = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') ledger[key] = value;
      }
      return ledger;
    } catch {
      return {};
    }
  }

  writeLedger(ledger: PushLedger): void {
    this.write(SYNC_PUSH_LEDGER_KEY, JSON.stringify(ledger));
  }

  private read(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private remove(key: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch {
      // Best effort, like every other sync bookkeeping entry.
    }
  }

  private write(key: string, value: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, value);
    } catch {
      // Progress is an optimisation; a lost entry only costs a repeated push.
    }
  }
}
