# AGENTS.md

## Stack & Architecture
- Vite, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), npm, Node 20+.
- No Tailwind, no UI component libraries, no third-party state or router libraries.
- Routing via hash routes (`#home`, `#plan`, `#tasks`, `#notes`, `#focus`, `#insights`, `#settings`).
- State via `useSyncExternalStore` over the Store module.
- Path alias: `@/` -> `src/`.

## Folder Rules
- `src/domain/`: Pure TypeScript business models only. Zero DOM, Web APIs, or React dependencies.
- `src/store/`: The only layer permitted to interact with persistence storage (via adapters).
- `src/features/`: React views, screens, and section presentation logic.
- `src/ui/`: Reusable, domain-agnostic UI presentation components (Button, Modal, Card, etc.).
- `src/platform/`: Hardware and environment adapters behind strict interfaces.
- `src/engines/`: Headless algorithms, audio synthesis, timer logic, spring solvers.
- `src/sync/`: Remote synchronization protocol, LWW conflict resolution, tombstone handling.

## Non-Negotiable Engineering Guidelines
- **Reference Integrity**: NEVER modify `reference/legacy-index.html`. It is the definitive spec.
- **Strict TypeScript**: Never use `any`. Always provide exact domain types.
- **Security**: Never use `dangerouslySetInnerHTML`. Sanitize all user-provided strings.
- **Smooth Animations**: Animate ONLY `transform` and `opacity`. Keep CPU/GPU load minimal.
- **Accessibility**: Always respect `@media (prefers-reduced-motion: reduce)`.
- **UI Copy**: Sentence case for all UI labels, button text, and headings.
- **Persistence**: Retain storage key `"personalOS_v1"`, backup `"personalOS_v1_backup"`, and schema version `2`.
- **Incremental Migration**: Port one feature at a time, backed by tests.

## Verification Commands (Run Before Finishing)
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

## Reporting Standard
Keep agent completion reports concise and capped at 8 lines.
