# CC18 v1 唯讀映射模擬報告

> 報告日期：2026-08-29（Asia/Taipei）
>
> 性質：唯讀盤點與映射模擬；不是資料遷移、不是實作結果
>
> 規格基準：`architecture/cc18-content-data-model-v1-draft.md` 的 `v1 Minimum Implementation Profile`
> 決策狀態：四項映射語意已定案；資料模型為 `approved-v1`／`1.2.0`

## 1. Executive Summary

本次以現有 24 份 `content/reviews/*.md` 為內容母體，在記憶體中模擬建立 Movie Master v1 投影，並交叉讀取 Source Record、Search Content、Editorial Brief、QA、Media Manifest、Registry、Taxonomy 與 Cloudflare D1 的唯讀查詢結果。沒有寫回任何作品資料、D1、Registry、Taxonomy 或網站程式。

主要結論：

- 24 部作品都可產生 `cc18:{normalized_catalog_code}`，目前樣本沒有番號缺失、正規化後撞號或來源 URL 重複。
- 15 部已發布作品全部具備第一版基本作品卡的必要資料，且正式頁面唯讀檢查均回傳 HTTP 200。
- 9 部草稿在資料層也都具備基本卡核心欄位；它們不符合「可上線卡片」只因尚未發布、沒有正式 canonical URL。排除 Demo 後，8/8 部正式草稿皆可進入後續發布前驗證。
- 23 部正式作品都有 Source Record；`CC18-DEMO-001` 是唯一沒有 Source Record 的示範資料。
- 證據等級分布為 `UNKNOWN` 1、`PUBLIC_METADATA` 22、`DISTRIBUTED_SAMPLE` 1、`PROMO_CLIP` 0、`FULL_WATCH` 0。唯一可升到 `DISTRIBUTED_SAMPLE` 的作品是 `HUNTC-568`。
- 目前 22 篇 `PUBLIC_METADATA` 文章都應明示其文章級證據範圍；其中 20 篇有較高的「文字具體程度超過可驗證來源範圍」風險，另 2 篇屬觀察名單。這是發布 QA 風險，不代表已證明內容錯誤。
- Taxonomy 的 53 個英文 ID 沒有 ID 重複、無效 target 或 alias 衝突，可作為 v1 stable tag ID 基礎；但 19 個實際使用的來源標籤尚未映射，且 `tag-candidates.json` 有 36 個已映射仍留在候選表的項目與 10 個 occurrence 統計不一致。
- 標題欄位、草稿 `publishedAt`、`content_hash` 與 Topic／Editorial channel 四項語意已完成定案；D1/Registry/線上發布狀態差異仍由未來 reconciliation report 保留，不阻擋建立 Movie Master v1。

## 2. Mapping Scope

### 2.1 納入範圍

內容層共 24 部：

`APNS-419`、`CC18-DEMO-001`、`CMJU-008`、`DSOD-006`、`ENDS-322`、`FTKD-041`、`GAREA-627`、`HUNTC-568`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`PRIAN-058`、`SDAB-358`、`SDMM-238`、`SDNM-560`、`SIRO-5722`、`SNOS-345`、`SNOS-360`、`SNOS-369`、`SNOS-371`、`SNOS-409`、`START-621`、`TPNS-037`。

| 分類 | 數量 | 判定依據 |
| --- | ---: | --- |
| 內容作品總數 | 24 | `content/reviews/*.md` |
| 正式非 Demo 作品 | 23 | 排除 `CC18-DEMO-001` |
| 已發布 | 15 | Registry 與現有內容狀態交叉檢查 |
| 草稿 | 9 | 現有內容狀態；含 Demo 1 部 |
| 正式草稿 | 8 | 草稿排除 Demo |
| 示範資料 | 1 | `CC18-DEMO-001` |

### 2.2 實際讀取資料層

- 文章：`content/reviews/*.md`
- 原始來源：`data/source-records/*.json`
- 編輯整理：`data/editorial-briefs/*.json`
- 搜尋／證據投影：`data/search-content/*.json`
- 品質檢查：`data/review-quality/*.json`
- 媒體紀錄：`data/media-manifests/*.json`
- 相容狀態快照：`data/movie-registry.json`
- 標籤：`data/taxonomy.json`、`data/tag-candidates.json`
- 營運狀態：Cloudflare D1 `cc18-db`，僅執行 SELECT；工具回報 `changes=0`、`rows_written=0`、`changed_db=false`
- 線上可達性：15 個現有作品 URL 僅做 HEAD/狀態碼檢查

