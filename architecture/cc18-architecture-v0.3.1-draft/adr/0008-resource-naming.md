# ADR-0008：資源命名

狀態：Accepted for draft

## 決策

- GitHub repository：`yaoshengmarketing-prog/cc18`。
- Cloudflare production Worker／網站：`cc18`。
- Staging Worker：`cc18-staging`。
- D1：`cc18-db`／`cc18-db-staging`。
- R2：`cc18-media`／`cc18-media-staging`。

## 原因

使用一致 `cc18` 前綴，方便在 GitHub、Cloudflare 帳號、Actions secrets、日誌與成本報告中辨識環境與歸屬。

## 後果

R2 bucket 等名稱仍需在 Cloudflare 帳號盤點後確認可用性；若名稱衝突，只調整衍生名稱，不更改 GitHub repository 與 Worker 主名稱。


