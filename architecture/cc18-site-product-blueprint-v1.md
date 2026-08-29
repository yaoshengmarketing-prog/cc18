# CC18 唯一產品藍圖 v1

文件狀態：`APPROVED v1`  
版本：`1.1.0`  
盤點基準日：2026-08-29（Asia/Taipei）  
適用網站：CC18 影格繁體中文站  
Current deployment：`https://cc18.pages.dev/`  
Approved production domain：`https://jav.com.tw/`

## 1. 藍圖定位

### 1.1 產品假設

> CC18 不是單純影評站，而是以繁體中文整理成人作品資料、人物名稱、番號、系列、題材與影片觀看前資訊的作品資料與選片指南。

本站的主要價值依序是：

1. 讓使用者用番號、人物名稱、別名、系列或題材找到作品。
2. 把 cc18.tv 的來源資料整理成可理解、可追溯、適合台灣讀者的繁體中文資訊。
3. 在使用者觀看前，交付封面、日期、人物、系列、題材、公開簡介、證據範圍與編輯摘要。
4. 讓使用者從一部作品繼續探索人物、系列、題材與相關作品。
5. 將有觀看意願的使用者導向 cc18.tv 對應作品頁。

影評仍是可保留的高價值內容，但不是每部作品的強制格式。資料充分、確有比較價值或具備觀看證據時，可寫深度影評；其他作品可以只提供完整作品資料、觀看前摘要與清楚的證據範圍。不可為了篇幅而灌入重複或無法驗證的主觀文字。

### 1.2 不變的資料原則

- 來源事實、程式推導、編輯判斷與觀看證據必須分開。
- 缺值直接保留空值或在前台隱藏，不由 AI 猜測補滿。
- 來源名稱與繁中顯示名稱分離；平假名、片假名不得自行猜成漢字。
- Remotion 9 秒宣傳片及 AI 原創圖片不是來源影片，也不是觀看證據。
- 不使用無依據的星等、總分或假精確評分。
- 產品頁的價值由資料完整度、可找性、關聯性與實際解答能力決定，不由字數決定。

## 2. 狀態標記與現況基線

### 2.1 狀態定義

| 狀態 | 定義 |
| --- | --- |
| `CURRENT` | 已存在於目前程式或正式網站，且能實際使用。 |
| `APPROVED_NOT_PUBLIC` | 已核准或已實作為資料底座／預覽，但尚未成為正式公開入口。 |
| `PROPOSED_V1` | 本藍圖建議納入第一版產品接入。 |
| `DEFERRED` | 有產品價值，但需等資料量、證據或前置能力成熟。 |
| `DO_NOT_BUILD_YET` | 現在建置會造成錯誤權威、薄頁、重複系統或過度成本。 |

### 2.2 已查核的資料與頁面

本藍圖以以下現有內容為事實基礎：

- `architecture/cc18-content-data-model-v1-draft.md`：Movie Master v1 核准規格，狀態 `approved-v1`、版本 `1.2.0`。
- `architecture/cc18-v1-readonly-mapping-report.md`：舊內容映射、衝突與 Evidence 風險盤點。
- `architecture/cc18-source-taxonomy-readonly-audit.md`：cc18.tv 分類、關聯與 Remotion 媒體角色盤點。
- `architecture/cc18-frontend-content-localization-rules-v1.md`：繁中人物與標題顯示永久規則。
- `data/movie-master/index.json` 與 19 份 Master：18 部正式作品、1 部 Demo；其中 15 部已發布、3 部正式草稿、1 部 Demo。
- 19 份 Master 的文章證據：17 部 `PUBLIC_METADATA`、1 部 `DISTRIBUTED_SAMPLE`、1 部 Demo 為 `UNKNOWN`。
- `data/localization/performers-zh-tw.json`：14 位人物；4 位有核准繁中顯示名、4 位有可搜尋但不可作主要顯示名的來源標題別名。
- `data/search-index-v1.json`：15 部已發布作品、14 位人物；排除 3 部正式草稿與 1 部 Demo。
- Astro 路由、首頁、Latest、作品頁、人物、系列、題材、搜尋、方法頁及 MovieCardV1 預覽。
- 15 部已發布作品均有 `remotion_promo_ref`，指向站內 Remotion 9 秒宣傳片。
- Current deployment 是 `https://cc18.pages.dev/`；Approved production domain 與未來正式 canonical 基準是 `https://jav.com.tw/`。正式網域尚未綁定，本文件不得把 pages.dev 誤寫為長期正式 canonical。cc18.tv 僅是來源與 CTA 目的地。

### 2.3 目前產品能力矩陣

