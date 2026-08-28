# CC18.tv 來源分類與關聯結構唯讀盤點

- 文件狀態：`readonly-audit`
- 盤點日期：2026-08-29（Asia/Taipei）
- 來源前臺：<https://cc18.tv/>
- 影評網站 canonical 基底：<https://cc18.pages.dev/>
- Git 基準：`3b2d66575d0dab10217b411d89289d80de0d1d87`
- 正式樣本：18 部 Movie Master；`CC18-DEMO-001` 排除

## 1. 結論摘要

`cc18.tv` 不是單純的分類目錄，而是「主頻道／營運入口、人工分類樹、具數字 ID 的關聯實體、自由關鍵字搜尋、作品頁」疊合而成的混合式資料圖。

本次可確認四種穩定的來源關聯 URL：

- 出演者：`/search.php?s_type=actor&s_tid={numeric_id}`
- 片商／品牌候選：`/search.php?s_type=fac&s_tid={numeric_id}`
- 系列：`/search.php?s_type=series&s_tid={numeric_id}`
- 原始標籤：`/search.php?s_type=tag&s_tid={numeric_id}`

目前 Movie Master v1 只保存這些關聯的顯示字串，沒有保存來源 `s_type`、`s_tid` 與關聯 URL，因此確實缺少一個最小化的 `source_relations` 區塊。這是資料追溯缺口，不代表本次可以修改 Movie Master。

現有 18 部正式作品中，作品識別、來源 URL、來源標題、日期、公開簡介、封面與來源標籤的既有值都有資料；18 個來源頁本次皆回應 HTTP 200。實際關聯連結的取得情況為：出演者 12/18、`fac` 15/18、系列 5/18、標籤 18/18。來源頁上共確認 16 個出演者連結與 160 個標籤連結。

`fac` 只能先歸類為 `MAKER_OR_LABEL_RELATION`。抽樣沒有證明它必然等於法人片商、製作公司、品牌或 Label；複合名稱和同名 tag 的存在，反而證明現在不能自動拆分或改名。

## 2. 範圍、方法與限制

### 2.1 實際檢查範圍

本次唯讀檢查：

1. `cc18.tv` 首頁及第一層導覽。
2. 女優索引 `/actor_list.php`。
3. 五個分類群組：衣著、職業、身材、身份、動作。
4. 五群組在盤點時列出的 88 個 `cate_c` 子分類連結，只讀取群組頁上已呈現的名稱與 URL，未逐頁爬取全部作品。
5. 三組同名 category/tag 對照頁：制服、巨乳、中出。
6. 三個出演者頁：河北彩花、糸井瑠花、紗倉真菜。
7. 三個 `fac` 頁：S1 Style、Hunter、オーロラプロジェクト・アネックス。
8. 三個系列頁：露出願望に憑りつかれた○○、同期女子と相部屋に！、性感覚醒！人妻エステ。
9. 三個作品頁的頁面結構細查：SNOS-371、HUNTC-568、APNS-419。
10. 現有 18 部正式 Movie Master 的每一個 `source_url`，比對作品頁上的 `actor`、`fac`、`series`、`tag` 連結。

沒有爬取完整資料庫、所有分頁、所有實體頁或所有作品。本報告中的數量只代表上述限定樣本與 2026-08-29 當下前臺。

### 2.2 讀取狀況

一般網頁索引工具可以讀取首頁，但對 `actor_list.php` 與帶 query string 的 `category.php` 回傳 cache／safe URL 限制。改以直接唯讀 HTTP GET 檢查相同公開頁面後，抽樣頁均可正常回應；沒有登入、沒有存取管理後臺、沒有取得影片、沒有繞過會員或播放權限。

### 2.3 Repo 依據

主要比對檔案：

- `data/movie-master/index.json`
- `data/movie-master/*.json`
- `data/source-records/*.json`
- `scripts/source/cc18-parser.mjs`
- `scripts/build-movie-master.mjs`
- `data/taxonomy.json`
- `architecture/cc18-content-data-model-v1-draft.md`
- `architecture/cc18-v1-readonly-mapping-report.md`

