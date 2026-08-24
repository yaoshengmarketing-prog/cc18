# 未決事項

以下事項不阻止架構討論，但在套件由 draft 轉正式前需要決定或盤點：

| 項目 | 目前預設 | 決定方式 |
|---|---|---|
| GitHub repo visibility | Private | 盤點 organization 與 Actions 額度後確認 |
| 正式網站網域 | 未定 | 確認品牌與 Cloudflare zone |
| 媒體網域 | `media.{site-domain}` | 與正式網域一起決定 |
| Cloudflare account／zone | 未知 | 唯讀盤點 |
| D1 database names | `cc18-staging`／`cc18-production` | 建置時確認 |
| R2 bucket | `cc18-media` 或分環境 bucket | 依帳號管理偏好決定 |
| 文字模型 | 高品質完整模型＋較快 QA 模型 | 一部＋十部評測 |
| 圖片模型／品質 | Medium／High 候選 | 視覺評測與拒絕率測試 |
| Remotion 授權 | 未知 | 確認法律主體與團隊人數 |
| Scout 頻率 | 每 6 小時 | 來源條款與負載檢查 |
| 新片資格 | watermark 後新發現＋日期政策 | 實際更新批次抽樣 |
| 成人內容政策文本 | 草案待撰 | 法律／平台政策確認 |

任何未決事項若改變核心架構，必須新增 ADR，不能只修改 README 一句話。

