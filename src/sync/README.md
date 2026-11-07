# Sync Engine

## Purpose
Handles remote synchronization protocols, conflict resolution (last-write-wins based on updatedAt), tombstones, and replication cursors.

## Rules
- Operates independently of specific cloud vendors.
- Interfaces with Store via explicit change sets (`pendingChanges`, `mergeRemote`).
