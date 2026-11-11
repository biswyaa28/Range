import {
  LLMError,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMTool,
  type LLMToolCall,
  type LLMToolResponse,
  type LLMToolProperty,
} from './types';

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_LABEL = 'Gemini 2.5 Flash';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: unknown;
  functionCall?: unknown;
}

interface GeminiCandidate {
  content?: { parts?: unknown };
  finishReason?: unknown;
  safetyRatings?: unknown;
}

interface GeminiPayload {
  candidates?: unknown;
  promptFeedback?: unknown;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function errorMessage(value: unknown): string {
  if (!isRecord(value)) return '';
  const error = isRecord(value['error']) ? value['error'] : value;
  return typeof error['message'] === 'string' ? error['message'] : '';
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

function classify(message: string, status: number, retryAfter: number | null): LLMError {
  const lower = message.toLowerCase();
  if (status === 429) {
    return new LLMError('rate-limit', message || 'Rate limited', {
      status,
      retryAfterMs: retryAfter,
    });
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('permission')
  ) {
    return new LLMError('auth', message || 'Authentication failed', { status });
  }
  if (status >= 500) {
    return new LLMError('server', message || 'AI service unavailable', { status });
  }
  if (status === 400) {
    return new LLMError('invalid', message || 'The request was rejected', { status });
  }
  return new LLMError('unknown', message || `AI request failed (${status})`, { status });
}

async function toError(response: Response): Promise<LLMError> {
  let message = `AI request failed (${response.status})`;
  try {
    const payload: unknown = await response.json();
    const parsed = errorMessage(payload);
    if (parsed) message = parsed;
  } catch {
    // keep the HTTP fallback
  }

  return classify(message, response.status, retryAfterMs(response.headers.get('retry-after')));
}

async function fetchWithBackoff(
  input: RequestInfo | URL,
  init: RequestInit,
  signal?: AbortSignal,
  retry = true,
): Promise<Response> {
  const maxAttempts = retry ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      if (attempt === maxAttempts - 1) return response;
      const retryAfter = retryAfterMs(response.headers.get('retry-after'));
      const delay = Math.min(4000, Math.max(retryAfter ?? 0, 250 * 2 ** attempt));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new LLMError('aborted', 'Request cancelled.'));
        }, { once: true });
      });
    } catch (error) {
      if (signal?.aborted) throw new LLMError('aborted', 'Request cancelled.');
      if (attempt === maxAttempts - 1) throw new LLMError('network', error instanceof Error ? error.message : 'Network request failed');
      await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 250 * 2 ** attempt)));
    }
  }
  throw new LLMError('network', 'Network request failed');
}

interface StreamEvent {
  text: string;
  calls: LLMToolCall[];
  parts: unknown[];
}

function partsEvent(parts: unknown): StreamEvent {
  const event: StreamEvent = { text: '', calls: [], parts: [] };
  if (!Array.isArray(parts)) return event;

  for (const part of parts) {
    if (!isRecord(part)) continue;
    event.parts.push(part);
    const text = (part as GeminiPart).text;
    if (typeof text === 'string') event.text += text;

    const functionCall = (part as GeminiPart).functionCall;
    if (!isRecord(functionCall)) continue;
    const name = functionCall['name'];
    if (typeof name !== 'string' || !name.trim()) continue;
    const id = functionCall['id'];
    event.calls.push({
      ...(typeof id === 'string' && id.trim() ? { id: id.trim() } : {}),
      name: name.trim(),
      args: functionCall['args'] ?? {},
    });
  }

  return event;
}

function payloadEvent(value: unknown): StreamEvent {
  const event: StreamEvent = { text: '', calls: [], parts: [] };
  if (!isRecord(value)) return event;
  const payload = value as GeminiPayload;
  if (!Array.isArray(payload.candidates)) return event;

  for (const candidate of payload.candidates) {
    if (!isRecord(candidate)) continue;
    const content = (candidate as GeminiCandidate).content;
    if (!isRecord(content)) continue;
    const part = partsEvent(content['parts']);
    event.text += part.text;
    event.calls.push(...part.calls);
    event.parts.push(...part.parts);
  }
  return event;
}

function modelSchema(schema: LLMToolProperty): Record<string, unknown> {
  const output: Record<string, unknown> = { type: schema.type.toUpperCase() };
  if (schema.description) output['description'] = schema.description;
  if (schema.enum) output['enum'] = [...schema.enum];
  if (schema.items) output['items'] = modelSchema(schema.items);
  if (schema.properties) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = modelSchema(value);
    }
    output['properties'] = properties;
  }
  if (schema.required?.length) output['required'] = [...schema.required];
  if (schema.nullable) output['nullable'] = true;
  return output;
}

