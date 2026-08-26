# 未決事項

以下事項不阻止架構討論，但在套件由 draft 轉正式前需要決定或盤點：

| 項目 | 目前預設 | 決定方式 |
|---|---|---|
| GitHub repository 名稱 | `yaoshengmarketing-prog/cc18` | 已決定 |
| GitHub repo visibility | Private | 已決定並建立 |
| 正式網站網域 | 未定 | 確認品牌與 Cloudflare zone |
| 媒體網域 | `media.{site-domain}` | 與正式網域一起決定 |
| Cloudflare account／zone | 帳號已確認；正式 zone 待定 | 決定正式網域 |
| Cloudflare Worker／網站名稱 | `cc18` | 已決定 |
| Cloudflare 部署產品 | Pages Git integration | 已決定；見 ADR-0010 |
| D1 database names | `cc18-db`／`cc18-db-staging` | 帳號盤點後確認可用性 |
| R2 bucket | `cc18-media`／`cc18-media-staging` | R2 尚未啟用；啟用後確認名稱可用性 |
| 文字模型 | 高品質完整模型＋較快 QA 模型 | 一部＋十部評測 |
| 圖片模型／品質 | Medium／High 候選 | 視覺評測與拒絕率測試 |
| Remotion 授權 | 未知 | 確認法律主體與團隊人數 |
| Media Bridge 常駐主機 | V1 使用目前 Windows 電腦 | 單部與 7 天驗收後決定是否搬到專用 Windows VPS |
| Scout 頻率 | 每 6 小時 | 來源條款與負載檢查 |
| 新片資格 | watermark 後新發現＋日期政策 | 實際更新批次抽樣 |
| 成人內容政策文本 | 草案待撰 | 法律／平台政策確認 |

任何未決事項若改變核心架構，必須新增 ADR，不能只修改 README 一句話。

