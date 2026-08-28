# CC18 作品資料模型 v1 與證據分級規格

- 文件狀態：`approved-v1`
- 文件版本：`1.2.0`
- 建立日期：2026-08-28
- 最後更新：2026-08-29（核准標題、舊發布日期、內容 hash、標籤 channel 與 Evidence Scope QA 語意）
- 適用專案：`yaoshengmarketing-prog/cc18`
- 性質：目前核准的 v1 邏輯資料模型與遷移前規格；檔名暫時保留 `-draft`，不是現行資料格式變更

## 0. 文件目的與範圍

本文件定義 CC18 未來共用的作品主資料語意，使作品卡、搜尋、篩選、演員頁、片商頁、系列頁、題材頁、編輯內容與觀看證據可以引用同一份邏輯模型。

本版只建立設計草案，不代表已修改 D1、Registry、Markdown、Taxonomy、QA、頁面或發布流程，也不要求立即補齊既有作品資料。現有資料若無法可靠映射，必須保留 `null`、缺值原因或衝突紀錄，不得猜測。

### 0.1 名詞

- **作品主記錄（Movie Master）**：一部作品的永久邏輯記錄，以不可變 stable ID 識別。
- **欄位值（Field Value）**：作品主記錄中的一項值；值可以為 `null`。
- **來源紀錄（Provenance Record）**：說明欄位值從哪裡取得、如何產生、何時驗證。
- **觀看證據（Evidence Record）**：對官方預告、來源片段或原始影片進行實際分析後留下的可追溯紀錄。
- **Claim**：作品頁或影評中的一項可辨識判斷。長期可逐 Claim 追溯；v1 只要求文章級 evidence scope，以及四個觀看型欄位連到 Evidence Record。
- **基本作品卡**：只需可靠來源事實即可成立的卡片。
- **進階選片卡**：可以包含故事密度、節奏、呈現方式等編輯判斷，但必須符合本文件的證據門檻。

## v1 Minimum Implementation Profile

本文件後續章節保存的是 CC18 的**長期邏輯藍圖**，用來避免第一版資料結構封死未來的證據、實體與治理能力；它不等於目前必須全部實作的工作清單。

本章才是下一階段「24 部現有內容唯讀映射」與「第一版基本作品卡資料資格」唯一有效的最小實作範圍。任何沒有列入本章的欄位、關聯、稽核與治理機制，一律標示為 `DEFERRED`，不得因後文已有完整 Schema 就在下一階段自行建立、補值或遷移。

### Profile 標記

| 標記 | 意義 |
|---|---|
| `V1_REQUIRED` | 24部唯讀映射與第一版基本作品卡必須驗證或產生的最小資料 |
| `V1_OPTIONAL` | 有可靠現值時可以映射；沒有時維持 `null` 或空陣列，不得阻擋基本卡 |
| `DEFERRED` | 保留於長期藍圖，本階段不得實作、回填或建立治理資料 |

### A. Movie Master v1 最小結構

Git 中的 Movie Master 是標準化內容資料權威。v1 最小投影只要求下列結構；實際檔名與序列化格式需等唯讀映射報告確認，本階段不建立實體檔案。

```text
MovieMasterV1Minimum
  schema_version                         V1_REQUIRED
  stable_movie_id                        V1_REQUIRED
  slug                                   V1_REQUIRED
  source:
    catalog_code                         V1_REQUIRED
    source_title                         V1_REQUIRED（可為 null，但基本卡需 fallback）
    release_date                         V1_OPTIONAL
    source_url                           V1_REQUIRED
    source_site_movie_id                 V1_OPTIONAL
    public_description                   V1_OPTIONAL
    source_cover                         V1_REQUIRED（或明確通用占位圖）
    raw_performer_names[]                V1_OPTIONAL
    raw_studio_name                      V1_OPTIONAL
    raw_series_names[]                   V1_OPTIONAL
    source_tags[]                        V1_OPTIONAL
    source_record_ref                    V1_REQUIRED
    source_snapshot_ref                  V1_OPTIONAL
    source_fetched_at                    V1_REQUIRED（舊資料未知時為 null＋原因）
    source_verified_at                   V1_OPTIONAL
    source_parser_version                V1_OPTIONAL
  titles:
    article_title                         V1_REQUIRED when article_ref exists
    translated_title_zh_tw               V1_OPTIONAL
    display_short_title                  V1_OPTIONAL
  derived:
    quality_codes[]                      V1_OPTIONAL
    duration_seconds                     V1_OPTIONAL
    performer_entity_candidates[]        V1_OPTIONAL
    studio_entity_candidate              V1_OPTIONAL
    series_entity_candidates[]           V1_OPTIONAL
    canonical_topic_tag_ids[]            V1_OPTIONAL
  editorial:
    one_line_summary                     V1_OPTIONAL
    article_ref                          V1_OPTIONAL
    article_evidence_level               V1_REQUIRED when article_ref exists
    article_evidence_scope               V1_REQUIRED when article_ref exists
  media:
    remotion_promo_ref                   V1_OPTIONAL
  evidence:
    records[]                            V1_OPTIONAL
  publishing:
    is_published                         V1_REQUIRED
    published_at                         V1_OPTIONAL
    legacy_published_at                  V1_OPTIONAL when legacy value exists
    legacy_published_at_semantics        V1_REQUIRED when legacy_published_at exists
    canonical_url                        V1_REQUIRED when is_published=true
    indexability                         V1_REQUIRED
    content_hash                         V1_REQUIRED when article_ref exists
```

v1 選擇 `content_hash`，不選 `content_revision`。理由是目前 Markdown、Registry、D1 與線上狀態可能不同步；內容 hash 可以直接辨識 Movie Master 指向的主要讀者可見文章內容是否改變，不必先建立新的跨系統 revision 發號制度。hash 的正式輸入與 canonical serialization 規則見本章 J 節。

### B. v1 來源追溯簡化

下列普通、單一且無衝突的 `SOURCE_FACT` 直接保存純值，不包裝成完整 Field Value 物件：

- `catalog_code`
- `source_title`
- `release_date`
- `source_url`
- `source_site_movie_id`
- `public_description`
- `source_cover`
- `raw_performer_names`
- `raw_studio_name`
- `raw_series_names`
- `source_tags`

這些值共同由作品 `source` 區的下列欄位追溯：

- `source_record_ref`
- `source_snapshot_ref`（若存在）
- `source_fetched_at`
- `source_verified_at`
- `source_parser_version`（若存在）

只有以下情況在 v1 建立欄位級 provenance：

1. 來源衝突。
2. 同一陣列項目來自不同來源。
3. AI／人工編輯判斷。
4. 程式推導後會影響篩選或實體合併。
5. 觀看型判斷。
6. 使用來源值以外的人工覆寫。

完整、逐欄、無差別 Field Value 包裝為 `DEFERRED`。

### C. Evidence v1 最小紀錄

完整 Evidence Record 保留在後文作長期規格。v1 每筆 Evidence Record 最少只要求：

```text
EvidenceRecordV1Minimum
  evidence_id
  movie_id
  evidence_level
  evidence_status
  source_media_kind
  source_ref 或 source_identity_hash
  source_duration_seconds（若可得）
  analysis_method
  analyzed_by_type
  analyzed_at
  coverage_summary
  observation_summary
  validation_status
```

v1 不做逐句 `ClaimEvidenceLink`。只有下列觀看型欄位需要明確連到 Evidence Record：

- `story_density`
- `pace_tendency`
- `presentation_style`
- `full_movie_structure`

一般影評正文只保存文章級 `article_evidence_level` 與 `article_evidence_scope`，不替每一句建立 Claim ID。完整逐 Claim 追溯、`supported_claim_ids`、逐句 observation link 為 `DEFERRED`。

### D. `FULL_WATCH` v1 最低紀錄

後文的完整嚴格定義仍是長期目標，但 v1 不建立法證級完整稽核系統。v1 標示 `FULL_WATCH` 必須至少保存：

- 來源作品識別。
- 作品總片長。
- 分析方式。
- 完成者類型。
- 開始時間與完成時間。
- 完整觀看或完整時間軸完成確認。
- 完整性驗證結果。
- 分析摘要。

下列能力為 `DEFERRED`：產物 hash、逐段 Claim link、清理證明、完整連續處理稽核與法證級鏈條。

即使採最小紀錄，仍必須遵守：

