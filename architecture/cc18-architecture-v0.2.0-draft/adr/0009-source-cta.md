# ADR-0009：原始作品連結作為必要導流 CTA

狀態：Accepted for draft

## 決策

每篇正式影評必須提供指向對應 cc18.tv 作品頁的明顯導流 CTA。CTA URL 由 SourceRecord 的已驗證 `source_url` 提供，不由 AI 生成。

若需統計導流，使用 `/go/{movie-id}/` 安全 redirect：目的 URL 由資料庫查表、目的網域 allowlist 為 `cc18.tv`，不接受任意 URL 參數。

## 原因

來源連結同時承擔資料透明度與導流價值。將其定為頁面契約可避免文章漏放、連到錯誤作品或使用誤導式 CTA。

## 後果

- Publisher 必須驗證 CTA 與 movie ID 對應。
- 前端需要外部連結樣式與目的地揭露。
- 需要定期 link health check。
- 若未來加入聯盟參數，必須分離 `source_url` 與 `destination_url`，保留原始來源並揭露商業關係。

