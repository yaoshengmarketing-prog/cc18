# 新片批次發現與持久化佇列

## 目的

CC18 來源可能一週集中新增 50～250 部。Scout 必須把列表上的候選作品全部收件，逐一打開作品頁讀取實際 `release_date`，然後再分類；不得用首頁排序代替作品日期，也不得因單次產能不足而漏掉作品。

## 流程

```text
讀取設定的 listing URLs
→ 收集並以完整作品 URL 去重
→ 檢查 500 部安全上限
→ 依序、節流讀取每個作品頁
→ Parser 驗證番號、日期、標題、簡介與封面
→ 依作品頁日期分類
→ D1 以番號與來源 UUID 去重
→ eligible 全部建立 media_analysis job
→ 生產 Worker 以 lease 分批領取
```

分類規則：

- `eligible`：作品日期在最近 7 天內，建立工作。
- `upcoming`：未來 30 天內的預告作品，先保存但到實際上片日才進入工作 Queue。
- `late_arrival`：第 8～14 天，保存但不自動建立高成本工作。
- `prelaunch_history`：超過掃描窗口，只計入 Discovery Run 摘要，不建立 Movie 或 Job，也不回補。
- `invalid_date`：超過允許的未來日期，隔離且不花費 AI 成本。

來源沒有公開簡介但仍有番號、日期、標題與封面時，Movie 使用 `metadata_status=partial`。若日期仍屬 `eligible`，可以進入影片分析；後續 Writer 不得虛構簡介，只能引用實際存在的標題、標籤與影片證據。

## 去重與持久化

- `movies.id` 使用正規化番號作主鍵。
- `source_variants.source_uuid` 唯一，允許同一番號保留多個來源變體。
- `pipeline_jobs.idempotency_key` 唯一，格式為 `{MOVIE-ID}:{stage}:v1`。
- 重跑 Discovery 會更新 `last_seen_at`，不會重複建立工作。
- GitHub Actions 的正式權威是 Cloudflare D1；`data/pipeline-queue.json` 只供本機與 CI 測試。

## Lease 與失敗

Worker 透過單一原子 `UPDATE ... RETURNING` 領取最高優先工作。預設租約 900 秒；程序中斷後，租約到期的工作可由其他 Worker 接手。完成、重試及永久失敗都必須由持有相同 `worker_id` 的 Worker 回寫，避免另一個程序誤結束工作。

## 安全閘門

- 每個作品頁間隔 1 秒，避免對來源站造成突發負載。
- 每次最多 500 個候選；超過即停止，不啟動 AI 或圖片流程。
- 列表若突然變成 0 個候選，也視為 selector 失效並停止。
- 作品頁錯誤率高於 20% 時整批標記失敗。
- 單一作品錯誤只記錄精簡錯誤，不阻塞其他候選。
- 不保存登入 Cookie、短效 HLS 或原始 HTML。
- V1 只收一般 `/player.php` 作品；`npage=cartoon` 與 `comic_player.php` 分類隔離，不混入真人影片 Queue。
- 目前 GitHub Workflow 只允許手動執行，沒有 `schedule`。

## D1 啟用現況

1. `cc18-db` 已建立於 Cloudflare APAC，migration 已套用。
2. GitHub Variables 已設定 Account ID 與 D1 Database ID。
3. GitHub Secret 尚缺一枚只含 D1 Read／Write 的 API Token；不得用本機 Wrangler OAuth token 代替。
4. 兩輪手動 `discover + d1` 已通過首次入列與零重複驗證。
5. 本機 Media Bridge 尚未接上 D1 claim／finish，所以 18 個工作保留為 `queued`。
6. 完成 Worker 接線及七天 canary 後才新增正式 schedule。

## 2026-08-26 live dry run

首頁取得 73 個一般影片候選；逐頁驗證為 18 部 eligible、4 部 upcoming、9 部 late arrival、42 部歷史略過，0 個錯誤。第一次正式 D1 執行保存 31 部作品並建立 18 個 jobs；第二次相同執行得到 `new_movies=0`、`enqueued=0`、`duplicates=31`，D1 仍維持 31 部作品與 18 個 jobs。
