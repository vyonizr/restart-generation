# Domain docs

This page describes how the engineering skills use this repository's domain documentation when they explore the codebase.

## Read these before you explore

- **`CONTEXT.md`** at the repository root, or
- **`CONTEXT-MAP.md`** at the repository root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read the architecture decision records (ADRs) that touch the area you're about to work in. In multi-context repositories, also check `src/CONTEXT_NAME/docs/adr/` for context-scoped decisions, where `CONTEXT_NAME` is the context's folder.

If any of these files don't exist, proceed silently. Don't flag their absence, and don't suggest creating them upfront. The `/domain-modeling` skill (reached through `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions get resolved.

## File structure

This repository has a single context. Its domain documentation looks like the following tree, which shows the first two ADRs:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-players-bring-their-own-game-files.md
│   └── 0002-replacement-arena-server-for-unmodified-clients.md
├── server/
└── web/
```

A multi-context repository (one with `CONTEXT-MAP.md` at the root) looks like the following example:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms that the glossary explicitly avoids.

If the concept you need isn't in the glossary, that's a signal: either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than silently overriding it, in the following form:

> _Contradicts ADR ADR_NUMBER (DECISION_TITLE), but worth reopening because REASON._

Replace the following:

- `ADR_NUMBER`: the ADR's four-digit number, such as `0007`
- `DECISION_TITLE`: the ADR's title
- `REASON`: why the decision deserves another look
