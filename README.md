# CC18

CC18 是以公開作品資料為基礎的成人作品介紹與原創影評網站專案。正式系統將使用 GitHub Actions 執行來源擷取、去重、Tag／影評生成、原創非露骨圖片、Remotion MP4、Registry、分波發布與 Cloudflare 部署。

目前狀態：V1 網站與自動化底座已部署至 Cloudflare Pages。第一筆真實來源測試作品 `SNOS-360` 已完成擷取、來源快照、分層 Tag、原創影評、非露骨原創圖片與 9 秒 Remotion MP4；R2 已啟用並以私有 bucket + Pages Function 提供媒體。每日排程與 D1 仍未啟用。

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

安全示範文章已降為草稿；目前公開文章為第一筆真實來源流程測試。作品封面暫時使用 CC18 公開來源 URL，原創 Hero 與 MP4 使用 R2 immutable key。文章 CTA 永遠保留精確的 CC18 原始作品網址。

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