現有 parser 的實際語意是：

- `.tag-info a[href*="s_type=actor"]` → `actress`
- `.content a[href*="s_type=fac"]` 第一筆 → `studio`
- `.content a[href*="s_type=series"]` 第一筆 → `series`
- `.tag-info a[href*="s_type=tag"]` → `source_tags`

parser 目前只保存文字，不保存 `s_tid` 或關聯 URL。

## 3. 分類架構與層級

### 3.1 不是單一樹狀分類

前臺大致可視為三層導覽，加上一層平行的作品關聯圖：

1. **主頻道與營運入口**：日本、歐美、國產、無碼、卡通、漫畫、免費、獨家、新片、推薦等。
2. **索引／分類群組**：女優索引，以及衣著、職業、身材、身份、動作五群組。
3. **列表頁**：`cate_c` 子分類、typed search 實體頁、熱門關鍵字結果、排序和分頁。
4. **作品關聯圖（平行於樹狀導覽）**：作品頁以 `actor`、`fac`、`series`、`tag` 連到其他作品集合。

因此「幾層」的答案是：前臺導覽約三層，但資料模型不能只照三層樹建立；作品頁還有一套以 `s_type + s_tid` 表示的關聯圖。

### 3.2 第一層與營運 URL

| 前臺概念 | 觀察到的 URL 例 | 分類 | 是否進永久作品資料 |
|---|---|---|---|
| 新片 | `/?cat=jp&order=latest` | `OPERATIONAL_PLACEMENT` | 否 |
| 週排行 | `?cate={n}&order=weekhot` | `OPERATIONAL_PLACEMENT` | 否 |
| 月排行 | `?cate={n}&order=monthhot` | `OPERATIONAL_PLACEMENT` | 否 |
| 近期更新 | `?cate={n}&order=latest` | `OPERATIONAL_PLACEMENT` | 否 |
| 搶先發行 | `?cate={n}&order=released` | `OPERATIONAL_PLACEMENT` | 否，除非另有作品級來源事實 |
| 首頁獨家／推薦區塊 | section 或 `s_type=event&s_tid=17` | `OPERATIONAL_PLACEMENT` | 否 |
| 日本／歐美／無碼等入口 | `cat`、`zone`、`scate` 或 typed search | `SOURCE_CATEGORY` 候選 | 只有能在作品層驗證時才可保存 |
| `cat=19` | 18 部作品 URL 都使用 | `UNKNOWN` | 不得解讀為主頻道 |

首頁「高清新片」「強檔獨家」「熱播推薦」代表當下陳列位置，不是永久作品事實。來源 tag 中另有 `独占配信`、`獨家限定`；它們是作品級 `SOURCE_KEYWORD`，不可與首頁「獨家」營運位置混為一談。

## 4. 主要 URL 規律

| 對象 | URL 規律 | 穩定鍵候選 | 本次分類 |
|---|---|---|---|
| 作品 | `/player.php?uuid={opaque_id}&cat=19` | `uuid` | `MOVIE_FACT` |
| 女優索引 | `/actor_list.php?num={page}` | 無作品關聯鍵 | `SOURCE_CATEGORY` |
| 出演者頁 | `/search.php?s_type=actor&s_tid={id}` | `(actor, s_tid)` | `PERFORMER_RELATION` |
| fac 頁 | `/search.php?s_type=fac&s_tid={id}` | `(fac, s_tid)` | `MAKER_OR_LABEL_RELATION` |
| 系列頁 | `/search.php?s_type=series&s_tid={id}` | `(series, s_tid)` | `SERIES_RELATION` |
| tag 頁 | `/search.php?s_type=tag&s_tid={id}` | `(tag, s_tid)` | `SOURCE_KEYWORD` |
| 分類群組 | `/category.php?cate={2..6}` | `cate` | `SOURCE_CATEGORY` |
| 子分類 | `/category.php?cate={group}&cate_c={id}` | `(cate, cate_c)` | `SOURCE_CATEGORY` |
| 熱門搜尋 | `/search.php?kw_type=sc&kw={encoded_text}` | 只有查詢文字 | 當下為 `OPERATIONAL_PLACEMENT`；詞本身是未綁作品的 keyword observation |
| 作品旁關鍵字搜尋 | `/search.php?kw_type=player_link&kw={encoded_text}` | 只有查詢文字 | `SOURCE_KEYWORD` 候選，關聯範圍需再確認 |
| 排序／分頁 | `order=...`、`num=...` | 無 | `OPERATIONAL_PLACEMENT` |