- Writer 或文章文字不能自行宣稱 `FULL_WATCH`。
- Remotion 宣傳片及 AI 圖不能提升證據。
- 未完成全片不得標示 `FULL_WATCH`。
- `evidence_status` 或完整性驗證未通過時不得標示 `FULL_WATCH`。

### E. Movie Master 與營運狀態分工

| 資料位置 | v1 權責 |
|---|---|
| Git Movie Master | 標準化內容資料權威 |
| Source Record | 原始來源事實 |
| Markdown | 讀者可見文章正文 |
| Media Manifest | 生成媒體資產紀錄 |
| D1 | 發現、佇列、Job、重試、人工核准與營運狀態 |
| Registry | 暫時保留的相容快照；映射後再決定是否縮減 |

Movie Master v1 的 Publishing 投影只保存：

- `is_published`
- `published_at`
- `canonical_url`
- `indexability`
- `content_hash`

下列流程資料不進 Movie Master v1，全部為 `DEFERRED` 或繼續只存在 D1／既有系統：

- retry count
- lease
- queue state
- job state
- detailed approval workflow
- 完整 media completion workflow
- rewrite attempts

### F. stable ID v1 策略

- 作品 `stable_movie_id` 優先採可重現且有命名空間的 `cc18:{normalized_catalog_code}`。
- 唯讀映射若發現無番號、番號衝突或番號變更，列入例外報告；v1 不提前建立 UUID fallback 制度。
- 題材標籤先沿用現有穩定英文 ID；display name、aliases、slug 與 stable ID 分開，不全面改成 UUID。
- 演員、片商、系列在唯讀映射階段只產生 entity candidates，用來找同義、異體、錯字與可能重複。
- 未確認前不大量建立永久 UUID，也不把低信心名稱匹配自動合併。
- 完整 Entity merge／redirect／永久 UUID 治理機制保留為 `DEFERRED`。

### G. 第一版基本作品卡資格

第一版只實作基本作品卡資料資格；進階選片卡為 `DEFERRED`。

基本卡最低需要：

- `stable_movie_id`
- `slug`
- `catalog_code`
- `source_cover` 或明確通用占位圖
- 顯示標題
- `is_published=true`
- `canonical_url`

顯示標題固定依下列順序選擇：

1. `display_short_title`
2. `translated_title_zh_tw`
3. `article_title`
4. `source_title`
5. `catalog_code`

舊 Markdown `title` 正式映射為 `article_title`，不得直接改名為 `display_short_title`。`article_title` 是文章主標題，不保證符合卡片短標題長度；只有它可用時，基本卡可以暫時顯示該值，但前台應限制行數。`display_short_title` 保留給未來經編輯的卡片專用文字。

可靠時才顯示：

- `release_date`
- performer
- studio
- series
- duration
- quality
- 最多 2～3 個 canonical topic tags
- `one_line_summary`
- 是否有站內 Remotion 短片

缺值直接隱藏，不顯示「待補」，也不用 AI 猜測補滿。本階段不把下列欄位用於卡片主要顯示或篩選：

- `story_density`
- `pace_tendency`
- `presentation_style`
- `full_movie_structure`
- 假精準評分
- 星等
- 總分

### H. `PROMO_CLIP` 已決策規則

`PROMO_CLIP` 可以支持明確標示為「依官方預告觀察」或「依來源片段觀察」的局部文字內容。

`PROMO_CLIP` 不能：

- 代表全片故事密度。
- 代表全片節奏。
- 代表全片主要鏡位。
- 作為全片主要 faceted filter。

故事密度、節奏或呈現方式要成為全片篩選條件，最低仍需要有效的 `DISTRIBUTED_SAMPLE`。此規則在 v1 只供資料驗證；進階選片卡本身仍為 `DEFERRED`。

### I. Topic／Editorial channel 已決策規則

- `story` 保留為現有穩定 Topic ID。只有來源標籤經正式 taxonomy 映射，或未來經核准的確定性題材規則，才可進入 `canonical_topic_tag_ids`。
- 單純由編輯或 AI 判斷作品「有故事感」，只能留在 Editorial channel，不能成為正式 topic filter。
- `contrast-charm` 定義為 Editorial viewpoint，只能進入 `editorial_viewpoint_tag_ids`；不得進入 `canonical_topic_tag_ids`、不得單獨形成正式題材篩選頁，也不得因 AI 推論自動成為來源題材。
- 現有舊 `canonicalTagIds` 不直接作權威。正式 `canonical_topic_tag_ids` 必須由 Source Record `source_tags` 經正式 taxonomy 映射重新產生。

### J. `content_hash` canonical serialization

`content_hash` 只代表主要讀者可見文章內容。輸入固定為下列四項並依此順序序列化：

1. `article_title`
2. `seoTitle`
3. `shortReview`
4. Markdown 正文

正規化規則：UTF-8；所有換行統一為 LF；移除每行行尾空白；文件結尾固定保留一個換行；輸入鍵使用上述固定順序；缺值使用 JSON `null`，不得以空字串代替。使用無額外空白的 JSON canonical serialization，並在序列化結果末尾保留一個 LF，再以 SHA-256 計算。

簡短範例：

```text
{"article_title":"文章主標題","seoTitle":null,"shortReview":"一句話短評","markdown_body":"第一段。\n\n第二段。\n"}\n
```

不納入 hash：`publishedAt`、`status`、`videoStatus`、`imageStatus`、`featured`、本機路徑、Registry 狀態、D1 queue/job/lease/retry/approval，以及單純由 YAML 日期解析造成的格式差異。本節只定義規格，本版不實作產生器。

### K. v1 範圍總表

| `V1_REQUIRED` | `V1_OPTIONAL` | `DEFERRED` |
|---|---|---|
| Minimum Movie Master 識別、來源區引用、發布投影、內容 hash | 有可靠來源時映射日期、演員、片商、系列、片長、畫質、標籤、摘要與 Remotion ref | 全量 Field Value 包裝 |
| 普通來源事實純值＋作品層來源追溯 | 已存在且可驗證的 Evidence Record 最小映射 | 逐 Claim／逐句證據鏈 |
| 例外情況欄位級 provenance | 觀看型四欄的 Evidence 連結 | 法證級 `FULL_WATCH` 稽核鏈 |
| 文章級 evidence level／scope | Entity candidates 與別名候選報告 | 演員／片商／系列永久 UUID 大量建立與自動合併 |
| 基本作品卡資格與標題 fallback | 現有英文題材 ID 的相容性驗證 | 進階選片卡實作與觀看型全片篩選器 |
| Git Movie Master／Source Record／Markdown／Manifest／D1 權責分離 | Registry 相容性比較 | D1 流程狀態完整複製進 Movie Master |
| `article_title`、legacy publishedAt 保留規則與 canonical `content_hash` | 經正式 taxonomy 映射的 `story` Topic | `scheduled_at` 與逐句 Evidence Claim links |
| 空值保留、缺值隱藏、禁止 AI 補猜 | 有官方片段時保存局部觀察 | 總分、星等、假精準分數 |

## 1. 設計原則

1. **允許不完整**：除主記錄識別與稽核欄位外，不要求所有欄位都有值。
2. **空值優先於猜測**：來源沒提供、解析失敗、資料衝突或尚未分析時，保留 `null` 並填寫 `missing_reason`。
3. **四種資料性質分離**：來源事實、程式推導、AI／人工編輯判斷、實際觀看證據不得混為同一種事實。
4. **可追溯但不重複包裝**：v1 的普通、單一、無衝突來源事實由作品來源區共同追溯；只有 Minimum Profile 列出的例外才要求欄位級 provenance。完整逐欄包裝是長期藍圖。
5. **證據不由文風決定**：文章寫得具體、篇幅長或語氣肯定，都不能提高 `evidence_level`。
6. **生成媒體與原片證據分離**：Remotion 9 秒宣傳片及 AI 生成圖片是站內媒體產物，不是原片觀看證據。
7. **不製造假精準度**：不使用沒有量測依據的總分、星等或 8.7／9.2 等精準數字。
8. **有限枚舉優先**：故事密度、節奏等主觀欄位先採有限枚舉加文字說明；只有日後建立可驗證量測方法，才考慮數值化。
9. **ID 與名稱分離**：v1 作品使用 `cc18:{normalized_catalog_code}`，題材沿用英文 ID；演員、片商與系列先做 candidate。長期永久 ID 建立後，名稱修正不得改變 ID 或破壞舊 URL。
10. **狀態與內容分離**：D1 Job 或 Registry 的流程狀態不能覆蓋作品事實；內容檔也不能自行改寫營運佇列狀態。
11. **可降級呈現**：卡片與頁面依現有可靠欄位縮減，不顯示「待補」或用推測值填版。
12. **權威資料已分工**：Git Movie Master 是標準化內容資料權威；Source Record 保存原始事實、Markdown 保存正文、Media Manifest 保存生成媒體、D1 保存營運狀態。實際 Movie Master 序列化格式仍待唯讀映射後決定。

