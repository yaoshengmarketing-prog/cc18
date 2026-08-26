# CC18

CC18 是以公開作品資料為基礎的成人作品介紹與原創影評網站專案。正式系統將使用 GitHub Actions 執行來源擷取、去重、Tag／影評生成、原創非露骨圖片、Remotion MP4、Registry、分波發布與 Cloudflare 部署。

目前狀態：V1 網站與自動化底座已部署至 Cloudflare Pages。作品頁已分成來源事實、原創影評與搜尋決策三層，另有站內搜尋、編輯方法、索引門檻與結構化資料。`HUNTC-568` 已完成完整時間軸分布式影片分析、證據型影評、分層 Tag、非露骨原創圖片、9 秒 Remotion MP4 與 R2 雜湊驗證。D1 已啟用並保存 31 部作品／20 個工作；目前 8 個 completed、11 個 queued、1 個 retry。每日大量排程仍未啟用。

代理商權限的完整影片分析採 Windows Media Bridge：使用本機專用 Chrome Profile 經由正常的後臺「前台」連結取得短效 HLS，只下載分布式樣本，且不保存 Cookie 或簽章網址。操作與安全邊界見 [`docs/media-bridge.md`](docs/media-bridge.md)。

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

安全示範文章已降為草稿；目前公開文章為第一筆真實來源流程測試。作品封面暫時使用 CC18 公開來源 URL，原創 Hero 與 MP4 使用 R2 immutable key。文章 CTA 永遠保留精確的 CC18 原始作品網址。

內容規則的可執行來源：

- `config/title-policy.json`：來源標題、顯示標題與 SEO 標題。
- `config/review-policy.json`：可用資料、禁止宣稱、證據與發布門檻。
- `config/review-scorecard.json`：影評七項評分。
- `data/taxonomy.json`：穩定 Tag ID、來源映射與忽略規則。
- `scripts/validate-content.mjs`：CI 發布阻擋與文章相似度檢查。
- `config/media-bridge.json`：本機授權瀏覽器、媒體 allowlist、抽樣與保留政策。
- `docs/discovery-queue.md`：新片全量收件、日期分類、D1 去重與 lease 規則。
- `docs/editorial-d1.md`：影片 Evidence 到 Editorial Draft／QA 的 D1 接棒與模型責任。
- `cloudflare/migrations/0001_pipeline_queue.sql`：持久化 Queue 的 D1 schema。

批次 Discovery 與本機 worker 目前只允許手動執行：

```bash
npm run discovery:run -- --store=file
npm run queue:status -- --store=file
npm run bridge:d1:process-one
npm run worker:readiness
npm run worker:cycle -- --max=3
```

`worker:cycle` 預設只做影片證據分析，每次最多三筆，單筆失敗不阻塞其他工作，原始影片樣本在分析後刪除。只有同時加上 `--with-editorial` 並明確設定 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES`，才會把安全化資料送往外部文字模型建立草稿；它仍不會發布。Windows 排程安裝器已備妥，但驗證前不會自行安裝：`npm run worker:schedule:install`。

`file` 模式是本機 dry run；正式跨執行持久化使用 `--store=d1`。D1 已建立並套用 migration。正式每日發布仍維持關閉，必須先完成整條流程與七天 canary。

## Architecture

- 最新套件來源：`architecture/cc18-architecture-v0.15.0-draft/`
- 最新 ZIP：`architecture/releases/cc18-architecture-v0.15.0-draft.zip`
- 前一版實作套件：`architecture/cc18-architecture-v0.14.0-draft/`
- 第一版套件保留於 `architecture/cc18-architecture-v0.1.0-draft/`

所有實作應引用架構文件、Schema 或 ADR。架構變更需產生新版本，不覆寫既有 ZIP。

## Confirmed names

- GitHub：`yaoshengmarketing-prog/cc18`
- Cloudflare site／Worker：`cc18`
- D1：`cc18-db`、`cc18-db-staging`
- R2：`cc18-media`、`cc18-media-staging`