`s_tid` 不能脫離 `s_type` 使用：`tag:35`、`fac:35` 與 `actor:35` 沒有證據是同一實體。

## 5. 五大來源分類群組

| `cate` | 群組 | 本次看到的 `cate_c` 數 | 例子 | 注意事項 |
|---:|---|---:|---|---|
| 2 | 衣著 | 17 | 制服、和服／浴衣、絲襪、女僕 | 「女僕」也出現在職業群組 |
| 3 | 職業 | 19 | OL、學生妹、護士、空姐、AV女優片 | 含身分或內容型詞，不是純職業本體論 |
| 4 | 身材 | 12 | 美乳、巨乳、美尻、白虎 | 有「愛美臀／美尻」「美腿／愛美腿」「巨乳／愛巨乳」相近詞 |
| 5 | 身份 | 17 | 素人、人妻、角色扮演、熟女 | 混合人物身分、受眾方向與題材 |
| 6 | 動作 | 23 | 中出、顏射、騎乘位、自慰 | 含動作、情境與「其他癖好」兜底類 |

這 88 個選項是來源站的成熟導覽資產，但不是互斥、完備或嚴格一致的 ontology。不能直接複製成 CC18 Canonical Taxonomy。

### 5.1 Category 與 tag 是兩套資料結構

抽樣三組同名詞，兩種 URL 均回應 200 且各自有作品列表：

| 詞 | Category URL | tag URL |
|---|---|---|
| 制服 | `/category.php?cate=2&cate_c=4` | `/search.php?s_type=tag&s_tid=43` |
| 巨乳 | `/category.php?cate=4&cate_c=2` | `/search.php?s_type=tag&s_tid=15` |
| 中出 | `/category.php?cate=6&cate_c=1` | `/search.php?s_type=tag&s_tid=4` |

同名不代表相同集合、相同維護來源或相同 ID。作品頁直接提供的是 `tag/s_tid` 關聯；`cate/cate_c` 是否完全由 tag 投影、另有人工編排，或只有部分重疊，本次不能定案。

### 5.2 同義、上下位與重複風險

已觀察到：

- `女僕` 同時位於衣著與職業。
- `角色扮演` 位於身份，但也是作品 tag。
- `學生妹` 同時是熱門搜尋、職業子分類與作品 tag。
- `人妻`、`人妻・主婦`、`新娘、少婦` 存在相近或上下位關係，但不能自動合併。
- `美尻`、`愛美臀`，以及 `美腿`、`愛美腿` 名稱相近；集合是否相同未知。
- `巨乳` 與 `愛巨乳` 可能是偏好入口和事實 tag 的差異，不能只靠字面合併。
- `妄想族` 在樣本中既可包含於單一 `fac` 顯示名，也能作為 `tag` 出現。
- `独占配信`、`獨家限定`、首頁獨家 event 是三種不同通道。

Canonical 映射必須以來源通道與來源 ID 為輸入，不能只以顯示字串為鍵。

## 6. 出演者、fac、系列與關鍵字抽樣

### 6.1 出演者

抽查頁：

- `/search.php?s_type=actor&s_tid=34284`（河北彩花）
- `/search.php?s_type=actor&s_tid=41229`（糸井瑠花）
- `/search.php?s_type=actor&s_tid=13`（紗倉真菜）

三頁皆為可分頁作品列表。本次每頁首屏解析到最多 48 個唯一作品 URL；這只是頁面批次大小，不是出演作品總數。

