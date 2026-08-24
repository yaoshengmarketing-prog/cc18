# 容量、成本與 SLA

## 1. 容量情境

| 情境 | 每週新增 | 每月約量 |
|---|---:|---:|
| 一般 | 50–60 | 200–260 |
| 高峰 | 125 | 約 500 |
| 壓力 | 250 | 約 1,000–1,100 |

系統不得因當日數量高於 5 而丟棄作品。容量由 Queue、並行度、API rate limit 與發布波次調節。

## 2. 初始並行度

| 階段 | 建議並行度 |
|---|---:|
| Source detail fetch | 1–3，附節流 |
| Metadata validation | 10–20 |
| Text／Tag AI | 10–20 |
| Image generation | 5–10 |
| Remotion render | 3–5 |
| Production deploy | 1 |

並行度以設定控制，根據實測成功率、rate limit 與 runner 時間調整。

## 3. 250 部批次 SLA 目標

| 階段 | 目標 |
|---|---:|
| 全部登記 | 60 分鐘內 |
| Metadata 驗證 | 2 小時內 |
| 文章與 Tag | 6–12 小時 |
| Hero | 12 小時 |
| 完整圖片 | 18 小時 |
| MP4 | 24 小時 |
| 一般 retry | 24–48 小時 |

SLA 是初始目標，第一輪壓力測試後校正。

## 4. 媒體容量

每部約 10 MB 媒體時：

- 250 部／月：約 2.5 GB 新增。
- 500 部／月：約 5 GB 新增。
- 1,000 部／月：約 10 GB 新增。
- 1,000 部／月持續一年：約 120 GB。

R2 成本在此規模通常低於 AI 與 Remotion 授權；不因節省少量儲存費而將 MP4 放入 Git。

## 5. 品質導向成本策略

- 完整影評可使用較高品質文字模型；規則正規化使用程式。
- 圖片以 Medium／High 品質實測選擇，不預設最低品質。
- GitHub Actions 可付少量超額分鐘，優先保持流程簡單。
- Cloudflare Workers Paid 每月基本費若能提升操作空間，可直接採用。
- Remotion 是否需付費依法律主體與團隊人數確認。
- 建議保留每月 US$100–150 起的運作預算；若接近 1,000 部或需 Remotion 公司授權，預算提高至約 US$200–400。

## 6. 成本度量

每部保存：

- text input／cached／output tokens
- image requests、quality、success／reject／retry
- render seconds／Actions minutes
- output bytes
- estimated USD

成本報告用於發現 bug 與比較模型，不以最低費用作為唯一優化目標。

