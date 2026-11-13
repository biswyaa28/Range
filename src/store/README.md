# Store Layer

## Purpose
Manages state persistence, hydration, migrations, and notifications across the application.

## Rules
- The ONLY place allowed to touch persistence storage (via platform adapters).
- Features read via subscriptions (e.g. `useSyncExternalStore`) and never access storage directly.
- `settingsStore` owns typed, versioned preferences under `personalOS_settings_v1`; it adopts
  legacy settings/profile fields from `personalOS_v1` on first load.
- `applySettings` is the only bridge that projects preferences onto CSS variables.
- `aiKeyStore` owns the LLM key in platform secure storage; `Settings` never holds it.
- `chatStore` persists the local transcript under `personalOS_chat_v1`.