女優索引亦顯示括號別名形式，例如「春宮雛乃(川原理央、福原悠里)」「西垣流花(櫻木莉愛)」「小那海綾(佐佐波綾)」。這證明來源顯示名可能混合日文、中文、異體或舊名，但括號內容是否全部為正式 alias 仍需逐實體驗證；不得靠括號自動拆分後合併人物。

### 6.2 fac

抽查頁：

- `/search.php?s_type=fac&s_tid=35`（S1 Style）
- `/search.php?s_type=fac&s_tid=30`（Hunter）
- `/search.php?s_type=fac&s_tid=117`（オーロラプロジェクト・アネックス）

三頁皆為作品列表，但 URL 只說 `fac`。樣本還有：

- `チン負け女優/妄想族` → 單一 `fac:3924`
- `全日本カメコ協同組合/妄想族` → 單一 `fac:1984`

斜線不能被當成可安全拆分的兩個實體。第一版應保留來源 `fac` 關係和原名，語意標記為 maker／brand／label 尚待確認。

### 6.3 系列

抽查頁：

- `series:18724`：露出願望に憑りつかれた○○，本頁抽樣有 9 個唯一作品 URL。
- `series:20710`：同期女子と相部屋に！，本頁抽樣只有 1 個唯一作品 URL。
- `series:20725`：性感覚醒！人妻エステ，本頁抽樣只有 1 個唯一作品 URL。

系列 ID 適合形成 `SERIES_RELATION`，但一部作品的系列頁會是薄弱 SEO 頁；是否建立 Hub 必須依本站已發布作品數與內容價值另行決定。

### 6.4 熱門搜尋

首頁熱門搜尋採 `/search.php?kw_type=sc&kw={text}`，本次同時出現出演者名、番號／代碼型詞與題材詞。它沒有 typed entity ID，且清單顯然可隨營運調整。

因此：

- 「當下出現在熱門搜尋」是 `OPERATIONAL_PLACEMENT`。
- 搜尋文字可作趨勢觀察，但不是某部作品的永久關係。
- 若同一文字另有 `actor/tag/fac/series + s_tid`，typed relation 才是較可靠的關聯識別。

## 7. 18 部正式作品取得率

### 7.1 既有 Movie Master／Source Record 欄位

| 欄位 | 存在數／18 | 取得率 | 判讀 |
|---|---:|---:|---|
| `source_url` | 18 | 100% | `MOVIE_FACT` |
| `source_site_movie_id` (`uuid`) | 18 | 100% | `MOVIE_FACT` |
| `catalog_code` | 18 | 100% | `MOVIE_FACT` |
| `source_title` | 18 | 100% | `MOVIE_FACT` |
| `release_date` | 18 | 100% | `MOVIE_FACT` |
| `public_description` | 18 | 100% | `MOVIE_FACT`；內容仍只代表公開簡介 |
| `source_cover` | 18 | 100% | `MOVIE_FACT`／來源資產引用 |
| 原始出演者字串 | 12 | 66.7% | `PERFORMER_RELATION` 候選；6 部沒有值 |
| 原始 studio 字串 | 16 | 88.9% | `MAKER_OR_LABEL_RELATION` 候選 |
| 原始 series 字串 | 6 | 33.3% | `SERIES_RELATION` 候選 |
| `source_tags` | 18 | 100% | `SOURCE_KEYWORD`；共 160 個值 |

### 7.2 2026-08-29 來源頁 typed relation 再驗證

| 關聯 | 有有效 typed relation 的作品 | 取得率 | 項目數 | 與既有值相符情況 |
|---|---:|---:|---:|---|
| 出演者 `actor` | 12/18 | 66.7% | 16 | 12 部所有既有 performer 值皆找到相同 actor link |
| maker／label `fac` | 15/18 | 83.3% | 15 | 16 部既有 studio 中 15 部找到同名 fac link |
| 系列 `series` | 5/18 | 27.8% | 5 | 6 部既有 series 中 5 部找到同名 series link |
| 原始標籤 `tag` | 18/18 | 100% | 160 | 160/160 既有 source tag 均找到同名 tag link |

