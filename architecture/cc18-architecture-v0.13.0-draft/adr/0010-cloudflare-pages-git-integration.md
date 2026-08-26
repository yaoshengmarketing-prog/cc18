# ADR-0010：網站採 Cloudflare Pages Git integration

- 狀態：Accepted
- 日期：2026-08-25
- Supersedes：ADR-0002 中由 GitHub Actions 直接執行網站 deploy 的部分

## 決策

Astro 靜態網站使用 Cloudflare Pages Git integration。GitHub Actions 負責來源擷取、內容與媒體生產、Registry、QA 與 commit；Pages 監看 `main` 並部署通過驗證的版本。

## 原因

- 現有 Cloudflare 帳號已大量採 Pages Git Provider，維運方式一致。
- 每個 PR／branch 可取得 preview deployment。
- GitHub 不必保存長效 Cloudflare deploy token。
- 網站是靜態內容，Pages 與 Astro 的責任邊界清楚。

## 邊界

Git integration 不代表來源生產移到 Cloudflare。排程、AI、Remotion 與 commit 仍由 GitHub Actions 控制；D1、R2 與未來 Worker API 是獨立資源。
