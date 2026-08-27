# D1 Editorial 接棒

## Creative-first source-only 路徑

自 v0.17 起，Discovery 會為 eligible 作品同時建立 `editorial` 與 `media_analysis` 工作，兩者互不等待：

```text
SourceRecord → local Ollama Creative Brief → external Writer → QA → draft
          ↘ optional Media Analysis → later enriched rewrite
```

本機 Creative Brief 可讀取完整來源標題、簡介與 Tag，但外部 Writer 只接收非露骨的整理結果。執行單件使用 `npm run editorial:d1:source-only -- MOVIE-ID`；批次 `editorial:source-cycle` 必須另外設定 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES`。兩者都只產生 draft。

Editorial 採「預設開放」：來源資料層要精確，創作表達層不設禁詞。即使沒有影片抽樣，Writer 仍可用主觀影評語氣推演鏡位、聲音氛圍、剪輯節奏、表情、演技、互動與場景銜接。QA 不因這些評論性內容阻擋文章；它只阻止來源身分串錯、標題失去作品特徵、Tag／Registry 被創作內容污染、輸出結構損壞或發布流程出錯。

Editorial job 通過 QA 後會以唯一 `{movie_id}:image:v1` 建立圖片工作。圖片 Worker 必須先讀取供應商即時模型能力，生成橫式與直式素材；兩個物件都上傳 R2 並下載回來通過 SHA-256 驗證後，才可寫入 Media Manifest、更新 `imageStatus=rendered` 並建立 video job。暫時失敗使用 retry，不回滾已完成文章。

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

Writer 使用 AItokenKing 的 OpenAI Responses 相容 API 與嚴格 JSON Schema。模型、Base URL、金鑰變數名、主機 allowlist、推理強度、輸出上限、QA 重寫上限與估算單價集中在 `config/editorial-model.json`，不寫死在流程程式中。預設使用 `gpt-5.4`，品質優先；`store` 固定為 `false`。

本機金鑰只放在已由 `.gitignore` 排除的 `.dev.vars`：

```dotenv
AITOKENKING_API_KEY=你的金鑰
```

連線驗證與正式接棒：

```powershell
npm run editorial:provider:smoke
npm run editorial:d1:handoff -- <MOVIE-ID>
```

金鑰只由本機秘密檔或環境變數載入，不得寫入 repo、Source Record、D1 工作或 log。若沒有金鑰，handoff 會在讀寫 D1 佇列前以 `EDITORIAL_PROVIDER_NOT_CONFIGURED` 停止。

每次模型呼叫的模型名、token 數、價格基準日、AItokenKing 積分／Pay-as-you-go 現金估算與 OpenAI 直連參考成本記在 `data/editorial-usage/<MOVIE-ID>.json`。QA 重寫會新增一筆 call 並更新 totals；該檔案不含提示詞、模型全文、API response id 或金鑰。

2026-08-26 smoke test 已確認 `gpt-5.4`、Responses 與 strict JSON Schema 可用：40 input、9 output、共 49 tokens；AItokenKing 估算 0.000403 積分，OpenAI 直連參考約 US$0.000235。價格比較只用於成本透明，不自動切換供應商。

API 暫時性錯誤與內容重寫分開計數：可重試的 HTTP／網路錯誤依 `api_retry_count` 短暫重送；內容未達 QA 門檻則依 `qa_rewrite_limit` 重寫。兩者皆有明確上限。

## APNS-419 canary

本機 7B 視覺模型第一次輸出未在顯示標題使用足夠來源訊號，生成階段即被拒絕。第二次加入確定性標題修復後產生草稿，但 Automated QA 發現缺少方法揭露、重複句與空泛證據，再次 blocked。

較強編輯層依相同 Source Record 與 24 個影片窗口重寫後通過：7 段、7 條證據、15 個不同窗口、0 組重複句。D1 同一 Editorial job 最終以 attempt 3 completed；文章仍是 draft，未進入圖片、影片或發布階段。

## 模型責任

- `qwen2.5vl:7b`：只負責本機視覺 Evidence，不能作為無人值守的最終中文 Writer。
- 最終 Writer：使用 `gpt-5.4`，遵守 JSON Schema、Title Signals 與 Evidence refs。
- QA：任何門檻不通過都保留 draft 並 blocked，不得降低標準換取通過。
- 正式批量自動化前，需配置強文字模型 API 並以至少 10 部不同系列做品質 canary。