兩個不一致必須保留為 conflict，不得在本次改資料：

1. `GAREA-627`：既有 `raw_studio_name=mercury（マーキュリー）`，本次作品頁沒有同名 `fac` 關聯；頁面出現的其他 fac link 位於推薦內容，不能拿來覆寫本作。
2. `SIRO-5722`：既有 series `【初撮り】ネットでAV応募→AV体験撮影`，本次作品頁沒有同名 `series` typed link。

這可能是來源內容變動、舊抓取快照與現況差異、或欄位過去由非 typed 文字取得。本次證據不足，分類為 `UNKNOWN` conflict。

### 7.3 目前無法統計

- 18 部作品各自屬於哪個 `cate/cate_c`：作品頁沒有直接保存 category ID，本次也沒有反向掃描 88 個完整列表。
- 每部作品的永久主頻道：`cat=19` 不能解讀，頁面導覽連結是全站共用。
- 「其他相關作品」的選擇規則：可能混合推薦、同演員、同 fac、熱門或營運排序，未見可驗證 relation type。
- 熱門搜尋詞與單一作品的關係：熱門搜尋是全站位置，不是作品欄位。

## 8. 資料分類決策

| 資料 | 分類 | 保存建議 |
|---|---|---|
| 番號、來源 uuid、來源標題、日期、公開簡介、封面、來源 URL | `MOVIE_FACT` | 直接保存來源值與來源時間 |
| `actor + s_tid + name + URL` | `PERFORMER_RELATION` | 先保存 `source_relations`，之後才做 entity candidate |
| `fac + s_tid + name + URL` | `MAKER_OR_LABEL_RELATION` | 保留原樣；不先判定公司／品牌／Label，不拆斜線 |
| `series + s_tid + name + URL` | `SERIES_RELATION` | 保存來源關係；名稱修正不應丟掉來源 ID |
| `cate/cate_c` | `SOURCE_CATEGORY` | 作為來源導覽分類；需額外驗證作品 membership |
| `tag + s_tid + name + URL` | `SOURCE_KEYWORD` | 保留 raw relation，再經人工核准映射 Canonical Taxonomy |
| `kw_type=sc` 熱門詞 | `OPERATIONAL_PLACEMENT` | 可做趨勢快照，不寫入永久作品資料 |
| 新片、排行、推薦、首頁獨家區 | `OPERATIONAL_PLACEMENT` | 不進 Movie Master 永久事實 |
| `event:17` 獨家入口 | `OPERATIONAL_PLACEMENT` | 不等同 `tag:501` 或 `tag:3175` |
| `cat=19` 的語意 | `UNKNOWN` | 只保留在 source URL，不推導主頻道 |
| 推薦區出現的 actor/fac | `UNKNOWN`（相對本作品） | 不得誤寫為本作品關聯 |
| GAREA-627 fac、SIRO-5722 series 漂移 | `UNKNOWN` conflict | 保留舊值、現況與驗證時間，等待後續確認 |

## 9. 保留、映射與排除

### 9.1 適合直接保留為作品事實

- `catalog_code`
- 來源 `uuid`
- `source_url`
- 來源標題
- 上片日期
- 公開簡介
- 來源封面 URL
- 若作品頁明確提供的片長與畫質原始值

片長和畫質即使可顯示，也應記錄是來源事實或程式正規化值；不能用 Remotion 9 秒片長代替原片片長。

### 9.2 適合先保存為 `source_relations`

- 出演者 `actor`
- `fac`
- 系列 `series`
- 作品頁明確連出的 `tag`

建議未來最小結構只需保留：`relation_type`、`source_type`、`source_id`、`source_name`、`source_url`、`observed_at`、`validation_status`。這是報告建議，本次不實作。

### 9.3 可映射為 Canonical Taxonomy 的候選

作品級 `tag/s_tid` 是最適合的映射輸入，其次才是經驗證的 `cate/cate_c` membership。映射應：