| 能力 | 狀態 | 現況與限制 |
| --- | --- | --- |
| Movie Master v1 | `CURRENT` | Git 中已有 19 份 Master 與 index，是標準化內容資料權威。 |
| Source Record | `CURRENT` | 保存來源事實；10 部已發布作品已有 typed performer relation，fac／series／tag 尚未完整接線。 |
| 正式站內搜尋 v1 | `CURRENT` | `/search/` 使用 Movie Master、人物字典與 taxonomy；支援番號、片名、人物繁中／日文／來源名／可搜尋別名與部分比對。 |
| 搜尋頁 SEO | `CURRENT` | `noindex,follow`、固定 canonical、不進 sitemap。 |
| 現有首頁與 Latest | `CURRENT` | 已公開，但仍由 Markdown collection 與舊 `ReviewCard` 驅動，不是 Movie Master 投影。 |
| 現有作品頁 | `CURRENT` | `/reviews/{slug}/` 已發布 15 部；包含資料、標籤、影片、文章、CTA、Article／VideoObject／Breadcrumb。仍由 Markdown 為主要頁面輸入。 |
| 演員索引與演員頁 | `CURRENT` | 已公開，但仍依 Markdown 姓名字串與 name-based URL 建立，不符合 stable actor ID 的長期要求。薄頁採 noindex 門檻。 |
| 系列索引與系列頁 | `CURRENT` | 已公開，但仍依 Markdown 系列字串建立；typed series relation 尚未接線。 |
| 題材索引與題材頁 | `CURRENT` | 已公開，以 canonical taxonomy ID 建頁；現有頁面仍從 Markdown 聚合。 |
| MovieCardV1 | `APPROVED_NOT_PUBLIC` | 15 張已發布卡片已在 `/preview/movie-master-cards/` 驗證；預覽頁 `noindex,nofollow`、不在導覽與 sitemap。 |
| 人物繁中顯示資料 | `APPROVED_NOT_PUBLIC` | 已進 Movie Master、搜尋與卡片預覽；舊演員 Hub 尚未改用 stable actor ID。 |
| 9 秒選片短影音 | `CURRENT` | 15 部作品已產生，在作品頁扮演站內宣傳／選片 Hook；不是官方預告與觀看證據。 |
| Evidence 分級 | `CURRENT` | 資料層已保存文章級證據；前台尚未形成一致、簡潔的觀看前證據標示。 |
| 自動 sitemap／canonical／robots | `CURRENT` | Astro sitemap＋postbuild 排除 noindex；目前輸出仍以 pages.dev 為基準。切換至 jav.com.tw 與 pages.dev 全站防重複索引尚未實作。 |
| 作品 URL 遷移 | `PROPOSED_V1` | 已定案由 `/reviews/{slug}/` 遷至 `/works/{slug}/`；須在 MovieCardV1 接入首頁及 Latest 前完成一對一 301 與全站回歸。 |
| 正式作品卡全面接入 | `PROPOSED_V1` | URL 遷移完成後先接 Latest，再接首頁；不得維持兩套作品卡資料邏輯。 |
| stable 人物頁 | `PROPOSED_V1` | 要先由 stable actor ID 建立可維護 URL，再替換 name-based 人物頁。 |
| 題材百科 | `PROPOSED_V1` | 只為資料量與內容門檻足夠的 canonical topic 建立。 |
| 片商、番號前綴、完整月份庫 | `DEFERRED` | 需 typed relations、資料量與來源語意先成熟。 |
| 全片觀看指南與進階篩選 | `DEFERRED` | 需 `DISTRIBUTED_SAMPLE` 或更高 Evidence；目前只有 1 部符合。 |
| 大型 UUID、全站 fac 自動合併、逐句 Claim link | `DO_NOT_BUILD_YET` | 超出 v1，需要更多來源樣本與明確產品價值。 |

## 3. 產品使用需求

| 使用需求 | 第一版答案 | 主要資料 |
| --- | --- | --- |
| 1. 用番號找作品 | 搜尋支援完整番號、大小寫、全半形與常見連字號差異，結果回到唯一作品。 | Movie Master、Search index |
| 2. 用日文、繁中或別名找演員 | 所有核准名稱與可搜尋別名合併到同一 stable actor ID。 | 人物在地化字典、Search index |
| 3. 查看演員出演作品 | 建立 stable 人物頁後，依 stable actor ID 聚合已發布作品；未完成前由搜尋顯示相關作品。 | typed performer relation、Movie Master |
| 4. 查看最新收錄與未來的新作 | 第一版首頁只提供依本站 `published_at` 排序的「最新收錄」。依 `release_date` 的「最新發行」及本週／本月新作，要等來源覆蓋完整後才提供。 | `published_at`、`release_date`、來源覆蓋狀態 |
| 5. 查看系列完整作品 | 先補 typed series relation；資料不足時只顯示作品欄位，不建立薄 Hub。 | Source Record、series relation |
| 6. 查看題材解釋與相關作品 | canonical taxonomy 提供穩定 ID；達門檻的題材頁加入繁中解釋與作品集合。 | Taxonomy、Movie Master |
| 7. 觀看前了解內容與證據範圍 | 顯示來源簡介整理、編輯摘要與 Evidence 標示；具體觀察不得超出證據範圍。 | Source Record、Editorial、Evidence |
| 8. 從作品繼續探索 | 作品頁連到人物、題材、系列及相關作品；只使用已驗證關係。 | Movie Master 投影、stable entities |
| 9. 前往來源作品頁觀看 | 作品頁保留低干擾、清楚標示的 cc18.tv CTA。 | `source_url` |
| 10. 從 GSC query 補內容 | 部署累積查詢後，以真實問題新增 FAQ、別名說明或題材解釋；不預先量產猜測型文章。 | GSC、Search Console landing query |

## 4. 內容類型藍圖

URL 均為候選；除現有路由外，本輪不代表已建立或已核准遷移。

