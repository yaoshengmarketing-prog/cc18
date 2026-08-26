# ADR-0014：Editorial Provider 安全邊界與相容層

狀態：Accepted
日期：2026-08-26

## 問題

完整影片 Evidence 可能含受限題材描述；AItokenKing 的 Azure 模型會拒絕過度敏感的輸入，而且其 OpenAI Responses strict JSON Schema 相容性不完整。直接傳送原始資料會增加隱私、內容政策與格式失敗風險。

## 決策

第三方 Writer 只接收本機建立的安全 Payload：番號、日期、已知演員／系列、安全 Title Signals，以及將影片觀察映射成有限字典後的場景、互動氣氛、鏡位與時間索引。原始片名、簡介、未知來源 Tag、原始影像、影片、HLS、Cookie、Token 與視覺模型自由文字不得送出。

AItokenKing 回傳先擷取第一個完整 JSON，再映射 camelCase／替代 Editorial Brief 格式；可由本機資料確定的 Title Signals、Evidence refs 與 Canonical Tags 由 deterministic code 補全。正文、觀點與段落不可用模板假造。

任何正規化後輸出仍須通過來源可追溯、方法揭露、決策價值、段落數、證據窗口與重複句 QA。未通過時保持 draft 並進入 retry／blocked；不得因模型已付費就降低門檻。

## 後果

- 第三方不取得原始影片觀察與露骨 Metadata。
- Writer 能在內容政策邊界內產生非露骨影評。
- Provider 格式漂移不會直接破壞文章，但需維護相容層測試。
- 若安全訊號不足兩個，工作 fail closed，不用原始敏感文字補足。
- QA 已通過但工作因舊 QA 規則 blocked 時，只允許以 QA report 為證據做 guarded completed transition，文章仍維持 draft。
