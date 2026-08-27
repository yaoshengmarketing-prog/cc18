# CC18

CC18 是以公開作品資料為基礎的成人作品介紹與原創影評網站專案。正式系統將使用 GitHub Actions 執行來源擷取、去重、Tag／影評生成、原創非露骨圖片、Remotion MP4、Registry、分波發布與 Cloudflare 部署。

目前狀態：V1 網站與自動化底座已部署至 Cloudflare Pages。作品頁已分成來源事實、原創影評與搜尋決策三層，另有站內搜尋、編輯方法、索引門檻與結構化資料。`HUNTC-568` 已完成完整時間軸分布式影片分析與證據型影評；`SDAB-358` 已完成分層 Tag、非露骨原創圖片、9 秒 Remotion MP4、R2 雜湊驗證、Cloudflare 正式頁驗證與 D1 Publisher 閉環。D1 已啟用並保存 31 部作品／68 個工作；目前 12 個 completed、53 個 queued、2 個 retry、1 個 leased。每日大量排程仍未啟用。

影評採「創作預設開放、影片分析加分」：限制只用來防止番號、演員、日期、系列、來源 CTA、Registry、Tag 與發布狀態出錯，不用來壓縮文章。正文允許以主觀評論語氣補寫情節、人物動機、場景銜接、鏡位、聲音氛圍、剪輯節奏、演技與表情，優先追求故事性、獨特性、畫面感、可讀性與選片價值。創作內容在內部 Brief 留下 provenance，但不回寫來源事實。Windows Media Bridge 的影片抽樣只用來增加素材，失敗不阻止文章。

內容品質採硬性發布門檻：正式影評必須保存 CC18 原始標題，另產生來源導向的顯示標題與 SEO 標題；Tag 使用穩定 ID，文章必須附帶來源證據、評分紀錄與內容雜湊，並通過最低 8 分及跨文章相似度檢查。`新片` 依作品日期即時計算，不永久寫入文章。

正式站：<https://cc18.pages.dev>

## Local development

```bash
npm install
npm run registry:validate
npm run content:validate
npm run validate
npm run dev
```

Remotion Studio：

```bash
npm run video:studio
```

安全示範文章已降為草稿；目前有三篇真實來源文章公開。作品封面暫時使用 CC18 公開來源 URL，原創 Hero 與 MP4 使用 R2 immutable key。文章 CTA 永遠保留精確的 CC18 原始作品網址。

內容規則的可執行來源：

- `config/title-policy.json`：來源標題、顯示標題與 SEO 標題。
- `config/review-policy.json`：可用資料、禁止宣稱、證據與發布門檻。
- `config/review-scorecard.json`：影評七項評分。
- `data/taxonomy.json`：穩定 Tag ID、來源映射與忽略規則。
- `scripts/validate-content.mjs`：CI 發布阻擋與文章相似度檢查。
- `config/media-bridge.json`：本機授權瀏覽器、媒體 allowlist、抽樣與保留政策。
- `docs/discovery-queue.md`：新片全量收件、日期分類、D1 去重與 lease 規則。
- `docs/editorial-d1.md`：影片 Evidence 到 Editorial Draft／QA 的 D1 接棒與模型責任。
- `docs/publisher.md`：發布 QA、限定提交、Cloudflare 正式頁驗證與 D1 完成條件。
- `cloudflare/migrations/0001_pipeline_queue.sql`：持久化 Queue 的 D1 schema。
- `config/agent-roles.json`：Scout、Tag Curator、Editor、Critic/QA、Media Producer、Publisher 的責任與交接契約。
- `docs/agent-workflow.md`：多角色工作流、失敗隔離與資料 source of truth。
- `docs/content-canary.md`：3–7 天內容 canary；每天最多三部、單工執行，正式日排程保持關閉。

Tag 現在固定分成三層：CC18 原始標籤逐字保存；站內標準標籤只由 taxonomy 規則映射；影評觀點標籤由 Editor 提出並由 Critic/QA 審核。作品頁另由原始標籤自動整理「人物身分、身材、衣著、關係、場景、行為與體位、拍攝與形式」摘要，這些來源字詞也進入站內搜尋，不依賴 AI 是否剛好寫進正文。

