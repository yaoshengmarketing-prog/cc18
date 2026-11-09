# Recovery of the 23 works attempted by schedule 392

## Scope and evidence

The operator requested recovery of the original 23 failures without rewriting
completed articles or republishing completed works. The source batch is
[Content pipeline run 42413107999](https://github.com/yaoshengmarketing-prog/cc18/actions/runs/42413107999)
(schedule 392, 2026-11-07 20:52:11 UTC). Its final result lists 23 attempted,
zero published and the 50-minute time-budget stop.

The batch is: START-617, START-650, KNMB-131, SDNM-560, START-621, SDMM-238,
PRIAN-058, PRIAN-055, SDAM-179, FTKD-041, APNS-419, TPNS-037, CEAD-763,
CEMD-880, RGAV-005, TLDC-064, SNOS-290, HEYZO-3917, DSOD-061, SNOS-333,
DSOD-069, DSOD-054 and ROE-541. Other outstanding queue works are outside
this migration.

At the initial 2026-11-09 read, all 23 Editorial jobs were completed and
publication jobs were retryable; none held a lease. Only APNS-419 and
TPNS-037 existed in main's Registry, both as drafts. These are queue and
repository observations, not proof of public availability.

## Source binding repair: 21 preserved checkpoints

All 21 had a single blocking QA issue, `stale_search_source_snapshot`.
For 20, the old Search Content source hash exactly matches the D1 source
serialized with the existing `JSON.stringify(source, null, 2) + '\n'`
format. For APNS-419, it exactly matches the Source Record in commit
`44fd1f001d14694ab6d7369e63408ba364963d15`.

Comparing each old source with the preserved checkpoint shows only
`source_relations` and `fetched_at` changed. Work ID, source URL, title,
performers, series, release date, description, tags and all other fields
are unchanged. All 42 downloaded Source/Search files were verified against
their Git blob SHA. The manifest pins the exact Source, Search and article
bytes before repair. Existing article text and Search interpretation are
retained.

The rehydration step uses the existing hash-refresh utility only for the
reviewed manifest entries. A real mismatch in any pinned file is rejected.
An already-current binding needs no migration and proceeds to normal QA,
so later approval dates and R2 metadata do not obstruct retries.

## Missing draft recovery: START-617 and START-650

The original raw Writer responses are preserved in
[run 41805284692](https://github.com/yaoshengmarketing-prog/cc18/actions/runs/41805284692),
artifact `editorial-responses-41805284692-1` (ID `13312462409`). The artifact
ZIP SHA-256 is `db04fb9818979f4600d9dca4bc735d0a2c5c6744e857f8588c16f0bc15373938`.
The archive expires on 2026-11-11, so the two original response files are
also retained with the recovery bundles.

Both original responses parse completely. Their source hashes match the
current D1 source serialized by the original builder. Reconstruction used
the existing source-only repair path with network calls disabled. No new
Writer request was made. It retains titleVersion 1 and the original text
through the normalizer. START-650's existing `premise` to `故事前提`
normalization is also present in the original run's code.

Recovery bundles remain outside the public content paths. Runtime recovery
is restricted to these two IDs, requires the original source binding, and
does not overwrite an existing article. All bundle files are checked before
writing. Recovered quality records remain unapproved until the original QA
and approval steps run. Completed images and videos use the existing R2
rehydration path.

## Unchanged production controls

No cron, queue selection, attempt budget, publication gate or Writer provider
is changed. Existing D1 checks, checkpoint isolation, QA, content validation,
build, Publisher and live release verification remain responsible for
completion. Publication state is never set directly by the recovery helpers.
Per-work files from the 21 checkpoints are not committed to main by this
maintenance change, preserving checkpoint conflict detection.

## Validation before production

The 21 real preserved articles passed isolated QA after hash-only repair;
all article byte hashes remained unchanged. A second migration pass made
zero writes. The two reconstructed drafts passed isolated QA with notes
and no blocking or repair issues. These targeted checks do not substitute
for the full repository CI or each production Publisher verification.
