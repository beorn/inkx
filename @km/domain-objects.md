---
id: "@km/domain-objects"
aliases:
  - km-domain-objects
  - "@km/_orphan/domain-objects"
created_at: 2026-01-23T10:21:31Z
closed_at: 2026-01-23T11:49:07Z
---

# [x] Refactor to domain objects with factory functions @km/domain-objects #epic #P2

# Domain Object Architecture

Refactor the km codebase from scattered functions + singletons + classes to **domain objects created by factory functions**.

## Principles
- Factory functions (not classes)
- Plain objects with methods (not class instances)
- No singletons (all state owned by domain objects)
- Disposable/AsyncDisposable for lifecycle management
- Dependency injection for testability

## Domain Objects
- `Vault` - storage, queries, mutations (Disposable)
- `Board` - navigation state (Disposable)
- `Watcher` - file sync (Service, AsyncDisposable)
- `Config` - vault configuration

## Service Interface
```typescript
interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping";
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

See plan: .claude/plans/stateful-splashing-parrot.md