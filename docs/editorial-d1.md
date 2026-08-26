# D1 Editorial 接棒

## 流程

```text
completed media_analysis
→ 驗證本機 analysis.json 的 movie_id／job_id
→ 從 D1 source_json 建立可版本化 Source Record
→ 強模型 API preflight（無金鑰時不 claim、不增加 attempt）
→ 以 {movie_id}:editorial:v1 去重建立工作
→ 指定 job 原子 claim 並定期續租
→ 生成 Brief、標題、Tag 與 draft Markdown
→ Automated QA
→ 未通過時帶 QA 回饋重寫，最多 2 次
→ passed: D1 completed，但文章仍維持 draft
→ failed: D1 blocked，保留輸出供重寫
```

正式指令：

```powershell
npm run editorial:d1:handoff -- APNS-419
npm run editorial:d1:handoff -- APNS-419 --qa-only
```

`--qa-only` 只允許重新檢查因 `EDITORIAL_QA_FAILED` 或 `EDITORIAL_GENERATION_FAILED` 而 blocked 的工作。它不會解除登入、權限或其他安全阻擋，也不會重新生成已人工／強模型修訂的正文。

## 正式 Writer 設定

Writer 使用 OpenAI Responses API 與嚴格 JSON Schema。模型、推理強度、輸出上限、QA 重寫上限與估算單價集中在 `config/editorial-model.json`，不寫死在流程程式中。預設使用 `gpt-5.4`，品質優先；`store` 固定為 `false`。

本機執行前，在目前 PowerShell 工作階段安全設定金鑰：

```powershell
$env:OPENAI_API_KEY = "你的金鑰"
npm run editorial:d1:handoff -- <MOVIE-ID>
```

金鑰只來自環境變數，不得寫入 repo、Source Record、D1 工作或 log。若沒有金鑰，handoff 會在讀寫 D1 佇列前以 `EDITORIAL_PROVIDER_NOT_CONFIGURED` 停止。

每次模型呼叫的模型名、token 數、價格基準日與估算 USD 記在 `data/editorial-usage/<MOVIE-ID>.json`。QA 重寫會新增一筆 call 並更新 totals；該檔案不含提示詞、模型全文、API response id 或金鑰。

API 暫時性錯誤與內容重寫分開計數：可重試的 HTTP／網路錯誤依 `api_retry_count` 短暫重送；內容未達 QA 門檻則依 `qa_rewrite_limit` 重寫。兩者皆有明確上限。

## APNS-419 canary

本機 7B 視覺模型第一次輸出未在顯示標題使用足夠來源訊號，生成階段即被拒絕。第二次加入確定性標題修復後產生草稿，但 Automated QA 發現缺少方法揭露、重複句與空泛證據，再次 blocked。

較強編輯層依相同 Source Record 與 24 個影片窗口重寫後通過：7 段、7 條證據、15 個不同窗口、0 組重複句。D1 同一 Editorial job 最終以 attempt 3 completed；文章仍是 draft，未進入圖片、影片或發布階段。

## 模型責任

- `qwen2.5vl:7b`：只負責本機視覺 Evidence，不能作為無人值守的最終中文 Writer。
- 最終 Writer：使用 `gpt-5.4`，遵守 JSON Schema、Title Signals 與 Evidence refs。
- QA：任何門檻不通過都保留 draft 並 blocked，不得降低標準換取通過。
- 正式批量自動化前，需配置強文字模型 API 並以至少 10 部不同系列做品質 canary。
