# Discovery Queue 實作現況（2026-08-26）

## 已實作

- Listing → Work page → Date classification → Queue 的可重入流程。
- 一般影片 selector，排除卡通與漫畫分類。
- D1 migration、索引、prepared parameters 與批次 upsert。
- 番號、來源 UUID、工作 idempotency key 三層防重。
- Queue status、claim、finish／retry CLI。
- 本機 atomic JSON fallback，供 fixture、CI 與人工 dry run。
- GitHub manual workflow 可選 `file` 或 `d1`，但沒有 schedule。

## Live dry run 與正式 D1 驗證

2026-08-26 讀取 cc18.tv 首頁後得到 73 個一般影片候選。逐頁節流驗證結果：18 部 `eligible`、4 部 `upcoming`、9 部 `late_arrival`、42 部 `prelaunch_history` 略過、0 個錯誤。卡通與漫畫沒有進入候選，兩部缺少公開簡介的作品以 partial metadata 正常分類。

Cloudflare APAC 的 `cc18-db` 已建立並套用 `0001_pipeline_queue.sql`。第一次正式 D1 執行保存 31 部作品、建立 18 個 `media_analysis` jobs；第二次同批執行新增 0 部、入列 0 個、辨識 31 個重複，D1 總數仍是 31 部作品與 18 個 jobs。

## 安全閘門

- 每頁間隔 1 秒。
- 0 個或超過 500 個候選即失敗。
- 個別頁面錯誤持續處理；全批錯誤率超過 20% 則失敗。
- 只有最近 7 天建立高成本工作，8～14 天保存分類；更舊資料只計入 run summary，不建立 Movie 或 Job。
- 缺少公開簡介但番號、日期、標題與封面完整的作品標為 `metadata_status=partial`；新片仍可進影片分析，但 Writer 不得補造簡介。

## 尚未執行

- 建立只含 D1 Read／Write 的 GitHub API Token Secret；Account ID 與 Database ID 已使用 Variables。
- 配置較強文字模型 API，取代本機視覺模型的暫時 Writer 角色。
- 七天 canary 與正式 schedule。

## Media Bridge D1 canary

2026-08-26，Windows Media Bridge 以唯一 worker ID 領取 APNS-419，完成 24 個全時間軸窗口與本機 `qwen2.5vl:7b` 分析，平均信心 0.9062。分析成功後原始片段與畫格立即刪除，D1 工作以 attempt 1 完成；其餘 17 個工作保持 queued。

Worker 在分析期間定期續租；只有原 claimed worker 能續租或完成。登入與年齡確認問題轉為 `blocked`，暫時錯誤才進 `retry`，達最大 attempt 後轉 `failed`。

## Editorial D1 canary

APNS-419 的 completed media job 已以唯一 `{movie_id}:editorial:v1` 接棒。第一次生成因標題訊號不足被拒絕；第二次因方法揭露、重複句與空泛證據被 Automated QA blocked。使用同一 Source Record 與 Analysis 的較強編輯重寫版通過 7 段、7 條證據、15 個不同窗口及 0 重複句，D1 Editorial job 以 attempt 3 completed，但文章保持 draft。

此結果確認本機 `qwen2.5vl:7b` 適合產生非露骨視覺 Evidence，不適合擔任無人值守最終中文 Writer。正式大量自動化必須使用較強文字模型，QA 門檻不可因模型成本或速度而降低。
