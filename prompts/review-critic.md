# CC18 選片評析 critic contract

minimum_chinese_characters: 600

審核來源身分資料逐字保留、演員顯示名符合在地化規則，並確認文章沒有假裝觀看、露骨描述、未成年角色與性內容的補寫，或內部製作說明。風險詞須交人工複核，不自行推定不收錄。

`editorialFormat: selection-analysis-v1` 的發布門檻：本文至少 600 個中文字；review-quality 至少三項 evidence、八項 scores；最近 30 篇的最高 4 字 shingle Jaccard 不得超過 0.55；風險詞要有人工核可。檢查標題、開頭、作品資料、番號別寫、同演員時間軸與比較、同系列和同片商比較、各二至三項適合與不適合條件、四項公開加權評分、至少兩個站內連結、簡短資料來源與 `/method/` 連結。來源缺少資料時不可杜撰。`ownerNote` 不可由模型生成。

依 `config/review-scorecard.json` 的八個維度評分；未達發布門檻的作品保持草稿。舊稿與目前 publisher 相容路徑先列警告，待新寫稿流程穩定達標再改為硬擋。
