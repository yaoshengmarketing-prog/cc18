# CC18 首頁演員探索唯讀決策 v1

文件狀態：`APPROVED CTA-ONLY`  
版本：`1.1.0`  
盤點日期：2026-08-30（Asia/Taipei）  
盤點基準：`2605918d27cbaee6e82bb7b6a0f0764365abb484`  
適用階段：Phase 4B-2

## 1. 決策摘要

建議現階段在首頁加入一個**只有演員索引入口、不顯示個別人物卡**的輕量「演員探索」模組。

人工核准CTA-only方案，實作僅限以下規格：

- 模組位置：`Hero → 最新收錄 → 9秒看重點 → 演員探索入口 → 題材探索`。
- 不列14位人物、不選出部分人物、不呈現任何排行。
- 使用 `loadPerformerCatalog()` 動態取得合格人物總數；目前為14位。
- 唯一主要動作連到 `/actresses/`，不在首頁直接列出14個stable人物頁連結。
- 不使用人物照片、作品poster或AI生成圖片。
- 不修改人物頁的 `noindex,follow`、canonical、redirect、Schema或sitemap政策。

理由是資料鏈已足以提供可靠導覽，但14位人物目前都只有1部公開作品，詳細頁全為 `NOINDEX_THIN`。此時列出全部人物會拉長已經很長的手機首頁；只列部分人物又會在沒有熱門度資料時形成類似推薦或排行的暗示。先提供清楚的索引入口，可以交付可用的探索路徑，同時避免過薄與誤導。

## 2. 現況與資料限制

### 2.1 首頁現況

首頁目前順序為：

`Hero → 最新收錄 → 9秒看重點 → 題材探索`

實際production版面量測如下；量測viewport高度均為900px：

| viewport | 頁面總高度 | 約當viewport數 | 水平溢出 |
| --- | ---: | ---: | --- |
| 390px | 11,114px | 12.35 | 無 |
| 900px | 6,636px | 7.37 | 無 |
| 1440px | 5,245px | 5.83 | 無 |

390px首頁已很長。若再列出14張人物卡，即使採雙欄，也會增加顯著捲動距離；單欄則更不適合。

### 2.2 人物資料現況

`loadPerformerCatalog()`目前輸出：

- 15部公開作品。
- 10部具有typed performer relations。
- 5部沒有人物資料。
- 14位具有合法stable actor ID、核准主要顯示名與stable人物頁的人物。
- 14位人物目前各有1部公開作品。
- 14頁皆為 `NOINDEX_THIN / ONLY_ONE_PUBLIC_WORK`。
- 14頁均為stable URL、HTTP 200、`noindex,follow`且不進sitemap。

目前沒有可證明的人氣、觀看量、點擊量、編輯推薦、趨勢或市場排名資料。因此不得用「熱門演員」、「人氣推薦」、「本週人氣」或相近語意。

### 2.3 權威資料鏈

首頁若加入演員探索，唯一可使用的資料鏈為：

`Movie Master index → 公開MovieCard catalog → 各Movie Master ordered typed performer relations → 人物在地化字典 → Search performer projection → loadPerformerCatalog() → stable人物頁`

責任分工如下：

- Movie Master typed performer relations：決定作品與人物的已驗證關係。
- 人物在地化字典：決定主要顯示名、日文原名、來源名與可搜尋別名。
- Search performer projection：驗證搜尋人物集合及關聯作品集合一致。
- Performer catalog：聚合公開人物、作品數、stable URL與索引決策。
- 首頁：只投影已核准資料，不翻譯、不猜人物、不另建人物名單。

不使用Markdown人名字串、raw-only候選或姓名本身作身分。

## 3. 是否建議現在上線

### 3.1 導覽價值

首頁直接連到可索引的 `/actresses/` 人物索引是合適的站內導覽功能；本階段不從首頁直接連到14個 `noindex,follow` 人物詳細頁。`noindex`限制搜尋引擎收錄，不代表詳細頁不能由人物索引、搜尋或作品頁提供使用者導覽；目前人物頁已能一致呈現：

- 核准主要顯示名。
- 日文原名與來源名。
- 經核准別名。
- stable actor ID。
- 已發布相關作品。

首頁入口可讓使用者理解本站支援「從人物找作品」，也能導向完整人物索引。

### 3.2 現階段限制

每人只有1部作品，使個別人物卡的資訊差異很小；如果每張都只顯示姓名與「1部作品」，首頁會重複14次相同資訊。這不足以支撐大型卡片模組，更不構成SEO索引門檻。

### 3.3 結論

現在適合上線**索引入口**，不適合上線**人物卡精選**。

`DEFERRED_REVIEW_THRESHOLD`：當部分人物累積至少2部公開typed作品後，可重新評估在首頁顯示少量人物卡；這只是重新審查門檻，不是自動上線、排序或顯示規則。

## 4. 模組位置比較

