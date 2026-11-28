# 選片評析 v1 資料欄位

`content/reviews/{ID}.md` 以 `editorialFormat: selection-analysis-v1` 啟用新區塊與中文編輯 H1。舊稿不受影響。

`workTitle` 是 H1；`sourceTitle` 必須保留來源原文。`shortReview` 供導言、meta description 與 Article description 使用。`modifiedAt` 記錄實際編輯日期，供 Article dateModified 使用。`ownerNote` 是選填的站長實看短評，只有站長提供實看內容時填寫；缺值不顯示區塊。

`selectionScores` 包含 `topicClarity`（題材明確度，權重 0.30）、`dataCompleteness`（資料完整度，0.25）、`performerDistinctiveness`（同演員差異度，0.25）及 `tagConsistency`（標籤一致度，0.20）。每項有 `score`（0–10）與 `reason`（一句公開資料理由）；總分由模板計算並顯示一位小數。評分依公開資料評估，不代表觀看品質。完整公式與判斷標準見 `/method/`。

番號別寫法由番號機械產生。時間軸由相同 stable performer ID 的已發布作品與發行日產生；每筆連到本站作品頁。共演由該作品的 performer relations 產生；常合作片商統計本站同演員已發布作品，至少兩部才顯示。缺資料的區塊不顯示。
