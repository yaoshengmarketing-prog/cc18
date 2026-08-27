# Publisher

Publisher 是 D1 生產線的最後一段，處理 `publish` 工作，但不負責決定文章內容。

流程：

1. 以 lease 原子領取一個 `publish` 工作。
2. 確認文章與 Registry 都是 `published`，且 `review-quality` 已核准、SHA-256 仍與 Markdown 完全一致。
3. 執行 Registry、內容與 Astro build 驗證。
4. 對 R2 Hero 與 MP4 做公開 HEAD 驗證；MP4 必須是 `video/mp4` 且支援 byte ranges。
5. Git 工作樹只能包含該番號的產物與共享 Registry／Tag 候選；發現其他檔案立即 retry，不混入提交。
6. 有變更時提交並推送 `main`；無變更時沿用目前 commit，保持冪等。
7. 輪詢正式文章。頁面中的 `cc18-release-id` 必須等於 QA 保存的文章 SHA-256；若文章有 `videoUrl`，正式 HTML 也必須已輸出播放器與相同路徑。
8. 上述條件全部成立後，D1 才標記 `completed`。逾時或驗證失敗寫入 error code 並設為 retry。

本機單筆執行：

```bash
npm run publish:d1:process-one -- SDAB-358
```

GitHub 使用 `Content pipeline (manual canary)`，選擇 `publish` 並填入精確番號。每日排程仍由 `config/pipeline.json` 的 `publishing.daily_enabled: false` 關閉；完成七天 canary 前不得加入 cron。
