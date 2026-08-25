# Changelog

## 0.5.0-draft — 2026-08-25

### Added

- 新增 `Analysis → Editorial Brief → Review → QA` 本機內容流程與 `editorial:build`／`editorial:qa` 指令。
- QA 自動阻擋示範代號、缺少來源訊號的標題、重複句、空泛證據、未轉錄音訊宣稱及缺少選片價值的文章。
- 未映射 Source Tag 在產文當下自動進入 Candidate quarantine，不阻塞文章但不可直接成為可點擊 Tag。

### Validated

- 第一版本機模型草稿因示範標題、重複段落與無證據對白宣稱而被拒絕，證明 QA 能阻止低品質內容發布。
- HUNTC-568 重寫版使用 7 組證據、14 個不同影片窗口、8 個不重複段落；內容評分 9.2／10。
- 兩張原創非露骨圖片與 9 秒 1080×1920 MP4 已上傳 R2，三項重新下載後 SHA-256 完全一致。
- R2 驗證完成後，本機 Hero、直式圖、MP4 與 contact sheet 均已清除。

### Decision

- 小型本機視覺模型負責 Evidence，不直接擔任無監督最終編輯；低品質草稿必須被 QA 拒絕或交由較強寫作模型重寫。

## 0.4.1-draft — 2026-08-25

### Changed

- 來源 HLS、抽樣 JPG 與 WAV 改為分析成功立即清除；失敗或中斷最多保留 2 小時。
- 新增每工作 1GB 與 Bridge runtime 2GB 硬上限，避免本機空間隨作品數累積。
- 年齡確認只有在帳號持有人明確授權並寫入本機設定後才可自動點擊。

### Validated

- HUNTC-568 完成 24 個全片分布窗口本機分析，平均信心值 0.9292。
- 分析後原始片段、47 張 JPG 與 24 段 WAV 均已刪除，只保留 Evidence／Analysis JSON。
- 本機 `qwen2.5vl:7b` 使用嚴格 JSON Schema；Bridge 測試 8/8 通過。

### Added

- 新增 `video-analysis.schema.json`，記錄非露骨敘事觀察、覆蓋率與本機執行保證。
- 新增並安裝使用者層級 `CC18-MediaBridge-Cleanup` Windows 排程，每小時清理逾期暫存。

## 0.4.0-draft — 2026-08-25

### Added

- 確認帳號權限為代理商後臺與正常完整播放，不能要求來源站新增 API。
- 新增 ADR-0011，採用 Windows Local Browser Media Bridge。
- 專用 Chrome Profile 經由後臺「前台」連結取得正常授權；Cookie 不離開 Profile。
- 新增 HLS master／media playlist 解析、全片分布式取樣、流量上限與本機 Evidence manifest。
- 新增 `video-evidence.schema.json`、本機 Queue、`auth_required`／`retry` 狀態與初版清理政策。
- FFmpeg 以專案依賴提供；Bridge 測試納入 CI。

### Security

- HLS 簽章網址只存在記憶體，不寫入 Queue、Evidence 或日誌。
- 來源與媒體網域採 HTTPS allowlist；未知主機停止處理。
- CAPTCHA、登入、密碼與二步驗證不自動繞過。

## 0.3.1-draft — 2026-08-25

### Deployed

- 建立 Cloudflare Pages 專案 `cc18`，以 Git integration 監看 `main`。
- 正式站已部署至 `https://cc18.pages.dev`，Cloudflare production build 通過。
- 修正 Astro canonical 與 sitemap，固定使用 production hostname，不採單次部署雜湊網址。
- 公開端驗收首頁與作品頁無 console error；作品頁 CC18 CTA 保留 `rel="sponsored noopener"`。
- `sitemap-index.xml` 公開回傳 HTTP 200，並指向固定 hostname。
- R2 尚未啟用；媒體 URL 仍為 placeholder，正式 MP4 上線前必須完成 R2。

## 0.3.0-draft — 2026-08-24

### Implemented — 2026-08-25

- 建立 private GitHub repository `yaoshengmarketing-prog/cc18` 與 `main`。
- 建立 Astro 靜態網站、橫式影片縮圖首頁、作品頁、演員／系列／Tag Hub 與 HTML5 player fallback。
- 建立內容 Schema、JSON Registry、Taxonomy policy 與安全示範文章。
- 建立 cc18.tv listing／work parser、網域白名單、fixture tests 與單筆 live smoke test。
- 確認來源作品頁可取得番號、日期、片商、系列、簡介、演員、Tag 與 `800×538` 主預覽圖。
- 建立 9 秒、1080×1920、四場景參數化 Remotion 模板。
- 部署產品定案為 Cloudflare Pages Git integration；新增 ADR-0010。
- GitHub Actions CI 已啟用；內容 pipeline 僅能手動 dry-run，每日排程仍關閉。

### Added

- 確定 GitHub repository 名稱為 `yaoshengmarketing-prog/cc18`。
- 確定 Cloudflare 網站／Worker 專案名稱為 `cc18`。
- 衍生資源預設命名為 `cc18-db`、`cc18-media`；staging 使用 `-staging`。
- 加入本地、GitHub 與 Cloudflare 首次唯讀盤點報告。
- 新增 ADR-0008 命名決策。
- 將每篇文章的 cc18.tv 原始作品連結定義為必要導流 CTA，並新增 ADR-0009。

### Inventory findings

- 本地 workspace 尚非 Git repository，尚未有網站程式。
- GitHub CLI 已安裝，但 `yaoshengmarketing-prog` 的既有 token 失效。
- GitHub 公開頁面對 `yaoshengmarketing-prog/cc18` 回傳 404；private repo 狀態待重新驗證。
- 本機尚未安裝 Wrangler，亦未找到 Wrangler 登入設定。
- Cloudflare OAuth 登入已完成；`cc18` Worker／Pages 均不存在，D1 與 Queues 為空，R2 尚未啟用。
- 帳號已有多個採 Git Provider 的 Pages 專案，因此正式部署面需在 Pages Git integration 與 Workers Static Assets 間做最後選擇。

## 0.1.0-draft — 2026-08-24

### Added

- 建立 CC18 首份完整架構套件。
- 確立突發批次、全量收件與分波發布模型。
- 將營運 Registry／Queue 權威來源定為 Cloudflare D1。
- 定義 GitHub、D1、R2 與 Cloudflare Workers 的責任邊界。
- 定義來源 Tag、Canonical Tag、Editorial Tag 與候選 Tag 生命週期。
- 定義批次編輯規劃、文章前置 Tag 計畫與文章後置 QA。
- 定義媒體不可變路徑、Remotion 規格與文章先於影片發布策略。
- 加入 JSON Schema、範例資料、工作流規格與 ADR。

### Open

- 正式網站網域未決定。
- GitHub repository 公開／私人未決定，預設私人。
- Cloudflare 現有帳號與資源尚未盤點。
- 文字與圖片模型仍需以第一部測試作品做品質評測。
- Remotion 免費／公司授權資格尚未確認。
- cc18.tv 使用條款、robots 與穩定擷取頻率仍需正式檢查。

