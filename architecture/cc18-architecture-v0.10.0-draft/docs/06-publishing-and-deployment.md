# 發布與部署

## 1. 部署責任

GitHub Actions 是內容生產與 QA 控制中心；Cloudflare Pages Git integration 是網站部署控制面。Actions 不再同時執行 Wrangler production deploy，避免同一 commit 被建置兩次。

```text
main 更新
→ CI
→ Astro build
→ 搜尋索引／sitemap
→ Pages 偵測 main commit
→ Pages Astro build／deploy
→ deployment webhook／狀態檢查
→ 健康檢查
→ D1 publication batch = published
```

## 2. Publication batch

大量新片以每 25–50 篇或每 30–60 分鐘形成一個發布波次。每個 batch 保存：

- batch ID
- movie IDs
- media manifests
- registry snapshot hash
- Git commit SHA
- deployment ID／URL
- started／completed timestamps
- status 與錯誤

不能每完成一篇就 build/deploy。

## 3. 發布交易

1. 文章 JSON、Markdown、Hero 與 media manifest 通過 Schema。
2. 媒體上傳不可變 R2 路徑並驗證 hash。
3. 建立 `publication_batch=prepared`。
4. 產生 Markdown、來源快照與 Registry export。
5. 建立單一 Git commit。
6. CI build、連結檢查、sitemap 與搜尋索引驗證。
7. Pages Git integration 建置並部署該 commit。
8. 以已知頁面與資產做健康檢查。
9. D1 標記 published；若部署失敗則保留 prepared／deploy_retry。

任何步驟失敗均從最後安全邊界重試，不重新執行已成功且輸入未變的 AI 工作。

## 4. Git 策略

- 主分支：`main`。
- 人工架構／程式變更使用 PR。
- 生產內容批次可使用 bot branch，CI 通過後自動合併。
- 每批一個可追蹤 commit，訊息包含 batch ID 與作品數。
- 不 force push，不覆寫歷史。
- `main` 保護規則要求 CI、Schema 與 build 通過。

## 5. 網站頁面

- `/reviews/{movie-id}/`
- `/latest/`
- `/performers/{slug}/`
- `/series/{slug}/`
- `/tags/{slug}/`
- `/archive/{yyyy}/{mm}/`

首頁只展示精選與有限最新卡片；大量作品由 latest、分頁、搜尋、Hub 與 sitemap 承接。

## 6. 原始作品導流 CTA

每篇作品頁必須有至少一個明顯 CTA：

```text
前往 cc18.tv 查看原始作品頁
```

規則：

- URL 只能來自已驗證的 SourceRecord `source_url`，AI 不得生成或修改。
- CTA 清楚標示外部網站與新視窗行為。
- 本站定位是推廣 cc18.tv，因此 CTA 使用 `rel="sponsored noopener"` 並以可見文字標示 CC18；若法律／商務關係確認不是推廣關係，再調整 rel 與揭露文字。
- 可在短評後與文章結尾各放一個 CTA，但不得用誤導式下載、播放或假按鈕文案。
- 原始來源頁不存在時，CTA 暫停顯示並將作品標為 `source_link_retry`，不能導向首頁冒充作品頁。

若需要導流統計，使用站內 `/go/{movie-id}/`：

1. Worker 只接受正規化 movie ID。
2. 目的 URL 由 D1／已發布 Registry 查表取得。
3. 僅允許 `https://cc18.tv/` allowlist。
4. 記錄匿名 click event 後回傳 302。
5. 不接受 query parameter 傳入任意目的 URL，避免 open redirect。

公開頁仍應在可見文字中標示 cc18.tv；導流統計不得收集不必要的個人資料。

## 7. SEO 與結構化資料

- 每頁 canonical URL。
- 作品、演員、系列與 Tag 的清楚內部連結。
- sitemap 可分割，預留大量頁面成長。
- 薄弱 Tag Hub 使用 `noindex`。
- 原創文字不得以來源簡介大量複製代替。
- 媒體可使用適當 `VideoObject`／圖片 metadata，但欄位必須與實際資產一致。

