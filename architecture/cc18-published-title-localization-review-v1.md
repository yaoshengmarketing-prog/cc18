# CC18 已發布作品繁中標題唯讀決策表 v1

狀態：`APPROVED FOR PHASE 1B`  
文件版本：`1.1.0`  
盤點日期：`2026-08-29`  
適用範圍：目前 15 部 `is_published=true` 且 `indexability=INDEX` 的正式作品

## 1. 文件目的與邊界

本文件是 Phase 1A 的核准決策，15 部標題均已核准進入 Phase 1B；這不代表標題已寫入正式資料。`source_title` 永遠保留 cc18.tv 原文；本輪未修改 Movie Master、Source Record、Markdown、Search Content、人物字典、Taxonomy、搜尋索引或任何前台頁面。

最終決策分布：`READY` 15 部、`NEEDS_SEMANTIC_REVIEW` 0 部、`INSUFFICIENT_EVIDENCE` 0 部。

標題判斷依序區分：

1. **來源事實**：cc18.tv 作品頁明確呈現的番號、標題、人物、簡介、系列及標籤。
2. **語言正規化**：日文詞義、台灣繁體字形、大小寫、空格及標點的修正。
3. **編輯性繁中改寫**：以來源事實重組成較自然、易懂的台灣用語，不新增影片事實。
4. **觀看證據**：只有 HUNTC-568 具有效 `DISTRIBUTED_SAMPLE`；其餘 14 部均只有 `PUBLIC_METADATA`。
5. **未決問題**：來源內部衝突、人物主次不明或語意仍需人工判斷時，不以推測補齊。

本輪的 `display_short_title` 建議均不重複番號；卡片本身已有獨立番號欄位。所有現有 Movie Master 的 `display_short_title` 都是 `null`。

## 2. 查證範圍與共同規則

