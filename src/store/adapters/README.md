# Store Adapters

## Purpose
Storage backend implementations and serialization bridges for the Store.

## Rules
- Encapsulate physical storage I/O behind uniform interfaces.
- Handle fallback strategies, quota errors, and corrupted payloads safely.
