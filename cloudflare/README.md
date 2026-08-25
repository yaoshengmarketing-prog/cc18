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
