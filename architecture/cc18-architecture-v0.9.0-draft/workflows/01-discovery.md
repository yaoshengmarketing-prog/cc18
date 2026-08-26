# Workflow：Discovery

觸發：每 6 小時及 `workflow_dispatch`。

1. 取得 D1 source cursor 與 launch watermark。
2. 讀取 cc18.tv 最新列表，使用節流與安全窗口翻頁。
3. 正規化番號並以 D1 去重。
4. 逐部讀取作品頁實際日期及欄位。
5. 驗證 SourceRecord Schema。
6. 原子寫入 Movie、SourceRecord 與 metadata-validation jobs。
7. 更新 cursor 僅在批次驗證通過後進行。
8. 產生 run summary；不在本 workflow 產文。

Idempotency key：`source:cc18:{normalized_movie_id}:{source_snapshot_hash}`。


