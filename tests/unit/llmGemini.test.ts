import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider, GEMINI_MODEL } from '@/engines/llm/gemini';
import type { LLMMessage, LLMTool, LLMToolCall } from '@/engines/llm/types';

const provider = new GeminiProvider();

function sse(payloads: unknown[]): string {
  return (
    payloads
      .map((payload) =>
        typeof payload === 'string' ? `data: ${payload}\n\n` : `data: ${JSON.stringify(payload)}\n\n`,
      ).join('')
  );
}

function streamResponse(text: string, cuts: number[] = []): Response {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let start = 0;
      for (const cut of cuts) {
        if (cut <= start || cut >= bytes.length) continue;
        controller.enqueue(bytes.slice(start, cut));
        start = cut;
      }
      controller.enqueue(bytes.slice(start));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of iterable) text += chunk;
  return text;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiProvider', () => {
  it('streams SSE text even when JSON payloads are split across chunks', async () => {
    const body = sse([
      { candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'world' }] } }] },
      '[DONE]',
    ]);
    const cuts = [9, body.indexOf('world') + 2, body.length - 6];
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(body, cuts));
    vi.stubGlobal('fetch', fetchMock);

    const messages: LLMMessage[] = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Tell me a joke' },
    ];
    await expect(collect(provider.streamReply({ messages }, 'AIza-test'))).resolves.toBe(
      'Hello world',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain(`${GEMINI_MODEL}:streamGenerateContent?alt=sse`);
    expect(call[1].method).toBe('POST');
    expect((call[1].headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    const requestBody = JSON.parse(String(call[1].body)) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
    };
    expect(requestBody.contents.map((entry) => entry.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(requestBody.systemInstruction?.parts[0]?.text).toBe('Be concise.');
  });

  it('maps a 429 response to a rate limit with Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
          status: 429,
          headers: { 'retry-after': '7' },
        }),
      ),
    );

    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, 'key')),
    ).rejects.toMatchObject({
      code: 'rate-limit',
      status: 429,
      retryAfterMs: 7000,
    });

  });

  it('maps auth failures and rejects a missing key before fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), {
        status: 400,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, 'bad')),
    ).rejects.toMatchObject({ code: 'auth', status: 400 });

    fetchMock.mockClear();
    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, '   ')),
    ).rejects.toMatchObject({ code: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends tool declarations and surfaces streamed function calls', async () => {
    const calls: LLMToolCall[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        streamResponse(
          sse([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'set_theme',
                        args: { theme: 'dark' },
                      },
                    },
                  ],
                },
              },
            ],
          },
          ]),
        ),
      )
      .mockResolvedValueOnce(streamResponse(sse([{ candidates: [{ content: { parts: [{ text: 'Done' }] } }] }])));
    vi.stubGlobal('fetch', fetchMock);

    const tools: LLMTool[] = [
      {
        name: 'set_theme',
        description: 'Switch theme.',
        parameters: {
          type: 'object',
          properties: {
            theme: { type: 'string', enum: ['light', 'dark', 'system'] },
          },
          required: ['theme'],
        },
      },
    ];

    await collect(
      provider.streamReply(
        {
          messages: [{ role: 'user', content: 'Make it dark' }],
          tools,
          onToolCall: (call) => calls.push(call),
        },
        'key',
      ),
    );

    expect(calls).toEqual([{ name: 'set_theme', args: { theme: 'dark' } }]);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(String(call[1].body)) as {
      tools?: Array<{
        functionDeclarations: Array<{
          name: string;
          parameters: { type: string; properties: Record<string, { type: string; enum?: string[] }> };
        }>;
      }>;
    };
    expect(requestBody.tools?.[0]?.functionDeclarations[0]?.name).toBe('set_theme');
    expect(requestBody.tools?.[0]?.functionDeclarations[0]?.parameters.type).toBe('OBJECT');
    expect(
      requestBody.tools?.[0]?.functionDeclarations[0]?.parameters.properties['theme']?.type,
    ).toBe('STRING');
  });

  it('reports network failures, empty streams and blocked prompts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, 'key')),
    ).rejects.toMatchObject({ code: 'network' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse(sse(['[DONE]']))),
    );
    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, 'key')),
    ).rejects.toMatchObject({ code: 'unknown' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        streamResponse(sse([{ promptFeedback: { blockReason: 'SAFETY' } }])),
      ),
    );
    await expect(
      collect(provider.streamReply({ messages: [{ role: 'user', content: 'Hi' }] }, 'key')),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: expect.stringContaining('SAFETY') as unknown as string,
    });
  });

  it('continues with bounded function responses and preserves model turns', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(streamResponse(sse([{
          candidates: [{ content: { parts: [{ functionCall: { name: 'get_tasks', args: { filter: 'week' } } }] } }],
        }])))
        .mockResolvedValueOnce(streamResponse(sse([{
          candidates: [{ content: { parts: [{ text: 'You have one task: revise maths.' }] } }],
        }])));
      vi.stubGlobal('fetch', fetchMock);

      await expect(collect(provider.streamReply({
        messages: [{ role: 'user', content: 'What tasks are due?' }],
        tools: [{
          name: 'get_tasks',
          description: 'Get tasks',
          parameters: { type: 'object', properties: {} },
        }],
        onToolCall: async (call) => ({
          name: call.name,
          response: { status: 'ok', data: '<untrusted-local-data>revise maths</untrusted-local-data>' },
        }),
      }, 'key'))).resolves.toContain('revise maths');

      const secondBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)) as {
        contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      };
      expect(secondBody.contents.at(-2)?.role).toBe('model');
      expect(secondBody.contents.at(-2)?.parts[0]).toHaveProperty('functionCall');
      expect(secondBody.contents.at(-1)?.parts[0]).toEqual({
        functionResponse: {
          name: 'get_tasks',
          response: { status: 'ok', data: '<untrusted-local-data>revise maths</untrusted-local-data>' },
        },
      });
    });

  it('stops after five tool rounds', async () => {
      const callPayload = sse([{
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_tasks', args: {} } }] } }],
      }]);
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(streamResponse(callPayload)));
      vi.stubGlobal('fetch', fetchMock);

      await expect(collect(provider.streamReply({
        messages: [{ role: 'user', content: 'Check my tasks' }],
        onToolCall: () => ({ name: 'get_tasks', response: { status: 'ok', data: 'none' } }),
      }, 'key'))).rejects.toMatchObject({ code: 'tool-limit' });
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('returns a proposed response for write tools without applying them', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(streamResponse(sse([{
          candidates: [{ content: { parts: [{ functionCall: { name: 'set_theme', args: { theme: 'dark' } } }] } }],
        }])))
        .mockResolvedValueOnce(streamResponse(sse([{
          candidates: [{ content: { parts: [{ text: 'I proposed dark mode for your approval.' }] } }],
        }])));
      vi.stubGlobal('fetch', fetchMock);

      await expect(collect(provider.streamReply({
        messages: [{ role: 'user', content: 'Make it dark' }],
        tools: [{
          name: 'set_theme',
          description: 'Change the theme',
          parameters: { type: 'object', properties: {} },
        }],
        onToolCall: (call) => ({
          name: call.name,
          response: { status: 'proposed', note: 'awaiting user approval' },
        }),
      }, 'key'))).resolves.toContain('proposed dark mode');

      const secondBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)) as {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
      };
      expect(secondBody.contents.at(-1)?.parts[0]).toEqual({
        functionResponse: {
          name: 'set_theme',
          response: { status: 'proposed', note: 'awaiting user approval' },
        },
      });
    });
});
