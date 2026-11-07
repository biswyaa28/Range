# Store Layer

## Purpose
Manages state persistence, hydration, migrations, and notifications across the application.

## Rules
- The ONLY place allowed to touch persistence storage (via platform adapters).
- Features read via subscriptions (e.g. `useSyncExternalStore`) and never access storage directly.