## 2. 共用欄位包裝與狀態

### 2.1 欄位級來源包裝

本節是長期邏輯藍圖。v1 不將所有普通來源事實包裝成 Field Value；實作範圍以 Minimum Profile 的「來源追溯簡化」為準。只有來源衝突、混合來源陣列、編輯判斷、會影響篩選／實體合併的推導、觀看型判斷或人工覆寫，才在 v1 使用欄位級包裝。

長期而言，凡是會影響前台顯示、搜尋、篩選或編輯判斷的非普通欄位，邏輯上可採下列結構。實作時可正規化成獨立資料表，不要求 JSON 必須逐欄重複保存。

```json
{
  "value": null,
  "provenance_refs": ["prov_..."],
  "evidence_refs": [],
  "confidence_status": "UNKNOWN",
  "missing_reason": "NOT_COLLECTED",
  "verified_at": null,
  "updated_at": "2026-08-28T00:00:00Z"
}
```

規則：

- `value` 可以為 `null`；不得以空字串、`N/A`、`待補` 取代空值。
- `provenance_refs` 指向一筆或多筆來源紀錄。
- 觀看相關判斷若宣稱受到影片支持，`evidence_refs` 不得為空。
- `confidence_status` 不代表數字分數，而是資料的可用狀態。
- v1 只有陣列項目來自不同來源時才要求項目級 provenance；單一 Source Record 內的普通來源陣列直接保存純值。

### 2.2 `confidence_status`

| 值 | 定義 | 可否直接篩選／顯示 |
|---|---|---|
| `VERIFIED` | 已由指定來源或可重複規則驗證 | 可以 |
| `CONSISTENT` | 多項資料一致，但尚未完成正式驗證 | 可顯示；篩選需標示規則允許 |
| `UNVERIFIED` | 有值但缺少足夠驗證 | 不作硬篩選；可在適當語境顯示 |
| `CONFLICTED` | 不同來源給出不同值 | 不作篩選；基本卡原則上隱藏 |
| `STALE` | 曾驗證但超過該欄位更新期限 | 可顯示舊值；不作時效性硬篩選 |
| `UNKNOWN` | 無法判定 | 不顯示、不篩選 |

### 2.3 `missing_reason`

| 值 | 定義 |
|---|---|
| `NOT_PROVIDED` | 指定來源沒有提供 |
| `NOT_APPLICABLE` | 該作品不適用此欄位 |
| `NOT_COLLECTED` | 尚未執行收集 |
| `SOURCE_UNAVAILABLE` | 來源暫時或永久無法讀取 |
| `PARSE_FAILED` | 來源存在，但程式無法可靠解析 |
| `CONFLICTED` | 多來源衝突，尚未裁決 |
| `LEGACY_UNKNOWN` | 舊資料無法判斷當時缺值原因 |
| `WITHHELD` | 因授權、隱私或營運政策不保存 |

## 3. `provenance_type` 正式定義

### 3.1 類型比較

| `provenance_type` | 定義 | 可接受來源 | 不可接受來源 | 典型欄位 | 搜尋／篩選 | 基本卡 | 前台性質揭露 |
|---|---|---|---|---|---|---|---|
| `SOURCE_FACT` | 直接來自 CC18.tv 或另一個事前列入允許清單的真實來源，未經內容性改寫 | 指定作品頁、官方片商頁、官方演員資料、來源方公開 API／結構化資料 | AI 補寫、搜尋摘要、未指定鏡像站、其他文章推測 | 番號、來源標題、上片日期、來源封面、演員、片商、系列、公開簡介、原始標籤 | `VERIFIED` 時可以 | 可以 | 一般不必逐欄貼標籤；作品資訊區須與編輯內容分區 |
| `DERIVED_FACT` | 由明確、版本化、可重複的程式規則，從已追溯輸入推導 | Slug 規則、標籤映射、媒體 probe、日期格式化、資產 hash、路由規則 | AI 的自由判斷、不可重現人工直覺、單靠文意猜測 | slug、canonical tag、畫質正規化、媒體尺寸／片長、索引資格 | 規則版本固定且輸入可靠時可以 | 可以 | 通常不需逐欄揭露；方法頁應說明推導方式 |
| `EDITORIAL_JUDGMENT` | AI 或人工編輯根據已知資料產生的摘要、分類、推薦或評論 | 經核准的 Writer／Editor、人工編輯、版本化 prompt 與 brief | 冒充來源事實、未保存輸入或無法辨識作品的自由生成 | 站內標題、一句話摘要、適合／不適合、觀看重點、影評、編輯標籤 | 只有有限枚舉、通過 QA 且符合證據規則時可作軟篩選 | 摘要可顯示；不能放進來源事實列 | 以「短評／編輯觀點／選片提示」等版位揭露，不必反覆顯示模型名稱 |
| `VIEWING_EVIDENCE` | 由實際官方預告、來源片段或原始影片內容觀察取得，且存在可追溯分析紀錄 | 獲授權的來源播放、官方公開預告、可驗證片段、時間軸／抽樣紀錄 | Remotion 成片、AI 圖、來源文字、文章寫得具體、模型自稱看過 | 時間軸觀察、節奏、鏡位、呈現方式、完整觀看判斷 | 覆蓋率與可信狀態達門檻時可以 | 不直接作基本卡必備值 | 預告觀察、抽樣觀察與完整觀看應以不同語意呈現 |

### 3.2 來源紀錄 Schema

```text
ProvenanceRecord
  provenance_id: string, required, immutable
  provenance_type: enum, required
  source_kind: enum(cc18_page, official_page, source_record, program_rule,
                    ai_editorial, human_editorial, viewing_record, legacy_unknown)
  source_uri_or_ref: string|null
  source_snapshot_ref: string|null
  source_field: string|null
  producer: string|null
  producer_version: string|null
  rule_or_prompt_version: string|null
  generated_at: datetime|null
  verified_at: datetime|null
  input_hashes: string[]
  notes: string|null
```

來源紀錄不得保存來源登入 Cookie、短效 HLS token 或其他密鑰。若來源只能在本機授權環境存取，可保存不可逆 hash、工作 ID、時間範圍與清理證明。

## 4. `evidence_level` 正式定義

### 4.1 等級

| `evidence_level` | 定義 | 最低可追溯要求 | 可以支持的內容 | 不能支持的內容 |
|---|---|---|---|---|
| `UNKNOWN` | 舊資料或證據不足，無法判斷依據 | 記錄未知原因 | 不支持觀看型 Claim | 不能推定為任何更高等級 |
| `PUBLIC_METADATA` | 只根據公開標題、簡介、演員、標籤與作品頁資料 | Source record 或指定來源快照 | 題材設定、公開劇情、演員、片商、系列、來源標籤 | 實際鏡位、剪輯、收音、表演細節、影片節奏 |
| `PROMO_CLIP` | 實際分析官方預告或來源方提供的公開片段 | 片段來源、時長、分析時間、片段 hash／URL、觀察紀錄 | 該片段內可觀察的畫面與有限呈現特徵 | 未出現在片段中的全片結構；不能代表完整影片 |
| `DISTRIBUTED_SAMPLE` | 對原始影片多個分散時間點進行抽樣 | 來源影片識別、總時長、抽樣方法、窗口時間、成功窗口、觀察 refs | 被抽樣區段的呈現、有限的全片趨勢判斷 | 未抽樣段落的逐幕事實；不能稱為完整觀看 |
| `FULL_WATCH` | 完整觀看，或完成可追溯的完整時間軸分析 | 連續覆蓋紀錄、總時長、完整性驗證、工作／人工紀錄、觀察索引與結束證明 | 全片結構、段落推進及完整觀看結論 | 仍不能把主觀評論冒充客觀來源事實 |

### 4.2 不可混淆規則

