# CC18

CC18 是以公開作品資料為基礎的繁體中文成人作品選片網站。正式網域是 <https://jav.com.tw>；`cc18.pages.dev` 的一般頁面轉至正式網域，舊的 `/media/` 網址仍由同一個 Pages Function 讀取 R2。預覽部署維持 noindex。作品頁保存來源原始事實，顯示標題和演員名稱另依在地化規則投影。

## 開發與驗證

```bash
npm ci
npm run validate
npm run dev
```

`npm run validate` 包含內容與登錄驗證、單元測試、網站建置和建置後 SEO 檢查。`npm run content:validate` 單獨檢查已發布稿件；輸出各類警告與阻擋數。正式部署由 main 分支的 Cloudflare Pages 流程處理，不手動執行 `wrangler pages deploy`。

## 內容與發布

每小時的 `Content pipeline` 會處理新作品，Editorial 由 `scripts/editorial/build-from-analysis.mjs` 讀取 `prompts/review-writer.md` 產生草稿，`scripts/editorial/qa-draft.mjs` 執行 QA，再由 publisher 提交限定檔案。Writer 與 critic 契約見 `prompts/`；來源身分、標籤和演員顯示名不得由評論覆寫。不得把影片抽樣或公開簡介寫成完整觀看心得。

新稿的目標格式是「選片評析」，詳見 `prompts/review-writer.md`。`editorialFormat: selection-analysis-v1` 的稿件須滿足 600 個中文字、至少三項 evidence、八項分數、最近 30 篇的相似度門檻，以及風險詞人工核可。舊稿與目前 publisher 的日期觸發稿暫時只警告，直到產線能穩定達標。人工核可只記錄於 `data/editorial-risk-approvals.json`；風險詞本身不是不收錄決定。

## 主要資料與文件

- `data/movie-registry.json`：作品登錄與發布狀態。
- `data/source-records/`：來源原始資料；`data/localization/performers-zh-tw.json`：演員顯示名。
- `data/review-quality/`：內容核可、證據、分數與文章雜湊。
- `data/search-content/`：搜尋投影與來源快照雜湊。
- `config/review-scorecard.json`、`config/review-policy.json`：評分與發布政策。
- `scripts/validate-content.mjs`：內容完整性及新格式阻擋規則。
- `docs/publisher.md`、`docs/editorial-d1.md`：Publisher 和 Editorial 流程。

共用首頁 og:image 是 `public/images/site-og.png`。作品媒體透過 `/media/works/...` 的 Pages Function 從 R2 提供；`wrangler.jsonc` 的 `MEDIA_BASE_URL` 使用正式網域。
