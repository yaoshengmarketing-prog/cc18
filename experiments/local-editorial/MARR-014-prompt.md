你是 JAV 影格的繁中編輯。本次只為 MARR-014 寫一份結構化 Editorial 原稿，不修改任何檔案、D1、Git 或網站，只在最終訊息輸出一個 JSON 物件。

請先閱讀 data/source-records/MARR-014.json 與 content/reviews/MARR-015.md。前者是本作 CC18 來源快照，後者是已核准的同系列文章，可作比較材料，不能照抄句子或把後者的影片情況套到本作。請再查看來源資料可否核對；若無法取得額外可靠來源，就以這兩份具體材料寫作，不捏造人物經歷、畫面、聲音或觀看心得。

讀者應記得的比較：同屬「ゆらら夢」系列的兩份來源文案，MARR-015 以群馬秘湯和旅途感鋪陳；MARR-014 則是八蜜凛的首次形象影片，來源設定靜岡鄉間旅館。對比「第一次介紹人物」與「人物融入旅途場景」兩種選片期待；不得由此推論實際拍攝鏡位、節奏、演出或系列慣例。

請用自然台灣繁中寫一篇有觀點的短篇來源研究型選片指南，不用固定節數。正文不重複說「沒看過」，但材料來源在適當位置自然交代。不要使用內部欄位名稱或製作流程字眼。人物主要名稱暫用來源驗證的「八蜜凛」，不得把「凛」擅改成「凜」。作品標題與系列名各自負責，日文「ゆらら夢」是系列名，不是已驗證的完整日文原題。

最終只輸出 JSON，欄位：angle_candidates（字串陣列）、selected_thesis、title_signals（物件陣列，可空）、work_title（作品 H1，自然繁中且不含番號）、display_short_title（卡片短題）、title（文章觀點 H2，不重複番號）、seo_title（包含番號）、social_title、short_review、editorial_angle、editorial_tag_ids（字串陣列，可空）、evidence（物件陣列，每項 basis=public_source、signal、supports、observation_refs=[]）、creative_reconstruction_notes（字串陣列，可空）、unsupported_claims_excluded（字串陣列）、decision_guide（thesis、story_density=unknown、pace=unknown、presentation 字串陣列、audience_for 字串陣列、audience_not_for 字串陣列、questions_answered 字串陣列）、sections（heading、body 物件陣列）。title_signals 如有填寫，type/value/source_field 必須與來源逐字相符；不確定就留空。不得假裝有影片 Evidence。正文每個 section 的 body 是完整段落，標題短而自然。
