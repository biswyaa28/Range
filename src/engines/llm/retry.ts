import {
  LLMError,
  type LLMMessage,
  type LLMProvider,
  type LLMTool,
  type LLMToolCall,
  type LLMToolResponse,
} from './types';

export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface StreamChatOptions {
  signal?: AbortSignal;
  tools?: readonly LLMTool[];
  onDelta: (text: string) => void;
  onToolCall?: (call: LLMToolCall) => LLMToolResponse | void | number | Promise<LLMToolResponse | void | number>;
  /** Total attempts including the first. */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: Sleeper;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 900;
const MAX_DELAY_MS = 30_000;

function abortError(): LLMError {
  return new LLMError('aborted', 'Request cancelled.');
}

export const delay: Sleeper = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export function isAbort(error: unknown): boolean {
  if (error instanceof LLMError) return error.code === 'aborted';
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { name?: unknown }).name === 'AbortError',
  );
}

function retryable(error: unknown): boolean {
  if (!(error instanceof LLMError)) return true;
  return (
    error.code === 'rate-limit' ||
    error.code === 'network' ||
    error.code === 'server' ||
    error.code === 'unknown'
  );
}

function waitFor(error: unknown, attempt: number, baseDelayMs: number): number {
  const retryAfter =
    error instanceof LLMError && error.retryAfterMs !== null ? error.retryAfterMs : 0;
  const backoff = baseDelayMs * 2 ** attempt;
  return Math.min(MAX_DELAY_MS, Math.max(backoff, retryAfter));
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** Friendly, UI-ready copy for every provider failure. */
export function friendlyErrorMessage(error: unknown): string {
  if (!(error instanceof LLMError)) {
    return 'Something went wrong. Try again.';
  }

  switch (error.code) {
    case 'rate-limit':
      return error.retryAfterMs !== null
        ? `Limit reached. Try again in ${seconds(error.retryAfterMs)}s.`
        : 'Limit reached. Try again in a minute.';
    case 'auth':
      return "That API key wasn't accepted. Check it in Settings.";
    case 'network':
      return "Couldn't reach the AI service. Check your connection and try again.";
    case 'server':
      return 'The AI service is busy. Try again in a moment.';
    case 'unsupported':
      return error.message;
    case 'invalid':
      return error.message || 'That request was rejected. Try a shorter message.';
    case 'aborted':
      return '';
    case 'tool-limit':
      return 'I could not finish checking your data. Try a narrower question.';
    case 'unknown':
      return 'Something went wrong. Try again.';
  }
}

/**
 * Streams a reply, retrying rate limits, network failures and 5xx responses
 * with exponential backoff. A stream that already emitted text is never
 * retried, because that would duplicate the partial answer.
 */
export async function streamChat(
  provider: LLMProvider,
  apiKey: string,
  messages: LLMMessage[],
  options: StreamChatOptions,
): Promise<void> {
  const attempts = Math.max(1, options.maxAttempts ?? DEFAULT_ATTEMPTS);
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const sleep = options.sleep ?? delay;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (options.signal?.aborted) throw abortError();

    let emitted = false;
    let calledTool = false;
    try {
      for await (const chunk of provider.streamReply(
        {
          messages,
          signal: options.signal,
          ...(options.tools?.length ? { tools: options.tools } : {}),
          onToolCall: (call) => {
            calledTool = true;
            return options.onToolCall?.(call) ?? {
              name: call.name,
              response: { status: 'proposed', note: 'awaiting user approval' },
            };
          },
        },
        apiKey,
      )) {
        if (!chunk) continue;
        emitted = true;
        options.onDelta(chunk);
      }
      return;
    } catch (error) {
      if (isAbort(error) || options.signal?.aborted) throw abortError();
      // A function call already reached the host; replaying would duplicate it.
      const canRetry =
        !emitted && !calledTool && retryable(error) && attempt < attempts - 1;
      if (!canRetry) throw error;
      await sleep(waitFor(error, attempt, baseDelayMs), options.signal);
    }
  }
}