1. Remotion 生成的 9 秒宣傳影片不屬於 `PROMO_CLIP`，它是 CC18 的衍生宣傳媒體。
2. AI 生成圖片不屬於任何觀看證據。
3. 公開簡介中的劇情描述仍屬於 `PUBLIC_METADATA`，不因描述詳細而升級。
4. 系統不得僅因文章文字具體、具有鏡位或表演描述，就升級證據等級。
5. 每次證據升級都必須新增或引用一筆通過驗證的 Evidence Record。
6. `FULL_WATCH` 不得由 Writer、AI 或文章文字自行宣稱。
7. 較高 evidence level 不會自動支持文章內所有判斷。v1 以文章級 scope 加四個觀看型欄位的 Evidence 連結管理；逐 Claim 連結為 `DEFERRED`。
8. 一部作品可以同時擁有多筆不同等級證據。作品摘要的 `evidence_level` 是「目前通過驗證的最高等級」，但 v1 的觀看型四欄仍須引用自己的 Evidence Record。

#### 4.2.1 `EVIDENCE_SCOPE_REVIEW`

`PUBLIC_METADATA` 可以進行編輯解讀；但若文章在沒有有效 `PROMO_CLIP` 或 `DISTRIBUTED_SAMPLE` 證據時，以確定語氣描述鏡位、剪輯、收音、表演細節、開場／中段／後段或全片結構，QA 應將命中段落標記為 `EVIDENCE_SCOPE_REVIEW`。

`EVIDENCE_SCOPE_REVIEW` 是局部 QA／修稿狀態，不等於整篇直接退稿，也不會自行提升或降低作品 evidence level。v1 只保存文章級 evidence level 與適用範圍；本階段不建立逐句 Claim link。本規則是獨立後續工作，不阻擋 Movie Master v1 建立，也不授權本次修改既有風險文章。

### 4.3 `FULL_WATCH` 完成條件

本節是 `DEFERRED` 的長期嚴格目標。v1 實作只要求 Minimum Profile 所列的來源識別、總片長、分析方式、完成者類型、開始／完成時間、完成確認、完整性驗證與分析摘要；不建立法證級完整稽核鏈。

`FULL_WATCH` 必須同時滿足：

- 已知並記錄來源影片總時長。
- 有可驗證的連續時間軸覆蓋，從開頭到結尾；若允許技術性微小間隙，容許值必須由後續實作規格固定，不能由單次工作臨時決定。
- 每個時間段都有處理狀態，不能存在未說明缺口。
- 保存工作 ID、分析方式、開始／結束時間、來源識別 hash、分析產物 hash。
- 自動分析須通過完整性 validator；人工完整觀看須保存人工確認者、確認時間與使用的來源識別。
- 來源媒體可以依安全政策清除，但清除前必須完成上述不可逆稽核紀錄。
- Evidence Record 狀態必須為 `VALID`；`PARTIAL`、`INTERRUPTED`、`CONFLICTED` 均不得標示為 `FULL_WATCH`。

### 4.4 Evidence Record Schema

下列是長期完整 Schema。v1 只實作 Minimum Profile 的 `EvidenceRecordV1Minimum`；`method_version`、詳細 analyzer ref、逐窗口欄位、artifact refs、supported claim IDs、validation ref 與 cleanup attestation 均為 `DEFERRED`，除非現有資料已經存在且唯讀映射只做保留。

```text
EvidenceRecord
  evidence_id: string, required, immutable
  movie_id: string, required
  evidence_level: enum, required
  evidence_status: enum(VALID, PARTIAL, INVALID, CONFLICTED, REVOKED)
  source_media_kind: enum(official_promo, source_clip, source_full_video)
  source_ref: string|null
  source_identity_hash: string|null
  source_duration_seconds: number|null
  analysis_method: enum(metadata_only, promo_analysis, distributed_sampling,
                        continuous_machine_analysis, human_full_watch)
  method_version: string|null
  analyzed_by_type: enum(program, ai_model, human, hybrid)
  analyzed_by_ref: string|null
  analyzed_at: datetime
  coverage:
    requested_windows: integer|null
    completed_windows: integer|null
    timeline_start_seconds: number|null
    timeline_end_seconds: number|null
    continuous_coverage_seconds: number|null
    coverage_ratio: number|null
  observation_refs: string[]
  artifact_refs: string[]
  supported_claim_ids: string[]
  validation_ref: string|null
  cleanup_attestation_ref: string|null
```

`coverage_ratio` 只有在分母、分子與計算規則都可追溯時才可保存；不可用模型主觀判斷產生。

## 5. 作品主資料邏輯 Schema

### 5.1 頂層結構

本章保存長期 Movie Master 邏輯藍圖。下一階段不得直接照本章建立全部欄位；v1 實際欄位以 `v1 Minimum Implementation Profile` 的 `MovieMasterV1Minimum` 為唯一範圍。

```text
MovieMasterV1
  schema_version
  identity
  titles
  release_facts
  taxonomy
  media
  editorial
  evidence
  validation
  publishing
```

下列表格中的「必填」指主記錄是否必須存在該欄位容器；選填值可以為 `null`。`基本卡`／`進階卡` 的「可」仍受可信狀態與證據門檻限制。

### 5.2 Identity

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `stable_movie_id` | string；v1 採 `cc18:{normalized_catalog_code}` | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 不可為空；無番號／衝突列為映射例外 | 內部精確查詢 | 不顯示 | 不顯示 |
| `catalog_code` | string|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋原因；不得自造番號 | 可，精確／前綴 | 必備；缺值時不得發布一般作品卡，例外作品需另定類型 | 可 |
| `slug` | string | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 由 stable 規則產生；不可由標題生成 | 路由用 | 不直接顯示 | 不直接顯示 |
| `source_url` | URL|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋原因；發布 CTA 需另驗證 | 不作一般篩選 | CTA 用 | CTA 用 |
| `source_site_movie_id` | string|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`；不得由 URL 猜錯 | 精確查詢／去重 | 不顯示 | 不顯示 |

Identity 規則：

- v1 `stable_movie_id` 採有命名空間且可重現的 `cc18:{normalized_catalog_code}`，不立即建立 UUID。
- 一般作品的 `slug` 固定採正規化番號，標題改名不得更改 slug。
- 無番號、同番號衝突或番號變更只列入唯讀映射例外，不在本版提前設計複雜 fallback。

### 5.3 Titles

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `source_title` | string|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋原因 | 全文搜尋 | 選填 | 可 |
| `official_title_ja` | string|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | 無權威來源時必須 `null` | 全文搜尋 | 通常不顯示 | 可 |
| `translated_title_zh_tw` | string|null | 選填 | 單值 | `SOURCE_FACT` 或 `EDITORIAL_JUDGMENT`，逐值標示 | `PUBLIC_METADATA+` | 未翻譯時 `null`；不得假裝官方 | 全文搜尋 | 選填 | 可 |
| `article_title` | string|null | article_ref 存在時必填 | 單值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | 舊 Markdown `title` 映射至此；不得改名成短標題 | 全文搜尋，不作 faceted filter | fallback 可用，前台限制行數 | 可 |
| `seo_title` | string|null | 選填 | 單值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | `null` 時採可追溯 fallback，不反寫資料 | 不作分類篩選 | 不直接顯示或作頁面 title | 不直接顯示 |
| `display_short_title` | string|null | 選填 | 單值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | `null` 時只顯示番號 | 適合全文搜尋，不作 faceted filter | 選填 | 可 |

翻譯標題如果由編輯翻譯，provenance 必須為 `EDITORIAL_JUDGMENT`；只有指定官方來源提供的繁中標題才可標記 `SOURCE_FACT`。`article_title` 與 `display_short_title` 語意不同：前者是文章主標題，後者是卡片短標題，資料層不得互相重新命名。

### 5.4 Release facts

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `release_date` | date|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋原因；不以抓取日代替 | 可，日期範圍 | 建議必備，缺值則隱藏日期 | 可 |
| `duration_seconds` | integer|null | 選填 | 單值 | `SOURCE_FACT` 或 `DERIVED_FACT` | `PUBLIC_METADATA+` | `null`；不得估計 | 可，驗證後 | 選填 | 可 |
| `quality_codes` | enum[] | 選填 | 多值 | `SOURCE_FACT`／`DERIVED_FACT` | `PUBLIC_METADATA+` | 空陣列；保留原始字串 | 可，需正規化 | 選填 | 可 |
| `studio_id` | entity ref|null | 選填 | 單值 | `DERIVED_FACT`，原始名稱另存 `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋未解析名稱 | 可 | 選填 | 可 |
| `series_ids` | entity ref[] | 選填 | 多值 | `DERIVED_FACT`，原始名稱另存 `SOURCE_FACT` | `PUBLIC_METADATA+` | 空陣列 | 可 | 選填 | 可 |
| `performer_ids` | entity ref[] | 選填 | 多值 | `DERIVED_FACT`，原始名稱另存 `SOURCE_FACT` | `PUBLIC_METADATA+` | 空陣列；不得補猜演員 | 可 | 選填 | 可 |
| `public_description` | string|null | 選填 | 單值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | `null`＋原因 | 全文搜尋，避免直接作分類 | 不放基本卡主資訊 | 可在資料區顯示 |

