import { EPOCH_TS } from './types';

/**
 * Local chat transcript. This module is pure: the store owns persistence and
 * the feature owns streaming; normalization here keeps stored payloads safe.
 */

export const CHAT_STORAGE_KEY = 'personalOS_chat_v1';
export const CHAT_SCHEMA_VERSION = 1;
export const CHAT_MAX_MESSAGES = 200;
export const CHAT_MAX_CONTENT = 20_000;

export type ChatRole = 'user' | 'assistant';

export type ChatMessageStatus = 'complete' | 'streaming' | 'error' | 'stopped';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status: ChatMessageStatus;
  /** Friendly failure text shown under an assistant bubble. */
  error: string | null;
}

export interface ChatState {
  messages: ChatMessage[];
}

export interface ChatEnvelope {
  schemaVersion: number;
  data: ChatState;
}

export function emptyChat(): ChatState {
  return { messages: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeStatus(value: unknown, content: string): ChatMessageStatus {
  if (value === 'error') return 'error';
  if (value === 'stopped') return 'stopped';
  // A reload cannot resume a stream; keep the partial text but stop the cursor.
  if (value === 'streaming') return content ? 'stopped' : 'error';
  return 'complete';
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const id = typeof value['id'] === 'string' ? value['id'].trim() : '';
  const role = value['role'] === 'assistant' ? 'assistant' : value['role'] === 'user' ? 'user' : null;
  if (!id || !role) return null;

  const content =
    typeof value['content'] === 'string'
      ? value['content'].slice(0, CHAT_MAX_CONTENT)
      : '';
  const createdAt =
    typeof value['createdAt'] === 'string' &&
    value['createdAt'].length > 0 &&
    !Number.isNaN(Date.parse(value['createdAt']))
      ? value['createdAt']
      : EPOCH_TS;
  const error =
    typeof value['error'] === 'string' && value['error'].trim()
      ? value['error'].slice(0, 500)
      : null;

  return {
    id,
    role,
    content,
    createdAt,
    status: normalizeStatus(value['status'], content),
    error,
  };
}

export function normalizeChat(value: unknown): ChatState {
  if (!isRecord(value)) return emptyChat();
  const source = isRecord(value['data']) ? value['data'] : value;
  const rawMessages = Array.isArray(source['messages']) ? source['messages'] : [];
  const seen = new Set<string>();
  const messages: ChatMessage[] = [];

  for (const entry of rawMessages) {
    const message = normalizeMessage(entry);
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    messages.push(message);
  }

  return { messages: messages.slice(-CHAT_MAX_MESSAGES) };
}

/** The conversation sent to a provider, excluding failed empty placeholders. */
export function providerMessages(
  messages: readonly ChatMessage[],
): Array<{ role: ChatRole; content: string }> {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
}
