# 營運、安全與合規

## 1. 失敗隔離

| 失敗 | 自動處理 |
|---|---|
| Scout 暫時失敗 | 保留 cursor，指數退避重試 |
| Metadata 缺欄位 | 隔離該作品，不阻塞批次 |
| 文字 AI 失敗 | 依輸入 hash 重試，超限後留 Queue |
| 圖片失敗 | 安全視覺 fallback 或 retry |
| 影片失敗 | 文章發布，影片獨立 retry |
| Deploy 失敗 | 保留 commit，僅重試 build/deploy |
| Taxonomy 更新失敗 | 沿用上一個有效版本 |
| D1 job 中斷 | lease 過期後重新領取 |

## 2. 可觀測性

每次 run 記錄：

- discovered／eligible／duplicate／rejected 數量
- 各階段成功、失敗與 backlog
- 平均與 P95 處理時間
- AI tokens、圖片次數與估算成本
- Actions render minutes
- R2 bytes／objects
- publish batch／commit／deployment ID
- extractor schema drift 指標

提供 GitHub Actions Summary 與 D1 run record。通知不是流程必經條件；系統可自動重試，但連續失敗仍應留下明確告警。

## 3. 成本與 runaway 保護

- 每部與每批成本 ledger。
- 單一 stage 最大重試次數。
- 每日／每月 soft budget 與 hard circuit breaker。
- 突然出現異常數量時先做免費／低成本驗證，再啟動 AI。
- 模型拒絕不以無限 prompt 改寫重試。

成本上限用來防止 bug，不用來犧牲文章與媒體品質。

## 4. Secrets 與權限

- GitHub Environments 分 staging／production。
- Cloudflare API token 僅給指定 account、Worker、D1、R2 所需權限。
- R2 使用受限 S3 token；前台只有公開讀取 URL，不暴露寫入憑證。
- OpenAI key 僅存在 production secret store。
- 日誌禁止輸出 token、cookie、完整 request headers 或敏感帳號資料。
- bot token 不授予不必要的 organization 管理權。

## 5. 供應鏈安全

- lockfile 固定 dependency 版本。
- 啟用依賴更新與漏洞掃描。
- Workflow action 使用固定 major 或 commit SHA，正式期優先 pin SHA。
- Pull request 不可取得 production secrets。
- 生成內容與來源頁均視為不可信輸入，不能改寫系統指令。

## 6. 成人內容與權利政策

- 年齡提示與所在地法律聲明。
- 只處理合法成年人作品；疑似未成年暗示或高風險描述自動隔離。
- 不宣稱觀看未實際觀看的完整影片。
- 不建立真實人物換臉或仿冒肖像。
- 保留來源連結與擷取證據，但公開文字使用原創改寫。
- 建立更正、移除與權利人聯絡流程。
- 原始作品 CTA 保留來源透明度；導流 redirect 僅允許 cc18.tv 且不得成為 open redirect。
- 正式營運前檢查來源條款、robots、Cloudflare、GitHub 與 AI 供應商政策。

## 7. 備份與恢復

- GitHub 保存所有發布內容與 Taxonomy 歷史。
- 每次發布匯出 Registry snapshot。
- D1 定期 export／backup。
- R2 使用 immutable version；media manifest 保存 hash。
- 災難恢復順序：Git clone → 建立 D1 → 匯入最新 Registry snapshot → 比對 Markdown／R2 manifests → 重建網站。