### 2.3 排除與限制

- 未抓取新資料、未呼叫外部 AI、未產生圖片或影片。
- 未把 D1 queue/job 狀態寫進 Movie Master。
- 未建立永久 Movie Master 檔案、實體 UUID、Claim link 或資料遷移腳本。
- 未修改任何既有作品、資料、頁面、設定與部署。
- 來源快照目前不存在，因此無法重播當時頁面，只能以 Source Record 與現有參照交叉驗證。

## 3. Existing Layers and Authority

依 Minimum Profile，本次使用以下權責分工；有衝突時不靜默覆蓋，而是列入衝突報告。

| 資料層 | 本次用途 | 權威範圍 | 不應被誤用為 |
| --- | --- | --- | --- |
| Source Record | 來源事實 | CC18.tv 已抓取的標題、日期、來源 URL、簡介、原始實體字串與來源標籤 | 發布狀態、人工核准狀態 |
| Markdown | 讀者可見正文 | 站內標題、短評、正文與讀者可見欄位 | 原始來源事實的唯一權威 |
| Search Content | 搜尋／分析投影 | 標準化查詢欄位、現有證據摘要 | 自動證明文章已觀看全片 |
| Editorial Brief | 編輯工作輸入 | 編輯角度、摘要、生成上下文 | 原始來源快照 |
| QA | 品質結果 | 既有 QA 判定與命中紀錄 | 來源事實或發布真相 |
| Media Manifest | 媒體資產紀錄 | 生成 Hero、直式圖、Remotion 宣傳片 | 原片或觀看證據 |
| D1 | 發現、佇列、Job、重試與營運狀態 | 執行期狀態 | 標準化內容主資料 |
| Registry | 相容快照 | 現有發布／媒體狀態的相容讀取 | 未來唯一內容權威 |
| Taxonomy | 站內標準標籤 | canonical tag ID 與來源標籤映射 | 文章自由觀點標籤的所有權 |

投影衝突優先序：來源事實先採 Source Record；讀者正文採 Markdown；媒體採 Media Manifest；營運狀態採 D1；已發布快照暫以 Registry 並配合線上 URL 驗證。任何層級不一致均保留，不以較晚檔案自動覆蓋。

## 4. V1 Field Coverage

下表以 24 部作品為分母。`0` 不代表必須補齊，只代表目前無可靠值。

| v1 投影欄位 | 存在數／24 | 取得率 | 主要來源 | 備註 |
| --- | ---: | ---: | --- | --- |
| `schema_version` | 24 | 100% | 模擬常數 | 僅投影，不寫檔 |
| `stable_movie_id` | 24 | 100% | 番號規則推導 | 無撞號 |
| `slug` | 24 | 100% | Markdown 檔名／番號推導 | 均可重現 |
| `catalog_code` | 24 | 100% | Source Record／Markdown | Demo 由 Markdown 提供 |
| `source_title` | 24 | 100% | Source Record | Demo 使用現有示範標題 |
| `release_date` | 24 | 100% | Source Record／Markdown | 23 部僅有序列化格式差異 |
| `source_url` | 24 | 100% | Source Record／Markdown | Demo 指向首頁 |
| `source_site_movie_id` | 23 | 95.8% | Source Record | Demo 缺少 |
| `public_description` | 23 | 95.8% | Source Record | Demo 缺少 |
| `source_cover` | 24 | 100% | Source Record／Markdown | Demo 為通用示範圖 |
| `raw_performer_names` | 17 | 70.8% | Source Record | 7 部無值 |
| `raw_studio_name` | 21 | 87.5% | Source Record | 3 部無值 |
| `raw_series_names` | 9 | 37.5% | Source Record | 15 部無值 |
| `source_tags` | 24 | 100% | Source Record／Markdown | 保留原字串 |
| `source_record_ref` | 23 | 95.8% | 檔案路徑 | Demo 無 Source Record |
| `source_snapshot_ref` | 0 | 0% | — | 現況沒有快照 |
| `source_fetched_at` | 23 | 95.8% | Source Record | Demo 無值 |
| `source_verified_at` | 0 | 0% | — | 尚未保存 |
| `source_parser_version` | 0 | 0% | — | 尚未保存 |
| `translated_title_zh_tw` | 0 | 0% | — | 不以舊 `title` 自動假定 |
| `display_short_title` | 0 | 0% | — | 不以舊 `title` 自動假定 |
| `article_title` | 24 | 100% | 舊 Markdown `title` | 文章主標題；不是短標題 |
| `quality_codes` | 23 | 95.8% | 既有搜尋／來源資料 | Demo 缺少 |
| `duration_seconds` | 1 | 4.2% | 影片分析紀錄 | 僅 `HUNTC-568` |
| `canonical_topic_tag_ids` | 23 | 95.8% | `source_tags` 經 taxonomy 映射 | Demo 未形成正式 canonical topic |
| `one_line_summary` | 24 | 100% | Markdown／Editorial | 屬編輯摘要，不是來源事實 |
| `article_ref` | 24 | 100% | Markdown 路徑 | — |
| `article_evidence_level` | 24 | 100% | 保守推導 | 22 public、1 sample、1 unknown |
| `article_evidence_scope` | 24 | 100% | 模擬規則 | 需在正式模型保存 |
| `remotion_promo_ref` | 15 | 62.5% | Media Manifest／Markdown | 不屬觀看證據 |
| `evidence_records` | 1 | 4.2% | Search Content＋Brief＋QA | 僅 `HUNTC-568` |
| `is_published` | 24 | 100% | Registry／內容狀態／線上驗證 | 15 true、9 false |
| `published_at` | 15 | 62.5% | 發布狀態投影 | 草稿的舊 `publishedAt` 不採用 |
| `canonical_url` | 15 | 62.5% | 發布路由 | 僅已發布作品 |
| `indexability` | 24 | 100% | 發布狀態推導 | 草稿不可索引 |
| `content_hash` | 24 | 100% | 模擬曾使用整份 Markdown SHA-256 | 正式規格已改為主要讀者可見內容的 canonical serialization |

