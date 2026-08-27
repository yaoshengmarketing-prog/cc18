# 內容與多角色 Canary（3–7 天）

本輪目的不是增加發布量，而是驗證 Editorial 草稿、QA 與故障隔離是否能在無人逐篇介入的情況下穩定運作。正式每日大量 schedule 維持關閉；`Draft-only acceptance (manual)` 先以手動觸發驗證，cron 必須獨立核准後才可加入。

## 執行規模

- 最短觀察 3 個連續健康日，目標 7 日。
- 每日最多 3 部，單部依序走完 Scout → Tag Curator → Editor → Critic/QA → Media Producer → Publisher。
- 同一時間最多處理 1 部，先排除並行寫 Registry／Git 的干擾。
- 每天選不同人物、系列與題材組合，避免只測到同一類模板。
- 未知來源 Tag 必須被保存並進候選佇列；不得因尚未建立 canonical 映射而漏掉或阻塞作品。

## 每日步驟

1. 確認 Git worktree 乾淨、D1 無 stale lease、production schedule 關閉。
2. 從 validated 作品中最多選 3 部，記錄 work ID 與選擇理由。
3. 執行完整控制器；單部失敗後繼續下一部。
4. 抽查每篇來源身分、原始 Tag 保存、canonical 映射、標題與題材摘要。
5. 比對近期文章，確認核心論點、開場、段落順序與結論不是只換番號。
6. 驗證 R2 物件回讀 hash、正式 URL、Git commit 與 Cloudflare exact release。
7. 清理本機 runtime，輸出每日 JSON 報告；不在本階段打開 cron。

## 內容觀察項目

每篇至少要能回答：

- 這部的主要人物／關係／場景／行為／體位／呈現特徵是什麼？
- 標題是否使用最重要的來源搜尋詞，而非讓 HD、FHD 等一般規格搶走主題？
- 原始 Tag、canonical Tag、editorial Tag 是否分層，且原始 Tag 沒有被 AI 改寫？
- 影評是否解釋題材元素如何組合，而不只是堆疊情色關鍵字？
- 和近期同演員、同系列或同 Tag 文章相比，是否有不同的核心判斷？
- 讀者能否從適合／不適合、優點／取捨得到明確選片答案？

## 每日報告與指標

每日報告至少包含選入、完成與失敗的 work IDs，各階段嘗試數、QA 分數、重複檢查、R2 hash 結果、Git commit、Cloudflare release、stale lease、本機殘留與人工升級事件。

可以升級到下一階段的最低門檻：

| 指標 | 門檻 |
|---|---:|
| 連續健康日 | 最少 3 日，目標 7 日 |
| 完成作品數 | 至少 9 部 |
| 端到端成功率 | ≥ 95% |
| QA 通過率 | ≥ 90% |
| 重複發布 | 0 |
| 來源身分錯誤 | 0 |
| 未驗證 R2 資產 | 0 |
| 驗證到錯誤 Cloudflare release | 0 |
| 每日收尾 stale lease | 0 |
| 每日收尾本機 runtime 殘留 | 0 |

QA 重寫後成功可計入端到端成功，但必須保留重寫次數。影片暫時 retry 而文章按政策發布時，文章發布可計成功，媒體完整率另計，不能把 retry 隱藏成完成。

## 停止條件

出現下列任一情況，停止新增 canary 作品並先修復：

- 任何來源身分錯誤、密鑰暴露、無關檔案被提交或錯誤 release 被標成完成。
- rolling failure rate 超過 20%。
- 每日收尾仍有 stale lease。
- Tag Curator 改動了來源 Tag，或 AI 未經規則直接晉升 canonical Tag。
- 同一篇內容被重複發布，或不同作品產生高度近似的核心段落。

單部圖片或影片 retry 不直接停止整輪；它必須隔離在該 work ID，其他作品繼續，並在報告中列出恢復結果。

## 3 日與 7 日決策

- 第 3 日：只判斷是否允許延長 canary、是否能提高到每日 3 部；不啟用正式 schedule。
- 第 7 日：若所有 promotion gate 達標，才提出「有限量 GitHub Actions 自動批次」變更建議。
- 即使 7 日達標，正式大量發現與發布仍須獨立啟用；本文件不授權修改 cron、Secrets、供應商或發布目的地。

## Draft-only editorial canary

在單一作品獲得明確傳送授權後，以
`CC18_ALLOW_EDITORIAL_TRANSMISSION=YES npm run editorial:draft-canary -- <MOVIE-ID>`
執行。此路徑只讀取 D1 已驗證來源，在本機建立影評草稿與 QA 產物；不 claim
或完成 D1 工作、不建立圖片工作、不發布、不 commit、不 push，也不啟用排程。

GitHub 批次使用 `Draft-only acceptance (manual)`，每次自動從 D1 選最多三部尚未進 Registry 的 eligible／validated Editorial 工作。每部獨立產生草稿與 QA；失敗不阻止後續作品。結果以 14 天保存期限的 Artifact 輸出，包含草稿、Brief、QA、Search Content、Usage 與每日報告。工作流只有 `contents: read`，不執行圖片、影片、Git push 或 Cloudflare 部署，目前沒有 `schedule`／`cron`。
