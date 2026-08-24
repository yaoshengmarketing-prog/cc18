# CC18

CC18 是以公開作品資料為基礎的成人作品介紹與原創影評網站專案。正式系統將使用 GitHub Actions 執行來源擷取、去重、Tag／影評生成、原創非露骨圖片、Remotion MP4、Registry、分波發布與 Cloudflare 部署。

目前狀態：架構與平台盤點階段，尚未啟用正式產文或 Cloudflare production 資源。

## Architecture

- 最新套件來源：`architecture/cc18-architecture-v0.2.0-draft/`
- 最新 ZIP：`architecture/releases/cc18-architecture-v0.2.0-draft.zip`
- 第一版套件保留於 `architecture/cc18-architecture-v0.1.0-draft/`

所有實作應引用架構文件、Schema 或 ADR。架構變更需產生新版本，不覆寫既有 ZIP。

## Confirmed names

- GitHub：`yaoshengmarketing-prog/cc18`
- Cloudflare site／Worker：`cc18`
- D1：`cc18-db`、`cc18-db-staging`
- R2：`cc18-media`、`cc18-media-staging`