缺值作品明細：

- performer：`ENDS-322`、`GAREA-627`、`HUNTC-568`、`MCSR-639`、`SDMM-238`、`SIRO-5722`、`TPNS-037`。
- studio：`CC18-DEMO-001`、`ENDS-322`、`SIRO-5722`。
- series：`DSOD-006`、`ENDS-322`、`FTKD-041`、`GAREA-627`、`MVG-171`、`PRIAN-054`、`PRIAN-058`、`SDAB-358`、`SDNM-560`、`SNOS-345`、`SNOS-360`、`SNOS-369`、`SNOS-371`、`SNOS-409`、`TPNS-037`。

這些都是基本卡的選填欄位；依規格應直接隱藏，不應以 AI 猜測補滿。

## 5. Stable Movie ID Simulation

### 5.1 規則

模擬規則為：

```text
stable_movie_id = "cc18:" + normalized_catalog_code
normalized_catalog_code = NFKC → trim → uppercase → 保留現有連字號
```

### 5.2 結果

| 檢查 | 結果 |
| --- | --- |
| 可產生 stable ID | 24/24 |
| 缺番號 | 0 |
| 正規化後撞號 | 0 |
| 同番號不同來源 URL | 0 |
| 重複來源 URL | 0 |
| 因正規化而改變番號字面 | 0 |

23 部正式作品可直接使用此規則。Demo 會得到 `cc18:CC18-DEMO-001`；它應保留示範身分，不能混入正式作品統計或對外選片結果。

### 5.3 D1 對照

D1 在 23 部正式內容中可找到 22 部；`SNOS-360` 不在目前 D1 inventory。Demo 不在 D1，符合預期。這不影響 stable ID，但證明 D1 不能反向作為「所有已存在內容」的唯一清單。

## 6. Title Fallback Simulation

Minimum Profile 的顯示標題順序：

1. `display_short_title`
2. `translated_title_zh_tw`
3. `article_title`
4. `source_title`
5. `catalog_code`

決策已定案：舊 Markdown `title` 映射為 `article_title`，不得直接映射或重新命名為 `display_short_title`。`article_title` 是文章主標題，不保證符合卡片短標題長度；只有它可用時可暫作卡片顯示，但前台應限制行數。

| 實際命中的 fallback 層 | 數量 |
| --- | ---: |
| `display_short_title` | 0 |
| `translated_title_zh_tw` | 0 |
| `article_title` | 24 |
| `source_title` | 0 |
| `catalog_code` | 0 |

