# ADR-0002：GitHub Actions 作為控制中心

狀態：Accepted for draft

## 決策

Discovery、AI、Remotion、Publisher 與 Cloudflare deploy 由 GitHub Actions 控制；不依賴 ChatGPT 排程，也不重複啟用 Cloudflare production Git auto-deploy。

## 原因

工作流、日誌、權限、commit 與部署可集中追蹤；適合每日／突發批次。

## 後果

需要嚴格管理 runner 分鐘、cache、artifact retention、workflow concurrency 與 secrets。
