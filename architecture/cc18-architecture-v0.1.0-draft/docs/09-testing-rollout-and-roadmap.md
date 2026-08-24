# 測試、上線與 Roadmap

## 1. 測試層級

### Unit

- 番號正規化與去重。
- 日期解析。
- Tag mapping。
- Schema validation。
- R2 path／manifest。
- 狀態機與 retry delay。

### Contract

- cc18.tv 列表與作品頁 extractor fixtures。
- OpenAI structured output schema。
- D1 migration 與 query。
- R2 upload／head／hash。
- Astro content collection。

### Integration

- 一部作品從 source snapshot 到 Markdown。
- 圖片 fallback。
- Remotion render。
- Publication batch、commit、deploy。

### Load

- 250 部合成 Metadata。
- Queue claim／lease／recovery。
- 10–20 AI worker 節流。
- 5 個發布波次。
- 搜尋索引與 sitemap build。

## 2. 上線階段

### Phase 0 — Read-only inventory

盤點本地、GitHub、Cloudflare、repo 名稱、帳號、網域、D1、R2、Workers 與 Remotion 授權；不建立正式資源。

### Phase 1 — Foundation

建立 repo、Astro、schemas、D1 migration、R2 path、Remotion template、CI 與 staging。

### Phase 2 — Single real work

以一部代表作品完成資料、Tag、影評、圖片、MP4、Registry、Git、R2 與 staging deploy。

### Phase 3 — Controlled batch

處理 10 部，驗證同系列差異、成本、失敗重試與分波發布。

### Phase 4 — Load and unattended acceptance

執行 250 部合成負載，並連續 7 天無人值守；測試期間必須涵蓋至少一次來源真實更新。

### Phase 5 — Production schedule

啟用正式 schedule、budget guard、backlog SLA 與 production deployment。

## 3. 驗收條件

- 不漏掉符合政策的新作品。
- 同番號多 UUID 不重複發布。
- 日期來自作品頁實際欄位。
- AI 不宣稱完整觀看。
- 同批／同系列文章差異化通過門檻。
- Tag 當下完成，未知詞可自動演進。
- 影片失敗不阻塞文章。
- Job 中斷可由 lease 恢復。
- 250 部能在 SLA 內完成或保持可觀察 backlog。
- 每次發布有 commit、batch、deployment 與成本紀錄。

## 4. 暫不納入 V1

- 大量歷史回補。
- 使用者登入、收藏與個人化。
- Cloudflare Stream。
- HLS／DRM。
- 即時 CMS 後台。
- 自動搬運原影片畫面。
- 多來源聚合。
- 大型向量推薦服務；先以系列、演員與 Tag 加權。

## 5. 版本退出 draft 的條件

- GitHub／Cloudflare 唯讀盤點完成。
- 來源擷取政策與技術可行性確認。
- Remotion 授權狀態確認。
- 正式網站／媒體網域決定。
- 第一部測試作品與模型選型決定。
- 本套件未決事項已建立 ADR 或明確延期。