因此，依核准規格重跑投影時，24 部基本卡都會先使用 `article_title`；未來另有經編輯的 `display_short_title` 時才覆蓋卡片顯示，資料層不改變文章主標題的語意。

## 7. Basic Card Eligibility

第一版基本卡必要條件：stable movie ID、slug、catalog code、來源封面或明確通用占位圖、顯示標題、`is_published`、canonical URL。

| 群組 | 結構資料合格 | 可對外顯示 | 阻擋原因 |
| --- | ---: | ---: | --- |
| 已發布 15 部 | 15/15 | 15/15 | 無 |
| 草稿 9 部 | 9/9 | 0/9 | `is_published=false`、無 canonical URL |
| 正式草稿 8 部 | 8/8 | 0/8 | 同上；不是資料缺失 |
| 全部正式作品 23 部 | 23/23 | 15/23 | 8 部仍為草稿 |

15 部線上作品頁均回傳 HTTP 200：

`DSOD-006`、`ENDS-322`、`GAREA-627`、`HUNTC-568`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`SDAB-358`、`SIRO-5722`、`SNOS-345`、`SNOS-360`、`SNOS-369`、`SNOS-371`、`SNOS-409`。

草稿為：

`APNS-419`、`CC18-DEMO-001`、`CMJU-008`、`FTKD-041`、`PRIAN-058`、`SDMM-238`、`SDNM-560`、`START-621`、`TPNS-037`。

卡片縮減規則可直接沿用 Minimum Profile：performer、studio、series、duration、quality、canonical tags、摘要或 Remotion 片缺值時隱藏，不顯示「待補」，也不阻擋基本卡。

## 8. Evidence Classification

### 8.1 分布

| Evidence level | 數量 | 作品 |
| --- | ---: | --- |
| `UNKNOWN` | 1 | `CC18-DEMO-001` |
| `PUBLIC_METADATA` | 22 | 除 Demo 與 HUNTC-568 外的全部作品 |
| `PROMO_CLIP` | 0 | — |
| `DISTRIBUTED_SAMPLE` | 1 | `HUNTC-568` |
| `FULL_WATCH` | 0 | — |

22 部 `PUBLIC_METADATA`：

`APNS-419`、`CMJU-008`、`DSOD-006`、`ENDS-322`、`FTKD-041`、`GAREA-627`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`PRIAN-058`、`SDAB-358`、`SDMM-238`、`SDNM-560`、`SIRO-5722`、`SNOS-345`、`SNOS-360`、`SNOS-369`、`SNOS-371`、`SNOS-409`、`START-621`、`TPNS-037`。

### 8.2 HUNTC-568

`HUNTC-568` 可判定為 `DISTRIBUTED_SAMPLE`，依據：

- `data/search-content/HUNTC-568.json` 保存不可逆來源識別、evidence job ID `afa054ce-8a33-4bdd-bb86-681a696d9374`、總長 9716.867 秒、24 個分散視窗與平均信心 0.9292。
- `data/editorial-briefs/HUNTC-568.json` 記錄 24 個視窗覆蓋 0 至 9716.867 秒，並有 observation refs。
- `data/review-quality/HUNTC-568.json`／automated QA 可追到 14 個不同影片視窗並通過既有檢查。

這些資料足以證明分散抽樣，不足以證明連續完整觀看，因此不得升級為 `FULL_WATCH`。

### 8.3 D1 狀態不能代替證據

D1 在本次 22 部對照作品中，`media_analysis=completed` 的內容 ID 為 `APNS-419`、`DSOD-006`、`SNOS-371`、`SNOS-409`、`TPNS-037`；但 Git 資料層沒有符合 v1 的可追溯影片證據紀錄。它們仍判定為 `PUBLIC_METADATA`。

反向案例是 `HUNTC-568`：Git 中有有效抽樣證據，但 D1 目前仍顯示 editorial/media analysis queued。這進一步證明營運 Job 狀態與內容 Evidence 必須分開。

### 8.4 明確排除

- 15 部 Remotion 9 秒宣傳片不構成 `PROMO_CLIP`。
- AI 生成 Hero／直式圖不構成任何觀看證據。
- 公開簡介即使描述劇情，仍只屬 `PUBLIC_METADATA`。
- 文章寫得具體不會自動提升 evidence level。

## 9. Editorial Tone Versus Evidence Risk

