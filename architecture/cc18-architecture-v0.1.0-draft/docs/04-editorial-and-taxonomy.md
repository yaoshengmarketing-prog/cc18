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

所有事實句必須能映射到 `source_facts`；評論與推論使用明確的編輯語氣。

## 4. 差異化 QA

完成後比較：

- 同批文章標題與段落。
- 同系列近作。
- 同演員近作。
- 最近 30–90 天相同 Tag 文章。
- `angle_signature` 與常用句型。

高相似時先重新分配切角，再重寫；重試仍相似則保留文章但標為 `editorial_retry`，不得以替換姓名方式發布。

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

