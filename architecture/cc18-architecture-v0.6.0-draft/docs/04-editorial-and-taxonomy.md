# 編輯與 Taxonomy

## 1. 文章生成順序

```text
Source facts
→ Tag batch preflight
→ Content brief / angle assignment
→ Structured review generation
→ Fact and editorial QA
→ Markdown renderer
```

AI 不直接自由輸出最終 Markdown。先產生符合 Schema 的 JSON，再由程式渲染固定結構。

## 1.1 作品名稱與標題身分層

每部作品分別保存：

- `source_title`：CC18 顯示原文，逐字保存，作為來源證據。
- `original_title_ja`：權威來源提供的日文正式片名；無法確認時為 `null`。
- `translated_title_zh_tw`：對日文正式片名的忠實繁中直譯；沒有日文原名時為 `null`。
- `display_title`：繁中文章 H1，包含番號、核心情境與編輯辨識度。
- `seo_title`：繁中搜尋標題，包含番號、已知演員、影評意圖與主要搜尋詞。
- `social_title`：Open Graph 與短影音使用的短 Hook，不能增加來源未支持的事實。

AI 在產生三種站內標題前，先建立二至四項 `title_signals`。每項保存 `type`、`value` 與 `source_field`，只能來自來源標題、公開簡介、演員或系列。顯示標題至少使用兩項，社群標題至少使用一項；其他關鍵詞留給摘要、內文、Tag 與 Hub，禁止塞滿標題。

日文片名負責作品身分及精確查找，不負責臺灣讀者的主要 SEO。缺少日文權威來源時不可將中文宣傳標題反向翻譯成「原名」。作品 URL 永久使用小寫番號，例如 `/reviews/huntc-568/`；標題版本變更不得改變 URL。

本機視覺模型可先提出草稿，但不得因「成功輸出 JSON」就視為可發布。首筆端到端測試已證明 7B 視覺模型可能產生示範標題、重複段落與無音訊證據的宣稱；因此 Writer 與 QA 必須是兩個獨立階段。

## 2. Content brief

每部作品在寫作前取得：

- `primary_angle`
- `secondary_angle`
- `avoid_angles`
- `source_facts`
- `canonical_tags`
- `editorial_tags`
- `provisional_candidates`
- 同系列最近文章摘要
- 同演員最近文章摘要

同批 Planner 應平衡切角分布，避免所有作品都使用「氛圍」「反差」「沉浸感」等泛化表達。

## 3. 文章結構

- 作品資料與方法揭露
- 短評
- 公開劇情設定
- 核心題材與看點
- 人物／角色適配
- 同系列差異
- 適合的觀眾類型
- 總評
- 同演員／同系列推薦
- 原始作品來源連結

來源連結是必要導流 CTA，而非可省略的註腳。CTA 文案由網站模板產生，不交給 AI 自由改寫；按鈕應顯示將前往 cc18.tv。

所有事實句必須能映射到 `source_facts`；評論與推論使用明確的編輯語氣。

## 4. 差異化 QA

完成後比較：

- 同批文章標題與段落。
- 同系列近作。
- 同演員近作。
- 最近 30–90 天相同 Tag 文章。
- `angle_signature` 與常用句型。

高相似時先重新分配切角，再重寫；重試仍相似則保留文章但標為 `editorial_retry`，不得以替換姓名方式發布。

發布前的硬性 QA 至少檢查：

- 標題含番號及兩個以上來源訊號，禁止 placeholder／demo 字樣。
- SEO 與社群標題均含番號；演員已知時，顯示及 SEO 標題均需保留演員姓名。
- Title Signal 必須能回查指定來源欄位；日文原名與繁中直譯若存在，必須與 Source Record 一致。
- 每組影片證據引用有效 observation index，不能只把番號當成 `signal`。
- 音訊未轉錄時不得評論具體對白、語氣、ASMR 或收音品質。
- 相同長句不可重複，段落標題與問題必須不同。
- 必須說明適合與不適合的觀眾，並揭露完整時間軸分布式抽樣方法。

## 5. Tag 四層模型

| 類型 | 定義 | 顯示／用途 |
|---|---|---|
| Source Tag | cc18.tv 原始 ID 與文字 | 證據；可選擇性顯示 |
| Canonical Tag | 本站正式分類 | 搜尋、篩選、Hub、推薦 |
| Editorial Tag | 本站影評切角 | 內容特色與推薦 |
| Candidate Tag | 尚未成熟的新概念 | 內部或非連結特色 |

演員、片商、系列、發行日期與畫質均為獨立欄位，不當作 Canonical Tag。

## 6. 文章當下分類

Pre-tagger 在文章生成前輸出 Tag plan；Post-tagger 在文章完成後驗證證據與一致性。正式 Tag ID 必須存在於當前 taxonomy，未知 ID 不可直接公開。

## 7. 全自動 Taxonomy 治理

每日 reconcile：

- 已知來源 ID 精確映射。
- 新詞加入 observation。
- 高信心同義詞映射。
- 技術詞移至技術欄位。
- 敏感詞隔離。

每週 consolidation：

- 統計跨作品與跨系列出現頻率。
- 檢查與既有 Tag 的語意重疊。
- 兩次獨立 AI／規則判斷一致後才升級。
- 新 Tag 先 `approved + indexable=false`。
- 作品數、獨立說明與穩定性足夠後才 `indexable=true`。

不確定時維持 provisional；不等待人工。Tag 不直接刪除，先 deprecated，並以 alias／redirect 保持連結。

## 8. 搜尋與 Hub

- 作品可立即使用已批准 Tag。
- Candidate 可保存或顯示為非連結特色。
- 低作品數 Tag Hub 設 `noindex`。
- 成熟 Hub 包含定義、最新作品、相關演員、系列、相鄰 Tag 與獨立介紹。
- 搜尋權重優先序建議：番號 > 演員 > 系列 > Canonical Tag > 標題 > 影評全文 > Source Tag。

