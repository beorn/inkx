---
mentions:
  - km
id: "@km/disposable/2-add-symbol-dispose-to-fakevault-and-store-classes"
aliases:
  - km-disposable.2
  - km-disposable-2
  - "@km/disposable/2"
created_at: 2026-01-23T18:27:24Z
closed_at: 2026-01-23T20:07:15Z
---

# [x] Add Symbol.dispose to FakeVault and Store classes @km/disposable #task #P2

Add Disposable interface to FakeVault, MemoryStore, and DiskStore. All have close() methods but lack Symbol.dispose.