本次僅做詞彙與語境風險掃描，不判定文章真偽，也不修改正文。風險訊號包括：在僅有公開資料時，正文使用鏡頭、鏡位、剪輯、收音、表情、節奏、開場／中段／後段或「整部／全片」等容易被理解為實際觀看觀察的語句。

### 9.1 較高風險候選（20）

`APNS-419`、`CMJU-008`、`DSOD-006`、`ENDS-322`、`FTKD-041`、`GAREA-627`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`PRIAN-058`、`SDMM-238`、`SDNM-560`、`SIRO-5722`、`SNOS-345`、`SNOS-369`、`SNOS-371`、`SNOS-409`、`START-621`、`TPNS-037`。

代表性風險型態：

- `MVG-171` 使用近似「幾乎整部都在證明」的全片範圍語氣。
- `PRIAN-058` 對鏡頭行為作直接陳述，但目前只有公開資料證據。
- `GAREA-627` 對鏡位、剪輯與收音作具體判斷。
- `NAMH-074` 涉及從開始到結束的眼神／停頓描述。
- `SNOS-371` 涉及段落順序與節奏陳述。
- `START-621` 涉及開場、中段、後段的全片結構。

### 9.2 觀察名單（2）

`SDAB-358`、`SNOS-360` 也命中相關詞彙，但文字有「公開簡介／公開資料」的明確限定，現階段不應直接判定越界。

### 9.3 建議的 v1 表達規則

- `PUBLIC_METADATA` 文章可寫編輯解讀，但需把適用範圍保存為「依來源標題、簡介與標籤整理」。
- 對鏡頭、收音、剪輯或全片結構的確定陳述，若無 `PROMO_CLIP`／`DISTRIBUTED_SAMPLE` 證據，應在未來 QA 標為 evidence-scope review，而非直接當成來源事實。
- 本節清單只供後續唯讀抽查，不構成本次資料遷移或退稿決定。

## 10. Conflict and Inconsistency Report

### 10.1 Source Record 與 Markdown

- 23 部正式作品的 release date 在字面上不同：Source Record 是 `YYYY-MM-DD`，YAML 解析後成為 `YYYY-MM-DDT00:00:00.000Z`。日期正規化後語意衝突為 0，屬序列化差異。
- actors、studio、series、source URL、source tags、cover 在可比較的 23 部中沒有發現語意差異。
- `CC18-DEMO-001` 沒有 Source Record，是已知示範例外，不應用 Markdown 反向製造來源事實。

### 10.2 草稿的 `publishedAt`

9 部草稿 Markdown 都保存了 `publishedAt`：

| ID | 舊 `publishedAt` |
| --- | --- |
| APNS-419 | 2026-08-28 |
| CC18-DEMO-001 | 2026-08-25 |
| CMJU-008 | 2026-08-28 |
| FTKD-041 | 2026-08-28 |
| PRIAN-058 | 2026-08-28 |
| SDMM-238 | 2026-08-28 |
| SDNM-560 | 2026-08-28 |
| START-621 | 2026-08-28 |
| TPNS-037 | 2026-08-28 |

正式決策：`is_published=false` 時不把舊值映射為 Movie Master `published_at`。原值只保留為 `legacy_published_at`，並固定標記 `legacy_published_at_semantics=LEGACY_SEMANTICS_UNKNOWN`；不推測它是預定發布日、草稿建立日或曾發布日。正式 `published_at` 只有在已發布狀態及線上／發布證據成立時才產生。未來若需要排程日期，使用獨立 `scheduled_at`。

`legacy_published_at` 不進基本卡、排序、sitemap 或結構化資料。

### 10.3 Registry 覆蓋範圍

- Registry 有 19 部：15 已發布＋4 草稿。
- Registry 有 `published_at` 但仍是草稿的 4 部：`APNS-419`、`CC18-DEMO-001`、`CMJU-008`、`TPNS-037`。
- Registry 缺少 5 部本機草稿：`FTKD-041`、`PRIAN-058`、`SDMM-238`、`SDNM-560`、`START-621`。
- 因此 Registry 可保留為相容快照，但不能作為 24 部內容全集的唯一母體。

### 10.4 D1、Registry 與線上狀態

