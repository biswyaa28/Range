import type { AIProvider } from '@/domain/settings';

export type LLMRole = 'user' | 'assistant' | 'system';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export type LLMToolType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export interface LLMToolProperty {
  type: LLMToolType;
  description?: string;
  enum?: readonly string[];
  items?: LLMToolProperty;
  properties?: Record<string, LLMToolProperty>;
  required?: readonly string[];
  nullable?: boolean;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: LLMToolProperty & { type: 'object' };
}

/** A provider-neutral function call; args stay unknown until validated. */
export interface LLMToolCall {
  id?: string;
  name: string;
  args: unknown;
}

export interface LLMToolResponse {
  name: string;
  response: Record<string, unknown>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  tools?: readonly LLMTool[];
  signal?: AbortSignal;
  /**
   * Transport callback. Providers invoke it as soon as a function call is
   * parsed; the host validates and previews it after the stream settles.
   */
  onToolCall?: (call: LLMToolCall) => LLMToolResponse | void | number | Promise<LLMToolResponse | void | number>;
}

export type LLMErrorCode =
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'server'
  | 'unsupported'
  | 'invalid'
  | 'aborted'
  | 'tool-limit'
  | 'unknown';

export interface LLMErrorOptions {
  status?: number;
  retryAfterMs?: number | null;
}

export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(code: LLMErrorCode, message: string, options: LLMErrorOptions = {}) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    // Preserve instanceof across the transpiled class boundary.
    Object.setPrototypeOf(this, LLMError.prototype);
  }
}

/**
 * Vendor boundary for chat completions. Implementations own transport only;
 * retries, cancellation and presentation live in `streamChat`.
 */
export interface LLMProvider {
  readonly id: AIProvider;
  readonly label: string;
  readonly model: string;
  readonly available: boolean;
  streamReply(request: LLMRequest, apiKey: string): AsyncIterable<string>;
}

export interface ProviderMeta {
  id: AIProvider;
  label: string;
  model: string;
  available: boolean;
  note: string;
}
