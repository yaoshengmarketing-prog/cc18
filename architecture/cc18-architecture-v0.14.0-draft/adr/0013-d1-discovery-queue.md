# ADR-0013：D1 新片發現與持久化工作佇列

狀態：Accepted
日期：2026-08-26

## 情境

來源不是每日平均新增，而是可能每週一次集中出現 50～250 部。把「每天產 3～5 篇」同時當成發現上限會永久漏片；只用 Git JSON 作為多 Worker Queue，又會產生競爭、重複與中斷後無法接手的問題。

## 決策

Discovery 與 Production 解耦。每次 Scout 全量讀取候選連結，逐一打開作品頁取得實際日期，先全部寫入 Cloudflare D1，再由限流 Worker 分批領取。`movies.id` 與來源 UUID 去重，`pipeline_jobs.idempotency_key` 阻止同階段重複工作。

Worker 使用單一原子 `UPDATE ... RETURNING` 取得 lease。預設 lease 900 秒；程序中斷後，只有租約過期才允許其他 Worker 接手。完成、重試與失敗回寫必須匹配 `job_id + claimed_by`。

## 分類

- 最近 7 天：`eligible`，建立 `media_analysis` job。
- 第 8～14 天：`late_arrival`，保存但暫不投入高成本流程。
- 更舊：`prelaunch_history`，只計入 run summary，不建立 Movie 或 Job，也不自動回補。
- 異常未來日期：`invalid_date`，隔離。

## 後果

- 產能不足只形成 backlog，不造成來源作品遺失。
- 重跑與多 Worker 可安全復原，不需要人工作業去重。
- D1 成為工作狀態權威；Git JSON 只能是測試 fallback 或匯出快照。
- 正式啟用前需要建立 D1、套用 migration 並配置最小權限 secrets。

## 回滾

停止新的 Discovery，不刪除 D1 資料。既有 Git 文章與 Registry 快照仍可部署；待問題修正後從最後成功 run 繼續。
