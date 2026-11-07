# Platform Layer

## Purpose
Hardware and environment abstraction layer providing uniform interfaces for web, mobile, and desktop environments.

## Rules
- All platform implementations must sit behind strict interfaces (Haptics, FileSaver, StorageAdapter, HealthProvider).
- Application code never calls browser globals or native APIs directly; it consumes platform adapters.
