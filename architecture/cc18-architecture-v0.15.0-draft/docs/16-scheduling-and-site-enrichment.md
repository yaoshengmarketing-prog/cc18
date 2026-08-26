# 排程與網站內容完整度

## 1. 執行責任

```text
GitHub Actions（公開資料 Discovery／CI／部署）
  → Cloudflare D1（全量收件、去重、狀態與 lease）
  → Windows bounded worker（授權影片取樣、本機分析、立即清除）
  → Editorial draft（明確允許才外送安全化 Payload）
  → deterministic QA
  → 人工控制的發布開關
  → main／Cloudflare Pages
```

排程不是單一大腳本。Discovery 可以在雲端規律執行；需要登入 Chrome 與本機 Ollama 的 Media 階段必須在 Windows 主機執行。D1 是兩邊共同的 source of truth。

## 2. 本機 Worker 指令

- `npm run worker:readiness`：檢查 D1 權限是否存在、Chrome Profile、本機視覺模型、磁碟上限、清除政策與發布關閉狀態，不輸出秘密。
- `npm run worker:cycle -- --max=3`：只處理最多三筆 Media 工作。
- `npm run worker:cycle -- --max=3 --with-editorial`：只有環境另有 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES` 才建立外部模型草稿。
- `npm run worker:schedule:install`：安裝每小時執行一次、同時間不重疊的 Windows 工作；目前不得自動執行此安裝器。

## 3. 排程啟用順序

1. 每次修改先跑完整 `npm run validate`。
2. 手動執行三輪 media-only cycle，確認成功、retry 與 queue-empty 三條路徑。
3. 連續七天只產 draft，檢查磁碟峰值、平均時間、來源錯誤率與 QA 通過率。
4. 再啟用 Windows Task Scheduler；批次上限先用 3，依實際處理速度提高。
5. 最後才開啟 GitHub Discovery schedule 與分波發布；不能同時一次開啟全部開關。

## 4. 作品頁完整內容

每篇作品頁的資訊價值由三層組成：

- 來源事實：番號、演員、日期、系列、原始標題、來源 Tag、公開簡介、片長／畫質與原始 CTA，直接由 SourceRecord 渲染。
- 原創影評：核心切角、設定、互動、節奏、同系列差異與總評；每個具體觀察要能回到 Evidence。
- 搜尋決策：一句快速判斷、時間軸摘要、適合／不適合、自然語言問題與附理由推薦。

另外提供站內搜尋與演員／系列／Tag Hub。搜尋結果頁與未滿三部的 Hub 固定 `noindex`，避免為了頁數建立薄內容。

## 5. SEO 與信任門檻

- 每頁唯一 title、description、canonical。
- 作品頁具 `Article` 與 `BreadcrumbList`；只有本站實際 MP4 才有 `VideoObject`。
- 成人標示只套用於作品與成人內容 Hub，中性方法頁不套用。
- `robots.txt` 指向正式 sitemap；postbuild 會把 `noindex` URL 從 sitemap 移除。
- 來源簡介標示來源且排除搜尋摘要；外部 CTA 標記 sponsored。
- 方法頁揭露抽樣、AI、商業關係與更正政策，不宣稱逐幕完整觀看。

## 6. 目前驗證結果

- Readiness 六項通過。
- `PETS-071` 捕捉 timeout 後進入 retry，整批沒有卡死。
- `DSOD-006` 完成 24 windows、平均信心 0.9042；只保留 JSON，原始媒體為 0。
- 外部 Editorial 與正式發布均未在本次 worker canary 啟用。
