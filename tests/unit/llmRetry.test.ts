import { describe, expect, it, vi } from 'vitest';
import {
  friendlyErrorMessage,
  isAbort,
  streamChat,
} from '@/engines/llm/retry';
import { LLMError, type LLMProvider, type LLMRequest } from '@/engines/llm/types';

function providerWith(
  run: (attempt: number) => AsyncGenerator<string>,
): LLMProvider & { attempts: number } {
  const provider: LLMProvider & { attempts: number } = {
    id: 'gemini',
    label: 'Test',
    model: 'test',
    available: true,
    attempts: 0,
    async *streamReply(_request: LLMRequest): AsyncIterable<string> {
      provider.attempts++;
      yield* run(provider.attempts);
    },
  };
  return provider;
}

const rateLimit = (retryAfterMs: number | null = null): LLMError =>
  new LLMError('rate-limit', 'Rate limited', { status: 429, retryAfterMs });

describe('streamChat retries', () => {
  it('retries a rate limit with exponential backoff, then succeeds', async () => {
    const provider = providerWith(async function* (attempt) {
      if (attempt === 1) throw rateLimit();
      yield 'ok';
    });
    const chunks: string[] = [];
    const sleeps: number[] = [];

    await streamChat(provider, 'key', [], {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onDelta: (delta) => chunks.push(delta),
    });

    expect(provider.attempts).toBe(2);
    expect(chunks).toEqual(['ok']);
    expect(sleeps).toEqual([100]);
  });

  it('honors Retry-After when it is longer than the backoff', async () => {
    const provider = providerWith(async function* (attempt) {
      if (attempt === 1) throw rateLimit(5000);
      yield 'done';
    });
    const sleeps: number[] = [];

    await streamChat(provider, 'key', [], {
      maxAttempts: 2,
      baseDelayMs: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onDelta: () => undefined,
    });

    expect(sleeps).toEqual([5000]);
  });

  it('never retries after a tool call reached the host', async () => {
    let attempts = 0;
    const provider: LLMProvider = {
      id: 'gemini',
      label: 'Test',
      model: 'test',
      available: true,
      // eslint-disable-next-line require-yield
      async *streamReply(request: LLMRequest): AsyncIterable<string> {
        attempts++;
        request.onToolCall?.({ name: 'set_theme', args: { theme: 'dark' } });
        throw rateLimit();
      },
    };
    const onToolCall = vi.fn();
    const sleep = vi.fn();

    await expect(
      streamChat(provider, 'key', [], {
        maxAttempts: 3,
        sleep,
        onToolCall,
        onDelta: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'rate-limit' });

    expect(attempts).toBe(1);
    expect(onToolCall).toHaveBeenCalledWith({ name: 'set_theme', args: { theme: 'dark' } });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never retries after partial text, so the answer is not duplicated', async () => {
    const provider = providerWith(async function* () {
      yield 'partial';
      throw rateLimit();
    });
    const sleep = vi.fn();
    const onDelta = vi.fn();

    await expect(
      streamChat(provider, 'key', [], {
        maxAttempts: 3,
        sleep,
        onDelta,
      }),
    ).rejects.toMatchObject({ code: 'rate-limit' });

    expect(provider.attempts).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onDelta).toHaveBeenCalledWith('partial');
  });

  it('gives up after the configured attempts and surfaces the last error', async () => {
    // eslint-disable-next-line require-yield
    const provider = providerWith(async function* () {
      throw new LLMError('server', 'down', { status: 503 });
    });
    const sleeps: number[] = [];

    await expect(
      streamChat(provider, 'key', [], {
        maxAttempts: 2,
        baseDelayMs: 50,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onDelta: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'server' });

    expect(provider.attempts).toBe(2);
    expect(sleeps).toEqual([50]);
  });

  it('stops before the first request when already aborted', async () => {
    const provider = providerWith(async function* () {
      yield 'never';
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      streamChat(provider, 'key', [], {
        signal: controller.signal,
        onDelta: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(provider.attempts).toBe(0);
  });
});

describe('friendlyErrorMessage', () => {
  it('turns rate limits into a friendly limit message', () => {
    expect(friendlyErrorMessage(rateLimit(12_000))).toBe(
      'Limit reached. Try again in 12s.',
    );
    expect(friendlyErrorMessage(rateLimit())).toBe(
      'Limit reached. Try again in a minute.',
    );
  });

  it('explains auth, network and server problems without raw provider text', () => {
    expect(friendlyErrorMessage(new LLMError('auth', 'API key invalid'))).toContain(
      'API key',
    );
    expect(friendlyErrorMessage(new LLMError('network', 'fetch failed'))).toContain(
      'connection',
    );
    expect(friendlyErrorMessage(new LLMError('server', '500'))).toContain('busy');
    expect(
      friendlyErrorMessage(new LLMError('invalid', 'Try a shorter message.')),
    ).toBe('Try a shorter message.');
    expect(friendlyErrorMessage(new LLMError('aborted', 'cancelled'))).toBe('');
    expect(friendlyErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });

  it('recognizes abort errors', () => {
    expect(isAbort(new LLMError('aborted', 'cancelled'))).toBe(true);
    expect(isAbort(new DOMException('cancelled', 'AbortError'))).toBe(true);
    expect(isAbort(new Error('boom'))).toBe(false);
  });
});
