# CC18 Windows Media Bridge

Media Bridge 是代理商權限下的本機授權橋接器。它不修改 cc18.tv、不匯出管理員 Cookie，也不把短效 HLS 簽章寫入 GitHub、Queue、Evidence 或日誌。

## 責任邊界

- 公開 Scout、文章、Tag、Remotion 與部署仍由 GitHub pipeline 負責。
- Media Bridge 僅在專用 Windows Chrome Profile 中重現正常授權流程：後臺登入 → 點「前台」→ 開啟作品 → 播放。
- 影片來源只在本機短期處理；公開網站不託管或轉發來源長片。
- CAPTCHA、密碼、二步驗證與登入失效必須由帳號持有人處理；程式不得繞過。

## 一次性初始化

```powershell
npm install
npm run bridge:init
npm run bridge:login
```

`bridge:login` 會開啟獨立 Chrome Profile。使用者只在該視窗中登入 CC18，確認後臺可見後回到終端按 Enter。Profile 位於 `.cc18-bridge/chrome-profile`，已被 `.gitignore` 排除。

## 單部測試

```powershell
npm run bridge:enqueue -- HUNTC-568 "https://cc18.tv/player.php?uuid=2Id2ijkXE6V&cat=19"
npm run bridge:process-one
npm run bridge:analyze-one
```

正式 D1 Queue 的單件 Worker：

```powershell
npm run bridge:d1:process-one
```

此指令會先確認本機模型與 runtime 配額，再以唯一 worker ID 原子領取一筆 `media_analysis`。分析期間每 5 分鐘續租；完成後回寫 `completed`，暫時錯誤 30 分鐘後 `retry`，登入或年齡確認問題則停在 `blocked`，不會自行嘗試密碼或繞過驗證。

輸出位於 `.cc18-bridge/runtime/jobs/{job-id}/`：

- `evidence.json`：媒體資訊、覆蓋率與樣本索引，不含簽章網址。
- `segments/`：短期 HLS 取樣片段。
- `samples/`：每個時間窗口的低量影格與音訊。

成功分析後立即刪除 `.ts`、JPG 與 WAV，只保留 Evidence／Analysis JSON。失敗或中斷樣本最多保留 2 小時；Bridge runtime 另有 2GB 硬上限，每個工作最多下載 1GB：

```powershell
npm run bridge:cleanup
```

## 工作狀態

```text
pending → capturing → samples_ready → analyzing → analysis_ready
                   ↘ retry                ↘ samples_ready（可重試）
                   ↘ auth_required
                   ↘ age_confirmation_required
```

- `retry`：暫時網路或媒體失敗，可由下一次排程重試。
- `auth_required`：停止工作，不嘗試登入、不讀取密碼，等待使用者重新執行 `bridge:login`。
- `age_confirmation_required`：尚未取得使用者明確授權時停止；授權寫入本機 Bridge 設定後，才允許自動點擊一般年齡確認。

## 本機空間政策

| 類型 | 保存位置 | 保留期限 |
| --- | --- | --- |
| HLS 片段、JPG、WAV | `.cc18-bridge/runtime/jobs/{job-id}` | 分析成功立即刪除；失敗最多 2 小時 |
| Evidence／Analysis JSON | 同一工作目錄 | 長期保留，通常每部只有數十 KB |
| Chrome 登入 Profile | `.cc18-bridge/chrome-profile` | 持續保留，避免反覆登入 |
| Ollama 視覺模型 | Ollama 共用模型目錄 | 固定約 6GB，不隨作品數增加 |
| 網站 Hero／9 秒 MP4 | Cloudflare R2 | 正式發布資產，不放本機與 Git |

`bridge:process-one` 與 `bridge:d1:process-one` 每次開始前都先清理逾期工作並檢查 2GB 上限。另應由 Windows 排程固定執行 `npm run bridge:cleanup`，即使當日沒有新作品也能清除中斷殘留。

安裝每小時執行的使用者層級清理排程：

```powershell
npm run bridge:cleanup:install
```

## 安全保證

- 來源頁只允許 `cc18.tv`／`www.cc18.tv`。
- 媒體主機使用 allowlist；未知網域立即停止。
- 僅允許 HTTPS。
- Queue 與 Evidence 權限以本機使用者為限。
- 日誌欄位會丟棄 Cookie、Token、Authorization、簽章與 manifest URL。
- HLS 查詢字串只存在處理程序記憶體。
- 每個工作有最大取樣流量，避免 selector 或 manifest 異常造成無限下載。

## 正式 D1 canary（2026-08-26）

- 領取 `APNS-419`，attempt 由 0 增為 1。
- 授權播放器長度 6,636.9 秒、1280×720。
- 24 個全片分布時間窗，下載 37,780,480 bytes。
- 本機模型完成 24 個非露骨觀察，平均信心 0.9062。
- 分析完成後只留下 `evidence.json` 與 `analysis.json`，片段、JPG、WAV 已清除。
- D1 狀態為 1 completed、17 queued，沒有重複領取或額外失敗。

## 尚未自動啟用

- Windows Task Scheduler。
- 音訊轉錄。
- 自動把 `analysis_ready` 轉成正式影評。

本機 `qwen2.5vl:7b` 視覺分析與 D1 `claim → analyze → finish` 已通過正式單件 canary；抽樣影格不送第三方服務。其餘項目需再經驗收後啟用。