1. 同時看 source channel 和 ID，不只看字串。
2. 保留一對多、多對一與 ignored／operational 類型。
3. 把畫質、發行方式、人物身分、衣著、動作分組，不強迫全部成為題材。
4. 對 `独占配信`、`獨家限定` 等發行詞和首頁 event 分開處理。
5. 不因 `fac` 名稱或熱門搜尋詞自動產生 topic。

### 9.4 只能保留為 raw source tag 的資料

- 尚未建立正式 mapping 的 tag。
- 語意含混或跨群組的詞。
- 日文／中文混合、異體或近義但集合未驗證的詞。
- 可能是品牌、技術規格或發行狀態，而不是題材的詞。
- `鼻フック` 等可有中文 display alias、但來源原字必須保留的詞。

### 9.5 必須排除於永久作品資料

- 首頁位置、熱門、推薦、新片、排行。
- category/list page 當下排序。
- 搜尋框熱門詞排名。
- 推薦區塊中其他作品的 performer、fac、series 與 tag。
- 登入狀態、播放線路、播放器選項、下載／最愛狀態。

## 10. 基本作品卡與 Hub 資格

### 10.1 第一版基本作品卡可穩定使用

- stable movie ID
- catalog code
- slug
- source cover
- 既定標題 fallback
- `is_published`
- canonical URL
- release date
- 已驗證時的 performer 顯示名
- 已驗證時的 fac 原始顯示名（前台可稱片商，但資料層不要提前定義法人語意）
- 已驗證時的 series 顯示名
- 經既有正式 mapping 產生、最多 2–3 個 canonical topic tags
- 是否有站內 Remotion 宣傳片

缺值仍應隱藏。Category membership、熱門程度、排行、推薦、未驗證主頻道與來源關聯漂移不能拿來補卡片。

### 10.2 有資格形成 Hub 的資料

| Hub | 最低來源資格 | 額外門檻 |
|---|---|---|
| 女優頁 | `actor + s_tid` | alias 驗證、本站至少有足夠已發布作品、避免一名多頁 |
| 片商／品牌頁 | `fac + s_tid` | 先確認 fac 顯示語意；複合名稱不自動拆分 |
| 系列頁 | `series + s_tid` | 本站作品數與獨立內容足夠；單作品系列避免薄頁 |
| 題材頁 | 已核准的 tag/category → canonical mapping | 排除技術、發行與營運詞；有足夠已發布作品與內部連結 |

來源站已經有實體頁不代表本站應立即建立 SEO Hub。Hub 的 indexability 仍須以本站內容量、獨特文字與使用者價值決定。

## 11. 來源關聯資料鏈缺口

### 11.1 權威位置判定

這是**來源關聯資料鏈缺口**，不能直接等同於 Movie Master v1 Schema 缺欄位。`actor/fac/series/tag + s_tid + URL` 是作品頁直接提供的來源事實，應先由 parser 完整保存到 Source Record；現行 parser 雖然已用 typed selector 找到這些連結，卻只留下顯示文字，因此關聯身分在來源擷取階段就已遺失。

既有權責已明確分工：Source Record 是原始來源事實的權威候選；Git Movie Master 是經驗證、標準化後的內容投影；Media Manifest 只負責生成媒體資產。未來若補 typed relations，Source Record 應保存來源觀察的完整關係，Movie Master 只投影前臺實際需要、且已通過驗證的最小欄位，並以 `source_record_ref` 回指來源紀錄。Movie Master 不應完整複製每次來源觀察、衝突歷史或 parser 細節，否則兩者會變成互相競爭的權威。

缺失的最小資訊包括：

- `source_type`：actor／fac／series／tag
- `source_id`：`s_tid`
- `source_name`：當次來源顯示名
- `source_url`
- `observed_at` 或來源驗證時間
- `validation_status`／conflict 狀態

