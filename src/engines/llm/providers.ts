import type { AIProvider } from '@/domain/settings';
import { GeminiProvider } from './gemini';
import { LLMError, type LLMProvider, type LLMRequest, type ProviderMeta } from './types';

class StubProvider implements LLMProvider {
  readonly available = false;
  readonly id: AIProvider;
  readonly label: string;
  readonly model: string;
  private readonly note: string;

  constructor(id: AIProvider, label: string, model: string, note: string) {
    this.id = id;
    this.label = label;
    this.model = model;
    this.note = note;
  }

  // eslint-disable-next-line require-yield
  async *streamReply(_request: LLMRequest, _apiKey: string): AsyncIterable<string> {
    throw new LLMError('unsupported', this.note);
  }
}

const gemini = new GeminiProvider();
const groq = new StubProvider(
  'groq',
  'Groq',
  'Llama 3.3',
  'Groq is not connected yet. Use Gemini Flash for now.',
);
const openrouter = new StubProvider(
  'openrouter',
  'OpenRouter',
  'Auto',
  'OpenRouter is not connected yet. Use Gemini Flash for now.',
);

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    model: '2.5 Flash',
    available: true,
    note: 'Google · streaming',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    model: 'Llama 3.3',
    available: false,
    note: 'Adapter stub — coming soon',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    model: 'Auto',
    available: false,
    note: 'Adapter stub — coming soon',
  },
};

export function providerFor(id: AIProvider): LLMProvider {
  switch (id) {
    case 'gemini':
      return gemini;
    case 'groq':
      return groq;
    case 'openrouter':
      return openrouter;
  }
}
