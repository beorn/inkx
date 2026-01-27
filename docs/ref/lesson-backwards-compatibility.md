# Lesson: The Backwards Compatibility Trap

**Date**: January 25, 2025
**Commit**: `8014128`

## The Problem

During a migration to dependency injection, we introduced "singleton wrappers for backwards compatibility" to allow old code to continue working while the migration progressed.

The commit message read:

> This maintains backwards compatibility for existing code while migrating to the new dependency injection pattern.

## What Happened

With fallbacks available, old patterns persisted. The migration never completed. Multiple commits patched symptoms instead of removing the root cause. The old code became a crutch that prevented the migration from finishing.

## The Lesson

**Make fallbacks impossible by deleting the code first.** The old code cannot be used as a crutch if it doesn't exist.

When migrating from one pattern to another, delete the old pattern completely rather than maintaining backwards compatibility. Force all callers to update immediately. This creates short-term pain but prevents long-term technical debt.

## Related Principles

- [Delete First, Fix Second](../principles.md#delete-first-fix-second) - Remove old patterns before fixing, no backwards compatibility
- [Fail Fast](../principles.md#fail-fast) - Throw on programming errors immediately
