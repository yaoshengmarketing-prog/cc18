# ADR-0001：Astro 靜態網站

狀態：Accepted for draft

## 決策

網站使用 Astro 靜態生成；作品、演員、系列、Tag、最新與歸檔頁在 build time 產生。

## 原因

內容以 Markdown 與結構化資料為主，讀多寫少；靜態頁部署簡單、速度快、容易回滾，亦可避免 V1 維護 SSR 與應用資料庫。

## 後果

大量發布需分波 build；即時登入、收藏與個人化延後。搜尋先使用 build-time index。

