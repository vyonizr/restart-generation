# Issue tracker: local Markdown

Issues and specs for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/FEATURE_SLUG/`.
- The spec is `.scratch/FEATURE_SLUG/spec.md`.
- Implementation issues are one file per ticket at `.scratch/FEATURE_SLUG/issues/NN-SLUG.md`, numbered from `01`, never a single combined tickets file.
- Triage state is recorded as a `Status:` line near the top of each issue file (see [Triage labels](triage-labels.md) for the role strings).
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

In these paths, `FEATURE_SLUG` is a short hyphenated name for the feature, `NN` is the two-digit ticket number, and `SLUG` is a short hyphenated name for the ticket.

## When a skill says "publish to the issue tracker"

Create a file under `.scratch/FEATURE_SLUG/`, and create the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user usually passes the path or the issue number directly.

## Wayfinding operations

`/wayfinder` uses these operations. The *map* is a file with one *child* file per ticket.

- **Map**: `.scratch/FEATURE_SLUG/map.md` (the body with the Notes, Decisions-so-far, and Fog sections).
- **Child ticket**: `.scratch/FEATURE_SLUG/issues/NN-SLUG.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`, `prototype`, `grilling`, or `task`); a `Status:` line records `claimed` or `resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/FEATURE_SLUG/issues/` for files that are open, unblocked, and unclaimed; the lowest number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, and then append a context pointer (a summary and a link) to the Decisions-so-far section of `map.md`.
