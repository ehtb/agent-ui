# MIGRATION.md template

Copy this file to the project root as `MIGRATION.md` and fill it in. Update the status columns as you work; it is the memory of the migration.

```markdown
# Migration to agent-ui

Old app: <path, how to start it, how to run its tests>
New app: <path, `agent-ui dev`, `agent-ui check`, test command>
Strategy: side by side | in place
Started: <date>   Last updated: <date>

## Summary
<one paragraph: what the app is and the size of the migration: number of routes, components, namespaces, endpoints>

## Routes -> pages
| Old URL | Parameters | Target folder | Layout / shell | Data | Status |
|---|---|---|---|---|---|
| / | - | pages/ | layout | - | pending |

## State -> namespaces
| Old state | Kind (UI, shared, server data, URL, storage) | Target namespace.key | Derivable? | Status |
|---|---|---|---|---|

## Data and effects -> resources and plugins
| Old effect | Trigger / dependencies | Target (resource, plugin) | Failure / retry | Status |
|---|---|---|---|---|

## Components -> spec fragments and definitions
| Old component | Kind (markup, state, effects, library) | Target | Variants / props | Status |
|---|---|---|---|---|

## Forms
| Form | Fields and rules | Works without JavaScript? | Target | Status |
|---|---|---|---|---|

## Server
| Old endpoint / handler | Target (`api.js` table, existing server + `createSsrHandler`) | Status |
|---|---|---|

## Styling and assets
<how styles are written now, how they port, what is in public/>

## Libraries kept behind a plugin
| Library | Why | Plugin | Element id |
|---|---|---|---|

## Decisions
| # | Old behavior | Options | Recommendation | Answer | Date |
|---|---|---|---|---|---|

## Divergences from the old behavior
| Where | Old | New | Reason | Accepted by |
|---|---|---|---|---|

## Scenarios (user flows compared old vs new)
| Scenario | Steps (actions) | Old result | New result | Test | Status |
|---|---|---|---|---|---|

## Verification log
- `agent-ui check`: <date, result>
- Tests (dev and `dev: false`): <date, result>
- Size, old vs new production bundle: <numbers>
- Browser-only checks still to do by hand: <list>

## Open questions
<anything blocking>
```

Status values: `pending`, `in progress`, `ported`, `verified`, `decision pending`, `not ported (reason)`.
