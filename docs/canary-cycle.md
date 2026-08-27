# Canary 生產循環

Canary 是正式大量排程前的限量生產控制器。它每次只允許 1–3 部，依序執行 Editorial → Image → Video → Publisher；單部失敗會保留該階段的 D1 retry 狀態並繼續下一部，不會把其他作品一起卡住。

## 安全邊界

- 只選 `eligible` 且 `metadata_status=validated` 的新作。
- `media_analysis` 是可選的深度分析，不阻塞來源資料型影評。
- 開始前必須是乾淨 Git worktree；每部作品由 Publisher 個別 commit、push、驗證 Pages 後才完成。
- Remotion props 由影評、Taxonomy 與 Media Manifest 自動生成，不再人工維護。
- 暫存圖片與 MP4 在 R2 驗證後清除；Canary 報告存於被忽略的 `.cc18-canary/`。
- `publishing.daily_enabled` 維持 `false`，連續 Canary 穩定後才另行啟用每日排程。

## 操作

先檢查或修復過期 lease：

```powershell
npm run canary:health
npm run canary:repair
```

明確允許本次外部文字與圖片模型傳輸後，執行一部：

```powershell
$env:CC18_ALLOW_EDITORIAL_TRANSMISSION='YES'
$env:CC18_ALLOW_IMAGE_TRANSMISSION='YES'
$env:CC18_R2_AUTH_MODE='oauth'
npm run canary:run -- --max=1
```

也可指定最多三部：`npm run canary:run -- --max=3 --ids=ENDS-322,PRIAN-054,GAREA-627`。

## GitHub 單部端到端 Canary

在 GitHub Actions 手動執行 `Content pipeline (manual canary)`，選擇：

- `stage`: `end-to-end`
- `queue_store`: `d1`
- `movie_id`: 精確番號，例如 `SNOS-409`

Workflow 會在同一個序列化 run 內完成 Editorial → Image → Remotion Video → Publisher，並等到 Cloudflare Pages 的 release hash 與 R2 公開媒體都通過才成功。它沒有 `schedule`，不會自行每日啟動。

GitHub 必須設定：

- Variables：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`
- Secrets：`AITOKENKING_API_KEY`、`CLOUDFLARE_API_TOKEN`（D1）、`CLOUDFLARE_R2_API_TOKEN`（只供 Wrangler 寫入 `cc18-media`）

本機仍可使用 `CC18_R2_AUTH_MODE=oauth`；GitHub 則固定使用專用 R2 Token，D1 Token 不會傳入 Wrangler 子程序。
