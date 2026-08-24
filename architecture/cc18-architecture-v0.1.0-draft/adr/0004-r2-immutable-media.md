# ADR-0004：R2 不可變媒體

狀態：Accepted for draft

## 決策

所有生成圖片與 MP4 儲存在 R2 的版本化不可變路徑；Git 不保存大型媒體。

## 原因

控制 repository 大小、避免 Actions artifact 成為正式儲存，並支援 CDN、回滾與獨立媒體重試。

## 後果

需 media manifest、hash 驗證、custom domain、CORS／cache 設定與 orphan cleanup。