| 內容類型 | 用途與最低資料 | URL 候選 | 索引原則 | v1 判定 |
| --- | --- | --- | --- | --- |
| 作品資料頁 | 回答番號、片名、日期、封面、人物、來源、題材與觀看前摘要。最低需基本卡資格、來源 URL、可追溯資料；評論可選。 | `/works/{slug}/`；舊 `/reviews/{slug}/` 一對一 301 | 已發布、`INDEX`、有獨特資料與 canonical 才索引；草稿／Demo noindex。 | `PROPOSED_V1`：先遷移 URL，再重整資訊層級。 |
| 演員人物頁 | 統一日文名、繁中名、來源名、可搜尋別名與出演作品。最低需 stable actor ID、核准顯示名、至少一部已發布作品。 | `/actresses/{stable-source-id}/`；實作前定義數字 ID 與完整 stable ID 的映射契約 | 一部作品且無獨特人物資訊時 noindex；達作品量或有可靠名稱關係說明才 index。 | `PROPOSED_V1` |
| 最新收錄／最新發行／月份頁 | 「最新收錄」依本站 `published_at`；「最新發行」依作品 `release_date`；本週／本月新作另要求來源覆蓋完整。 | `/latest/`；未來候選 `/releases/`、`/releases/2026-08/` | 第一版 `/latest/` 只承擔最新收錄；月份頁須有連續、可驗證的來源覆蓋才進 sitemap。 | 最新收錄 `PROPOSED_V1`；最新發行與月份頁 `DEFERRED` |
| 系列頁 | 整理系列順序、差異與作品集合。最低需 typed series ID、名稱與至少兩部本站已發布作品。 | `/series/{stable-slug}/` | 單作品或關係未驗證時 noindex；不可只靠同名字串合併。 | `DEFERRED`（現有骨架保留） |
| 題材百科與題材 Hub | 解釋台灣讀者使用的題材詞、來源同義詞及相關作品。最低需 canonical tag ID、繁中顯示名、映射證據、足夠作品。 | `/topics/{tag-id}/` 或保留 `/tags/{tag-id}/` | 有獨特解釋與足夠作品才 index；純清單薄頁 noindex。 | `PROPOSED_V1`：優先改善少數高價值題材。 |
| 片商／品牌頁 | 整理 fac 對應作品，但 fac 可能混合片商、品牌、Label。最低需 typed fac relation 與語意確認。 | `/studios/{stable-slug}/` | 未確認 fac 語意或只有單一作品時不索引。 | `DO_NOT_BUILD_YET` |
| 番號前綴與番號知識頁 | 回答前綴代表什麼、相關品牌與作品。最低需可靠關係、足夠樣本及可引用說明。 | `/catalog-prefix/{prefix}/` | 需有可靠解釋，不可只聚合相同字首。 | `DEFERRED` |
| 影片觀看前指南 | 根據證據說明內容走向、呈現方式、故事密度、節奏及適合對象。最低需清楚 Evidence scope；全片型判斷至少 `DISTRIBUTED_SAMPLE`。 | 先作作品頁模組；未來可有 `/guides/.../` | 作品頁內模組隨 canonical 索引；獨立指南需具獨特價值。 | `DEFERRED` |
| 名稱／改名／別名關係 | 幫使用者理解同一人物不同寫法。最低需 stable actor ID、來源或市場查證。 | 優先置於人物頁，不建獨立 alias 頁 | 可見內容才有 SEO 價值；不可把別名藏成關鍵字。 | `PROPOSED_V1`：人物頁內呈現。 |
| 編輯整理與少量精選影評 | 對特別題材、系列差異或具證據作品提供深度選片觀點。 | 作品頁內，未來可有 `/editorial/` | 有獨特觀點與資料才索引；不要求每部長文。 | `PROPOSED_V1`：少量保留。 |
| 問題型搜尋內容 | 回答 GSC 已出現的實際問題，如別名、系列順序、題材差異。 | 人物／題材／作品頁 FAQ；必要時獨立 `/answers/.../` | 必須有真實需求與可驗證答案；避免大量相似問答頁。 | `DEFERRED` 至有 GSC 資料 |
| 搜尋結果頁 | 即時找作品與人物，不承擔可索引落地頁。 | `/search/?q=...` | 固定 `noindex,follow`、不進 sitemap、固定 `/search/` canonical。 | `CURRENT` |

## 5. 資訊架構與 URL 決策

### 5.1 作品主 URL：採 `/works/{slug}/`

產品決策已定案：CC18 仍在早期階段，且定位已由純影評轉為作品資料與選片指南，因此作品主 URL 採 `/works/{slug}/`。

遷移契約：

1. 現有 15 個 `/reviews/{slug}/` 必須逐一對應到相同作品的 `/works/{slug}/`，並回傳永久 301；不得導向首頁或模糊集合頁。
2. `/works/{slug}/` 成為唯一 indexable canonical。舊 `/reviews/` URL 不得繼續自我 canonical，也不得同時出現在 sitemap。
3. sitemap、麵包屑、Article／VideoObject／Breadcrumb Schema、搜尋結果、MovieCard、首頁、Latest、人物、系列、題材及所有站內連結必須同步更新。
4. 需驗證 15 個新 URL 為 HTTP 200、15 個舊 URL 為一對一 301，且 redirect 後 canonical、內容與 stable movie ID 一致。
5. URL 遷移必須在 MovieCardV1 正式接入首頁及 Latest **以前**完成，避免先擴大舊路徑的內部連結量後再遷移。
6. 301 規則須長期保留；未來英文獨立站可自行採用 `/works/`，但不共用繁中站 canonical。

本輪只在藍圖定案，不執行任何 URL、canonical、redirect、sitemap 或頁面變更。

