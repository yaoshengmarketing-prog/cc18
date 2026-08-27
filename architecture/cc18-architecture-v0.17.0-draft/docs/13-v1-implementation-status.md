# V1 實作現況（2026-08-28）

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
- 已建立 `cc18-local-d1-bridge` 最小權限 Token，僅限指定帳戶 D1 Edit，保存在 Git 忽略的本機檔。
- TPNS-037 已完成 24-window Media Bridge、平均信心 0.8917、原始媒體清除、AItokenKing 降敏 Writer 與 D1 completed。
- TPNS-037 草稿 QA：7 段、5 組證據、5 個不同影片窗口、0 組重複句、0 issues；仍維持 draft。
- AItokenKing Schema 相容層、第一個完整 JSON 擷取、安全 Payload 與 QA-blocked guarded finalize 已納入自動測試。
- Registry 已有 11 部正式作品；SNOS-409 完成 GitHub-only Editorial → Image → Video → Publisher → Cloudflare Pages canary。
- GitHub Actions 的 D1 與 R2 憑證已拆分；R2 使用僅限 `cc18-media` 讀寫的 S3 JSON 憑證，完成反向雜湊與公開 Range 驗證。
- Phase 4 的 250 部本機合成負載通過：500 個雙 Queue 工作、零重複、10 個 worker、12 次合成 retry、1 次過期 lease 回收、五個 50 部發布波次，約 10 秒完成。

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
- 2026-08-28 完整 `npm run validate` 通過：Astro 134 個檔案零錯誤／警告／提示，73 頁建置成功。
- 250 部合成負載不使用網路、外部 AI 或發布環境，暫存 Queue 在結束後刪除。

## 仍未啟用

- 大量抓取與每日自動發布。
- AItokenKing Writer、降敏 Payload、格式相容層、雙價格 ledger 與單件正式作品 canary 已完成；圖片 API 尚待接入。
- D1 已建立並同步 Queue；尚未啟用無人值守 Worker 排程。
- 音訊轉錄。
- 連續 7 天 draft-only 無人值守驗收；期間必須涵蓋至少一次真實來源更新。
- 正式網域與媒體網域。