- D1 inventory 共 77 筆；分類為 eligible/partial 4、eligible/validated 51、late_arrival/partial 1、late_arrival/validated 17、upcoming/validated 4。
- D1 jobs：editorial completed 15／queued 30；image completed 13；media_analysis completed 6／queued 46／retry 3；publish completed 13；video completed 13。
- 內容層 23 部正式作品中，D1 有 22 部；`SNOS-360` 缺席。
- D1 `publish=completed` 有 13 部：`DSOD-006`、`ENDS-322`、`GAREA-627`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`SDAB-358`、`SIRO-5722`、`SNOS-345`、`SNOS-369`、`SNOS-371`、`SNOS-409`。
- 線上與 Registry 為 15 部。差異是 `HUNTC-568` 線上 200 但 D1 publish 無 completed；`SNOS-360` 線上 200 但完全不在 D1。

結論：Movie Master 只保留發布投影，D1 繼續管營運狀態；真正遷移時需產出 reconciliation report，不能讓任一層靜默覆蓋另一層。

### 10.5 QA 與媒體

- 13 部 QA 紀錄為 approved，但 score 欄位為 null：`DSOD-006`、`ENDS-322`、`GAREA-627`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`SDAB-358`、`SIRO-5722`、`SNOS-345`、`SNOS-369`、`SNOS-371`、`SNOS-409`。
- `HUNTC-568`、`SNOS-360` 有分數化 QA。QA 分數不屬基本卡 v1，故不阻擋映射，但現行 QA 結構需在後續流程規格統一。
- 15 部有 Hero／影片的正式已發布作品均有 Media Manifest。
- Demo 的 `/images/demo-hero.svg` 沒有 Media Manifest；它是明確示範／占位資產，不視為正式作品媒體缺漏。

## 11. Entity Candidate Report

本次只產生候選與正規化結果，不建立 UUID、不合併實體。

### 11.1 正規化規則

僅使用低風險規則：NFKC、trim、空白折疊、比對時 case-fold。沒有刪除標點、翻譯、羅馬字轉換或跨語言推測。

### 11.2 演員

- 原始不同名稱：20（含 Demo）；正式來源名稱 19。
- 作品－演員連結：21。
- `糸井瑠花` 對應 2 部；其餘已取得名稱在目前樣本各 1 部。
- 正規化後不同名稱仍為 20，沒有可由機械規則安全合併的群組。

### 11.3 片商

正式資料有 13 個不同原始字串，正規化後仍為 13：

`オーロラプロジェクト・アネックス`、`チン負け女優/妄想族`、`ダスッ!`、`FALENO TUBE`、`mercury(マーキュリー)`、`Hunter`、`ビッグモーカル`、`gloryquest`、`なまなま`、`アースダイバー`、`SOD`、`S1 Style`、`全日本カメコ協同組合/妄想族`。

其中 `S1 Style` 5 部、`SOD` 4 部、`アースダイバー` 2 部；其餘各 1 部。

### 11.4 系列

共有 9 個不同原始系列字串，正規化後仍為 9：

`露出願望に憑りつかれた○○`、`流程測試 Demo`、`最強の雄。デカチンイケメンに快楽堕ち`、`同期女子と相部屋に!`、`性感覚醒!人妻エステ`、`至高の膣内射精`、`マジックミラー号`、`【初撮り】ネットでAV応募→AV体験撮影`、`いいなり温泉旅行`。

### 11.5 合併分級

| 分級 | 本次結果 | 規則 |
| --- | --- | --- |
| 可自動合併 | 0 組 | 只有不同原字串經低風險正規化後完全相同才可 |
| 需人工確認 | 所有未來跨日文／中文、品牌縮寫、異體與疑似錯字候選 | 必須有來源參照或人工確認 |
| 不應合併 | 目前所有彼此不同且無證據支持的候選 | 名稱相似不構成同一實體 |

目前資料不足以可靠提出特定跨語言等價對；不應為了減少頁面數而先合併。

## 12. Taxonomy Report

### 12.1 結構健康度

| 指標 | 結果 |
| --- | ---: |
| canonical tag ID | 53 |
| 重複 ID | 0 |
| 無效 source-map target | 0 |
| alias 衝突 | 0 |
| 同一來源詞映射多個 target | 0 |
| 有意義的多來源詞歸一 ID | 5 組 |

5 組多對一映射：

- `married-woman`：人妻、人妻・主婦
- `facial`：顏射、噴精
- `group-sex`：3p・4p、亂交
- `hd`：720p、HD
- `exclusive-release`：独占配信、獨家限定

結論：現有英文 ID 在 v1 可繼續作 stable tag ID，無需本次改名或改 UUID。

### 12.2 未映射且實際使用的來源標籤（19）

