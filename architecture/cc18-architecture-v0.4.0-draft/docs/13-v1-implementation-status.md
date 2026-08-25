# V1 實作現況（2026-08-25）

## 已完成

- Private GitHub repository：`yaoshengmarketing-prog/cc18`，主分支 `main`。
- Astro 靜態網站與 11 個測試輸出頁面。
- 首頁採橫式影片縮圖，對應 cc18.tv 公開主預覽圖約 `800×538` 的實際比例。
- 作品頁必要 CTA，精確保存 `source_url`，使用 `rel="sponsored noopener"`。
- 演員、系列、Tag Hub 與最新作品索引。
- Astro content schema、JSON Registry、Taxonomy policy。
- CC18 listing／work parser；只允許 cc18.tv 網域。
- parser fixture 測試與一筆公開作品 live smoke test。
- 9 秒、30fps、1080×1920 Remotion 四場景模板。
- CI：Registry、來源 parser、Astro 型別與 build。
- 手動 content pipeline dry-run；每日排程關閉。
- Cloudflare Pages `cc18` 已以 Git integration 正式部署：`https://cc18.pages.dev`。
- R2 已啟用，第一筆測試作品使用私有 bucket 與 Pages Function 供應衍生媒體。
- Windows Media Bridge 原型：專用 Chrome Profile、後臺前台授權路徑、HLS 攔截、全片取樣規劃、本機 Evidence、retry／auth_required 與安全日誌。
- `ffmpeg-static` 與 `playwright-core` 已納入專案；Bridge 單元測試納入 CI。

## 驗證結果

- Astro：0 errors、0 warnings、0 hints。
- TypeScript：通過。
- Registry：1 筆示範資料、無重複。
- Parser tests：2/2 通過。
- 瀏覽器：桌面與手機首頁、作品 CTA、console errors 均已檢查。
- 公開 production：首页與作品頁 canonical 使用固定 hostname，console error 為 0。
- 公開 sitemap：HTTP 200，指向 `https://cc18.pages.dev/sitemap-0.xml`。
- Media Bridge tests：4/4 通過；本機 FFmpeg binary 可用。

## 仍未啟用

- 正式作品文章與大量抓取。
- AI 寫作與圖片 API。
- D1 databases。
- Media Bridge 專用 Chrome Profile 的一次性 CC18 登入。
- 單部 HUNTC-568 端到端授權、抽樣與 Evidence 驗收。
- 本機畫面／音訊語意分析器與 Evidence → 正式影評串接。
- 正式網域與媒體網域。
