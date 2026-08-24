# Changelog

## 0.3.0-draft — 2026-08-24

### Implemented — 2026-08-25

- 建立 private GitHub repository `yaoshengmarketing-prog/cc18` 與 `main`。
- 建立 Astro 靜態網站、橫式影片縮圖首頁、作品頁、演員／系列／Tag Hub 與 HTML5 player fallback。
- 建立內容 Schema、JSON Registry、Taxonomy policy 與安全示範文章。
- 建立 cc18.tv listing／work parser、網域白名單、fixture tests 與單筆 live smoke test。
- 確認來源作品頁可取得番號、日期、片商、系列、簡介、演員、Tag 與 `800×538` 主預覽圖。
- 建立 9 秒、1080×1920、四場景參數化 Remotion 模板。
- 部署產品定案為 Cloudflare Pages Git integration；新增 ADR-0010。
- GitHub Actions CI 已啟用；內容 pipeline 僅能手動 dry-run，每日排程仍關閉。

### Added

- 確定 GitHub repository 名稱為 `yaoshengmarketing-prog/cc18`。
- 確定 Cloudflare 網站／Worker 專案名稱為 `cc18`。
- 衍生資源預設命名為 `cc18-db`、`cc18-media`；staging 使用 `-staging`。
- 加入本地、GitHub 與 Cloudflare 首次唯讀盤點報告。
- 新增 ADR-0008 命名決策。
- 將每篇文章的 cc18.tv 原始作品連結定義為必要導流 CTA，並新增 ADR-0009。

### Inventory findings

- 本地 workspace 尚非 Git repository，尚未有網站程式。
- GitHub CLI 已安裝，但 `yaoshengmarketing-prog` 的既有 token 失效。
- GitHub 公開頁面對 `yaoshengmarketing-prog/cc18` 回傳 404；private repo 狀態待重新驗證。
- 本機尚未安裝 Wrangler，亦未找到 Wrangler 登入設定。
- Cloudflare OAuth 登入已完成；`cc18` Worker／Pages 均不存在，D1 與 Queues 為空，R2 尚未啟用。
- 帳號已有多個採 Git Provider 的 Pages 專案，因此正式部署面需在 Pages Git integration 與 Workers Static Assets 間做最後選擇。

## 0.1.0-draft — 2026-08-24

### Added

- 建立 CC18 首份完整架構套件。
- 確立突發批次、全量收件與分波發布模型。
- 將營運 Registry／Queue 權威來源定為 Cloudflare D1。
- 定義 GitHub、D1、R2 與 Cloudflare Workers 的責任邊界。
- 定義來源 Tag、Canonical Tag、Editorial Tag 與候選 Tag 生命週期。
- 定義批次編輯規劃、文章前置 Tag 計畫與文章後置 QA。
- 定義媒體不可變路徑、Remotion 規格與文章先於影片發布策略。
- 加入 JSON Schema、範例資料、工作流規格與 ADR。

### Open

- 正式網站網域未決定。
- GitHub repository 公開／私人未決定，預設私人。
- Cloudflare 現有帳號與資源尚未盤點。
- 文字與圖片模型仍需以第一部測試作品做品質評測。
- Remotion 免費／公司授權資格尚未確認。
- cc18.tv 使用條款、robots 與穩定擷取頻率仍需正式檢查。

