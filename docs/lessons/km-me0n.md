# Lesson: The km-me0n Incident

## The Problem

`km sync --to-fs` corrupted source files by converting them to markdown stubs. This was a catastrophic failure - the tool meant to help manage files instead destroyed user data.

## What Happened

The sync operation wrote to real files instead of test fixtures. Tests that should have been using isolated temporary directories were accidentally touching real user data.

## The Lesson

Three principles emerged from this incident:

1. **Tests MUST use isolated directories** (`/tmp/kmtest-*`) - Never touch real user files in tests
2. **E2E safety tests** - Explicitly verify that sync operations never touch non-`.md` files
3. **Fast tests use in-memory infrastructure** - When tests run against real files, they're slow AND dangerous

The combination of fast tests and isolated infrastructure prevents this entire class of bugs. When your tests run in memory or isolated directories, they can't corrupt user data.

## Related Principles

- [Fast Tests by Default](../principles.md#principle-5-second-test-loops) - In-memory infrastructure, <5s feedback loop
- [Fail Fast](../principles.md#principle-fail-loud-fail-now) - Throw on programming errors immediately
- [testing.md](../dev/testing.md) - Testing strategy and test types
