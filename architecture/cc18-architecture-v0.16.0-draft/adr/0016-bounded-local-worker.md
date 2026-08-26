# ADR-0016：有上限的本機 Worker 與發布分離

狀態：Accepted  
日期：2026-08-26

## 背景

來源可能每週一次新增 50–250 部。GitHub Actions 能負責 Discovery、驗證與部署，但不能保存代理商登入狀態，也不能直接操作本機授權 Chrome 與 Ollama。若每次只靠人工執行單件腳本，無法形成可營運排程；若一次無上限清空 Queue，則會放大來源、磁碟、模型與失敗風險。

## 決策

使用 Windows 本機 bounded worker 消費 D1 Queue：

- 每輪 `max` 限制 1–20，預設 3。
- 一次只處理一部影片，避免 Chrome、FFmpeg 與本機模型爭搶資源。
- 單件失敗由 D1 記錄 retry／blocked／failed，控制器繼續下一筆。
- 分析成功即刪除原始 HLS、音訊與 frames，只留 Evidence／Analysis JSON。
- 執行摘要寫入 Git 忽略的 `.cc18-bridge/cycle-runs.jsonl`。
- 預設只執行 Media Analysis；外部 Editorial 必須同時使用 `--with-editorial` 與精確環境值 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES`。
- Editorial 只建立 draft；發布必須通過獨立 QA、Git commit 與 deployment gate。
- Task Scheduler 使用 `IgnoreNew`，前一輪未完成時不重疊啟動。

## 結果

來源突發量被 D1 吸收，不會因單日 250 部而遺失。處理速度可藉由排程頻率與每輪上限調整，但不犧牲磁碟安全、第三方資料邊界或發布品質。