`quality_codes` 初始建議有限枚舉：`SD`、`HD_720P`、`FHD_1080P`、`UHD_4K`、`UNKNOWN_QUALITY`。`UNKNOWN_QUALITY` 只用於外部查詢結果，不應拿來填前台卡片。

### 5.5 Taxonomy

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `source_tags` | SourceTagValue[] | 選填 | 多值 | `SOURCE_FACT` | `PUBLIC_METADATA+` | 空陣列；保留來源原字串 | 只建議全文搜尋 | 選填，數量限制 | 可 |
| `canonical_topic_tag_ids` | entity ref[] | 選填 | 多值 | `DERIVED_FACT` | `PUBLIC_METADATA+` | 空陣列；不得模糊配對 | 可 | 選填 | 可 |
| `editorial_viewpoint_tag_ids` | entity ref[] | 選填 | 多值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+`；觀看型標籤依 Claim 升級 | 空陣列 | 可作軟篩選；觀看型受門檻限制 | 原則不放基本事實列 | 可 |
| `unmapped_tag_candidates` | TagCandidate[] | 選填 | 多值 | `DERIVED_FACT` | `PUBLIC_METADATA+` | 空陣列 | 不可作正式 faceted filter | 可顯示原始字詞但不可點擊 | 可作編輯提示 |

每個 `SourceTagValue` 必須保留 `raw_value`、`source_ref`、`language`（可未知）及映射結果。Canonical 與 Editorial tag 不得共用同一欄位。

`story` 是穩定 Topic ID，但只有來源標籤的正式映射或經核准的確定性題材規則可以產生它；編輯判斷「有故事感」只能留在 Editorial channel。`contrast-charm` 是 Editorial viewpoint，只能存入 `editorial_viewpoint_tag_ids`，不得成為 canonical topic、正式題材篩選頁或 AI 自動推導的來源題材。舊 `canonicalTagIds` 必須由 Source Record `source_tags` 經正式 taxonomy 重建後才能投影為 canonical topic。

### 5.6 Media

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `source_cover` | MediaAsset|null | 選填 | 單值 | URL 為 `SOURCE_FACT`；尺寸／hash 為 `DERIVED_FACT` | `PUBLIC_METADATA+` | `null`；可用站內通用版型但不得冒充封面 | 否 | 基本卡視覺必備；若無來源封面使用明確通用占位 | 可 |
| `original_hero_images` | MediaAsset[] | 選填 | 多值 | 創意內容為 `EDITORIAL_JUDGMENT`；資產 metadata 為 `DERIVED_FACT` | 不適用 | 空陣列 | 否 | 不作必備 | 可 |
| `vertical_images` | MediaAsset[] | 選填 | 多值 | 同上 | 不適用 | 空陣列 | 否 | 否 | 可 |
| `remotion_promos` | MediaAsset[] | 選填 | 多值 | `DERIVED_FACT` | 不適用；永不提升 evidence | 空陣列；不阻擋文章資料存在 | 可篩「有站內短片」，不可篩觀看證據 | 可作播放入口但非必備 | 可 |
| `official_promo_or_source_clips` | SourceMediaRef[] | 選填 | 多值 | `SOURCE_FACT`；分析結果為 `VIEWING_EVIDENCE` | `PROMO_CLIP+` | 空陣列 | 可篩「有官方預告」 | 選填，須標示官方／來源片段 | 可 |
| `source_video_sample_records` | evidence ref[] | 選填 | 多值 | `VIEWING_EVIDENCE` | `DISTRIBUTED_SAMPLE+` | 空陣列 | 可篩證據等級 | 不直接顯示技術紀錄 | 可轉為「抽樣觀察」提示 |

所有 `MediaAsset` 至少包含：`asset_id`、`role`、`origin_type`、`public_url_or_path`、`storage_ref`、`mime_type`、`width`、`height`、`duration_seconds`、`bytes`、`sha256`、`created_at`、`license_or_usage_status`。不適用的媒體屬性保留 `null`。

`origin_type` 必須區分：`SOURCE_COVER`、`OFFICIAL_PROMO`、`SOURCE_CLIP`、`AI_GENERATED_ARTWORK`、`REMOTION_PROMO`、`GENERIC_PLACEHOLDER`。

### 5.7 Editorial

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `one_line_summary` | string|null | 選填 | 單值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | `null` 時不顯示 | 全文搜尋，不作硬 faceted filter | 可，以短評版位顯示 | 可 |
| `suitable_for` | EditorialStatement[] | 選填 | 多值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | 空陣列 | 只有受控枚舉可作軟篩選 | 否 | 可 |
| `not_suitable_for` | EditorialStatement[] | 選填 | 多值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | 空陣列 | 只有受控枚舉可作軟篩選 | 否 | 可 |
| `watching_highlights` | EditorialStatement[] | 選填 | 多值 | `EDITORIAL_JUDGMENT`，可由 Evidence 支持 | `PUBLIC_METADATA+` | 空陣列 | 原則為文字提示；受控題材另由 taxonomy 篩選 | 否 | 可 |
| `presentation_style` | ControlledJudgment[] | 選填 | 多值 | `EDITORIAL_JUDGMENT`／`VIEWING_EVIDENCE` | 確定性顯示需 `PROMO_CLIP+`；主篩選需 `DISTRIBUTED_SAMPLE+` | 空陣列 | 符合門檻才可 | 否 | 可 |
| `story_density` | enum|null：`LOW`／`MEDIUM`／`HIGH` | 選填 | 單值 | `EDITORIAL_JUDGMENT` | 確定性顯示需 `PROMO_CLIP+`；主篩選需 `DISTRIBUTED_SAMPLE+` | `null`；不得從簡介長度推定 | 符合門檻才可 | 否 | 可 |
| `pace_tendency` | enum|null：`SLOW`／`BALANCED`／`FAST`／`VARIABLE` | 選填 | 單值 | `EDITORIAL_JUDGMENT` | 確定性顯示需 `PROMO_CLIP+`；主篩選需 `DISTRIBUTED_SAMPLE+` | `null`；不得從題材標籤推定 | 符合門檻才可 | 否 | 可 |
| `full_movie_structure` | StructuredSummary|null | 選填 | 單值 | `EDITORIAL_JUDGMENT`／`VIEWING_EVIDENCE` | 全片結構最低 `DISTRIBUTED_SAMPLE+`；完整斷言需 `FULL_WATCH` | `null`；不得由公開簡介補成全片結構 | 符合門檻才可 | 否 | 可 |
| `full_review` | rich text ref|null | 選填 | 單值 | `EDITORIAL_JUDGMENT` | `PUBLIC_METADATA+` | `null` 代表沒有影評，不以模板補滿 | 全文搜尋 | 否 | 作品頁顯示 |
| `editorial_status` | enum | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 預設 `NOT_STARTED` | 營運篩選 | 不顯示 | 不顯示 |

`EditorialStatement`／`ControlledJudgment` 必須支援：`statement_id`、`text` 或 `enum_code`、`provenance_refs`、`evidence_refs`、`confidence_status`、`scope`。`scope` 用來區分「來源設定推論」「預告片段觀察」「全片抽樣趨勢」等適用範圍。

`editorial_status` 建議枚舉：`NOT_STARTED`、`BRIEF_READY`、`DRAFT`、`QA_REPAIR`、`QA_PASSED`、`APPROVED`、`REJECTED`。它不等同 Publishing 狀態。

### 5.8 Evidence

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `highest_evidence_level` | enum | 必填 | 單值 | `DERIVED_FACT` | 所有 | 無證據時 `UNKNOWN` | 可 | 不顯示 | 可作內部門檻或適當揭露 |
| `evidence_sources` | EvidenceSource[] | 選填 | 多值 | `VIEWING_EVIDENCE` | `PROMO_CLIP+` | 空陣列 | 依來源種類可篩 | 否 | 可顯示證據類型，不顯示敏感 URL |
| `analysis_times` | datetime[] | 選填 | 多值 | `VIEWING_EVIDENCE` | `PROMO_CLIP+` | 空陣列 | 否 | 否 | 通常不顯示 |
| `analysis_methods` | enum[] | 選填 | 多值 | `VIEWING_EVIDENCE` | `PROMO_CLIP+` | 空陣列 | 可作管理篩選 | 否 | 可轉為簡明說明 |
| `trace_records` | evidence ref[] | 選填 | 多值 | `VIEWING_EVIDENCE` | `PROMO_CLIP+` | 空陣列 | 否 | 否 | 不直接顯示原始技術紀錄 |
| `supported_claim_links` | ClaimEvidenceLink[] | 選填 | 多值 | `DERIVED_FACT` | `PROMO_CLIP+` | 長期完整規格；v1 `DEFERRED` | 否 | 否 | 長期決定進階欄位能否顯示／篩選 |

`highest_evidence_level` 排序只用於門檻：`UNKNOWN < PUBLIC_METADATA < PROMO_CLIP < DISTRIBUTED_SAMPLE < FULL_WATCH`。它不是品質分數，也不代表影評好壞。

### 5.9 Validation

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `field_provenance` | ProvenanceRecord[]／refs | 必填 | 多值 | 各類型 | 所有 | 不可省略主識別欄位來源 | 管理篩選 | 不顯示 | 不顯示 |
| `provenance_type` | 欄位級 enum | 必填 | 每值一項 | 自描述 | 所有 | 舊資料用 `legacy_unknown` record，不猜測 | 管理篩選 | 不顯示 | 不顯示 |
| `verified_at` | datetime|null | 選填 | 每值一項 | `DERIVED_FACT` | 不適用 | 未驗證為 `null` | 可篩未驗證／過期 | 不顯示 | 視需要顯示資料日期 |
| `confidence_status` | enum | 必填 | 每值一項 | `DERIVED_FACT` | 所有 | 預設 `UNKNOWN` | 可 | 控制顯示 | 控制顯示與篩選 |
| `missing_reason` | enum|null | 條件必填 | 每個空值一項 | `DERIVED_FACT`／人工裁決 | 不適用 | 值為 `null` 時原則上必填 | 可作資料品質報表 | 不顯示 | 不顯示 |
| `last_updated_at` | datetime | 必填 | 單值／每值 | `DERIVED_FACT` | 不適用 | 不可為空 | 可 | 不顯示 | 不顯示 |

Validation 是稽核資料，不應直接塞入每張前台卡片。前台只依它決定顯示、隱藏、語氣與篩選資格。

### 5.10 Publishing

下表是長期藍圖。Movie Master v1 不複製 D1 的完整營運流程，只使用 Minimum Profile 已決定的 Publishing 投影：`is_published`、`published_at`、`legacy_published_at`、`legacy_published_at_semantics`、`canonical_url`、`indexability`、`content_hash`。

| 欄位名稱 | 型別 | 必填 | 值數 | Provenance | 可接受 evidence | 空值處理 | 篩選 | 基本卡 | 進階卡 |
|---|---|---|---|---|---|---|---|---|---|
| `publication_status` | enum：`DRAFT`／`APPROVED`／`PUBLISHED`／`UNPUBLISHED`／`ARCHIVED` | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 預設 `DRAFT` | 可 | 不顯示 | 不顯示 |
| `approved_at` | datetime|null | 選填 | 單值 | `DERIVED_FACT` | 不適用 | 非 approved 可為 `null` | 管理篩選 | 不顯示 | 不顯示 |
| `approved_by_ref` | string|null | 選填 | 單值 | `DERIVED_FACT` | 不適用 | `null` | 管理篩選 | 不顯示 | 不顯示 |
| `published_at` | datetime|null | 選填 | 單值 | `DERIVED_FACT` | 不適用 | 只有 `PUBLISHED` 可有正式值；舊衝突需記錄 | 可，日期排序 | 可顯示發布日期但不得冒充上片日期 | 可 |
| `legacy_published_at` | datetime/date|null | 選填 | 單值 | legacy reference | 不適用 | `is_published=false` 且舊值存在時保留原值；不得映射為正式發布日 | 不可 | 不顯示 | 不顯示 |
| `legacy_published_at_semantics` | enum：`LEGACY_SEMANTICS_UNKNOWN` | 條件必填 | 單值 | `DERIVED_FACT` | 不適用 | `legacy_published_at` 存在時固定使用該值，不推測舊語意 | 不可 | 不顯示 | 不顯示 |
| `scheduled_at` | datetime|null | 選填／`DEFERRED` | 單值 | `DERIVED_FACT` | 不適用 | 未來需要排程時另建；不得重用舊 `publishedAt` | 未來營運用 | 不顯示 | 不顯示 |
| `canonical_url` | URL|null | 選填 | 單值 | `DERIVED_FACT` | 不適用 | 未發布時可 `null` | 路由查詢 | 不直接顯示 | 不直接顯示 |
| `indexability` | enum：`INDEX`／`NOINDEX`／`UNKNOWN` | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 預設 `UNKNOWN`，發布前必須裁決 | 可 | 不顯示 | 不顯示 |
| `media_completion` | MediaCompletion | 必填 | 單值物件 | `DERIVED_FACT` | 不適用 | 各媒體獨立狀態 | 可 | 控制媒體區 | 控制媒體區 |
| `publication_revision` | integer | 必填 | 單值 | `DERIVED_FACT` | 不適用 | 從1開始；不可倒退 | 管理用 | 不顯示 | 不顯示 |

`media_completion` 應分開：`cover_status`、`hero_status`、`vertical_image_status`、`remotion_status`、`official_promo_status`。圖片或 Remotion 失敗不得偽裝成作品資料缺失，也不必阻止純文章發布；實際發布政策另行定義。

`is_published=false` 時，舊 Markdown `publishedAt` 不得映射為正式 `published_at`；原值只保存為 `legacy_published_at`，並固定標記 `legacy_published_at_semantics=LEGACY_SEMANTICS_UNKNOWN`。不推測它是預定發布日、草稿建立日或曾發布日。正式 `published_at` 只有在已發布狀態及線上／發布證據成立時才產生。`legacy_published_at` 不進基本卡、排序、sitemap 或結構化資料；未來預定發布日如有需要使用獨立的 `scheduled_at`。

`publication_status`、`approved_at`、`approved_by_ref`、`scheduled_at`、`media_completion` 與 `publication_revision` 在 Movie Master v1 均為 `DEFERRED`。retry、lease、queue、job、詳細 approval 與 rewrite attempts 留在 D1／既有流程，不映射進 Movie Master。

## 6. 實體模型

### 6.1 共用 Entity Schema

本節是長期實體治理藍圖。v1 只沿用現有英文題材 ID，並對演員、片商、系列產生唯讀 entity candidates；不大量建立永久 UUID，不執行自動 merge／redirect。

長期而言，演員、片商、系列與題材標籤可共用以下基礎欄位：

```text
EntityBase
  stable_id: string, immutable
  entity_type: enum(PERFORMER, STUDIO, SERIES, TOPIC_TAG)
  canonical_name: string
  display_name: string
  name_ja: string|null
  name_zh_tw: string|null
  aliases: Alias[]
  slug: string, immutable after first indexed publication
  source_references: SourceReference[]
  entity_status: enum(ACTIVE, MERGED, REDIRECTED, RETIRED, REVIEW_REQUIRED)
  merged_into_id: string|null
  redirect_from_slugs: string[]
  created_at: datetime
  updated_at: datetime
