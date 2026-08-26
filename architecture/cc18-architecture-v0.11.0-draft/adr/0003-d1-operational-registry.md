# ADR-0003：D1 作為營運 Registry

狀態：Accepted for draft

## 決策

Cloudflare D1 保存 Queue、lease、retry、成本與即時 Registry。Git 中的 `data/movie-registry.json` 是發布後匯出的版本化快照。

## 原因

單次 50–250 部會產生多個平行 job；直接共同修改單一 JSON 容易衝突、覆蓋狀態且難以原子領取工作。

## 後果

需提供 D1 migrations、export／restore 與權威邊界文件。若盤點後 Cloudflare 帳號限制不適合，須以新 ADR 選擇替代資料庫。


