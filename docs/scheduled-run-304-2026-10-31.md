# 定時發布維護紀錄：Content pipeline #304

觀察來源：[GitHub Actions #304](https://github.com/yaoshengmarketing-prog/cc18/actions/runs/41114588091) 的 [pipeline job](https://github.com/yaoshengmarketing-prog/cc18/actions/runs/41114588091/job/124265367872)。此紀錄只描述該次執行，不代表六筆工作目前仍處於相同狀態。

2026-10-31 03:21（台灣時間）由真正的 `schedule` 事件啟動。Discovery 回報 74 個候選、11 部新作品、12 筆入列工作與 1 筆來源錯誤；串行流程嘗試 14 部、發布 8 部、失敗 6 部，因時間預算用盡收尾。成功作品不因下列個別失敗撤回。

| 作品 | 失敗階段 | 該次日誌顯示的原因 | 該次工作狀態與後續重試 |
| --- | --- | --- | --- |
| KUSE-045 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |
| YMTK-146 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |
| HEYZO-3970 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |
| SDDE-771 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |
| LOCK-019 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |
| SIRO-5758 | Editorial 產文 | 來源發布預檢通過；供應者回應沒有完整 JSON，`build-from-analysis.mjs` 以 `EDITORIAL_GENERATION_FAILED` 結束。 | `retry`；由既有 D1 Editorial 工作與單作品隔離執行器續跑。 |

現有 `handoff-d1.mjs` 對尚未耗盡嘗試次數的 `EDITORIAL_GENERATION_FAILED` 設定 30 分鐘後可重試；串行單作品路徑以 `--retry-now` 領取符合條件的 `retry` 工作。若後續耗盡次數或供應者仍回傳不完整內容，應依當時 D1 狀態另行診斷；本次未手動重排、修改 Queue 或降低發布檢查。