### 5.2 第一版導覽候選

建議正式主導覽維持六個清楚入口：

1. 最新
2. 作品
3. 演員
4. 系列
5. 題材
6. 搜尋

其中「作品」在 `/works/` 遷移完成後連到正式作品集合；在集合頁建立前不得新增空入口。人物入口保留 `/actresses/`。片商、番號知識、編輯專題與月份歸檔不進第一版主導覽。cc18.tv CTA 保留為獨立動作，不混同本站導覽。

## 6. 首頁藍圖

首頁的任務是「快速開始搜尋、看最新收錄、選一條探索路徑」，不是把所有內容類型塞在同一頁。

### 6.1 第一版必須模組

建議順序：

1. **定位＋全站搜尋**：一句話說明可用番號、人物名、別名與題材搜尋；沿用正式搜尋 v1。
2. **最新收錄**：Movie Master 驅動，依本站 `published_at` 排序的最新已發布作品卡。此模組不宣稱代表市場完整新作。
3. **演員探索**：只顯示已有 stable actor ID、可靠顯示名與已發布作品的人物。
4. **題材入口**：精選少數有清楚繁中名稱、足夠作品與可用解釋的 canonical topics。
5. **低干擾 CTA**：頁尾或作品探索後說明完整影片在 cc18.tv，不讓 CTA 壓過本站資訊價值。

### 6.2 第一版已定案的小型模組

- **9 秒看重點**：首頁顯示 3–6 部已有 Remotion 資產的作品，不大量自動播放。完整媒體名稱仍為「9 秒選片短影音」；前台不得稱為官方預告、原片摘要或觀看證據。

### 6.3 第一版可選模組

- **編輯整理**：只放真正有差異的少量精選，不建立「每部都必須是長篇影評」的預期。
- **系列入口**：只有 typed series relation 與作品量足夠時才加入。

### 6.4 延後模組

- 新作月份永久歸檔。
- 番號前綴知識。
- 片商／品牌探索。
- 依故事密度、節奏、拍攝方式的進階選片器。

這些延後不是因為不重要，而是目前資料不足，過早加入會產生薄頁、錯誤關聯或看似精準但無證據的篩選。

## 7. 資料與頁面權責

| 資料層 | 唯一責任 | 對前台的輸出 | 不應承擔 |
| --- | --- | --- | --- |
| Source Record | 保存 cc18.tv 當次抓取的原始作品事實與 typed source relations。 | 來源標題、日期、簡介、封面、來源名稱、來源 URL。 | 前台翻譯、發布狀態、主觀判斷。 |
| Movie Master | Git 中標準化作品內容資料權威。 | 基本卡、搜尋、作品頁與 Hub 的共同作品投影。 | D1 job／retry／lease；完整來源觀察歷史。 |
| 人物在地化字典 | 保存 stable actor ID、日文名、繁中顯示名、來源名與可搜尋別名。 | 人物顯示與搜尋名稱。 | 猜測漢字、覆寫來源名稱、建立重複人物。 |
| Taxonomy | 保存 canonical topic ID、繁中顯示與來源映射。 | 題材標籤、題材 Hub、搜尋詞。 | 熱門排行、編輯觀點與來源詞的無條件合併。 |
| Markdown | 保存讀者可見文章正文及文章主標題。 | 精選影評、編輯整理與可讀正文。 | 原始來源事實權威、卡片清單母體。 |
| Media Manifest | 保存原創 Hero、直式圖與 Remotion 影片資產紀錄。 | 圖片與 9 秒選片標記／播放器。 | 原片 Evidence、官方預告身分。 |
| Evidence | 保存影片分析層級、來源、範圍與摘要。 | 觀看前資訊的證據標示與可用判斷。 | 由文章語氣反推證據等級。 |
| Search index | 由已發布 Movie Master、人物字典與 Taxonomy 建置的查詢投影。 | `/search/` 的人物與作品結果。 | 手動維護第二份作品清單。 |
| 前台頁面投影 | 依頁面任務選取已核准欄位並隱藏缺值。 | 卡片、詳情、Hub、搜尋與 CTA。 | 翻譯、猜值、實體合併或資料修復。 |

### 7.1 第一版真正的資料缺口

1. **繁中作品標題與 `display_short_title`**：目前 19/19 有 `article_title`，但 `translated_title_zh_tw` 與 `display_short_title` 都是 0；卡片只能暫用較長文章標題。
2. **fac／series／tag typed relations**：performer 已有局部接線，其他關聯仍會阻擋可靠的片商、系列與來源標籤連結。
3. **stable 人物頁 URL**：現有 `/actresses/{name}/` 依姓名建路由，改名或別名可能產生重複頁。
4. **兩種時間投影**：`latest_added`／最新收錄依本站 `published_at`；`latest_release`／最新發行依作品 `release_date`。目前尚未保存足以證明市場完整性的來源覆蓋狀態，本週／本月新作不可提前宣稱完整。
5. **觀看前指南 Evidence**：只有 HUNTC-568 達 `DISTRIBUTED_SAMPLE`；其他正式作品為 `PUBLIC_METADATA`，不得建立全片節奏或拍攝方式篩選。
6. **正式頁面資料源仍雙軌**：搜尋與預覽用 Movie Master；首頁、Latest、作品頁、人物、系列與題材多數仍讀 Markdown。

### 7.2 v1 只補最小能力

