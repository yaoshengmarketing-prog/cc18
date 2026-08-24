# Workflow：Taxonomy Reconcile

每日：

- 匯總新 Source Tag observations。
- 執行已知 ID／別名映射。
- 分離 technical、entity、source-only 與 sensitive。
- 對未知詞產生 provisional candidate。

每週：

- 統計跨作品、跨系列與時間分布。
- 檢查近似既有 Tag。
- 兩次獨立判斷一致時自動升級、映射或拒絕。
- 更新 taxonomy version、CHANGELOG 與受影響 assignment。
- 自動重建搜尋索引與 Hub；不重寫無關文章。

結構性變更必須有機器產生的 decision record，包含舊值、新值、證據、模型與信心。

