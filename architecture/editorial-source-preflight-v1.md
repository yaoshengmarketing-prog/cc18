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