沒有這些來源欄位，未來無法可靠區分同名不同實體、名稱改版、alias、category/tag 同名、`fac`/tag 重疊，也難以避免重複 Hub。本報告只確認資料鏈缺口，不在本次正式設計 `source_relations` Schema，也不授權修改 parser、Source Record 或 Movie Master。

### 11.2 時間與衝突保存原則

- relation 的 `observed_at` 應沿用產生該次觀察的 Source Record `fetched_at`；若未來有真正的 source snapshot，也可沿用該 snapshot 的擷取時間。不得使用 Movie Master build 時間，否則每次 build 都會製造沒有來源變化的 diff。
- `source_verified_at` 只適合記錄另一次明確驗證，不應替代原始觀察時間；現有 Movie Master 全部為 `null`，不得反推。
- `GAREA-627` 應保留既有 Source Record 的 `studio=mercury（マーキュリー）` 及其 `fetched_at=2026-08-27T04:41:26.624Z`，同時把 2026-08-29 作品頁未找到本作同名 `fac` relation 視為另一筆缺失／衝突觀察；不得用推薦區的其他 fac 覆寫，也不得把舊值靜默清空。
- `SIRO-5722` 同理，保留既有 series `【初撮り】ネットでAV応募→AV体験撮影` 及其 `fetched_at=2026-08-27T04:41:28.662Z`，並另記 2026-08-29 未找到同名 `series` relation。缺少 typed relation 不證明舊字串為錯，也不構成自動刪除理由。
- 在未來 Schema 定案前，舊值、現況缺失、觀察時間及 conflict 狀態必須並存；不得以「最新檔案」或「目前頁面」單方面覆蓋歷史來源值。

### 11.3 對基本卡與可點擊功能的影響

這個缺口**不阻擋第一版基本作品卡**。核准的基本卡最低欄位是 stable movie ID、slug、catalog code、來源封面或通用占位圖、顯示標題、`is_published` 與 canonical URL；演員、fac、系列及題材本來就是可靠時才顯示的選填欄位。

它會阻擋或降低可信度的是：可點擊人物／片商／系列連結、實體去重、alias／redirect、系列 Hub、來源 tag 對 canonical taxonomy 的穩定映射，以及基於這些關係的篩選。純文字顯示仍可沿用已保存的來源字串，但在 typed relation 驗證前不應假裝已連到穩定實體。

### 11.4 不應順勢擴張的能力

本缺口不要求：

- 立即建立 UUID。
- 自動合併人物或 fac。
- 立即把 88 個 category 遷入 taxonomy。
- 建立 Hub 或前台篩選器。
- 保存推薦區算法結果。
- 對所有舊資料重新抓取。

## 12. 既有 AI 原創影片命名與實作確認

### 12.1 現有名稱

專案目前沒有唯一、正式鎖定的中文產品名。實際存在的稱呼與識別如下：

| 層級 | 現有名稱／值 | 實際語意 |
|---|---|---|
| 架構與資料模型 | Remotion 宣傳片、9 秒宣傳影片、站內 9 秒宣傳片 | 最常見、也最接近 `remotion_promo_ref` 的稱呼 |
| 前臺元件 | 短影音、VIDEO PREVIEW | 作品頁播放器的讀者可見泛稱 |
| 少數架構文件 | 本站 9 秒預告 | 與「宣傳片／短影音」並存，名稱不一致；它不是來源方官方預告 |
| React 元件 | `VerticalReview` | 直式影評四場景元件名稱 |
| Remotion Composition ID | `CC18Vertical` | render 指令實際使用的 Composition ID |
| Movie Master 欄位 | `remotion_promo_ref` | 指向 Media Manifest 的 `#/video` |
| Manifest／檔案 | `video`、`vertical-v1.mp4` | 媒體紀錄鍵與 R2 輸出名稱，未另存語意型 media type |

因此，若只描述現況，最準確的中文稱呼是「**Remotion 9 秒宣傳片（站內短影音）**」；程式實作名稱則是 `VerticalReview`／`CC18Vertical`。它確實承載作品 Hook、影評核心句、tags 與 CTA，但目前沒有名為「AI 原創影評影片」的正式資料型別。

