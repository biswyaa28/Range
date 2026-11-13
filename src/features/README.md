# Feature Views

## Purpose
Top-level user-facing views and screens for each application section.

## Folders
- `chat/` — streaming AI assistant panel and its open/close bus.
- `deadlines/` — deadline list, approvals and dismissals under Plan.
- `shortcuts/` — keyboard shortcut reference sheet.
- `settings/` — profile, theme, sync, AI key and data management.
- `shell/` — top nav, breadcrumbs and storage-warning surface.

## Rules
- Feature folders represent distinct views/screens.
- Render UI via React components; read state from Store/hooks and trigger actions.
- No direct storage manipulation or raw device calls.
