# Services & Connectors

> **Status: Implemented** — CalDAV/CardDAV available in `@km/connector-caldav`.

External service integrations for km.

---

## Overview

Services (also called connectors) allow km to sync with external systems like calendars, contacts, and issue trackers.

---

## Connectors

| Connector | Protocol    | Features                | Status      |
| --------- | ----------- | ----------------------- | ----------- |
| Calendar  | CalDAV      | Events, reminders       | Implemented |
| Contacts  | CardDAV     | People, organizations   | Implemented |
| Tasks     | CalDAV TODO | External task sync      | Implemented |
| GitHub    | REST API    | Issues, PRs             | Planned     |
| Linear    | GraphQL     | Issues, projects        | Planned     |
| Slack     | REST API    | Messages, notifications | Planned     |

---

## CalDAV/CardDAV Integration

**Package:** `@km/connector-caldav`

### Usage

```bash
# Configure connection
km connector add caldav --url https://caldav.example.com --user me

# Sync calendars
km sync caldav

# List calendars
km caldav ls
```

### Features

- Sync events to/from km nodes
- Map calendar events to task nodes with dates
- Two-way sync with conflict resolution
- CardDAV contact sync as `@person` nodes

### Configuration

```yaml
# .km/config.yaml
connectors:
  caldav:
    url: https://caldav.example.com
    username: user
    password_env: CALDAV_PASSWORD
    calendars:
      - work
      - personal
```

---

## Design Principles

1. **Offline-first**: km works without network; sync when available
2. **Event-sourced**: All sync operations emit events
3. **Conflict resolution**: Last-writer-wins or manual resolution
4. **Opt-in**: Each connector must be explicitly configured

---

## See Also

- [../architecture/brain.md](../architecture/brain.md) — Brain layer: chats, memory graph, solidification (sync adapters are Phase 5)
- [../storage.md](../design/model/storage.md) — Events and sync model
- [agents.md](agents.md) — Agent connectors
