# CC18 Architecture Package

版本：`0.15.0-draft`
狀態：三層作品頁與 bounded worker 已實作；正式發布排程仍關閉
基準日期：2026-08-26

本套件是 CC18 影評網站的架構、資料契約與營運規則之單一討論基準。正式實作必須能追溯到本套件中的需求、Schema 或 Architecture Decision Record（ADR）。

## 專案定位

CC18 是以 cc18.tv 公開作品頁與代理商帳號正常播放權限為來源的成人作品介紹與原創影評網站。公開欄位負責發現與 Metadata；完整影片只在本機授權 Browser Bridge 中做分布式取樣，不能把登入 Cookie、短效 HLS 或原始影片送進 GitHub。網站以新片為主，來源可能在單日突發新增 50–250 部，因此生產線必須採「全量收件、持久化排隊、限流處理、分波發布」。

## 本版核心決策

- Astro 靜態網站；Cloudflare Pages Git integration 部署。
- GitHub Actions 是內容排程、生產與 QA 控制中心；Pages 監看通過驗證的 `main`。
- Cloudflare D1 是營運 Registry、Queue 與狀態的權威來源。
- GitHub 保存程式、Markdown、Taxonomy、來源正規化快照與 Registry 匯出快照。
- Cloudflare R2 保存所有生成圖片與 MP4，使用不可變版本路徑。
- Tag 在文章生成前規劃、生成後驗證；Taxonomy 另由全自動治理流程演進。
- 批次編輯規劃先於個別文章生成，以減少同批與同系列內容重複。
- 文章、圖片、影片是可獨立重試的階段；影片失敗不得阻塞文章發布。
- 全自動營運採保守、可逆的失敗策略；不確定時延後升級或隔離，不等待人工。
- 無法修改來源後臺時，使用專用 Windows Chrome Profile 經正常「後臺 → 前台 → 播放」取得短效媒體權限；新增 ADR-0011。
- GitHub Actions 不持有來源登入 Cookie；FFmpeg 與來源影片樣本只存在本機 Bridge runtime。
- `auth_required` 是不可自動繞過的終止狀態，必須由帳號持有人重新登入。
- 來源影像、音訊與 HLS 片段是本機暫存：分析成功立即刪除，失敗最多保留 2 小時；每工作 1GB、整體 runtime 2GB 硬上限。
- 視覺語意分析只呼叫本機 loopback 的 `qwen2.5vl:7b`；輸出遵守有限長度 JSON Schema，原始畫面不送第三方服務。
- Editorial pipeline 會把公開資料與影片 Analysis 組合成 Brief；草稿必須通過證據引用、重複句、來源標題、方法揭露與決策價值等 QA 才能發布。
- 正式 Writer 使用 AItokenKing 的 OpenAI Responses 相容 API 與 `gpt-5.4`；因閘道 strict Schema 相容性不完整，必須先經本機 JSON 擷取、欄位正規化與 deterministic QA。
- 傳送 Writer 前必須建立安全 Payload：原始片名、簡介、未知 Tag 與視覺模型原文不得送出，只傳番號、非露骨來源訊號與固定分類後的場景／鏡位／互動摘要。
- 成本 ledger 同時記錄 AItokenKing 積分／Pay-as-you-go 現金估算與 OpenAI 直連參考成本，透明呈現 gateway 溢價。
- 未設定 API 金鑰時，Editorial handoff 必須在 D1 claim 前停止，不增加工作 attempt；API 金鑰只由環境變數注入且不進入版本庫或日誌。
- 作品名稱採六層資料模型：CC18 原始標題、可驗證日文原名、繁中直譯、站內 H1、SEO 標題、社群標題；生成標題一律由二至四個可追溯 Title Signals 驅動。
- 日文原名缺少權威來源時保存 `null`，不得由中文宣傳標題反向杜撰；作品網址永久使用番號，不跟隨標題修改。
- 新片 Discovery 採全量候選收件、逐作品頁日期驗證、D1 去重與持久化工作 Queue；同一批重跑不重複排程。
- 生產 Worker 使用 900 秒 lease 原子領取；中斷後可接手，只有持有相同 worker ID 的程序能完成或重試工作。
- Cloudflare D1 `cc18-db` 已於 APAC 建立並套用 migration；兩輪正式 Discovery 已驗證跨執行去重。正式排程仍關閉。
- 本機 Media Bridge 已接上 D1 claim、租約續期與 finish／retry／blocked；TPNS-037 正式單件 canary 已完成，原始樣本已清除。
- TPNS-037 已完成 24-window、平均信心 0.8917 的本機 Evidence，以及 AItokenKing 草稿、7 段／5 證據／5 窗口／0 重複句 QA；文章保持 draft。
- APNS-419 已完成 D1 Editorial 接棒；兩次低品質輸出均被 fail-closed QA 阻擋，較強編輯層重寫後以 7 段、7 條證據、15 個窗口與 0 重複句通過，仍維持 draft。
- 本機 7B 視覺模型的責任固定為 Evidence；無人值守最終 Writer 必須使用較強文字模型。
- HUNTC-568 已完成第一筆影片證據型影評、原創非露骨 Hero／直式圖、9 秒 Remotion MP4、R2 雜湊驗證與本機媒體清除。
- 作品頁正式分為「來源事實、原創影評、搜尋決策」三層；完整影片資訊由 SourceRecord 直接渲染，不交給 AI 改寫。
- 搜尋決策層新增快速判斷、時間軸結構、適合／不適合與附理由推薦；薄 Hub、任意篩選 URL 與模板 FAQ 不得索引。
- 站內搜尋只查已發布作品的靜態索引，支援番號、演員、系列、標題與 Tag；結果頁固定 `noindex`。
- 本機 bounded worker 每輪最多 20 筆，預設 3 筆；單件失敗記錄 retry／failed 後繼續，不得阻塞整批。
- 外部 Editorial 需要 `--with-editorial` 與 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES` 兩個條件；worker 永遠只產草稿，不能直接發布。
- Windows 排程器與 readiness 檢查已建立但未安裝；正式排程須在七天 canary 後另行啟用。

## 文件導覽

1. `docs/00-product-and-principles.md`：產品範圍與不可違反原則。
2. `docs/01-system-architecture.md`：整體架構與平台責任。
3. `docs/02-data-and-state.md`：資料模型、權威來源與狀態機。
4. `docs/03-ingestion-and-burst-processing.md`：來源擷取、Watermark、突發批次。
5. `docs/04-editorial-and-taxonomy.md`：文章、切角、Tag 與自動治理。
6. `docs/05-media-pipeline.md`：圖片、Remotion、R2 與播放器。
7. `docs/06-publishing-and-deployment.md`：發布交易、GitHub、Cloudflare。
8. `docs/07-operations-security-compliance.md`：重試、監控、安全與內容政策。
9. `docs/08-capacity-cost-and-sla.md`：容量、成本與服務目標。
10. `docs/09-testing-rollout-and-roadmap.md`：測試、驗收與分階段上線。
11. `schemas/`：機器可驗證的資料契約。
12. `examples/`：資料、設定與工作流範例。
13. `adr/`：不可只靠口頭記憶的架構決策。
14. `docs/12-inventory-2026-08-24.md`：本地、GitHub、Cloudflare 的首次唯讀盤點。
15. `docs/13-v1-implementation-status.md`：網站、來源解析器、Remotion、CI 與 Media Bridge 的實作現況。
16. `adr/0012-multi-layer-title-identity.md`：作品身分、繁中標題與 SEO／社群標題的責任分離。
17. `adr/0013-d1-discovery-queue.md`：批次 Discovery、D1 去重與 lease Queue 決策。
18. `docs/14-discovery-queue-implementation.md`：實作、狀態、啟用條件與測試結果。
19. `adr/0014-editorial-provider-safety-boundary.md`：第三方 Writer 的降敏 Payload、格式相容層與 fail-closed QA。
20. `adr/0015-fact-review-search-graph.md`：來源事實、影評與搜尋決策的權限分離。
21. `docs/15-search-content-graph.md`：頁型意圖、索引門檻、技術 SEO 與自動 QA。
22. `adr/0016-bounded-local-worker.md`：本機批次排程、外送雙重同意與發布分離。
23. `docs/16-scheduling-and-site-enrichment.md`：已實作排程介面、內容模組與啟用步驟。

## 版本更新規則

- ZIP 發布物不可就地覆寫；任何修改都產生新版本。
- 每次修改必須更新 `VERSION`、`CHANGELOG.md` 與受影響文件。
- 架構方向改變時新增 ADR；舊 ADR 不刪除，只能標記 superseded。
- Schema 破壞性變更增加 major；新增相容欄位增加 minor；文字修正增加 patch。
- `draft` 表示仍在討論；移除 `draft` 才可作為正式建置基準。
- `MANIFEST.sha256` 於打包時生成，用來驗證 ZIP 內容。

## 已完成與尚未執行

- 已建立 private GitHub repository `yaoshengmarketing-prog/cc18`，主分支為 `main`。
- 已建立 Astro 網站首頁、作品頁、Hub、Registry、Tag policy、CC18 parser、Remotion 模板與 CI。
- 已建立 Cloudflare Pages `cc18`，production URL 為 `https://cc18.pages.dev`，由 `main` 自動部署。
- R2 與 D1 已啟用；自訂網域仍未建立。
- 已建立只限指定 Cloudflare 帳戶 `D1:Edit` 的本機 Bridge Token；僅存於 Git 忽略的 `.dev.vars.bridge`，沒有把本機 OAuth 或 Token 放入 GitHub。
- 尚未啟用 GitHub Actions 排程。
- 尚未大量擷取 cc18.tv 資料或啟用自動排程；目前保留少量正式流程測試作品。
- Media Bridge 已完成專用 Profile 登入及 HUNTC-568 全時間軸分布式抽樣驗證，來源媒體於分析完成後清除。
- TPNS-037 已完成 D1 `claim → authorized capture → 24-window analysis → cleanup → editorial → QA → completed`；其後 IMJO-011、SNOS-371、SNOS-409 與 DSOD-006 完成 Media Canary。目前 D1 為 8 completed、11 queued、1 retry。
