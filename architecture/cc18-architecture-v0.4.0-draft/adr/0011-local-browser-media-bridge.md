# ADR-0011：代理商權限使用本機 Browser Media Bridge

- 狀態：Accepted for V1 pilot
- 日期：2026-08-25

## 背景

營運者只有 cc18.tv 代理商後臺與經後臺進入前臺後的完整播放權限，無權要求來源站修改程式、建立 API 或發放服務帳號。實測顯示播放器先以 CC18 Session Cookie 呼叫站內 PHP，再取得帶短效查詢簽章的外部 HLS manifest；媒體片段依賴正常 Origin／Referer。

## 決策

- 使用獨立 Chrome Profile 保存正常登入 Session。
- 每個工作從後臺點擊「前台」，再開啟指定作品並點擊播放。
- 只在記憶體取得短效 manifest URL。
- 本機 FFmpeg 依全片時間軸分布式取樣，不完整鏡像來源影片。
- GitHub 與 Cloudflare 不接收 Cookie、短效 URL 或原始長片。
- 登入失效轉為 `auth_required`，由帳號持有人重新登入；不得繞過 CAPTCHA 或其他安全驗證。

## 後果

- 日常工作可自動化，但無官方 API 時不能保證永遠零人工登入。
- Bridge 必須在持續開機的 Windows 主機上執行；V1 使用本機，穩定後才評估專用 Windows VPS。
- Windows Task Scheduler 與遠端 Queue 僅在一部作品端到端驗收後啟用。
- 來源頁或播放器 selector 改變時，工作會安全失敗，不得回退成抓取秘密或繞過權限。
