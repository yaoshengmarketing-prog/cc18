# Discovery Queue 實作現況（2026-08-26）

## 已實作

- Listing → Work page → Date classification → Queue 的可重入流程。
- 一般影片 selector，排除卡通與漫畫分類。
- D1 migration、索引、prepared parameters 與批次 upsert。
- 番號、來源 UUID、工作 idempotency key 三層防重。
- Queue status、claim、finish／retry CLI。
- 本機 atomic JSON fallback，供 fixture、CI 與人工 dry run。
- GitHub manual workflow 可選 `file` 或 `d1`，但沒有 schedule。

## Live dry run

2026-08-26 讀取 cc18.tv 首頁後得到 73 個一般影片候選。逐頁節流驗證結果：18 部 `eligible`、4 部 `upcoming`、9 部 `late_arrival`、42 部 `prelaunch_history` 略過、0 個錯誤；本機 Queue 建立 18 個不重複 `media_analysis` jobs。卡通與漫畫沒有進入候選，兩部缺少公開簡介的作品以 partial metadata 正常分類。

## 安全閘門

- 每頁間隔 1 秒。
- 0 個或超過 500 個候選即失敗。
- 個別頁面錯誤持續處理；全批錯誤率超過 20% 則失敗。
- 只有最近 7 天建立高成本工作，8～14 天保存分類；更舊資料只計入 run summary，不建立 Movie 或 Job。
- 缺少公開簡介但番號、日期、標題與封面完整的作品標為 `metadata_status=partial`；新片仍可進影片分析，但 Writer 不得補造簡介。

## 尚未執行

- 建立遠端 `cc18-db`。
- 套用 production migration。
- 建立最小權限 GitHub Secrets。
- 執行第一輪 `discover + d1` 與第二輪零重複驗證。
- 將本機 Media Bridge Worker 接到 D1 claim／finish。
- 七天 canary 與正式 schedule。