- 先補搜尋 v1.1 的一字人物搜尋，再補 15 部已發布作品的繁中顯示標題與卡片短標題，不改 `source_title`。
- 先完成 `/reviews/` 至 `/works/` 一對一 301 與 canonical 遷移，再把 MovieCardV1 與中立的已發布作品投影接入正式列表。
- 人物頁以既有 stable actor ID 建可靠路由與 redirect 規則。
- typed relations 一次只補前台確實要用的關係，來源權威仍在 Source Record。
- 觀看前資訊依現有 Evidence 分級顯示；沒有影片證據時只說公開資料能支持的內容。

不建立完整大型 Schema、全站 UUID、逐句 Claim link、進階個人化或全資料庫自動合併。

## 8. 搜尋與探索藍圖

### 8.1 已上線搜尋

正式搜尋 v1 已支援：

- 15 部已發布且 `INDEX` 的作品。
- 番號、來源標題、文章標題、slug、canonical topic 與解析後人物名稱。
- 人物 `display_name_zh_tw`、`name_ja`、`source_name`、`searchable:true` 別名。
- 連續部分文字、大小寫、全半形與番號連字號正規化。
- 同一人物依 stable actor ID 合併；同一作品依 stable movie ID 去重。

搜尋結果頁維持工具頁角色，不作 SEO 落地頁。

### 8.2 搜尋 v1.1：一字人物搜尋

搜尋 v1.1 是正式首頁改版前的獨立小階段，規則如下：

- 一個中文漢字、日文漢字、平假名或片假名，可搜尋人物的 `display_name_zh_tw`、`name_ja`、`source_name` 與 `searchable:true` 別名。
- 一字查詢只走人物名稱索引，不掃作品長標題、題材、簡介、正文或其他一般文字，避免資料量增加後產生大量雜訊。
- 一字搜尋回傳所有名稱欄位或 `searchable:true` 別名包含該字的人物，不要求只有唯一結果；任何有效人物及其已發布相關作品都必須保留。
- 兩個可見字元以上，維持目前人物、作品、標題、題材與番號搜尋。
- 一個拉丁字母或單一數字仍判定查詢過短。
- 一字、二字、三字與完整名稱命中時，人物以 stable actor ID 合併；其相關作品以 stable movie ID 合併。
- 一字結果排序優先考慮主要顯示名、日文原名或來源名稱的命中，再考慮 `searchable:true` 的來源標題別名命中；排序只改變先後，不得刪除有效結果。
- 部分命中只影響召回，不改變人物主要顯示名稱，不把來源標題別名升級為正式繁中名。
- 搜尋頁繼續使用 `noindex,follow`、固定 `/search/` canonical 並排除於 sitemap。

最低驗收案例：

| 查詢 | 必須包含的人物 | 作品結果 |
| --- | --- | --- |
| `星`、`空`、`ね` | 至少包含 `cc18.tv:actor:54454`；未來若有其他人物有效命中也一併顯示 | 顯示所有命中人物的已發布相關作品，依 stable movie ID 去重 |
| `音` | `cc18.tv:actor:28932`（人物名稱「美咲音」）及 `cc18.tv:actor:54454`（來源標題別名「星空音琉」） | 兩位人物的已發布相關作品都顯示，作品依 stable movie ID 去重 |
| `星空`、`音琉` | 至少包含 `cc18.tv:actor:54454` | 顯示所有命中人物的已發布相關作品，依 stable movie ID 去重 |
| `星空音琉`、`星空ねる` | 至少包含 `cc18.tv:actor:54454` | 顯示關聯的已發布作品；不得因名稱寫法建立第二個人物或作品 |

### 8.3 後續擴充順序

| 搜尋類型 | 前置條件 | 狀態 |
| --- | --- | --- |
| 作品 | 已完成；隨 Movie Master 發布自然增加。 | `CURRENT` |
| 人物 | 已完成名稱搜尋；人物落地頁待 stable URL。 | `CURRENT`／`PROPOSED_V1` |
| 題材 | 已有 canonical tag 名稱搜尋；題材解釋與 Hub 品質待補。 | `CURRENT`／`PROPOSED_V1` |
| 系列 | 需 typed series relation 與 stable series ID。 | `DEFERRED` |
| 片商 | 需確認 fac 是 maker、label、brand 或混合語意。 | `DO_NOT_BUILD_YET` |
| 番號前綴 | 需可靠前綴知識與足夠作品樣本。 | `DEFERRED` |
| 新作月份 | 需月份完整性、日期分組與歸檔規則。 | `DEFERRED` |

任何語言或別名命中，都必須回到同一 stable entity，不因顯示文字產生第二個人物或作品。

## 9. SEO 架構

### 9.1 共通原則

- 每種可索引頁都要回答明確搜尋意圖，不能只因資料庫有一個欄位就建頁。
- 正式網域綁定後，所有 canonical、sitemap URL、結構化資料 URL、Open Graph URL 與分享網址一律使用 `https://jav.com.tw/`。
- 唯一正式主機名採 apex `jav.com.tw`；`https://www.jav.com.tw/` 必須永久 301 到相同路徑與查詢參數的 `https://jav.com.tw/`。
- `https://cc18.pages.dev/` 是 Cloudflare Pages 預覽／部署網域，不是長期 canonical；正式網域上線後，pages.dev 全站必須使用 `noindex,nofollow`，並不得進入正式 sitemap。
- cc18.tv 只作來源連結與 CTA 目的地，不作本站 canonical。
- 搜尋、預覽、草稿、Demo、薄 Hub 使用 noindex，並排除 sitemap。
- 結構化資料必須反映頁面真實可見內容；Remotion 9 秒片長不得當成原片片長。
- 長篇文字不是必要門檻；完整、可驗證、可探索的資料頁可以比灌水影評更有價值。

