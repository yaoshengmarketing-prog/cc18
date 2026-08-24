# CC18 Architecture Package

版本：`0.2.0-draft`  
狀態：架構討論稿，尚未授權建立正式網站或雲端資源  
基準日期：2026-08-24

本套件是 CC18 影評網站的架構、資料契約與營運規則之單一討論基準。正式實作必須能追溯到本套件中的需求、Schema 或 Architecture Decision Record（ADR）。

## 專案定位

CC18 是以 cc18.tv 公開作品頁為來源的成人作品介紹與原創影評網站。系統讀取番號、演員、實際發行日期、片商、系列、標籤與公開簡介；文章不得宣稱逐幕觀看完整影片。網站以新片為主，來源可能在單日突發新增 50–250 部，因此生產線必須採「全量收件、持久化排隊、限流處理、分波發布」，不能以每日 3–5 部作為正式上限。

## 本版核心決策

- Astro 靜態網站；Cloudflare Workers Static Assets 部署。
- GitHub Actions 是排程、生產與部署控制中心。
- Cloudflare D1 是營運 Registry、Queue 與狀態的權威來源。
- GitHub 保存程式、Markdown、Taxonomy、來源正規化快照與 Registry 匯出快照。
- Cloudflare R2 保存所有生成圖片與 MP4，使用不可變版本路徑。
- Tag 在文章生成前規劃、生成後驗證；Taxonomy 另由全自動治理流程演進。
- 批次編輯規劃先於個別文章生成，以減少同批與同系列內容重複。
- 文章、圖片、影片是可獨立重試的階段；影片失敗不得阻塞文章發布。
- 全自動營運採保守、可逆的失敗策略；不確定時延後升級或隔離，不等待人工。

## 文件導覽

1. `docs/00-product-and-principles.md`：產品範圍與不可違反原則。
2. `docs/01-system-architecture.md`：整體架構與平台責任。
3. `docs/02-data-and-state.md`：資料模型、權威來源與狀態機。
4. `docs/03-ingestion-and-burst-processing.md`：來源擷取、Watermark、突發批次。
5. `docs/04-editorial-and-taxonomy.md`：文章、切角、Tag 與自動治理。
6. `docs/05-media-pipeline.md`：圖片、Remotion、R2 與播放器。
7. `docs/06-publishing-and-deployment.md`：發布交易、GitHub、Cloudflare。
8. `docs/07-operations-security-compliance.md`：重試、監控、安全與內容政策。
9. `docs/08-capacity-cost-and-sla.md`：容量、成本與服務目標。
10. `docs/09-testing-rollout-and-roadmap.md`：測試、驗收與分階段上線。
11. `schemas/`：機器可驗證的資料契約。
12. `examples/`：資料、設定與工作流範例。
13. `adr/`：不可只靠口頭記憶的架構決策。
14. `docs/12-inventory-2026-08-24.md`：本地、GitHub、Cloudflare 的首次唯讀盤點。

## 版本更新規則

- ZIP 發布物不可就地覆寫；任何修改都產生新版本。
- 每次修改必須更新 `VERSION`、`CHANGELOG.md` 與受影響文件。
- 架構方向改變時新增 ADR；舊 ADR 不刪除，只能標記 superseded。
- Schema 破壞性變更增加 major；新增相容欄位增加 minor；文字修正增加 patch。
- `draft` 表示仍在討論；移除 `draft` 才可作為正式建置基準。
- `MANIFEST.sha256` 於打包時生成，用來驗證 ZIP 內容。

## 尚未執行的工作

- 尚未建立 `yaoshengmarketing-prog/cc18` repository。
- 尚未建立 Cloudflare Worker、D1、R2 或網域設定。
- 尚未放入任何 API key、token 或帳號資料。
- 尚未啟用 GitHub Actions 排程。
- 尚未大量擷取 cc18.tv 資料或產生正式文章。
