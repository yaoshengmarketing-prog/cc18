# CC18

CC18 是以公開作品資料為基礎的成人作品介紹與原創影評網站專案。正式系統將使用 GitHub Actions 執行來源擷取、去重、Tag／影評生成、原創非露骨圖片、Remotion MP4、Registry、分波發布與 Cloudflare 部署。

目前狀態：V1 網站與自動化底座已部署至 Cloudflare Pages。已建立 Astro 首頁、作品頁、演員／系列／Tag Hub、Registry、9 秒 Remotion 模板與手動 dry-run Action；尚未啟用正式產文、每日排程、D1 或 R2。

正式站：<https://cc18.pages.dev>

## Local development

```bash
npm install
npm run registry:validate
npm run dev
```

Remotion Studio：

```bash
npm run video:studio
```

目前唯一文章是安全示範資料。正式封面會由 Scout 從 CC18 公開作品頁取得後下載至 R2；文章 CTA 保留精確的 CC18 原始作品網址。

## Architecture

- 最新套件來源：`architecture/cc18-architecture-v0.3.1-draft/`
- 最新 ZIP：`architecture/releases/cc18-architecture-v0.3.1-draft.zip`
- 前一版實作套件：`architecture/cc18-architecture-v0.3.0-draft/`
- 第一版套件保留於 `architecture/cc18-architecture-v0.1.0-draft/`

所有實作應引用架構文件、Schema 或 ADR。架構變更需產生新版本，不覆寫既有 ZIP。

## Confirmed names

- GitHub：`yaoshengmarketing-prog/cc18`
- Cloudflare site／Worker：`cc18`
- D1：`cc18-db`、`cc18-db-staging`
- R2：`cc18-media`、`cc18-media-staging`