### 9.2 各內容類型 SEO 契約

| 類型 | 搜尋意圖 | Title／Description 方向 | 索引、canonical、sitemap | Schema 候選 | 內部連結與薄頁門檻 |
| --- | --- | --- | --- | --- | --- |
| 作品頁 | 番號、作品名、人物＋番號、內容資訊 | 番號＋自然繁中標題＋主要人物；描述回答題材與觀看前重點 | 已發布才 index；自我 canonical；進 sitemap | `Article`、`VideoObject`（有站內片時）、`BreadcrumbList`；未來評估 `Movie` | 首頁／Latest／人物／題材／系列導入；最低需基本事實、獨特摘要、來源 CTA。 |
| 人物頁 | 日文名、繁中名、舊名、出演作品 | 主要顯示名＋作品整理；描述可見地列出查證別名 | stable URL；達價值門檻才 index | `Person`、`BreadcrumbList`、`ItemList` | 搜尋與作品頁導入；只有一部且無別名／介紹時 noindex。 |
| 最新收錄／最新發行／月份 | 最新收錄、最新發行、本週新片、某月作品 | 清楚標示排序依據與覆蓋範圍 | Latest 的最新收錄可 index；最新發行與月份頁只有在來源覆蓋連續完整時才 index | `CollectionPage`、`ItemList` | 首頁先導入最新收錄；空月、不完整月份或未證明覆蓋時不建索引頁。 |
| 系列頁 | 系列名、系列順序、系列作品 | 系列名＋收錄順序／差異 | typed relation 驗證後才 canonical；足夠作品才進 sitemap | `CollectionPage`、`ItemList` | 作品互連；單作品且無獨特說明時 noindex。 |
| 題材頁 | 題材意思、相關作品、同義詞 | 台灣用語＋簡明定義＋相關作品 | canonical tag ID URL；有解釋與足夠作品才 index | `DefinedTerm`、`CollectionPage`、`BreadcrumbList` | 作品標籤與首頁入口導入；只有純清單或來源詞未映射時 noindex。 |
| 片商頁 | 品牌／片商作品 | 等 fac 語意確認後再定 | 目前不建 | 未定 | 未確認實體語意前不得形成 SEO Hub。 |
| 番號知識 | 番號前綴意思、品牌關聯 | 需可驗證說明，不只是前綴清單 | 有足夠證據才 index | `Article`／`DefinedTerm` | 由作品頁番號導入；沒有知識內容時不建。 |
| 觀看前指南 | 作品適合誰、內容走向、呈現方式 | 明確標示依公開資料／預告／抽樣觀察 | 優先作作品頁模組；獨立頁需避免與作品頁重複 | `Article`、可能的 `VideoObject` | Evidence scope 是門檻；無證據不寫全片型判斷。 |
| 搜尋結果 | 站內查找 | 固定搜尋工具 Title／Description | `noindex,follow`；固定 `/search/` canonical；不進 sitemap | 通常不需要 | 導向人物與作品；不製造 query 靜態頁。 |

「足夠作品」不採一個全站僵硬數字。v1 建議預設：人物頁至少 2 部，系列／題材至少 3 部；若只有 1 部但有可靠別名關係、獨特定義或高價值解答，可經頁面 QA 例外開放。門檻要以內容是否能提供獨立價值為最終判斷。

### 9.3 GSC 驗證方向

正式改版後，以 landing page 與 query 組合檢查：

- 番號 query：完整番號、無連字號、大小寫變體。
- 人物 query：日文名、繁中名、人物＋番號。
- 名稱別名 query：舊名、來源標題別名、異體字。
- 題材 query：台灣常用詞、來源日文詞、題材＋人物。
- 系列 query：系列名、系列順序、系列＋人物。
- 最新收錄 query 與新作 query 分開觀察：本站新增、最近收錄；以及本週新片、月份＋人物／題材。後者只有來源覆蓋達標後才建立對應頁。

只有 GSC 出現穩定需求後，才補問題型內容與頁面 Title；不為想像中的 query 預先批量建頁。

## 10. CTA 與來源站關係

- CC18 影格資料／選片站與 `https://cc18.tv/` 是兩個不同網站。
- Current deployment 是 `https://cc18.pages.dev/`；Approved production domain 是 `https://jav.com.tw/`。品牌仍為「CC18 影格」，不可因正式網域含 `jav` 而把品牌改成「JAV」。
- 正式網域上線後，jav.com.tw 負責繁中資料整理、人物名稱、搜尋、題材、選片與觀看前資訊；cc18.pages.dev 僅保留為 Cloudflare Pages 預覽／部署來源並維持 noindex。
- cc18.tv 是主要來源前台及完整影片目的地；每部作品使用對應 `source_url` 作 CTA。
- CTA 必須清楚標示會前往 cc18.tv，維持 `sponsored noopener` 等既有外部連結安全／關係屬性。
- 不假設 cc18.tv 每部作品會反向連回本站，也不把反向連結當成產品成立條件。
- 未來來源站若能提供一個全站品牌連結，視為品牌關聯與引薦加分，不改變本站需獨立提供搜尋價值的責任。

