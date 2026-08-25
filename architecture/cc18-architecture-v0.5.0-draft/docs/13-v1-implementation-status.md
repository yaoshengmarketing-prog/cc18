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
- 專用 Chrome Profile 已完成登入、後臺前台授權、年齡確認與 HUNTC-568 全流程。
- 本機 `qwen2.5vl:7b` 已完成 24 個分布窗口分析；成功後立即清除所有影像、音訊與 HLS 片段。
- `CC18-MediaBridge-Cleanup` Windows 使用者排程已安裝，狀態 Ready，每小時執行。
- HUNTC-568 已完成公開資料、影片 Analysis、Editorial Brief、原創影評、QA、兩張原創非露骨圖、Remotion MP4 與 R2 上傳校驗。
- HUNTC-568 文章 QA：8 段、7 組證據、14 個不同影片窗口、0 組重複句，總分 9.2／10。

## 驗證結果

- Astro：0 errors、0 warnings、0 hints。
- TypeScript：通過。
- Registry：1 筆示範資料、無重複。
- Parser tests：2/2 通過。
- 瀏覽器：桌面與手機首頁、作品 CTA、console errors 均已檢查。
- 公開 production：首页與作品頁 canonical 使用固定 hostname，console error 為 0。
- 公開 sitemap：HTTP 200，指向 `https://cc18.pages.dev/sitemap-0.xml`。
- Media Bridge tests：8/8 通過；本機 FFmpeg binary 可用。
- HUNTC-568：24/24 窗口，平均信心值 0.9292；Evidence 不含秘密，Analysis 不嵌入來源畫面。

## 仍未啟用

- 大量抓取與每日自動發布。
- 生產用 Writer／圖片 API 金鑰與成本控制。
- D1 databases。
- 遠端 Queue 同步。
- 音訊轉錄。
- 大批次 Writer 模型選型與連續 7 天無人值守驗收。
- 正式網域與媒體網域。
