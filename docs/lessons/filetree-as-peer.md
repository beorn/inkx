# Lesson: FileTree as Peer DataStore

## The Problem

The original km design treated FileTree and DataStore as peers implementing the same `Store` interface. The idea was elegant: two equivalent stores that could sync bidirectionally.

## What Happened

Three problems emerged:

1. **Performance asymmetry**: FileTree operations are O(n) (scan files), DataStore operations are O(1) (indexed lookups). This broke the contract that peers should have equivalent performance characteristics.

2. **Semantic mismatch**: Files don't naturally have stable node IDs. The FileTree had to manufacture IDs from paths, making the abstraction leaky.

3. **Sync became too generic**: The sync logic tried to be generic for "any two stores," when the reality is that syncing files to database is a specific translation with known semantics.

## The Lesson

**When A and B sync, ask: are they peers or is one a representation?**

FileTree is a **representation** of DataStore, not a peer. Files are the source of truth for content, but the database is the source of truth for structure and relationships.

Once we recognized this, the design simplified:

- FileTree translates markdown -> nodes
- DataStore is the canonical structure
- Sync is unidirectional with clear semantics

## Related Principles

- [Layered Architecture](../principles.md#principle-organize-objects-into-layers) - Each layer calls only the layer below
- [architecture.md](../architecture.md) - System layers and data flow
- [storage.md](../design/model/storage.md) - SQLite schema and sync details