## 11. 未來多語站邊界

- 繁中站維持獨立網站，以台灣用語、名稱查證與繁中搜尋意圖為主。
- 未來英文、簡中或其他語言站，使用獨立網域與 Repo；不在本 Repo 建立複雜多語切換。
- 各站可共用 `stable_movie_id`、`stable_actor_id`、來源作品 ID、來源 URL 與其他來源事實。
- 各語言站的顯示名稱、翻譯標題、文章、搜尋字典、Taxonomy 顯示、設計、canonical、hreflang 與 SEO 決策各自負責。
- 共用 stable ID 不代表共用 URL、索引狀態或編輯內容。

## 12. 營運型資料服務

以下能力是網站可靠性服務，不是新的內容類型，也不代表本輪要一次實作：

| 服務 | 目的 | 最小紀錄 |
| --- | --- | --- |
| 來源作品 URL 失效檢查 | 發現 cc18.tv 作品頁下架、改址或暫時不可用。 | URL、HTTP 結果、檢查時間、連續失敗次數、人工確認狀態 |
| 封面失效與 fallback 監測 | 避免卡片出現大片空白，並區分來源封面失效與本站 fallback 失效。 | 資產 URL、檢查結果、fallback 狀態、最後成功時間 |
| 人物改名／別名更正紀錄 | 讓顯示名稱更新仍回到同一 stable actor ID。 | stable actor ID、舊值、新值、證據、核准時間、redirect 影響 |
| 來源資料最後確認時間 | 讓讀者與維護者知道作品事實何時被確認。 | `source_fetched_at`、`source_verified_at`、來源 reference |
| CTA 目的地可用性 | 避免主要導流按鈕連到失效或錯誤作品。 | stable movie ID、目的 URL、HTTP 結果、最後成功時間 |
| GSC 索引與 query 回讀 | 驗證哪些頁被索引、哪些真實查詢值得補內容。 | landing page、query 類型、曝光／點擊趨勢、檢查期間 |

這些服務應以排程、Log 與例外處理支援既有資料頁，不應各自生成新的公開 SEO 頁。

## 13. 實作階段與依賴

### Phase 0：搜尋 v1.1 一字人物搜尋

- **使用者得到**：輸入 `星`、`空`、`音`、`ね` 等單一中日文字元，也能找到正確人物及已發布作品。
- **SEO 得到**：搜尋本身維持 noindex，但改善人物與別名探索，為 stable 人物頁累積可驗收行為。
- **需要資料**：現有 14 人字典、`searchable:true` aliases、stable actor ID、已發布作品關係。
- **現在不要做**：一字查詢不掃作品長標題、題材或正文；單一拉丁字母／數字不開放。

### Phase 1：15 部繁中作品標題與卡片短標題

- **使用者得到**：15 部作品在卡片上有自然、易掃讀的台灣繁中標題。
- **SEO 得到**：作品 Title 與站內錨文字更貼近番號＋人物＋題材意圖。
- **需要資料**：`source_title`、`article_title`、核准的 `translated_title_zh_tw`、`display_short_title` 與查證紀錄。
- **現在不要做**：不覆寫來源標題、不用 AI 猜人物漢字、不批量改正文。

### Phase 2：作品 URL 遷移至 `/works/`

- **使用者得到**：作品路徑與資料／選片指南定位一致，舊書籤仍可自動抵達同一作品。
- **SEO 得到**：15 組一對一 301、單一 jav.com.tw canonical、更新後 sitemap、Schema、麵包屑、搜尋結果與內部連結。
- **需要資料**：15 部 slug／stable movie ID 對照、redirect 規則、正式網域設定與全站 URL 清單。
- **現在不要做**：不做批次導首頁、不保留雙 canonical、不在遷移驗證前接入新版首頁卡片。

### Phase 3：MovieCardV1 接入 Latest 與首頁

- **使用者得到**：Latest 與首頁使用一致的 3／2／1 欄作品卡；首頁另有 3–6 部「9 秒看重點」。
- **SEO 得到**：公開列表的內部連結與作品資訊由同一 Movie Master 投影產生，連向 `/works/`。
- **需要資料**：Movie Master、MovieCardV1、中立卡片 loader、`published_at` 最新收錄排序、Remotion asset 狀態。
- **現在不要做**：不宣稱最新收錄等於市場最新發行；不大量自動播放；不另建卡片清單。

### Phase 4：stable actresses 人物頁與人物索引

- **使用者得到**：日文名、繁中名與別名回到同一人物，並查看已發布出演作品。
- **SEO 得到**：`/actresses/{stable-source-id}/` 提供穩定落地頁；舊 name-based URL 一對一 301。
- **需要資料**：stable actor ID、人物字典、typed performer relations、數字 ID 與完整 stable ID 的映射契約。
- **現在不要做**：不全面抓所有 cc18.tv 人物、不以姓名當 ID、不自動合併低信心候選。

### Phase 5：少數高價值題材 Hub 與內部連結

- **使用者得到**：看懂自然的台灣成人題材詞、精確定義、相近詞差異與相關作品。
- **SEO 得到**：少數有解釋力的題材 Hub，而非大量薄標籤頁。
- **需要資料**：canonical taxonomy、來源映射、繁中定義、實際相關作品與薄頁門檻。
- **現在不要做**：不合併相近但不同題材、不把 editorial viewpoint 當 topic、不為全部 raw tag 建頁。