`m女`、`マッサージ・リフレ`、`來源示範`、`傲嬌`、`制服`、`和服、浴衣`、`大屌`、`子宮頸`、`寝取り・寝取られ・ntr`、`惡作劇`、`泳裝`、`溫泉`、`空姐`、`紀錄片`、`美乳`、`羞恥`、`處男`、`電動按摩棒`、`鼻フック`。

這些應留在 `unmapped_tag_candidates`，不能因卡片需要 2～3 個標籤就自動猜測 canonical ID。`鼻フック` 的未來中文顯示名稱可另議；映射前仍保留來源原詞。

### 12.3 Candidate backlog 問題

- `data/tag-candidates.json` 有 51 個候選，其中 36 個已可由正式 source map 映射，屬過期／重複候選。
- 10 個候選的 `occurrences` 與 `source_ids` 數量不一致：`中出`、`學生妹`、`3p・4p`、`亂交`、`美少女`、`全高清(FHD)`、`獨家限定`、`配信専用`、`巨乳`、`自拍`。
- 以上問題不影響唯讀投影採正式 taxonomy，但在未來候選治理前不能把 occurrence 當可靠排序依據。

### 12.4 Topic 與 Editorial channel 邊界

10 部舊 Markdown 把 editorial ID 放入 `canonicalTagIds`：

- `story`：`CC18-DEMO-001`、`ENDS-322`、`GAREA-627`、`HUNTC-568`、`MCSR-639`、`NAMH-074`、`PRIAN-054`、`SDAB-358`、`SIRO-5722`
- `contrast-charm`：`HUNTC-568`、`SNOS-360`

正式決策：Movie Master 由 Source Record `source_tags` 經 `source_tag_map` 產生 canonical topic IDs，不直接信任舊 `canonicalTagIds`。`story` 保留為現有穩定 Topic ID，但只有來源標籤正式映射或未來核准的確定性題材規則可以產生；編輯或 AI 判斷「有故事感」只能留在 Editorial channel。`contrast-charm` 固定為 Editorial viewpoint，只能進入 `editorial_viewpoint_tag_ids`，不得成為 canonical topic、正式題材篩選頁或 AI 推導的來源題材。

## 13. Data Conservation Verification

### 13.1 輸入完整性

- 24/24 份 Markdown 都納入；沒有排除或解析失敗。
- 23/23 份正式 Source Record 都納入；Demo 無 Source Record 並明確標示未知。
- 24 個內容 SHA-256 均不同。
- 24 個 source URL 均不同。
- 原始來源標籤共 192 次出現；由正式 map 可產生 150 次 canonical topic tag 投影，未映射值仍保留，不丟棄。
- performer 關聯 21、series 關聯 9、Remotion ref 15 均保留於模擬統計。

### 13.2 Markdown 欄位去向

24 份 frontmatter 共出現 26 種 key，全部被分類，沒有未辨識欄位。

直接映射：

`id`、`sourceTitle`、`actress`、`releaseDate`、`publishedAt`、`studio`、`series`、`sourceUrl`、`sourceSite`、`coverUrl`、`videoUrl`、`shortReview`、`sourceTags`、`canonicalTagIds`、`status`。

保留為 legacy／供衝突報告使用：

`title`、`seoTitle`、`socialTitle`、`titleSignals`、`titleVersion`、`heroUrl`、`editorialAngle`、`editorialTagIds`、`videoStatus`、`imageStatus`、`featured`。

其中「直接映射」不代表無條件採值；例如草稿 `publishedAt` 會被保留但不投影為正式 `published_at`，舊 `canonicalTagIds` 會先依 channel 重建。

### 13.3 Source Record 欄位去向

23 份 Source Record 共 14 種 key，全部被分類。

直接映射：

`id`、`title`、`translated_title_zh_tw`、`release_date`、`actress`、`studio`、`series`、`source_tags`、`description`、`cover_source_url`、`source_url`、`source_site`、`fetched_at`。

保留為 legacy：`original_title_ja`。本次不自行判定它和 `title`、`source_title` 的語意差異。

### 13.4 非破壞性驗證

- 稽核前後比對既有 36 個未追蹤檔案：SHA-256、檔案長度與 `LastWriteTimeUtc` 全部一致。這 36 個包含資料模型草案與原有 35 個草稿相關檔案。
- tracked worktree 在報告建立前沒有 diff。
- 暫存稽核程式與 JSON 位於工作區外，已刪除並確認不存在。
- 唯讀 D1 查詢回報沒有寫入或資料庫變更。

