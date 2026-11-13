# AI Chat Feature

## Purpose
Streaming assistant panel: a bottom sheet on Android and narrow screens, a side panel on macOS and wide web.

## Rules
- The API key comes from `aiKeyStore` (secure storage); the panel never reads it from Settings.
- Replies stream through `LLMProvider`; Gemini Flash is live, Groq and OpenRouter are stubs.
- Retries, 429 handling and friendly error copy live in `engines/llm/retry.ts`, not in the view.
- Transcripts persist locally under `personalOS_chat_v1` and are never synced.
- Open state lives in `chatBus.ts` so the top nav and Android back button share one surface.