批次 Discovery 與本機 worker 目前只允許手動執行：

```bash
npm run discovery:run -- --store=file
npm run queue:status -- --store=file
npm run bridge:d1:process-one
npm run worker:readiness
npm run worker:cycle -- --max=3
npm run editorial:d1:source-only -- MOVIE-ID
```

`worker:cycle` 預設只做可選的影片證據分析；單筆失敗不阻塞文章或後續工作，原始影片樣本在分析後刪除。只有同時加上 `--with-editorial` 並明確設定 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES`，才會把安全化資料送往外部文字模型建立草稿；它仍不會發布。目前 Windows 排程保持停用，待 source-grounded Editorial 路徑完成後再重新啟用。

`file` 模式是本機 dry run；正式跨執行持久化使用 `--store=d1`。D1 已建立並套用 migration。正式每日發布仍維持關閉，必須先完成整條流程與七天 canary。

Creative-first 路徑已與 Media 解耦：Discovery 對每部 eligible 作品各建立一個 `editorial` 與一個 `media_analysis` 工作。Editorial 先由本機 Ollama 讀取完整來源標題、簡介與 Tag，產生非露骨 Creative Brief；外部 Writer 只接收這份 Brief 與安全化訊號。`editorial:source-cycle` 仍受 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES` 明確開關保護，目前未排程、未執行新作品外送。

圖片路徑已接成 `editorial completed → image queued → AItokenKing 非同步生成 → R2 上傳與反向 SHA-256 驗證 → Media Manifest／文章／Registry → video queued`。每部產生 16:9 Hero 與 9:16 直式素材；失敗標記 retry，不阻止文章保留 CC18 來源封面。批次 `image:cycle` 需設定 `CC18_ALLOW_IMAGE_TRANSMISSION=YES`，目前仍未啟用排程。

影片路徑已接成 `image completed → video queued → Remotion 1080×1920／9 秒 H.264 → R2 上傳與反向 SHA-256 驗證 → 文章／Media Manifest／Registry → publish queued`。只有雜湊驗證成功才標記 rendered，本機 MP4 與驗證副本隨即刪除。若本機 D1 Token 不含 R2 Object Write，但已執行 `wrangler login`，可在單次命令設定 `CC18_R2_AUTH_MODE=oauth`；GitHub Actions 使用獨立的 `CLOUDFLARE_R2_API_TOKEN`，D1 與 R2 權限不混用。單部完整雲端 Canary 操作見 `docs/canary-cycle.md`。

Publisher 路徑已接成 `publish queued → 內容與媒體 QA → 限定檔案 commit/push → Cloudflare Pages → 正式頁 release-id／播放器驗證 → D1 completed`。正式頁的 release-id 使用核准 Markdown 的 SHA-256，因此 Git push、Pages build 或邊緣切換任一環節尚未完成時，都不會提前結案。手動 canary 由 GitHub 的 `Content pipeline` 選擇 `publish` 並填入精確番號；大量排程仍維持關閉。

本機限量生產可使用 `npm run canary:run -- --max=1`，每次硬性限制最多三部，依序完成 Editorial、Image、Video、Publisher。執行前可用 `npm run canary:health` 檢查佇列，或以 `npm run canary:repair` 將已過期 lease 安全改回 retry。完整操作與安全邊界見 [docs/canary-cycle.md](docs/canary-cycle.md)。

## Architecture

- 最新套件來源：`architecture/cc18-architecture-v0.17.0-draft/`
- 最新 ZIP：`architecture/releases/cc18-architecture-v0.17.0-draft.zip`
- 前一版實作套件：`architecture/cc18-architecture-v0.16.0-draft/`
- 第一版套件保留於 `architecture/cc18-architecture-v0.1.0-draft/`

所有實作應引用架構文件、Schema 或 ADR。架構變更需產生新版本，不覆寫既有 ZIP。

## Confirmed names

- GitHub：`yaoshengmarketing-prog/cc18`
- Cloudflare site／Worker：`cc18`
- D1：`cc18-db`、`cc18-db-staging`
- R2：`cc18-media`、`cc18-media-staging`