## 14. Existing Fields Not Entering Movie Master v1

以下資訊仍有營運價值，但依 Minimum Profile 不應複製進 Movie Master v1：

| 現有資訊 | 保留位置 | v1 處理 |
| --- | --- | --- |
| retry count、lease、queue state、job state | D1 | 不進 Movie Master |
| detailed approval workflow | D1／QA | 不進 Movie Master |
| rewrite attempts | D1／QA | 不進 Movie Master |
| 完整 media completion workflow | D1／Media Manifest | Movie Master 只保留必要媒體 ref |
| `videoStatus`、`imageStatus` | Registry／Markdown legacy | 不作內容主資料權威 |
| `featured` | Markdown legacy | 暫不映射；屬前台策展決策 |
| `seoTitle`、`socialTitle`、`titleSignals`、`titleVersion` | Markdown legacy | 保留，不自動塞入 v1 title 欄位 |
| `editorialAngle`、`editorialTagIds` | Markdown／Editorial Brief | 保留編輯層，不當來源事實 |
| QA 分數與逐項命中 | QA | 基本卡不使用；不製造總分 |
| 逐句 Claim ID／ClaimEvidenceLink | 尚未存在 | Deferred |
| 永久 performer/studio/series UUID | 尚未存在 | 先輸出 candidates，不建立 |

## 15. Minimum Profile Decisions After Review

四項映射語意已定案並寫入 `architecture/cc18-content-data-model-v1-draft.md` 版本 `1.2.0`：

1. **標題。** 舊 `title` 映射為 `article_title`，不映射為 `display_short_title`；卡片 fallback 為短標題、繁中翻譯、文章主標題、來源標題、番號。
2. **草稿 `publishedAt`。** `is_published=false` 時只保存 `legacy_published_at` 與固定的 `LEGACY_SEMANTICS_UNKNOWN`，不產生正式 `published_at`。
3. **`content_hash`。** 正式輸入只包括 `article_title`、`seoTitle`、`shortReview` 與 Markdown 正文，依核准 canonical serialization 規則正規化後計算；本報告模擬時使用的整檔 hash 只作當時守恆比對。
4. **Topic／Editorial channel。** canonical topic 必須由來源標籤正式映射產生；`story` 是有來源門檻的 Topic ID，`contrast-charm` 是 Editorial viewpoint。

其他仍有效的實作約束：

- 日期比對前統一到 `YYYY-MM-DD`，避免 YAML Date 物件造成假衝突。
- Evidence 不能由 D1 job 完成狀態推導；只有具備可追溯 evidence record 才能升級。
- Registry、D1 與線上頁面差異需由 reconciliation report 保留，不得互相靜默覆蓋。
- `CC18-DEMO-001` 應有明確排除旗標，不進正式卡片、SEO 或作品總數。
- `source_snapshot_ref`、`source_verified_at`、`source_parser_version` 等追溯缺口允許 `null`，不得猜測回填。
- 文章級 evidence scope 是 v1 必需；後續以局部 `EVIDENCE_SCOPE_REVIEW` 處理具體觀看式語句，不等於整篇退稿，也不建立逐句 Claim link。此 QA 工作不阻擋 Movie Master。

## 16. Recommended Next Minimum Step

四項語意已定案，唯讀映射報告也已完成審查；不再建立另一份 golden report。下一步可以依 `approved-v1`／`1.2.0` 規格建立正式 Movie Master v1。

正式建立時仍不得自行加入 Deferred 欄位、逐句 Claim links 或永久實體 UUID，也不得把 D1 queue/job 狀態複製成內容主資料。文章 `EVIDENCE_SCOPE_REVIEW` 是獨立後續 QA 工作，不阻擋 Movie Master；本報告列出的 20 篇風險文章本次不修改。

---

### 本次主要檢查路徑

- `architecture/cc18-content-data-model-v1-draft.md`
- `content/reviews/*.md`
- `data/source-records/*.json`
- `data/editorial-briefs/*.json`
- `data/search-content/*.json`
- `data/review-quality/*.json`
- `data/media-manifests/*.json`
- `data/movie-registry.json`
- `data/taxonomy.json`
- `data/tag-candidates.json`
- Cloudflare D1：`cc18-db`（SELECT-only）
