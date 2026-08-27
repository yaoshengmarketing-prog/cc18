# Workflow：Publish

觸發：publish-ready 數量達波次門檻或等待超過時間門檻。

1. 鎖定單一 production publisher。
2. 取得最多 25–50 部 publish-ready 作品。
3. 驗證媒體 manifest 與 R2 objects。
4. 渲染 Markdown、Hub、Registry export 與 run summary。
5. 建立 bot branch／commit。
6. CI：Schema、Astro build、連結、搜尋索引、sitemap。
7. 通過後合併 main；Cloudflare Pages Git integration 建置並部署該 commit。
8. 等待 Pages deployment status，完成 production health check。
9. 將 publication batch 與 movies 標為 published；失敗則標記 deploy_retry。

若 deploy 失敗，保留 commit 並只重試部署。文章不得被重複生成。
