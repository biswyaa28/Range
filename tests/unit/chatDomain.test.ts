import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_MESSAGES,
  emptyChat,
  normalizeChat,
  providerMessages,
} from '@/domain/chat';
import { EPOCH_TS } from '@/domain/types';

describe('chat domain', () => {
  it('normalizes stored messages and drops malformed or duplicate entries', () => {
    const state = normalizeChat({
      schemaVersion: 1,
      data: {
        messages: [
          {
            id: 'a',
            role: 'user',
            content: ' Plan my week ',
            createdAt: '2026-04-13T10:00:00.000Z',
            status: 'complete',
          },
          {
            id: 'a',
            role: 'assistant',
            content: 'duplicate id',
            createdAt: '2026-04-13T10:00:00.000Z',
            status: 'complete',
          },
          {
            id: 'b',
            role: 'assistant',
            content: 'partial answer',
            createdAt: 'not-a-date',
            status: 'streaming',
          },
          {
            id: 'c',
            role: 'assistant',
            content: '',
            createdAt: '2026-04-13T10:00:00.000Z',
            status: 'streaming',
          },
          { id: 'd', role: 'tool', content: 'ignored', createdAt: EPOCH_TS },
          { id: '', role: 'user', content: 'no id' },
          null,
        ],
      },
    });

    expect(state.messages.map((message) => message.id)).toEqual(['a', 'b', 'c']);
    expect(state.messages[0]?.content).toBe(' Plan my week ');
    // A reload cannot resume a stream: partial text stops, empty text fails.
    expect(state.messages[1]?.status).toBe('stopped');
    expect(state.messages[1]?.createdAt).toBe(EPOCH_TS);
    expect(state.messages[2]?.status).toBe('error');
  });

  it('accepts a bare state payload and caps the transcript length', () => {
    const messages = Array.from({ length: CHAT_MAX_MESSAGES + 5 }, (_, index) => ({
      id: `m-${index}`,
      role: 'user',
      content: `message ${index}`,
      createdAt: '2026-04-13T10:00:00.000Z',
      status: 'complete',
    }));

    const state = normalizeChat({ messages });
    expect(state.messages).toHaveLength(CHAT_MAX_MESSAGES);
    expect(state.messages[0]?.id).toBe('m-5');
    expect(normalizeChat(null)).toEqual(emptyChat());
    expect(normalizeChat('nope')).toEqual(emptyChat());
  });

  it('only sends non-empty turns to a provider', () => {
    const state = normalizeChat({
      messages: [
        { id: 'u', role: 'user', content: 'Hello', status: 'complete' },
        { id: 'a1', role: 'assistant', content: '   ', status: 'error' },
        { id: 'a2', role: 'assistant', content: 'Hi there', status: 'stopped' },
      ],
    });

    expect(providerMessages(state.messages)).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);
  });
});
