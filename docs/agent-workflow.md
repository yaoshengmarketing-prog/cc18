# 多角色內容生產流程

這套流程把責任拆成六個角色，但不代表需要六個常駐 AI Agent。角色是可測試的責任邊界；確定性的抓取、佇列、驗證、提交與部署仍由程式執行。完整機器設定位於 `config/agent-roles.json`。

## 角色與執行方式

| 角色 | 執行者 | 責任 |
|---|---|---|
| Scout | 程式 | 發現新作、讀取作品頁實際日期與來源資料、去重入列 |
| Tag Curator | 規則優先、AI 輔助 | 保留來源 Tag、映射本站標準 Tag、提出未知詞與影評 Tag 候選 |
| Editor | AI + 安全輸入組裝程式 | 寫標題、題材摘要、搜尋內容與影評 |
| Critic / QA | 規則檢查 + 獨立 AI 評審 | 驗證作品身分、差異性、搜尋價值、內容品質與選片價值 |
| Media Producer | 程式編排 + 圖片供應商 | 產生非露骨圖片、Remotion MP4、上傳 R2 並回讀驗證 |
| Publisher | 程式 | 更新 Registry、精確提交作品檔案、部署並驗證正式 release |

Editor 與 Critic 必須分離。Editor 不得自行通過品質門檻；Critic 也不能直接改來源事實。若需要改稿，Critic 只輸出結構化問題與重寫要求，再交回 Editor，最多自動重寫兩次。

## 資料流與 source of truth

```text
CC18 作品頁
  → Source Record（來源身分與原始 Tag）
  → Tag Decision（canonical 映射、editorial 候選）
  → Review Draft（原創內容）
  → Quality Report / Approved Review
  → Media Manifest（R2 物件、hash、影片狀態）
  → Publication Receipt（commit、release、正式 URL）
```

- D1 是工作、lease、重試和階段狀態的唯一真相。
- Source Record 是番號、演員、日期、來源網址與原始 Tag 的唯一真相。
- Canonical Taxonomy 定義本站標準 Tag；AI 不能直接新增或改名。
- `data/movie-registry.json` 是已發布作品的營運索引，不用來覆蓋來源紀錄。
- Media Manifest 是 R2 路徑與資產驗證狀態的唯一真相。
- GitHub `main` 保存網站內容；Cloudflare release 表示實際部署狀態。Publisher 只有在精確 release 驗證完成後才能將 D1 標成 completed。

## JSON 交接契約

角色之間傳遞的是資料參照，不把整篇內容、密鑰或二進位檔塞入訊息。共同 envelope 至少包含：

```json
{
  "contract_version": 1,
  "handoff_id": "GAREA-627:editor:critic_qa:1",
  "work_id": "GAREA-627",
  "from_role": "editor",
  "to_role": "critic_qa",
  "input_refs": [
    "source_record:GAREA-627",
    "tag_decision:GAREA-627:v1"
  ],
  "output_ref": "review_draft:GAREA-627:v1",
  "status": "ready",
  "attempt": 1,
  "created_at": "2026-08-28T00:00:00.000Z"
}
```

`handoff_id` 同時是 idempotency key。相同版本重送不得建立第二篇文章或第二個發布工作。實際資料必須先寫入相對應的 source of truth，再送出 reference；接收端必須驗證 `work_id`、schema version、前置狀態與 checksum（若該資料類型有 checksum）。

## Tag Curator 的自動化界線

Tag Curator 不需要每天等人判斷：

1. CC18 原始 Tag 永遠完整寫入 Source Record。
2. 已存在 alias 規則的詞，由程式直接映射 canonical Tag。
3. 未知詞保留為來源 Tag，並加入候選佇列，不阻塞文章。
4. AI 可以建議候選類別、別名與 editorial Tag，但不能修改 taxonomy。
5. 候選達到晉升門檻後，由另一個受控的 taxonomy maintenance 流程處理；canary 期間不自動改正式詞庫。

因此新詞出現時，作品仍能發布；只有涉及人物身分衝突、法律或高風險歧義，才升級人工。

## 失敗隔離與重試

- 每部作品以 `work_id` 隔離；某部失敗不取消其他作品。
- 每階段最多五次嘗試，延遲依 15、30、120、360 分鐘遞增。
- QA 失敗最多自動重寫兩次；之後標記 blocked 並保留所有報告。
- 圖片或影片失敗時只把該階段設為 retry。若文章與替代素材符合發布政策，文章可以先發布，影片之後補齊。
- lease 過期由修復程序轉回 retry，不重複建立工作。
- Publisher 發現 dirty worktree、commit 範圍異常或 Cloudflare release 不符時立即停止該作品，不把不確定狀態標成 completed。

人工只處理無法由既有規則安全決定的例外：來源身分衝突、到達最大重試次數、供應商權限或帳務中斷、Git 衝突、部署版本不一致，以及 canary 失敗率超標。一般新 Tag、單一媒體 retry 或低頻候選不需要人工介入。

## 正式排程邊界

目前只允許手動 canary；`config/pipeline.json` 的 `publishing.daily_enabled` 與本設定的 production schedule 都必須保持 `false`。完成 `docs/content-canary.md` 的觀察期與 promotion gate，不代表自動開啟 schedule；是否開啟仍是獨立的發布決策。
