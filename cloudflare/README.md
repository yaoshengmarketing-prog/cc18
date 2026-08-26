# Cloudflare resources

Target names:

- Pages project: `cc18`
- D1 production: `cc18-db`
- D1 staging: `cc18-db-staging`
- R2 production: `cc18-media`
- R2 staging: `cc18-media-staging`

The site is a static Astro build deployed through Cloudflare Pages Git integration. GitHub Actions owns discovery, generation, QA, and commits; Pages deploys a verified `main` commit. This avoids storing a long-lived Cloudflare deploy token in GitHub.

R2 is enabled and the Standard bucket `cc18-media` is bound to Pages Functions as `MEDIA`. The bucket stays private; `/functions/media/[[path]].js` exposes only immutable `works/...` image and MP4 keys through the same-site `/media/` route. Public `r2.dev` access remains disabled.

Media object keys are immutable:

- `works/{yyyy}/{mm}/{id}/cover.webp`
- `works/{yyyy}/{mm}/{id}/hero.webp`
- `works/{yyyy}/{mm}/{id}/vertical-v1.mp4`

Every review keeps the exact `sourceUrl` pointing to its CC18 work page. R2 stores copies used by this site; it is not the destination CTA.

## D1 persistent discovery queue

The queue schema is in `cloudflare/migrations/0001_pipeline_queue.sql`. Production authority will be `cc18-db`; no remote database is created or migrated merely by building the repository.

After explicit approval to create D1:

```bash
npx wrangler d1 create cc18-db
```

After creation, copy the example to `cloudflare/wrangler.d1.jsonc`, replace the placeholder with the returned database ID, then apply the migration:

```bash
npx wrangler d1 migrations apply cc18-db --remote --config cloudflare/wrangler.d1.jsonc
```

Add GitHub Variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID`, plus the Secret `CLOUDFLARE_API_TOKEN`. The token should only have the account-level D1 permission required by this project; never reuse or export the local Wrangler OAuth credential.

Manual local discovery uses an atomic JSON fallback:

```bash
npm run discovery:run -- --store=file
npm run queue:status -- --store=file
```

This file fallback is for tests and dry runs. GitHub-hosted runners are ephemeral, so only `--store=d1` is persistent across workflow runs.
