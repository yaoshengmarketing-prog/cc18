# Cloudflare resources

Target names:

- Pages project: `cc18`
- D1 production: `cc18-db`
- D1 staging: `cc18-db-staging`
- R2 production: `cc18-media`
- R2 staging: `cc18-media-staging`

The site is a static Astro build deployed through Cloudflare Pages Git integration. GitHub Actions owns discovery, generation, QA, and commits; Pages deploys a verified `main` commit. This avoids storing a long-lived Cloudflare deploy token in GitHub.

R2 must be enabled in the Cloudflare dashboard before buckets can be created. Do not add fake D1 or R2 IDs to `wrangler.jsonc`; bind real resources only after creation.

Media object keys are immutable:

- `works/{yyyy}/{mm}/{id}/cover.webp`
- `works/{yyyy}/{mm}/{id}/hero.webp`
- `works/{yyyy}/{mm}/{id}/vertical-v1.mp4`

Every review keeps the exact `sourceUrl` pointing to its CC18 work page. R2 stores copies used by this site; it is not the destination CTA.
