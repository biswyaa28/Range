# Personal OS — Architecture

## Directory Structure

```text
Range/
├── docs/                      # Architectural specs and documentation
├── reference/                 # Original reference single-file implementation (frozen spec)
├── tests/
│   ├── unit/                  # Vitest + jsdom domain and UI tests
│   └── e2e/                   # Playwright end-to-end integration tests
└── src/
    ├── domain/                # Pure TypeScript domain entities, types, and defaults (No DOM/React)
    ├── store/                 # Single source of truth & persistence manager
    │   └── adapters/          # Storage engine implementations (local, backup, indexedDB)
    ├── platform/              # Device hardware abstractions (Haptics, FileSaver, Storage, Health)
    ├── engines/               # Headless logic (Audio synthesis, Pomodoro ticker, Spring solver)
    ├── sync/                  # LWW conflict resolution, tombstone sync, device cursors
    ├── integrations/          # README-only placeholder (no runtime code yet)
    ├── features/              # Modular screen views (lazy-loaded by the shell)
    │   ├── home/              # Bento dashboard, today timeline, quick capture
    │   ├── plan/              # Weekly calendar & schedule blocks
    │   ├── tasks/             # Prioritized to-do list with swipe actions
    │   ├── notes/             # Pinned notes & split-pane markdown editor
    │   ├── focus/             # Pomodoro timer & ambient noise generator
    │   ├── insights/          # Completion graphs, analytics, & streak tracking
    │   ├── settings/          # Profile, theme customization, & data management
    │   ├── onboarding/        # First-run guided setup flow
    │   └── palette/           # Global command palette & quick switcher
    ├── ui/                    # Reusable atomic presentation components
    ├── hooks/                 # React state bridges (useSyncExternalStore, route listener)
    └── styles/                # CSS design system (tokens, base reset, component styles)
        └── features/          # View-specific CSS modules
```

## Data Flow Diagram

```text
[ Browser / Platform Events (Hash, Pointer, Keyboard) ]
                       │
                       ▼
             [ React Shell + lazy React Views (src/features/*) ]
                       │
          Reads State via useSyncExternalStore
                       │
                       ▼
               [ Store (src/store) ] ── (Pure Types) ──► [ Domain (src/domain) ]
                 │             ▲
          Commits│             │ Emits Change
                 ▼             │
     [ Platform Adapters (web; native-ready hooks) ]
                 │
                 ▼
     [ LocalStorage / Remote Sync ]
```

## Core Principles
1. **Unidirectional Flow**: Features trigger actions -> Store updates state & stamps timestamps -> subscribers re-render via `useSyncExternalStore`.
2. **Platform Isolation**: Hardware features (vibration, downloads, storage) are wrapped by `PlatformAdapter` interfaces.
3. **Spec Alignment**: All features maintain backward compatibility with legacy storage schema version 2 (`personalOS_v1`).
4. **Accessibility and motion**: The Playwright Axe matrix covers every route in both themes
   and target viewports. Reduced motion is honored globally, and the built-CSS motion scan
   rejects layout-property transitions.
5. **Verification**: `npm run check` runs typecheck, lint, unit tests, production build,
   motion validation, and the full Playwright suite.

