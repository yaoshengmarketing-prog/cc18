# ADR-0007：影片與文章解耦

狀態：Accepted for draft

## 決策

文章、Hero 與基本 Tag 通過即可發布；Remotion MP4 失敗時標記 retry，完成後再以媒體版本增量更新。

## 原因

影片渲染最慢、依賴最多且容易失敗，不應阻塞最新作品文章 SLA。

## 後果

前端播放器需要無影片 fallback；Registry 與 media manifest 需支援部分完成狀態。