```

```text
Alias
  value: string
  language: string|null
  script: string|null
  alias_type: enum(SOURCE_NAME, TRANSLATION, TRANSLITERATION, FORMER_NAME,
                   TYPO, NORMALIZED_VARIANT, OTHER)
  provenance_refs: string[]
  confidence_status: enum
```

### 6.2 各實體 stable ID

| 實體 | Stable ID 建議 | 額外欄位 | URL 建議 |
|---|---|---|---|
| 演員 | v1 僅產生 candidate；永久 ID `DEFERRED` | 原始名稱、正規化名稱、別名／重複候選、來源 refs | 現行 URL 只做相容性盤點，不改路由 |
| 片商 | v1 僅產生 candidate；永久 ID `DEFERRED` | 原始名稱、正規化名稱、別名／重複候選、來源 refs | 片商頁仍未實作 |
| 系列 | v1 僅產生 candidate；永久 ID `DEFERRED` | 原始名稱、正規化名稱、別名／重複候選、來源 refs | 現行 URL 只做相容性盤點，不改路由 |
| 題材標籤 | v1 沿用現有穩定英文 ID | `display_name`、aliases、slug 與 stable ID 分離 | `/tags/{immutable-slug}/` |

題材標籤 v1 不全面改用 UUID。唯讀映射只驗證現有英文 ID 是否出現語意衝突；若有衝突，列入報告，不在映射時自行換 ID。

### 6.3 名稱修正、合併與 URL

以下規則保留作長期設計，其中實際 merge、redirect 與永久實體寫入在 v1 為 `DEFERRED`。

1. 名稱修正只更新 `canonical_name`、`display_name` 或 aliases，不更改 stable ID。
2. 已被索引的 `slug` 預設不可變。若業務上必須更換，新 slug 成為主路由，舊 slug 永久加入 `redirect_from_slugs` 並做 301。
3. 發現重複實體時，不刪除舊 stable ID；將舊實體標成 `MERGED`，填入 `merged_into_id`。
4. 所有作品關聯在遷移後指向主實體；舊 ID 仍可解析到主實體。
5. 別名匹配只能產生候選，不得在低信心時自動合併。
6. 日文名、中文名與顯示名可以不同；任何一個都不能被當成唯一鍵。
7. 錯字 alias 可以保留供搜尋召回，但前台顯示 canonical/display name。

## 7. 選片卡使用規則

v1 只實作第 7.1 節的基本作品卡資料資格。第 7.2 節進階選片卡完整保留為 `DEFERRED` 長期設計，不列入24部唯讀映射後的第一版前台工作。

### 7.1 A. 基本作品卡

基本卡目標是即使作品資料不完整，也能用可靠事實建立入口。

**最低必備：**

- `stable_movie_id`
- 可解析的 `slug`
- `catalog_code`
- `source_cover`，或明確標示的站內通用占位圖
- 至少一個可顯示標題，依 `display_short_title` → `translated_title_zh_tw` → `article_title` → `source_title` → `catalog_code` 選擇
- `is_published=true`
- 可用的 `canonical_url`

**可靠時可選顯示：**

- 上片日期
- 演員
- 片商
- 系列
- 片長
- 畫質
- 最多 2～3 個 canonical 題材標籤
- 一句話編輯摘要
- 是否有站內9秒宣傳片

**縮減規則：**

- 缺演員、系列、片商、片長或畫質時，直接隱藏該列。
- 沒有一句話摘要時，卡片只保留標題與可靠事實，不截取影評第一段湊字。
- 沒有來源封面時，可以使用固定通用占位圖；占位圖不得做成看似該作品的生成封面。
- 原始標籤未映射時，可以有限文字呈現，但不產生可點擊分類頁。
- 不顯示「待補」「未知演員」「片長不詳」來填版面。
- 只有 `article_title` 可用時可以暫作卡片標題，但前台應限制行數；資料層不得將它重新命名成 `display_short_title`。

**可作基本篩選：**

- 番號
- 上片日期
- 已驗證演員 stable ID
- 已驗證片商 stable ID
- 已驗證系列 stable ID
- Canonical 題材標籤
- 片長（只有已驗證數值）
- 畫質（只有正規化且來源可靠）
- 是否有站內短片

一句話摘要可以顯示，但它必須位於編輯摘要語境，不能混入來源事實列；不需要在每張卡上反覆顯示「AI生成」。

### 7.2 B. 進階選片卡

**狀態：`DEFERRED`。** 進階卡在基本卡之上，加入可幫助選片的編輯判斷。本節不授權下一階段實作卡片、篩選器或補建觀看型欄位。

**最低必備：**

- 符合基本卡所有最低必備欄位。
- `highest_evidence_level >= PROMO_CLIP` 才能顯示有限的片段觀察。
- 任何觀看型欄位都必須有 `evidence_refs` 與 `VALID` Evidence Record。
- 要把故事密度、節奏或拍攝／呈現方式作為主要 faceted filter，最低為 `DISTRIBUTED_SAMPLE`。

**可選顯示：**

- 適合對象／不適合對象
- 觀看重點
- 故事密度
- 節奏傾向
- 拍攝／呈現方式
- 官方預告或來源片段入口
- 證據範圍的簡明文字，例如「依官方預告觀察」或「依分散片段觀察」

**欄位門檻：**

| 欄位 | `PUBLIC_METADATA` | `PROMO_CLIP` | `DISTRIBUTED_SAMPLE` | `FULL_WATCH` |
|---|---|---|---|---|
| 題材／公開劇情 | 可顯示、可篩 canonical tags | 可 | 可 | 可 |
| 一句話摘要 | 可顯示為編輯摘要 | 可 | 可 | 可 |
| 適合／不適合 | 可作文字提示；不作觀看型硬篩選 | 可作有限片段提示 | 可作受控軟篩選 | 可作受控軟篩選 |
| 故事密度 | 不顯示確定枚舉、不篩選 | 可顯示「預告片段傾向」，不可代表全片主篩選 | 可顯示並作主篩選 | 可顯示並作主篩選 |
| 節奏傾向 | 不顯示確定枚舉、不篩選 | 同上 | 可顯示並作主篩選 | 可顯示並作主篩選 |
| 拍攝／呈現方式 | 只能描述公開設定，不能寫實際鏡頭觀察 | 只描述片段內觀察 | 可作全片趨勢但不得寫未抽樣逐幕事實 | 可作完整時間軸觀察 |

**只能作文字提示，不作主要篩選的內容：**

- 自由文字觀看重點
- 完整影評中的主觀意見
- 未受控的適合／不適合文字
- 只有 `PUBLIC_METADATA` 支持的故事或節奏推測
- `PROMO_CLIP` 對全片的延伸推測

**禁止事項：**

- 不以 AI 推測補滿故事密度、節奏、鏡位、收音或剪輯。
- 不將 Remotion 宣傳片當成官方預告。
- 不將 AI 圖當成作品場景。
- 不使用總分、星等或假精準分數。
- 不因其他同系列作品具有某特徵，就自動套用到本作。

`PROMO_CLIP` 的規則已確定：只能支持明確標示為「依官方預告觀察」或「依來源片段觀察」的局部文字，不能代表全片故事密度、全片節奏、全片主要鏡位，也不能作全片主要 faceted filter。全片故事密度、節奏或呈現方式若要成為篩選條件，最低仍需有效 `DISTRIBUTED_SAMPLE`。

## 8. 舊資料唯讀映射模擬規格

下一步映射只依 `v1 Minimum Implementation Profile` 產生報告與暫存結果，不寫回任何來源。後文長期 Schema 中的 Deferred 欄位不得因模擬而被建立或補值。

### 8.1 輸入資料與責任

| 現有來源 | 唯讀讀取內容 | 在新模型中的責任 | 不應承擔的責任 |
|---|---|---|---|
| `data/source-records/*.json` | 番號、來源標題、日期、演員、片商、系列、來源標籤、簡介、封面、URL、抓取時間 | CC18 來源事實的第一順位主來源 | 不決定發布狀態、編輯結論或觀看證據 |
| `content/reviews/*.md` | 站內標題、SEO標題、短評、編輯角度、標籤、文章、現行前台媒體路徑 | 目前已發布／草稿內容的主來源 | 不覆蓋來源事實；正文不能反推觀看等級 |
| `data/movie-registry.json` | review/image/video 狀態、模板、published_at 快照 | 舊版內容與媒體狀態參考 | 不作作品事實主來源；不單獨裁決是否真的已發布 |
| Cloudflare D1 | movies、jobs、lease、approval、publish 工作狀態 | 營運發現、佇列與工作狀態主來源 | 不覆蓋來源快照；job completed 不等於內容一定在線 |
| `data/media-manifests/*.json` | R2 key、URL、尺寸、時長、bytes、hash、provider | 生成媒體及資產完整性的主來源 | 不作原片證據；Remotion時長不是來源片長 |
| `data/review-quality/*.json` | QA、evidence refs、approval、rewrite | 編輯驗證與 Claim 支持關係來源 | `approved_for_publish` 不單獨等於線上 published；空 refs 不算觀看證據 |
| `data/search-content/*.json` | 適合／不適合、時間軸摘要、片長、sample windows | 搜尋決策資料候選與影片分析索引 | 不在無 Evidence Record 時自行升級證據 |
| `data/editorial-briefs/*.json` | Writer 輸入、來源訊號、觀察 refs | 追溯編輯生成輸入 | 不作來源事實的最高優先來源 |
| `data/taxonomy.json` | Canonical tag 定義與 source map | 標籤映射規則來源 | 不把未映射字詞自動當 canonical tag |

### 8.2 欄位衝突優先順序

衝突不能用一條全域規則處理，需依資料類型決定：

1. **來源事實**：最新且通過驗證的指定 Source Record／來源快照。
2. **程式推導值**：由最高版本的規則，對已選定來源事實重新計算；舊快照只供比較。
3. **觀看證據**：通過 schema 與完整性驗證的 Evidence Record；Search content 只是投影。
4. **編輯內容**：Review Markdown 是目前文章文字主來源；QA 決定可否採用，但不覆寫文字本身。
5. **營運狀態**：D1 是 jobs／queue 主來源；實際線上頁面與部署驗證共同決定「目前可存取」。Registry 是匯出／相容快照，不單獨作權威。
6. **媒體狀態**：Media manifest 加 R2 存在性／hash 驗證；Markdown URL 或 Registry status 不能單獨證明檔案完整。

若兩份同等權威資料不一致：

- 不自動選一份覆蓋另一份。
- 輸出 `CONFLICTED`。
- 保存全部候選值、各自 provenance 與抓取時間。
- 欄位值暫為 `null`，或保留最後 verified 值並標記衝突；採哪一種需依欄位政策決定。

### 8.3 模擬步驟

1. 建立只在暫存目錄存在的 `MovieMasterV1Minimum` 投影，不寫入 repo 或 D1。
2. 以所有可發現的作品 ID 建立 union，不以單一資料夾漏掉其他作品。
3. 對每個作品列出所有輸入檔與 D1 row 是否存在。
4. 先映射來源事實，再做 deterministic derived mapping。
5. 題材標籤沿用現有英文 ID；演員、片商與系列只建立 entity candidates，不建立永久 UUID、不合併實際名字。
6. 將 Markdown 編輯欄位與正文連入 Editorial 區。
7. 將 media manifest 連入 Media 區；明確標示生成媒體。
8. 只有存在有效觀看紀錄時才映射 Evidence v1 最小紀錄；不建立逐 Claim links。
9. 對每個空值填寫可判定的 `missing_reason`；無法回推時用 `LEGACY_UNKNOWN`。
10. 執行資料守恆比較，產生報告後刪除暫存投影。

### 8.4 模擬輸出報告

報告至少包含：

- 各資料來源的作品數與 union 後 unique 作品數。
- 每個欄位的存在數、空值數、缺值原因分布。
- 普通來源純值數量、作品來源區完整度，以及例外欄位級 provenance 數量。
- 各 `evidence_level` 的作品數與有效 Evidence Record 數。
- 每個欄位的衝突數、候選值與來源。
- 無法映射的舊欄位與未被消費的 JSON path。
- 演員、片商、系列與標籤的 entity candidate 數、別名候選及可能重複群組。
- 基本作品卡可成立的作品數，以及被哪個必備欄位擋下。
- Deferred 觀看型欄位只統計現有值與現有證據覆蓋，不判定或建立進階卡資格。
- Published／D1 publish job／Registry 狀態／線上 URL 的不一致清單。
- Media manifest 與實際媒體存在性、hash、duration 的不一致清單。
- 每部作品的資料守恆摘要。

### 8.5 資料守恆驗證

確認沒有遺失現有資料的方法：

- 對所有輸入檔建立檔案 hash 與讀取清單。
- 對每個被讀取的 JSON path／frontmatter key 標記為：`mapped_v1`、`observed_deferred`、`preserved_as_legacy`、`ignored_by_policy` 或 `unrecognized`。
- `unrecognized` 必須為 0 才能認定輸入盤點完整；`observed_deferred` 只證明資料仍被看見，不得因此建立 Deferred 欄位或治理資料。`ignored_by_policy` 必須附理由。
- 保留原始值與正規化值的對照，不只保存正規化結果。
- 比較作品 ID、來源 URL、正文 hash、媒體 hash、標籤數與實體關聯數。
- 模擬不得修改檔案 mtime、D1 rows、Registry、Git index 或工作狀態。
- 模擬結束時再次執行 Git status，確認沒有意外寫回。

## 9. 已確定設計、未決問題與下一步

### 9.1 已可確定的設計

1. v1 普通、單一且無衝突的來源事實保存純值，由作品來源區共同追溯；只有六類例外使用欄位級 provenance。
2. 正式使用四種 `provenance_type`。
3. 正式使用五種 `evidence_level`；v1 採精簡 Evidence Record 與文章級 evidence scope，逐 Claim 追溯 Deferred。
4. Remotion 宣傳片及 AI 圖永遠不構成原片觀看證據。
5. Source facts、Editorial、Evidence、Publishing 分區保存。
6. 作品 v1 stable ID 採 `cc18:{normalized_catalog_code}`；無番號與衝突由映射報告列為例外。
7. 題材標籤沿用現有英文 ID；演員、片商、系列 v1 只建立 entity candidates，永久 UUID 與 merge／redirect Deferred。
8. 基本卡允許缺值並自動縮減，不用推測值補版。
9. v1 只實作基本卡資格。顯示標題依短標題、繁中翻譯、文章主標題、來源標題、番號 fallback；舊 Markdown `title` 映射為 `article_title`，不映射為 `display_short_title`；進階卡 Deferred。
10. 不設總分、星等或無量測依據的精準評分。
11. Git Movie Master 是標準化內容資料權威；Source Record 負責原始事實、Markdown 負責正文、Media Manifest 負責生成媒體、D1 負責營運狀態，Registry 暫留相容快照。
12. Movie Master v1 Publishing 只保存 `is_published`、`published_at`、legacy publishedAt reference、`canonical_url`、`indexability`、`content_hash`；正式 hash 只涵蓋 canonical serialization 後的主要讀者可見內容。
13. `PROMO_CLIP` 只支持明確標示的局部片段觀察；全片觀看型篩選最低需要有效 `DISTRIBUTED_SAMPLE`。
14. `story` 保留為有正式來源映射門檻的 Topic ID；`contrast-charm` 固定為 Editorial viewpoint；舊 `canonicalTagIds` 不作 canonical topic 權威。
15. `PUBLIC_METADATA` 文章的觀看式確定語句進入局部 `EVIDENCE_SCOPE_REVIEW`，不因此整篇退稿；逐句 Claim link Deferred。
16. 24 部舊資料唯讀映射與守恆報告已完成，四項映射語意已定案；下一步可建立正式 Movie Master v1。

### 9.2 需要使用者決定的問題

本輪已決定 `PROMO_CLIP` 權限、標題 fallback、舊 `publishedAt`、`content_hash`、Topic／Editorial channel、題材英文 ID 與 Git Movie Master 權威分工。建立 Movie Master v1 前沒有新的必要產品決策；不得為了處理尚未出現的例外提前擴張 Schema。

若映射實際發現無番號作品、番號衝突、同一英文題材 ID 多重語意或無法保存的現有欄位，再把具體樣本提交使用者決定。

### 9.3 必須等實際資料驗證後才能決定

- 番號是否足以作所有作品的唯一業務鍵，以及無番號作品比例。
- 現有演員、片商、系列名稱的別名重複率與可自動合併比例。
- 現有53個 Taxonomy 英文 ID 是否存在語意衝突；v1 先沿用，不因驗證而自動換 ID。
- `PROMO_CLIP` 與 `DISTRIBUTED_SAMPLE` 各自能覆蓋多少新片。
- 分散抽樣要達到什麼窗口分布，故事密度／節奏才具有足夠代表性。
- Source facts 的合理 stale 期限；日期、片商與封面可能需要不同期限。
- 現有24部中有多少篇能映射文章級 evidence level／scope，以及四個觀看型欄位的 Evidence ref。
- Registry、D1、Markdown 與線上頁面的衝突型態是否能以規則自動裁決。
- 官方預告或來源片段的授權、保存與前台播放政策。

### 9.4 下一個最小步驟

依已核准的 `v1 Minimum Implementation Profile` 與完成審查的唯讀映射報告，下一步可以建立正式 Movie Master v1。實作仍不得自行建立 Deferred 欄位、逐句 Claim links、永久實體 UUID 或額外治理資料。

文章 `EVIDENCE_SCOPE_REVIEW` 是獨立後續 QA 工作，不阻擋 Movie Master 建立；在 Movie Master 可驗證前，仍不應開始改首頁、作品卡、搜尋篩選或批次前台遷移。