function declaration(tool: LLMTool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: modelSchema(tool.parameters),
  };
}

function blockedReason(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const feedback = value['promptFeedback'];
  if (!isRecord(feedback)) return null;
  const reason = feedback['blockReason'];
  return typeof reason === 'string' ? reason : null;
}

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<Record<string, unknown>>;
};

function toContents(messages: LLMMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === 'system' || !message.content.trim()) continue;
    const role = message.role === 'assistant' ? 'model' : 'user';
    const previous = contents[contents.length - 1];
    if (previous && previous.role === role) {
      previous.parts.push({ text: message.content });
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }

  }
  return contents;
}

const MAX_TOOL_ROUNDS = 5;

function functionResponsePart(response: LLMToolResponse): Record<string, unknown> {
  return {
    functionResponse: {
      name: response.name,
      response: response.response,
    },
  };
}

/**
 * Gemini Flash via the REST streaming endpoint. The API key travels in a
 * header (not the URL) and never enters the transcript.
 */
export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;
  readonly label = GEMINI_LABEL;
  readonly model = GEMINI_MODEL;
  readonly available = true;

  async *streamReply(request: LLMRequest, apiKey: string): AsyncIterable<string> {
    if (!apiKey.trim()) {
      throw new LLMError('auth', 'A Gemini API key is required.');
    }

    const system = request.messages
      .filter((message) => message.role === 'system' && message.content.trim())
      .map((message) => message.content)
      .join('\n\n');
    const contents = toContents(request.messages);
    const handleLine = (line: string): StreamEvent => {
      const empty: StreamEvent = { text: '', calls: [], parts: [] };
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return empty;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return empty;

      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        return empty;
      }

      if (isRecord(payload) && payload['error']) {
        throw classify(errorMessage(payload), 500, null);
      }
      const blocked = blockedReason(payload);
      if (blocked) {
        throw new LLMError(
          'invalid',
          `Gemini blocked this prompt (${blocked}). Try rephrasing it.`,
        );
      }
      return payloadEvent(payload);
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      if (request.signal?.aborted) throw new LLMError('aborted', 'Request cancelled.');
      const body: Record<string, unknown> = {
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      };
      if (system) body['systemInstruction'] = { parts: [{ text: system }] };
      if (request.tools?.length) {
        body['tools'] = [{ functionDeclarations: request.tools.map(declaration) }];
        body['toolConfig'] = { functionCallingConfig: { mode: 'AUTO' } };
      }

      const response = await fetchWithBackoff(
        `${ENDPOINT}/${this.model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: request.signal,
        },
        request.signal,
        round > 0,
      );
      if (!response.ok) throw await toError(response);
      if (!response.body) throw new LLMError('server', 'Gemini returned an empty stream.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const event: StreamEvent = { text: '', calls: [], parts: [] };
      let sawEvent = false;
      const consume = (line: string): void => {
        const next = handleLine(line);
        if (next.text || next.calls.length) sawEvent = true;
        event.text += next.text;
        event.calls.push(...next.calls);
        event.parts.push(...next.parts);
      };
      try {
        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            continue;
          }
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            consume(buffer.slice(0, newline).replace(/\r$/, ''));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
      } finally {
        reader.releaseLock();
      }
      if (!sawEvent) throw new LLMError('unknown', 'Gemini returned no reply. Try again.');
      if (event.text) yield event.text;
      if (!event.calls.length) return;

      contents.push({ role: 'model', parts: event.parts as Array<Record<string, unknown>> });
      if (round === MAX_TOOL_ROUNDS) {
        throw new LLMError('tool-limit', 'Too many tool rounds.');
      }
      for (const call of event.calls) {
        const response = request.onToolCall
          ? await request.onToolCall(call)
          : undefined;
        if (response === undefined || typeof response === 'number') return;
        const normalizedResponse = response && typeof response === 'object' && 'name' in response && 'response' in response
          ? response as LLMToolResponse
          : {
          name: call.name,
          response: { status: 'proposed', note: 'awaiting user approval' },
        };
        contents.push({
          role: 'user',
          parts: [functionResponsePart(normalizedResponse)],
        });
      }
    }
  }
}
