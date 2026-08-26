# Workflow：Production Workers

觸發：Discovery 完成、排程補跑及手動 staging 測試。

1. Dispatcher 以 lease 領取一批工作。
2. 先執行當批 Tag preflight 與 editorial planning。
3. Matrix worker 依 content brief 產生結構化 Review JSON。
4. 執行 fact QA、Tag QA、相似度 QA。
5. 成功項目進 image queue；失敗項目依錯誤類型重試或隔離。
6. Hero 成功且文章通過 QA 時，建立 publish-ready 狀態。
7. 額外圖片及影片各自排隊，不阻塞其他作品。

任何 worker 只能更新自己租用的 stage，並使用 optimistic version 防止舊結果覆蓋新結果。