### Phase 6：系列、來源 typed relations 與可靠的新作能力

- **使用者得到**：系列順序、可靠的最新發行，以及在來源覆蓋達標後的本週／本月新作。
- **SEO 得到**：系列與新作意圖可形成可信集合頁，不把零散收錄冒充市場全集。
- **需要資料**：fac／series／tag typed relations、來源觀察時間、衝突狀態、連續抓取覆蓋與月份完整性。
- **現在不要做**：不把熱門／推薦位置寫成永久事實；來源覆蓋未達標時不建立月份新作頁。

### Phase 7：影片觀看前指南

- **使用者得到**：清楚知道資訊依公開資料、預告、抽樣或完整觀看而來，能更安心選片。
- **SEO 得到**：具證據的長尾選片問題與內容差異。
- **需要資料**：Evidence record、scope 顯示、局部 QA、足夠的 `DISTRIBUTED_SAMPLE`。
- **現在不要做**：不以 Remotion／AI 圖升級 Evidence、不在 `PUBLIC_METADATA` 下寫全片確定判斷。

### Phase 8：SEO 與網站完整缺口驗收

- **使用者得到**：正式網域、導覽、作品路徑、來源連結與裝置體驗一致且可靠。
- **SEO 得到**：jav.com.tw canonical、sitemap、Schema、Open Graph、301、薄頁與內部連結完整驗收；pages.dev 防重複索引。
- **需要資料**：正式網域綁定、apex 主機名設定、www 至 apex 永久 301、HTTPS、Cloudflare redirect、crawl、GSC、PageSpeed 與實際裝置結果。
- **現在不要做**：不只看 build 通過就宣稱 SEO 完成，不讓 jav.com.tw 與 pages.dev 同時可索引。

### Phase 9：新作品自動取得、分析、產製與發布

- **使用者得到**：來源批次新增時仍能快速看到完整新作資料與可靠選片資訊。
- **SEO 得到**：穩定的新作覆蓋與持續更新，而不是偶發批量灌文。
- **需要資料**：持久化佇列、typed parser、去重、編輯 QA、媒體重試、發布投影、可靠性監測與成本紀錄。
- **現在不要做**：不在 Phase 0–8 尚未穩定前全面開每日自動發布；單部失敗不得阻塞其他作品。

## 14. Codex 能力與外部依賴

| 類型 | 可完成工作 |
| --- | --- |
| Codex 可直接完成 | Repo 盤點、資料投影、元件與路由實作、測試、SEO 技術檢查、redirect／sitemap 規格、Movie Master／Search index 接線、CI 驗證。 |
| 需要已登入瀏覽器 | cc18.tv 受權限保護的作品頁／影片觀察、Cloudflare 帳號設定、GSC 後台、需要現有登入狀態的正式部署畫面確認。 |
| 需要使用者產品決策 | 本版核心產品選擇及 apex 正式主機名均已定案；後續只需決定個別題材頁的公開優先順序等內容取捨。 |
| 需要市場名稱人工／來源查證 | 人物繁中通用名、藝名更換、日文假名的正式漢字、fac／品牌語意、題材台灣慣用說法。 |
| 需要 GSC 或部署後資料 | 實際 query 優先順序、哪些 Hub 值得 index、月份頁需求、Title 點擊率、問題型內容選題與薄頁門檻調整。 |

Codex 可以完成技術閉環，但不能以程式推論取代市場名稱查證、產品選擇或實際觀看 Evidence。

## 15. 已定案產品決策

1. **作品 URL**：主 URL 採 `/works/{slug}/`；現有 15 個 `/reviews/{slug}/` 一對一 301。遷移在 MovieCardV1 接入首頁與 Latest 前完成。
2. **人物 URL**：保留 `/actresses/`；未來採 `/actresses/{stable-source-id}/`，不以姓名作唯一身分。舊 name-based URL 一對一 301。
3. **首頁短影音**：第一版加入 3–6 部「9 秒看重點」小模組；正式媒體名稱為「9 秒選片短影音」，不宣稱官方預告、原片摘要或 Evidence。
4. **題材用語**：Hub 可使用正確、自然且台灣市場常見的成人關鍵詞，但必須有來源、定義與實際作品；相近但不同題材不合併，不為全部 raw tag 建薄頁。
5. **品牌與網域**：品牌保留「CC18 影格」，長期副標為「作品資料與選片指南」；Approved production domain 與唯一 canonical 主機名為 apex `https://jav.com.tw/`，`https://www.jav.com.tw/` 永久 301 至 apex，網域名稱不取代品牌。

正式上線前還必須完成：jav.com.tw 綁定、HTTPS、www 至 apex 永久 301、`/reviews/` 至 `/works/` redirect、jav.com.tw canonical／sitemap／Schema／Open Graph／分享網址，以及 cc18.pages.dev 全站 `noindex,nofollow` 防重複索引。

## 16. 本文件邊界

本文件是產品定位、資訊架構與實作優先順序草案，不是新的大型治理制度，也不是實作授權。建立本文件不代表修改任何既有程式、資料、URL、首頁、文章、搜尋、Movie Master、Cloudflare、Publisher、canonical、robots 或 sitemap；也不代表已建立本文所列的 `PROPOSED_V1`、`DEFERRED` 或 `DO_NOT_BUILD_YET` 能力。
