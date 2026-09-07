# Editorial input and publication preflight

## Confirmed causes

- Source-only Writer results were replaced wholesale when fewer than three video references were present. Source commentary now keeps its text; video claims still require evidence.
- Normalization truncated paragraphs at 700 characters, dropped sections after seven, and appended a standard audience conclusion. These mutations have been removed.
- The external brief injected the same invented guide/protagonist growth narrative into different works. Unknown relationships, scenes and character arcs now remain unknown. Source concepts remain traceable excerpts; abstract themes are not scene evidence.
- Legacy source snapshots can lack performer and series identities even when names are present. APNS-419 reproduced the performer-count failure. Refreshing its public source recovered one performer and one series without changing its title, date or names.

## Execution

1. Before Writer, validate source identities using the same validators as Movie Master publication.
2. If relations are invalid, refresh the existing source URL once. Only adopt relations and observation timestamp if movie ID, title, release date, performer names and series are unchanged. Never infer stable IDs or localized names.
3. Before media generation, repeat source preflight for restored/completed editorials.
4. Retain provider response and actual filtered input outside disposable canary worktrees. GitHub archives them for seven days; they are excluded from Git and the public website.
5. Empty, filtered or unsupported results stop with `EDITORIAL_REVIEW_REQUIRED`, rather than publishing a metadata template. The editorial queue does not automatically requeue this state.

This preflight covers source identity failures; it does not guarantee that a later deployment, media upload or network call succeeds. Existing completed media reuse remains unchanged.

## Validation and remaining work

Regression coverage includes long text, more than seven sections, source-only prose retention, malformed identities, unchanged-source repair and refusal to adopt changed facts. APNS-419 was refreshed locally without a paid model call. DSOD-067 passes source preflight.

Actual new Writer output and a single full production publication still need verification. Raw descriptions are still not sent to the external Writer; retaining prose does not itself solve insufficient source context. Daily spending budgets and a complete per-work paid-request ledger remain separate work.

## Source context diagnostics

The Writer now receives intact, non-graphic contextual sentences selected from descriptions, with exact source offsets. Sentences are not spliced to remove negations or unsupported fragments. A bounded context budget omits whole sentences and records omission reasons. These excerpts are source claims, not verified viewing observations or instructions.

`node scripts/editorial/audit-source-input.mjs` audits local snapshots without calling a model. Its report distinguishes missing descriptions, descriptions with no selected context, available source context and available video context. It never treats text length or available context as proof of review quality. Live input snapshots are saved before the request, including failed requests.

The first offline audit of 81 snapshots found 37 with selected context and 44 with descriptions but no selected context. This is a projection diagnostic, not a claim that 44 original works lack information. More comprehensive semantic source summarization remains necessary for those cases.

## Local semantic selection

`node scripts/editorial/select-source-context-local.mjs` uses the configured loopback model to select complete contextual sentence indices for the remaining snapshots. It does not paraphrase or create story facts. The selection is saved in `data/source-context/` with a description hash; changed source text, wrong identities or invalid indices invalidate it. Graphic sentence exclusion still applies after model selection. Empty valid selections are cached to avoid repeating the same local work.

The local run improved the 81-snapshot audit from 37 to 72 works with context. Nine snapshots still have no selected context. These numbers describe input availability, not approval of prose or publication. New snapshots can use the same local command; GitHub does not call the user's loopback model.

An isolated paid Writer preview is available via `preview-source-context.mjs MOVIE-ID --run-paid` and saves only local diagnostics. It is bounded to one request and 2500 output tokens, with no publication or image generation. The initial external preview was not executed because automatic approval review required explicit authorization for the selected payload and AItokenKing destination.