### 12.2 `remotion_promo_ref` 與實際產物

`scripts/build-movie-master.mjs` 只有在 Media Manifest 的 `video.public_path` 存在時，才建立 `data/media-manifests/{ID}.json#/video`，所以 `remotion_promo_ref` 正是指向這種 Remotion 9 秒直式宣傳片，不是來源影片、官方預告或觀看證據。

現有 15 部已具備 `rendered_and_uploaded` 的 9 秒、1080×1920、H.264 MP4：

`DSOD-006`、`ENDS-322`、`GAREA-627`、`HUNTC-568`、`MCSR-639`、`MVG-171`、`NAMH-074`、`PRIAN-054`、`SDAB-358`、`SIRO-5722`、`SNOS-345`、`SNOS-360`、`SNOS-369`、`SNOS-371`、`SNOS-409`。

原有 5 部本機草稿 `FTKD-041`、`PRIAN-058`、`SDMM-238`、`SDNM-560`、`START-621` 均為 `videoStatus: pending`，沒有 Media Manifest、Remotion props 或 `videoUrl`，因此尚未產生這種影片。

### 12.3 視覺來源與作品頁角色

15 份 Media Manifest 的 `artwork_policy` 都是 `original_non_explicit_no_real_person_likeness`。Composition 的 `imageOne` 與 `imageTwo` 由 Manifest 中的 `vertical_scene` 和 `article_hero` 提供；現有 Manifest 顯示這些資產是原創非露骨情境圖，部分由 AITokenKing／Seedream、部分由內建圖片模型或早期原創流程產生。render props 與 Composition 沒有輸入來源封面、來源影片截圖或來源片段，因此就目前可追溯實作而言，MP4 是「原創情境圖＋站內影評文字＋動態排版」的衍生影音，不是原片剪輯。來源封面只作作品頁播放器 poster，並未證明被燒錄進 MP4。

作品頁把它放在首屏 HTML5 `<video>` 播放器，作用是 9 秒的作品 Hook／影評摘要／tags／CTA；有影片時另產 `VideoObject`，沒有時顯示「短影音製作中」。它用來幫助選片與導流，不提升 `PROMO_CLIP`、`DISTRIBUTED_SAMPLE` 或其他觀看證據等級。

## 13. 尚不能定案

1. `fac` 在資料庫內究竟代表 maker、label、brand、發行商或混合欄位。
2. `category.php` 和 `tag` 的作品集合是否完全相同、部分重疊或由不同資料源維護。
3. 作品的主頻道是否有獨立且可讀取的穩定欄位。
4. `kw_type=player_link` 是否是作品直接標註，或由頁面其他模組注入。
5. 推薦作品的關聯算法。
6. 括號人物名的 alias 語法是否一致。
7. GAREA-627 與 SIRO-5722 的舊值／現況衝突原因。
8. `cate/cate_c` 的 ID 是否長期穩定；本次只確認當下 URL。
9. 單一 `s_tid` 名稱改變時，來源是否保留 redirect 或 alias。
10. 系列、fac、演員頁跨語言顯示是否始終共用同一 `s_tid`。

這些問題需要更長時間、跨日期快照或更多代表性樣本；現在不得寫成正式資料規則。

## 14. 下一個最小步驟（不執行）

若本報告通過，下一步應先在既有 Source Record 權責下設計一份最小 typed relation 擷取／保存草案，再做 18 部唯讀映射模擬，輸出 relation coverage、conflict、alias candidate 與 category/tag collision 報告；Movie Master 只規劃經驗證後的最小前臺投影。該步仍不應建立永久人物 UUID、Hub、前台卡片或分類頁。

## 15. 本次變更邊界

本次只新增並修正本報告。沒有修改 Movie Master、產生器、Parser、Source Record、Media Manifest、Remotion、Registry、Taxonomy、文章、QA、D1、首頁、卡片、搜尋、篩選、Cloudflare 或部署設定；沒有呼叫外部 AI、commit、push、產生影片或 deploy。