| 方案 | 優點 | 風險 | 判定 |
| --- | --- | --- | --- |
| 最新收錄之後 | 符合藍圖「作品後接人物探索」的概念 | 會把已驗證的最新收錄與9秒看重點拆開；過早打斷選片流程 | 不採用 |
| 9秒看重點之後 | 先完成作品辨識與短影音選片，再提供人物與題材兩條探索路徑 | 需要控制模組高度，避免手機繼續拉長 | **建議** |
| 題材探索之後 | 不干擾現有四模組順序 | 人物探索落到首頁尾端，重要性過低，也不符合藍圖人物先於題材的方向 | 不採用 |
| 現階段不加入 | 零版面成本 | 首頁缺少已核准的人物探索入口，stable人物底座只能由導覽或搜尋抵達 | 次選；若不接受CTA-only則採用 |

建議插入位置是9秒看重點之後、題材探索之前。原有四個模組的內容、內部排序與資料流不變，只在兩個既有模組之間增加一個低高度入口。

## 5. 顯示數量比較

| 方案 | 優點 | 問題 | 判定 |
| --- | --- | --- | --- |
| 全部14位 | 不需挑選，不遺漏合格人物 | 14位皆只有1部；手機過長，內容高度重複 | 不採用 |
| 固定顯示部分人物 | 模組較短，可直接點人物 | 現有資料無法證明誰應被選；截取結果容易被理解為推薦 | 不採用 |
| 只顯示索引入口CTA | 不需排名或硬編名單；所有人物在索引中平等可達 | 少一次直接到人物詳細頁的捷徑 | **建議：目前顯示0張人物卡、1個總覽CTA** |

不得把「0張人物卡」誤寫成沒有人物資料；模組可動態顯示合格人物總數，目前為14位。

## 6. 人物資格與排序方案

### 6.1 公開人物資格

首頁演員探索所依據的人物集合必須完全等於performer catalog的合格人物集合。每位至少需符合：

1. `stable_performer_id`是合法的 `cc18.tv:actor:{s_tid}`。
2. `primary_display_name`是人物在地化規則核准的非空顯示名。
3. 至少一部已發布、可索引且具有typed performer relation的作品。
4. stable人物頁 `href`可由既有route codec確定性產生。
5. localization、Movie Master與Search projection身分一致。

raw-only人物、來源標題候選、缺乏typed relation者及不在performer catalog內的人物一律排除。

### 6.2 排序方案比較

| 排序 | 可重現性 | 語意風險 | 適用性 |
| --- | --- | --- | --- |
| 主要顯示名升冪＋stable ID | 高；現有performer catalog已採用 | 不代表優先級，但容易理解為索引排序 | 適合完整人物索引 |
| 關聯作品 `published_at` 新到舊＋stable ID | 高，但目前首頁人物輸出需額外衍生最近收錄時間 | 同作品多人會集中，且容易被誤讀為人物趨勢 | 不建議現階段首頁截取 |
| 公開作品數降冪＋主要顯示名＋stable ID | 高；`public_work_count`已存在 | 現在14人全為1部，實際退化為姓名排序；不能稱人氣 | 未來人物卡候選 |

### 6.3 建議契約與tie-breaker

本階段CTA-only不執行人物截取排序。模組只使用：

```text
eligible_performer_count = performerCatalog.performers.length
index_href = /actresses/
```

若未來達到 `DEFERRED_REVIEW_THRESHOLD` 並經另一次產品審查改為人物卡，可再評估：

1. 首頁人物卡資格提高為至少2部公開typed作品。
2. `public_work_count DESC`。
3. `primary_display_name`以既有人物索引的 `zh-Hant` 規則升冪。
4. `stable_performer_id ASC`作最後確定性tie-breaker。

同作品數只代表本站已收錄的作品量，不代表人氣。不得使用隨機順序、人工置頂名單或build時鐘。

## 7. 卡片內容與文案提案

### 7.1 本階段實際呈現

本階段不呈現人物卡，只呈現一個語意完整的入口區塊：

- 英文輔助標題：`EXPLORE PERFORMERS`
- 中文標題：`從演員找作品`
- 說明：`依演員姓名瀏覽本站收錄的人物與已發布作品。目前收錄 {count} 位人物。`
- 總覽CTA：`查看全部演員 →`
- CTA目的地：`/actresses/`

「14」必須由performer catalog動態產生，不得寫死。

### 7.2 未來人物卡候選欄位

待人物卡門檻另行核准後，單卡最多顯示：

- 主要顯示名。
- 日文原名或來源名；僅在與主要顯示名實質不同時顯示一次。
- `public_work_count`，文案為「本站收錄 N 部作品」。
- stable人物頁連結。
- 卡片CTA：`查看{name}的作品 →`。
- 可選的一部關聯作品文字連結，必須標示「相關作品：{catalog_code}」，不顯示作品poster作人物圖。

不得顯示stable ID作為首頁主要文案，不顯示來源標題別名作主要名稱，也不顯示人物照片占位。

### 7.3 圖像規則

- 不抓取外部人物圖片。
- 不生成AI人物圖片。
- 不把作品poster裁切或呈現成人物頭像。
- CTA-only模組不需要圖片fallback或額外媒體請求。

## 8. 響應式與無障礙規格

### 8.1 版面