- 15/15 部 cc18.tv 來源作品頁於盤點日回讀為 HTTP 200，解析後番號均與 Movie Master 相符。
- 人物顯示遵循 [`cc18-frontend-content-localization-rules-v1.md`](./cc18-frontend-content-localization-rules-v1.md)：顯示值不得覆寫來源值，也不得由假名猜漢字。
- `相澤澪`、`鷲尾芽衣`、`淺野心`、`七森莉莉` 使用已核准繁中顯示名。
- `一ノ瀬ラム`、`柚木れんか`、`柊もみじ`、`星空ねる` 保留日文主要名稱。來源標題別名「一之瀨蘭」「柚木蓮花」「柊紅葉」「星空音琉」只可供搜尋及來源追溯，不升格為主要顯示名。
- GAREA-627 的來源原文是 `Happymail`；服務官方以「ハッピーメール／HAPPYMAIL」表記。本提案採官方羅馬字 `HAPPYMAIL`，視為品牌格式正規化，不回寫來源標題。官方參考：[ハッピーメール公司資訊](https://www.happymail.co.jp/company/)及[官方網站地圖的商標表記](https://happymail.co.jp/sitemap/)。
- HUNTC-568 的「同期」在日文職場語境指同一年度入社的人；台灣前台改寫為「同期進公司的女同事」，避免把日式縮語直接搬入標題。詞義參考：[Kotobank「同期」](https://kotobank.jp/word/%E5%90%8C%E6%9C%9F-6583)。
- `初撮り` 依 SIRO-5722 的來源系列與標籤改寫為「首次拍攝」，不宣稱完整觀看。

## 3. 逐部決策

### 3.1 DSOD-006

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:DSOD-006` |
| catalog code | `DSOD-006` |
| source title | `【老二航空】DAS！航空公司呈獻,極上空姐用敬語黏膩侍奉的舒適又色情的空中之旅SP 池田真理奈 柚木蓮花 柊紅葉 一之瀨蘭` |
| current article title | `DSOD-006 一ノ瀬ラム、池田真理奈、柚木れんか、柊もみじ｜老二航空】DAS與空服員設定：把展示型企劃拍出分段闖關感` |
| current display short title | `null`（尚未建立） |
| proposed article title | `DSOD-006｜一ノ瀬ラム等四位空服員的多人服務企劃` |
| proposed display short title | `四位空服員的多人服務企劃` |
| proposed SEO title | `DSOD-006｜一ノ瀬ラム等四位空服員的多人服務企劃` |
| 主要人物顯示名 | `一ノ瀬ラム`、`池田真理奈`、`柚木れんか`、`柊もみじ`；來源中文別名僅供搜尋 |
| 主要搜尋詞 | `DSOD-006`、`DAS`、`老二航空`、`陽具航空`、`ダスッ！`、`空服員`、`空姐`、四位人物名 |
| 來源支持 | 來源標題列出 DAS、航空公司、四位人物；簡介明寫四名空服員、敬語服務及多人服務流程；標籤含空姐、亂交 |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫企劃設定與來源標示的多人題材，不可寫實際鏡位、節奏或分段闖關成果 |
| 修改理由 | 不自行判定「老二航空」「陽具航空」「DAS／ダスッ！」哪一個是唯一正式繁中企劃名；主標題只使用來源一致支持的四位空服員與多人服務設定 |
| 風險或待確認事項 | 已定案：四種來源表記留在來源資料及搜尋詞；四位人物完整保留於人物關係與搜尋資料，短標題不堆入全部姓名 |
| 決策狀態 | `READY` |

### 3.2 ENDS-322

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:ENDS-322` |
| catalog code | `ENDS-322` |
| source title | `獨家 響 2` |
| current article title | `ENDS-322｜人妻設定與孕婦設定交纏下的扭曲性癖觀察` |
| current display short title | `null`（尚未建立） |
| proposed article title | `ENDS-322｜孕婦自曝性癖的3P企劃` |
| proposed display short title | `孕婦自曝性癖的3P企劃` |
| proposed SEO title | `ENDS-322｜孕婦、自曝性癖與3P題材作品介紹` |
| 主要人物顯示名 | 無來源人物資料，不顯示、不推測 |
| 主要搜尋詞 | `ENDS-322`、`孕婦`、`3P`、`人妻`、`響 2` |
| 來源支持 | 來源簡介明寫孕婦、自曝性癖與 3P；來源標籤另含人妻、孕婦、亂交、中出 |
| Evidence 邊界 | `PUBLIC_METADATA`；只能介紹公開設定，不可描述性格轉變、互動主導權或全片道德拉扯 |
| 修改理由 | 現有標題的「交纏」「觀察」偏抽象，且把兩個標籤寫成已成立的完整人物關係；新提案直接交代簡介可驗證的題材 |
| 風險或待確認事項 | `人妻` 只有來源標籤支持，簡介未明寫婚姻身分，因此保留為搜尋詞及 SEO 次要詞，不放 H1 主敘述 |
| 決策狀態 | `READY` |

### 3.3 GAREA-627

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:GAREA-627` |
| catalog code | `GAREA-627` |
| source title | `獨家 滴` |
| current article title | `GAREA-627｜自拍形式下的 Happymail OL 約會觀察` |
| current display short title | `null`（尚未建立） |
| proposed article title | `GAREA-627｜透過 HAPPYMAIL 配對的25歲 OL 自拍約會` |
| proposed display short title | `HAPPYMAIL 配對的 OL 自拍約會` |
| proposed SEO title | `GAREA-627｜HAPPYMAIL 配對、25歲 OL 與自拍約會企劃` |
| 主要人物顯示名 | 無來源人物實體；來源個案名「滴」不建立人物 stable ID |
| 主要搜尋詞 | `GAREA-627`、`HAPPYMAIL`、`Happy Mail`、`Happymail`、`25歲OL`、`自拍約會`、`滴` |
| 來源支持 | 簡介明寫 25 歲、辦公室 OL、東京、瀏覽 Happymail 後配對及首次使用交友軟體；標籤含自拍與 OL |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫配對背景與個人自述，不可把「約會觀察」延伸成已觀看的互動節奏 |
| 修改理由 | 採官方 `HAPPYMAIL` 羅馬字；補入 25 歲 OL 與自拍約會，使來源題材比「觀察」更具體 |
| 風險或待確認事項 | `HAPPYMAIL` 是前台品牌格式正規化；`source_title` 與來源簡介中的 `Happymail` 均保持原值 |
| 決策狀態 | `READY` |

### 3.4 HUNTC-568

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:HUNTC-568` |
| catalog code | `HUNTC-568` |
| source title | `出差的旅館因為我的失誤，竟然要跟認真的同期女同事同房！而且冷氣還故障，在像蒸籠一樣悶熱的房間裡，跟心情糟糕的同期女同事一起大汗淋漓…因為太熱睡不著，兩人一起喝酒後，喝醉的同期女同事竟然突然變成了撒嬌模式！汗水浸透的浴衣讓胸部和內褲若隱若現，所以…` |
| current article title | `HUNTC-568 旅館同房：冷氣故障如何推動同期女同事的酒後反差` |
| current display short title | `null`（尚未建立） |
| proposed article title | `HUNTC-568｜出差同房、冷氣故障與同年進公司的女同事酒後反差` |
| proposed display short title | `出差同房與女同事的酒後反差` |
| proposed SEO title | `HUNTC-568｜同年進公司的女同事、出差同房與酒後反差` |
| 主要人物顯示名 | 無來源人物資料，不顯示、不推測 |
| 主要搜尋詞 | `HUNTC-568`、`出差同房`、`同期進公司`、`女同事`、`冷氣故障`、`酒後反差` |
| 來源支持 | 標題與簡介明寫出差、旅館同房、冷氣故障、飲酒及撒嬌反差；系列為「同期女子と相部屋に！」 |
| Evidence 邊界 | `DISTRIBUTED_SAMPLE`（24 個分散視窗、有效）；可支持公事距離、浴衣與飲用場景、後段親近聚焦等有限觀察，仍不等於完整觀看 |
| 修改理由 | 將日式「同期女同事」改成台灣較易理解的「同期進公司的女同事」；保留造成題材轉折的三個核心條件 |
| 風險或待確認事項 | 無重大語意衝突；短標題省略「同期進公司」以控制長度，但 SEO 與 H1 保留 |
| 決策狀態 | `READY` |

### 3.5 MCSR-639

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:MCSR-639` |
| catalog code | `MCSR-639` |
| source title | `巧妙又刺激的療程讓性感覺醒！小心別太興奮！人妻專用美容沙龍4` |
| current article title | `MCSR-639 性感覚醒！人妻エステ × 高畫質｜《性感覚醒！人妻エステ》中的性快感與自我探索` |
| current display short title | `null`（尚未建立） |
| proposed article title | `MCSR-639｜人妻專用美容沙龍4：刺激療程與性感覺醒` |
| proposed display short title | `人妻專用美容沙龍4` |
| proposed SEO title | `MCSR-639｜人妻美容 SPA 療程與性感覺醒` |
| 主要人物顯示名 | 無來源人物資料，不顯示、不推測 |
| 主要搜尋詞 | `MCSR-639`、`人妻美容沙龍4`、`人妻美容SPA`、`性感覺醒`、`性感覚醒！人妻エステ` |
| 來源支持 | 來源標題明寫人妻專用美容沙龍第 4 作；系列為「性感覚醒！人妻エステ」；簡介明寫美容 SPA 與六位人妻 |
| Evidence 邊界 | `PUBLIC_METADATA`；不可把「自我探索」、主動轉變或流程層次寫成已觀看事實 |
| 修改理由 | 移除 `性感覚醒`、`人妻エステ` 日文殘留、重複書名及無助識別的「高畫質」；改用來源已有繁中系列概念 |
| 風險或待確認事項 | 日文系列原名仍可作搜尋別名，不應覆寫來源系列欄位 |
| 決策狀態 | `READY` |

### 3.6 MVG-171

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:MVG-171` |
| catalog code | `MVG-171` |
| source title | `太過囂張的傲慢辣妹被全公司員工徹底懲罰而墮落成醜臉M女！ 蘭華` |
| current article title | `MVG-171 蘭華｜辣妹 3p・4p 展示企劃，多人場面仍抓得住主角` |
| current display short title | `null`（尚未建立） |
| proposed article title | `MVG-171 蘭華｜傲慢辣妹遭全公司懲罰的3P／4P企劃` |
| proposed display short title | `傲慢辣妹的3P／4P懲罰企劃` |
| proposed SEO title | `MVG-171 蘭華｜傲慢辣妹、3P／4P與M女題材` |
| 主要人物顯示名 | `蘭華` |
| 主要搜尋詞 | `MVG-171`、`蘭華`、`傲慢辣妹`、`3P`、`4P`、`M女`、`全公司懲罰` |
| 來源支持 | 標題與簡介明寫傲慢辣妹、公司員工集體懲罰及 M 女轉變；標籤含 `3p・4p`、辣妹、羞恥、M 女 |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫公開企劃，不可寫多人場面如何突出主角或實際表演效果 |
| 修改理由 | 將 `3p・4p` 正規化為台灣成人內容常見的 `3P／4P`；用來源核心企劃取代未經影片證據支持的觀看評斷 |
| 風險或待確認事項 | 「懲罰」是來源明示的企劃設定；不得延伸為真實職場事件 |
| 決策狀態 | `READY` |

### 3.7 NAMH-074

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:NAMH-074` |
| catalog code | `NAMH-074` |
| source title | `至高陰道內射角度19發 潮吹短髮美少女 美咲音` |
| current article title | `NAMH-074｜美咲音在《至高の膣内射精》的學生設定與漏斗潑精反差觀察` |
| current display short title | `null`（尚未建立） |
| proposed article title | `NAMH-074 美咲音｜19發中出與多角度近距離企劃` |
| proposed display short title | `美咲音的19發中出企劃` |
| proposed SEO title | `NAMH-074 美咲音｜19發中出、多角度與 4K 近距離企劃` |
| 主要人物顯示名 | `美咲音` |
| 主要搜尋詞 | `NAMH-074`、`美咲音`、`19發中出`、`多角度`、`至高の膣内射精`、`漏斗潑精`、`4K` |
| 來源支持 | 標題明寫 19 發與美咲音；系列為「至高の膣内射精」；簡介列出不同角度、慢動作、漏斗及各段發數；標籤含中出、4K |
| Evidence 邊界 | `PUBLIC_METADATA`；可整理來源列出的拍攝規格，不可描述實際節奏、反差或由被動轉主動 |
| 修改理由 | 移除完整日文系列片語與沒有充分來源支持的「學生設定」「反差觀察」；保留番號、人物、19 發與多角度識別資訊 |
| 風險或待確認事項 | `19發` 是來源標題明示；「漏斗潑精」可作搜尋詞，但不必放進主要標題以免過度堆疊 |
| 決策狀態 | `READY` |

### 3.8 PRIAN-054

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:PRIAN-054` |
| catalog code | `PRIAN-054` |
| source title | `羽月乃蒼/Noah` |
| current article title | `PRIAN-054｜羽月乃蒼在南國的大自然裡，讓國寶級美乳與青春活力成為觀看主角` |
| current display short title | `null`（尚未建立） |
| proposed article title | `PRIAN-054 羽月乃蒼｜南國自然中的I罩杯全裸寫真` |
| proposed display short title | `羽月乃蒼的南國I罩杯寫真` |
| proposed SEO title | `PRIAN-054 羽月乃蒼｜Noah 南國寫真、I罩杯與首次全裸` |
| 主要人物顯示名 | `羽月乃蒼` |
| 主要搜尋詞 | `PRIAN-054`、`羽月乃蒼`、`Noah`、`南國寫真`、`I罩杯`、`首次全裸` |
| 來源支持 | 來源標題含人物與 Noah；簡介明寫南國自然、天然 I 罩杯及首次全裸；標籤含印象寫真與巨乳 |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫公開規格，不可評斷鏡頭如何展示、全片氣氛或由生澀轉自信 |
| 修改理由 | 以來源明示的南國、I 罩杯及寫真定位取代抽象的「成為觀看主角」，同時控制 H1 長度 |
| 風險或待確認事項 | `Noah` 是來源標題的一部分，SEO 保留；是否為系列／副標目前未知，不另建實體 |
| 決策狀態 | `READY` |

### 3.9 SDAB-358

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SDAB-358` |
| catalog code | `SDAB-358` |
| source title | `18歲口交課程 對各種雞巴感興趣的童顏弓道少女口交特訓的一天共10發！ 要結愛` |
| current article title | `SDAB-358 相沢澪×要結愛｜18歲口交課程與弓道少女一日特訓` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SDAB-358 要結愛｜18歲弓道少女的一日口交特訓` |
| proposed display short title | `要結愛的一日口交特訓` |
| proposed SEO title | `SDAB-358 要結愛｜18歲弓道少女口交課程與10發特訓` |
| 主要人物顯示名 | 提案主角為 `要結愛`；若日後仍列第二人物，來源 `相沢澪` 的前台核准字形必須是 `相澤澪` |
| 主要搜尋詞 | `SDAB-358`、`要結愛`、`相澤澪`、`18歲口交課程`、`弓道少女`、`一日特訓`、`10發` |
| 來源支持 | 來源標題只點名要結愛；簡介也只描述要結愛在首次拍攝一個月後接受課程；來源 actor relations 同時列相沢澪與要結愛 |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫來源課程設定與要結愛，不可判斷實際技術進步是否成立 |
| 修改理由 | 修正相沢澪的繁中字形；更重要的是避免把 actor relation 中的第二人物直接升成標題並列主角，讓 H1 回到標題與簡介一致的要結愛 |
| 風險或待確認事項 | 已定案：來源標題與簡介均以要結愛為明確主角；相澤澪繼續保留於 typed performer relation、來源記錄與搜尋資料，不升格為 H1 共同主角 |
| 決策狀態 | `READY` |

### 3.10 SIRO-5722

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SIRO-5722` |
| catalog code | `SIRO-5722` |
| source title | `獨家 素人應徵A片幹砲體驗 2608` |
| current article title | `SIRO-5722｜素人企劃下的害羞女孩，從初撮り到節奏轉變的觀看重點` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SIRO-5722｜22歲女大生的首次素人拍攝體驗` |
| proposed display short title | `女大生的首次素人拍攝體驗` |
| proposed SEO title | `SIRO-5722｜22歲女大生、首次拍攝與素人應徵企劃` |
| 主要人物顯示名 | 無 actor relation；來源簡介中的「里子」只保留為個案名稱，不建立正式人物 |
| 主要搜尋詞 | `SIRO-5722`、`22歲女大生`、`首次拍攝`、`初撮り`、`素人應徵`、`里子` |
| 來源支持 | 簡介明寫里子、22 歲學生及申請拍攝；系列與標籤含「初撮り」；來源標題含素人應徵與體驗編號 2608 |
| Evidence 邊界 | `PUBLIC_METADATA`；不可把來源宣傳中的聲音或狀態變化改寫成已驗證的全片節奏轉變 |
| 修改理由 | 將日文 `初撮り` 自然化為「首次拍攝」，並用可驗證的年齡與學生身分取代抽象觀看判斷 |
| 風險或待確認事項 | 「女大生」由 22 歲學生與女大學生來源標籤共同支持；不把「里子」當可跨作品識別的人物 |
| 決策狀態 | `READY` |

### 3.11 SNOS-345

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SNOS-345` |
| catalog code | `SNOS-345` |
| source title | `超級認真的樸素巨乳為了變漂亮而跑去美容院，結果被開發成了乳頭高潮女… 鷲尾芽衣` |
| current article title | `SNOS-345 鷲尾めい｜結果被開發成了乳頭高潮女：把企劃做出前後段差異的展示型作品` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SNOS-345 鷲尾芽衣｜樸素巨乳的美容院乳頭開發` |
| proposed display short title | `鷲尾芽衣的美容院乳頭開發` |
| proposed SEO title | `SNOS-345 鷲尾芽衣｜美容院乳頭開發與乳頭高潮題材` |
| 主要人物顯示名 | `鷲尾芽衣`（stable actor ID 不變；來源名仍保存 `鷲尾めい`） |
| 主要搜尋詞 | `SNOS-345`、`鷲尾芽衣`、`鷲尾めい`、`美容院`、`乳頭開發`、`乳頭高潮`、`樸素巨乳` |
| 來源支持 | 標題與簡介明寫美容院、樸素巨乳及乳頭高潮開發；標籤含美容院、按摩、高潮 |
| Evidence 邊界 | `PUBLIC_METADATA`；不可寫實際表情、呼吸、身體反應或前後段拍攝成果 |
| 修改理由 | 採用已核准的繁中顯示名「鷲尾芽衣」；移除「前後段差異」「展示型作品」等未由影片證據支持的評語 |
| 風險或待確認事項 | 無重大語意衝突；來源日文名仍須保留並可搜尋 |
| 決策狀態 | `READY` |

### 3.12 SNOS-360

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SNOS-360` |
| catalog code | `SNOS-360` |
| source title | `【絕美面孔】【最強口交技巧】【口交體感視角】【直擊大腦ASMR舔舐聲】究極口交與絕對想射出的美顏精液淋浴 淺野心` |
| current article title | `SNOS-360 淺野心ASMR近距離口交：體感視角如何放大反差` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SNOS-360 淺野心｜ASMR口交與近距離體感視角` |
| proposed display short title | `淺野心的ASMR近距離口交` |
| proposed SEO title | `SNOS-360 淺野心｜ASMR 口交、體感視角與美顏近拍` |
| 主要人物顯示名 | `淺野心`（來源日文名 `浅野こころ` 仍可搜尋） |
| 主要搜尋詞 | `SNOS-360`、`淺野心`、`浅野こころ`、`ASMR口交`、`體感視角`、`近距離`、`美顏近拍` |
| 來源支持 | 來源標題與簡介明寫 ASMR 舔舐聲、體感視角、近攝、口交與美顏；人物關係已投影為淺野心 |
| Evidence 邊界 | `PUBLIC_METADATA`；可以介紹來源宣傳的呈現方式，不可聲稱其實際放大反差或聲畫效果如何 |
| 修改理由 | 在人物名與 `ASMR` 間建立清楚資訊分隔；刪除「如何放大反差」的觀看結果式敘述 |
| 風險或待確認事項 | `ASMR` 與近攝是來源明示的規格，不等於已有 PROMO_CLIP 或 DISTRIBUTED_SAMPLE 證據 |
| 決策狀態 | `READY` |

### 3.13 SNOS-369

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SNOS-369` |
| catalog code | `SNOS-369` |
| source title | `平時傲慢的辣妹學生…擔心發燒的我而熱烈看病！連發情肉棒都幫忙介助的反差母性，讓我大量射精！ 七森莉莉` |
| current article title | `SNOS-369 七森莉莉｜平時傲慢的辣妹學生` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SNOS-369 七森莉莉｜傲慢辣妹學生探病時的溫柔反差` |
| proposed display short title | `辣妹學生探病時的溫柔反差` |
| proposed SEO title | `SNOS-369 七森莉莉｜辣妹學生、教師探病與母性反差` |
| 主要人物顯示名 | `七森莉莉`（來源日文名 `七ツ森りり` 仍可搜尋） |
| 主要搜尋詞 | `SNOS-369`、`七森莉莉`、`七ツ森りり`、`辣妹學生`、`教師探病`、`溫柔反差`、`母性反差` |
| 來源支持 | 標題與簡介明寫傲慢辣妹學生、教師生病、到家探病及溫柔照顧的反差 |
| Evidence 邊界 | `PUBLIC_METADATA`；可寫來源設定，不可把實際表演節點或全片節奏寫成觀看事實 |
| 修改理由 | 現有標題只留下人物初始人設，未包含來源最具辨識度的探病與反差；新提案補回核心但不增加場外推論 |
| 風險或待確認事項 | SEO 的「母性反差」直接取自來源標題；H1 用較自然且較少價值判斷的「溫柔反差」 |
| 決策狀態 | `READY` |

### 3.14 SNOS-371

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SNOS-371` |
| catalog code | `SNOS-371` |
| source title | `河北彩花展現真實的溫柔與體貼 關東巡行 破處紀錄片` |
| current article title | `SNOS-371 河北彩花｜關東巡行口交企劃：把紀錄片形式拍出路線感` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SNOS-371 河北彩花｜走訪關東三位處男的初體驗紀錄片` |
| proposed display short title | `河北彩花的關東初體驗紀錄片` |
| proposed SEO title | `SNOS-371 河北彩花｜關東巡行、處男初體驗紀錄片` |
| 主要人物顯示名 | `河北彩花` |
| 主要搜尋詞 | `SNOS-371`、`河北彩花`、`關東巡行`、`破處紀錄片`、`處男初體驗`、`三位處男` |
| 來源支持 | 標題明寫關東巡行與破處紀錄片；簡介明寫河北彩花前往三位處男所在地、提供人生第一次體驗及 120 分鐘紀錄片 |
| Evidence 邊界 | `PUBLIC_METADATA`；只能重述來源的紀錄片企劃，不能把口交、騎乘位等標籤升成全片主軸，也不能描述路線感或各站實際進程 |
| 修改理由 | 現有「口交企劃」把次要標籤誤升成作品核心；提案回到來源明示的三位處男、初體驗及紀錄片定位 |
| 風險或待確認事項 | 已定案：主要標題採自然可讀的「初體驗」；「破處」「破處紀錄片」「關東巡行」保留於來源資料與搜尋詞，現有「口交企劃」不得再作作品主軸 |
| 決策狀態 | `READY` |

### 3.15 SNOS-409

| 欄位 | 內容 |
| --- | --- |
| stable movie ID | `cc18:SNOS-409` |
| catalog code | `SNOS-409` |
| source title | `我還不知道的性愛，請讓我接受研修！「社會新鮮人」AV女優的職業初體驗3本番 全部都是人生第一次，爽到絕頂Special 星空音琉` |
| current article title | `SNOS-409 星空ねる｜我還不知道的性愛：把 AV女優片拍成一次有層次的自我研修` |
| current display short title | `null`（尚未建立） |
| proposed article title | `SNOS-409 星空ねる｜社會新鮮人 AV 女優的職業研修與三場初體驗` |
| proposed display short title | `星空ねる的 AV 女優研修初體驗` |
| proposed SEO title | `SNOS-409 星空ねる｜社會新鮮人 AV 女優的職業研修與三場初體驗` |
| 主要人物顯示名 | `星空ねる`；來源標題別名 `星空音琉` 可搜尋但不得作主要名稱。需求文字中的 `星空C琉` 與實際來源不符，不採用 |
| 主要搜尋詞 | `SNOS-409`、`星空ねる`、`星空音琉`、`社會新鮮人 AV 女優`、`職業研修`、`AV 女優研修`、`三場初體驗` |
| 來源支持 | 標題與簡介明寫 22 歲大學畢業、社會新鮮人、出道後第二次拍攝、職業研修及三場／多項初體驗 |
| Evidence 邊界 | `PUBLIC_METADATA`；可介紹公開研修清單，不可宣稱成長層次、實際研修成果或全片感受 |
| 修改理由 | 保留核准主要名稱星空ねる；將生硬的「自我研修」「AV女優片」改成來源語意更準確的「職業研修」「AV 女優」，並補回三場初體驗的辨識資訊 |
| 風險或待確認事項 | 已定案：來源用語 `3本番` 保留於來源資料；顯示層採自然繁中的「三場初體驗」 |
| 決策狀態 | `READY` |

## 4. 決策總表

### 4.1 已核准進入 Phase 1B（`READY`，15 部）

| 番號 | proposed article title | proposed display short title |
| --- | --- | --- |
| DSOD-006 | `DSOD-006｜一ノ瀬ラム等四位空服員的多人服務企劃` | `四位空服員的多人服務企劃` |
| ENDS-322 | `ENDS-322｜孕婦自曝性癖的3P企劃` | `孕婦自曝性癖的3P企劃` |
| GAREA-627 | `GAREA-627｜透過 HAPPYMAIL 配對的25歲 OL 自拍約會` | `HAPPYMAIL 配對的 OL 自拍約會` |
| HUNTC-568 | `HUNTC-568｜出差同房、冷氣故障與同年進公司的女同事酒後反差` | `出差同房與女同事的酒後反差` |
| MCSR-639 | `MCSR-639｜人妻專用美容沙龍4：刺激療程與性感覺醒` | `人妻專用美容沙龍4` |
| MVG-171 | `MVG-171 蘭華｜傲慢辣妹遭全公司懲罰的3P／4P企劃` | `傲慢辣妹的3P／4P懲罰企劃` |
| NAMH-074 | `NAMH-074 美咲音｜19發中出與多角度近距離企劃` | `美咲音的19發中出企劃` |
| PRIAN-054 | `PRIAN-054 羽月乃蒼｜南國自然中的I罩杯全裸寫真` | `羽月乃蒼的南國I罩杯寫真` |
| SDAB-358 | `SDAB-358 要結愛｜18歲弓道少女的一日口交特訓` | `要結愛的一日口交特訓` |
| SIRO-5722 | `SIRO-5722｜22歲女大生的首次素人拍攝體驗` | `女大生的首次素人拍攝體驗` |
| SNOS-345 | `SNOS-345 鷲尾芽衣｜樸素巨乳的美容院乳頭開發` | `鷲尾芽衣的美容院乳頭開發` |
| SNOS-360 | `SNOS-360 淺野心｜ASMR口交與近距離體感視角` | `淺野心的ASMR近距離口交` |
| SNOS-369 | `SNOS-369 七森莉莉｜傲慢辣妹學生探病時的溫柔反差` | `辣妹學生探病時的溫柔反差` |
| SNOS-371 | `SNOS-371 河北彩花｜走訪關東三位處男的初體驗紀錄片` | `河北彩花的關東初體驗紀錄片` |
| SNOS-409 | `SNOS-409 星空ねる｜社會新鮮人 AV 女優的職業研修與三場初體驗` | `星空ねる的 AV 女優研修初體驗` |

`READY` 表示標題已核准進入 Phase 1B，不表示本輪已寫入正式資料、發布或部署。

### 4.2 原語意複核項目：已定案決策紀錄

以下三項已完成產品決策，`NEEDS_SEMANTIC_REVIEW` 現為 0 部。後續 Agent 不得重新選擇企劃名、人物主次或主標題用語。

| 番號 | 已定案決策 | 核准標題 |
| --- | --- | --- |
| DSOD-006 | 不選定「老二航空」「陽具航空」「DAS／ダスッ！」其中之一作唯一繁中企劃名；四種表記留在來源與搜尋，H1 採共同可驗證的四位空服員多人服務設定 | `DSOD-006｜一ノ瀬ラム等四位空服員的多人服務企劃` |
| SDAB-358 | 要結愛是來源標題與簡介的明確主角；相澤澪保留於 typed performer relation、來源記錄及搜尋，不升格為 H1 共同主角 | `SDAB-358 要結愛｜18歲弓道少女的一日口交特訓` |
| SNOS-371 | H1 採自然可讀的「初體驗」；「破處」「破處紀錄片」「關東巡行」留在來源與搜尋，現有「口交企劃」不得再作主軸 | `SNOS-371 河北彩花｜走訪關東三位處男的初體驗紀錄片` |

### 4.3 證據不足、暫時不改（`INSUFFICIENT_EVIDENCE`，0 部）

本輪沒有作品因完全缺乏可用來源而必須維持現有標題。這不表示 15 部都有影片觀看證據；除 HUNTC-568 外，其餘提案都只根據 `PUBLIC_METADATA`，因此提案刻意限縮在來源標題、簡介、人物、系列及標籤能支持的範圍。

## 5. 後續實作注意事項

1. 15 部標題均已核准進入 Phase 1B；第 4.2 節是已定案紀錄，不是待選方案。
2. Phase 1B 只能更新顯示層的 `article_title`／`display_short_title`／SEO title；`source_title` 永遠不得修改。
3. 人物名稱必須由核准在地化投影取得；搜尋別名不等於主要顯示名稱，不得從來源標題臨時翻譯或升格別名。
4. 本次核准的是顯示層文案，不代表 `evidence_level` 或影片觀看證據提升。
5. Markdown 正文與 SEO description 的證據範圍檢查是獨立工作；不得因標題核准而自動改寫。
6. 本輪尚未把核准標題寫入正式資料，也未發布或部署。

## 6. 實際檢查的主要資料

- `data/movie-master/index.json`
- `data/movie-master/{15部番號}.json`
- `data/source-records/{15部番號}.json`
- `content/reviews/{15部番號}.md`
- `data/search-content/{15部番號}.json`
- `data/editorial-briefs/{15部番號}.json`
- `data/localization/performers-zh-tw.json`
- `data/taxonomy.json` 及現有 canonical taxonomy 顯示資料
- HUNTC-568 的 `data/review-quality/HUNTC-568.json`、`data/review-quality/HUNTC-568-automated.json` 與 Movie Master Evidence Record
- 15 個 Movie Master 所記錄的 cc18.tv `source_url`（2026-08-29 唯讀回讀）
