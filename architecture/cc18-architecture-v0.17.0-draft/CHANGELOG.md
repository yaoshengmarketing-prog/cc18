# Changelog

## 0.17.0-draft — 2026-08-27

### Creative-first production path

- Discovery 對每部 eligible 作品同時建立 `editorial` 與 `media_analysis` 工作；兩者獨立排隊、互不等待。
- Editorial 成為主要初始階段，Media 改為可選的後續素材增強。
- 新增 source-only D1 handoff，可直接領取下一筆 Editorial 工作並只產生 draft。
- 新增本機 Ollama Source Brief：完整來源標題、簡介與 Tag 只在 loopback 處理，外部 Writer 只接收非露骨 Creative Brief 與安全訊號。
- 新增 Creative Editorial batch cycle；必須有 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES` 才能執行，避免排程意外外送。
- 新增雙階段 Queue、Local Source Brief 與 raw-source isolation 測試。

### Validation

- Registry、Content、Source、Media、Bridge、Worker、Discovery、D1、Editorial、Search、Astro 與 SEO postbuild 全部通過。
- 新作品外送、正式發布與 Windows 排程仍保持關閉。

## 0.16.0-draft — 2026-08-26

### Editorial policy change

- 影評由「來源事實優先」改為「創作內容優先」；事實正確性不再是正文主要評分維度。
- 允許補寫情節、人物動機、場景銜接與敘事細節，優先追求故事性、獨特性、可讀性與選片價值。
- 番號、演員、日期、系列及來源 CTA 仍作為作品身分欄位，不可串錯作品。
- Creative Reconstruction 在 Editorial Brief 中保留內部 provenance，但不得回寫 Registry、Canonical Tag 或標記成 Video Evidence。
- 影片分析改為選用的內容素材；失敗不得阻止創作型影評。
- 移除每篇文章強制顯示「未完整觀看」免責句，方法統一由網站方法頁說明。

### Operations

- 先前建立的 Windows Media 排程已停用，等待 creative-first Editorial 路徑完成後再重新設計啟用順序。

## 0.15.0-draft — 2026-08-26

### Implemented

- 作品頁正式實作來源事實卡、搜尋決策板、全時間軸摘要、適合／不適合與附理由推薦。
- 新增站內搜尋，可依番號、演員、系列、顯示標題與 Canonical Tag 查找；搜尋結果頁固定 `noindex`。
- 新增編輯方法頁，說明來源、抽樣分析、AI 邊界、商業 CTA 與更正原則。
- 新增 `Article`、`BreadcrumbList` 與條件式 `VideoObject`；只有本站實際提供的短 MP4 才宣告影片結構化資料。
- 建置後 SEO QA 會阻擋重複 title／description、缺少 canonical 或作品頁結構化資料，並從 sitemap 移除 `noindex` URL。

### Scheduling

- 新增本機 bounded worker cycle，每輪 1–20 筆，單件失敗繼續下一筆，執行摘要保存在 Git 忽略的 runtime。
- 預設模式只做本機影片證據；外部 Editorial 必須同時提供 CLI 旗標與明確環境開關，正式發布仍為獨立關卡。
- 新增 Windows Task Scheduler 安裝器與非敏感 readiness 檢查；排程先建置、不自動安裝。

### Validated

- 新控制器以 `PETS-071` 驗證 timeout → retry，不阻塞 Queue。
- `DSOD-006` 完成 24-window Media Canary，平均信心 0.9042；原始影片片段與畫面清除，只保留 JSON Evidence／Analysis。
- D1 目前 8 completed、11 queued、1 retry；網站與測試套件均通過。

## 0.14.0-draft — 2026-08-26

### Added

- 新增 ADR-0015，將完整影片資訊、原創影評與搜尋決策內容分為三個權限層。
- 新增搜尋內容圖文件與 `search-content.schema.json`，定義快速判斷、時間軸摘要、適合／不適合及附理由推薦。
- 明確規定作品事實由 SourceRecord 直接渲染，AI 不得改寫或覆蓋。
- 定義作品、演員、系列、Canonical Tag、Latest／Archive 的搜尋意圖與可索引門檻。

### Validated

- IMJO-011、SNOS-371、SNOS-409 完成連續 24-window 本機 Media Canary，平均信心分別為 0.9167、0.9333、0.9292。
- 三部工作完成後原始媒體檔為 0；Bridge runtime 僅保留 JSON 證據與分析。

### Technical SEO

- 只有本站實際播放的短 MP4 可宣告 `VideoObject`；不得把 CC18 完整影片當作本站影片。
- 9 秒 MP4 不建立 `Clip`／Key moments；參數篩選頁不自動索引，薄 Hub 預設 `noindex`。
- 成人內容標示採頁級策略，避免把中性方法與政策頁錯誤套用成人標記。

## 0.13.0-draft — 2026-08-26

### Integrated

- 建立只限單一 Cloudflare 帳戶 `D1:Edit` 的 `cc18-local-d1-bridge` Token，秘密只保存在 Git 忽略的本機檔。
- TPNS-037 完成 D1 Media → Editorial 單件 canary：24 個取樣視窗、平均信心 0.8917、原始媒體清除、D1 兩階段 completed。
- AItokenKing Writer 前新增降敏 Payload，排除原始標題、簡介、未知 Tag 與視覺模型原文。
- 新增第一個完整 JSON 擷取、AItokenKing 替代欄位格式正規化、受控立即重試與 QA-blocked 安全結案。

### Validated

- TPNS-037 草稿通過 7 段、5 條證據、5 個不同影片窗口、0 重複句與 0 QA issue；仍維持 draft。
- 原始媒體檔 0，Bridge runtime 約 99 KB；網站 build 0 errors、0 warnings、0 hints。
- 本次除錯共 6,105 input／6,759 output tokens；AItokenKing Pay-as-you-go 現金估算 US$0.191733，正常單次成功成本將低於此 canary。

### Safety

- Azure 內容過濾拒絕時不繞過政策；改由本機固定分類降低外送資料敏感度。
- 第三方 Schema 不完整時不可直接發布；本機正規化後仍須 deterministic QA，失敗保持 retry／blocked。

## 0.12.0-draft — 2026-08-26

### Integrated

- Editorial Provider 改為可設定 OpenAI-compatible Base URL、API key 環境變數與 HTTPS host allowlist。
- 正式設定採 AItokenKing `gpt-5.4`／Responses API；本機秘密由 `.dev.vars` 的 `AITOKENKING_API_KEY` 載入且不進 Git。
- 新增不含作品資料、不 claim D1 的 strict JSON Schema smoke test。

### Cost transparency

- AItokenKing `gpt-5.4` 設定價為 input 5、cached input 0.5、output 22.5 credits／1M tokens；1 credit = US$1，Pay-as-you-go 儲值費 5%。
- 同一 ledger 另以 OpenAI 直連 input US$2.50、cached input US$0.25、output US$15／1M tokens計算參考成本與 gateway premium。

### Validated

- Live smoke：40 input、9 output、共 49 tokens；strict Schema 通過。
- AItokenKing 估算 0.000403 credits、Pay-as-you-go 現金約 US$0.000423；OpenAI 直連參考約 US$0.000235。
- 全套 Registry、Content、Source、Media、Bridge、Discovery、D1、Provider 與 Astro build 驗證通過。

## 0.11.0-draft — 2026-08-26

### Added

- 正式 Editorial Writer 接入 OpenAI Responses API，採 `gpt-5.4`、嚴格 JSON Schema 與 `store=false`。
- 新增 API 暫時性重送與 QA 內容重寫的獨立上限；QA 回饋最多驅動兩次全文重寫。
- 新增每作品 append-only 模型用量 ledger，累計 input、cached input、output token 與依版本化費率估算的 USD。

### Safety

- 無 `OPENAI_API_KEY` 時在 D1 claim 前 fail closed，不消耗 Queue attempt。
- 金鑰只由執行環境注入；用量 ledger 不保存 prompt、模型全文、response id 或金鑰。
- 草稿仍維持 draft；強模型生成成功不等於自動發布，必須通過同一套 deterministic QA。

### Validated

- Provider unit tests 3/3 通過；全套 Registry、內容、來源、媒體、Bridge、Discovery、D1、Editorial Provider 與 Astro build 驗證通過。
- 無金鑰 preflight 已實測以 `EDITORIAL_PROVIDER_NOT_CONFIGURED` 停止。

## 0.10.0-draft — 2026-08-26

### Added

- 新增 D1 Editorial handoff、stage idempotency、指定 job claim、租約續期與安全 blocked 重審。
- 新增 `--qa-only`，只允許 Editorial QA／生成失敗的工作重審，不解除登入或權限阻擋。
- 新增 Unicode NFKC Tag 比對，避免已映射來源 Tag 誤入 Candidate quarantine。

### Validated

- APNS-419 第一次生成因標題訊號不足 fail closed；第二次因缺少方法揭露、重複句與空泛證據 blocked。
- 較強編輯層重寫後通過 7 段、7 條證據、15 個不同影片窗口、0 重複句；D1 Editorial attempt 3 completed。
- APNS-419 仍為 draft，沒有 Hero、MP4 或公開發布。

### Decision

- 本機 7B 視覺模型只負責 Evidence；正式無人值守 Writer 必須使用較強文字模型並通過相同 QA，不得降低門檻。

## 0.9.0-draft — 2026-08-26

### Added

- 新增 D1 Media Bridge 單件 Worker，串接 `claim → authorized capture → local analysis → cleanup → finish`。
- 新增 owner-only 租約續期、作品來源查詢、blocked 狀態與本機模型預檢。
- 暫時錯誤延後 30 分鐘重試；登入／年齡確認停在 blocked；達最大 attempt 轉 failed。

### Validated

- APNS-419 正式 canary：6,636.9 秒來源、24 個分布時間窗、37,780,480 bytes 樣本、平均信心 0.9062。
- D1 回寫 completed／attempt 1；剩餘 17 queued，沒有重複領取。
- 原始片段、JPG 與 WAV 已清除，只保留約數十 KB 的 Evidence／Analysis JSON。

### Deferred

- 尚未啟用 Windows 自動 Worker 排程、Editorial 接棒或每日大量發布。

## 0.8.0-draft — 2026-08-26

### Activated

- 建立 Cloudflare D1 `cc18-db`（APAC）並套用 production migration。
- GitHub repository 設定非機密 Cloudflare Account ID 與 D1 Database ID Variables。
- 修正 D1 REST 多查詢格式為 `{ batch: [...] }`，保留作品、來源變體與工作寫入的交易語意。

### Validated

- 第一輪正式 D1 Discovery：73 fetched、31 movies persisted、18 jobs queued、0 errors。
- 第二輪相同 Discovery：0 new movies、0 new jobs、31 duplicates，總數維持 31 movies／18 jobs。
- GitHub schedule、文章生成與大量發布仍保持關閉；18 個工作等待 Media Bridge 接線。

### Security

- 不把本機 Wrangler OAuth token 匯出到 GitHub；正式 Workflow 尚待一枚只含 D1 Read／Write 的最小權限 API Token。

## 0.7.0-draft — 2026-08-26

### Added

- 新增可重入批次 Discovery：列表 URL 去重、作品頁實際日期驗證、7／14 天分類與 500 部安全上限。
- 新增 D1 migration，包含 `discovery_runs`、`movies`、`source_variants` 與 `pipeline_jobs`。
- 新增工作 idempotency key、優先級、最大重試、900 秒 lease、逾時接手及 owner-only 完成／重試。
- 新增 D1 REST prepared-query adapter 與本機原子 JSON fallback。
- 新增 Discovery、Queue 與 D1 migration 自動測試。

### Safety

- V1 只收一般 `/player.php`；卡通 `npage=cartoon` 與 `comic_player.php` 不進入影片 Queue。
- 候選數為 0、超過 500 或作品頁錯誤率超過 20% 時 fail closed，不啟動 AI 成本。
- 缺少公開簡介但核心身分欄位完整的作品標為 partial；允許影片分析，但禁止 Writer 補造簡介。
- GitHub Workflow 仍只有手動觸發，未加入 schedule；遠端 D1 未建立或遷移。

### Validated

- 2026-08-26 對 cc18.tv 首頁完成只讀盤點，確認列表仍可取得作品連結並發現混合分類 selector 問題。
- 修正分類與 partial metadata 後完成 73 頁 live dry run：18 eligible、4 upcoming、9 late arrival、42 history skipped、0 error、18 queued jobs。
- 本機 fixture 驗證同批重跑新增 0 個重複 job、有效 lease、逾時接手與完成回寫。

## 0.6.0-draft — 2026-08-26

### Added

- 新增 ADR-0012，將作品正式身分、繁中閱讀標題、搜尋標題與社群 Hook 分離。
- 新增 `original_title_ja`、`translated_title_zh_tw`、`display_title`、`seo_title`、`social_title` 與可稽核 `title_signals` 契約。
- Title Signal 限制為二至四項，逐項保存類型、值及來源欄位。

### Changed

- 日文原名只有在權威來源提供時才保存；缺少時為 `null`，禁止從 CC18 中文標題反向翻譯成虛構原名。
- 顯示、SEO 與社群標題均保留番號；顯示標題至少使用兩項來源訊號，社群標題至少使用一項。
- 草稿與發布 QA 改由每部作品的 `title_signals` 驗證，不再使用單一測試作品的硬編碼詞彙。

### Migration

- 既有來源快照補上 nullable 原名欄位；既有文章補上 `socialTitle` 與 `titleSignals`。
- 作品 URL 仍使用番號，不需 redirect 或重新命名。

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