- 390px：單欄；標題、說明與CTA垂直排列，模組保持短小，不建立橫向滑動。
- 900px：標題／說明與CTA可採兩欄或左右排列，但閱讀順序仍為標題、說明、CTA。
- 1440px：沿用首頁現有內容寬度，不拉成滿版人物名牆。
- 三種寬度均不得出現水平溢出。
- 中文、日文及混合姓名需允許正常換行與 `overflow-wrap`；本階段沒有個別姓名卡，仍應為未來卡片保留此要求。

### 8.2 操作與語意

- 模組使用具可辨識標題的 `<section>`。
- CTA使用正常 `<a href="/actresses/">`，不得依賴JavaScript導航。
- JS停用後標題、說明及CTA仍完整可用。
- 鍵盤focus需沿用全站清楚的桃紅focus樣式。
- CTA可點擊範圍至少符合現有按鈕／文字連結慣例。
- 不使用carousel、自動輪播、隱藏Tab或hover-only資訊。

### 8.3 頁長限制

CTA-only模組在390px應維持單一短區塊，不超過一個viewport。若未來實作導致手機首頁增加多個viewport、需要橫向滑動或必須隱藏人物才能控制高度，應停止並回產品審查。

## 9. SEO邊界

首頁連到人物頁只代表站內導覽功能，不代表人物頁已達SEO索引門檻。

本階段必須保持：

- 14個人物詳細頁維持 `noindex,follow`。
- 人物詳細頁不進sitemap。
- 不新增首頁 `Person` Schema。
- 不修改人物canonical、robots、redirect或stable URL。
- 不建立新的姓名型人物URL。
- 不因首頁曝光改變 `performerIndexDecision()`。
- 不把人物別名藏成首頁不可見SEO關鍵字。

首頁既有canonical、robots、title、description與Schema均不因新增導覽入口而改變。

## 10. 未來實作檔案白名單

若本報告經人工核准，第一批實作應限制於：

- `src/pages/index.astro`：載入performer catalog並插入模組。
- `src/components/HomePerformerExplore.astro`：可選的新CTA-only元件；樣式應scoped於元件。
- `tests/performer-catalog.test.mjs`：驗證首頁使用的合格總數與資料契約。
- `tests/movie-master-cards.test.mjs`：驗證首頁模組順序及既有卡片守恆。
- `scripts/validate-movie-master-preview.mjs`：若它仍是首頁postbuild權威驗證入口，只加入最小首頁契約。

正常情況不需修改global CSS；若現有section樣式確實無法承接，必須先說明原因再審核，不得直接擴大。

明確不應修改：

- `src/lib/performer-catalog.mjs`及Phase 4B-0／4B-1底座。
- Movie Master、人物字典、Search index、Source Record或其他正式資料。
- 首頁Hero、最新收錄、9秒看重點及題材探索的內容與資料流。
- 人物頁、人物索引、作品頁、搜尋頁、Latest。
- canonical、robots、Schema、sitemap、redirect、Cloudflare或Publisher。

## 11. 未來驗收項目

1. 首頁只新增一個演員探索section，位置精確位於9秒看重點與題材探索之間。
2. Hero、最新收錄、9秒看重點與題材探索HTML責任不變。
3. 合格人物總數動態等於 `performerCatalog.performers.length`；目前為14。
4. CTA精確連到 `/actresses/`，不得連到姓名URL。
5. 首頁不出現人工人物名單、人物排行或人氣文案。
6. 不新增圖片、影片、外部請求或作品poster。
7. 14個stable人物頁的canonical、robots、Schema及sitemap狀態不變。
8. 首頁metadata與Schema不變。
9. 390／900／1440px無水平溢出；390px模組不超過一個viewport。
10. 鍵盤focus可見，JS停用後CTA可用。
11. Browser Console為0 error、0 warning。
12. Movie Master、Search index與正式資料零diff。
13. 既有35份未追蹤草稿指紋零差異。

## 12. 風險與停止條件

實作時發生任一情況應停止：

- 需要修改Movie Master、人物字典、Search index或正式資料。
- 需要人工硬編人物名單或建立首頁專用人物資料源。
- 無法由performer catalog產生可靠人物總數或stable索引入口。
- 出現stable ID、主要顯示名或typed作品關係衝突。
- 需要抓外部圖片、生成AI人物圖片或把poster冒充人物頭像。
- 需要修改Phase 4B-0／4B-1底座。
- 需要把人物詳細頁改為index、加入sitemap或修改redirect／Cloudflare。
- 為控制版面而引入carousel、隨機抽選或JS-only導航。
- CTA-only實作意外改變既有首頁模組、metadata或公開資料。

## 13. 已核准產品決策

1. 首頁採CTA-only方案，只連到可索引的 `/actresses/` 人物索引，不顯示人物卡、人物姓名、排行或精選名單。
2. 採用第7.1節核准文案，人物數由 `loadPerformerCatalog().performers.length` 在build階段動態取得。
3. 「至少2部公開typed作品」只標記為 `DEFERRED_REVIEW_THRESHOLD`；達標後仍須重新產品審查，不會自動上線人物卡或啟動排序。
