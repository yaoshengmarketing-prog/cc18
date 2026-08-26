# 媒體管線

## 0. 來源影片分析

來源完整影片與本站公開短影音是兩條不同管線。來源影片只由 Windows Media Bridge 在本機使用：

1. 專用 Chrome Profile 開啟代理商後臺。
2. 點擊正常「前台」連結建立播放授權。
3. 開啟作品、點擊播放並攔截成功的短效 HLS manifest。
4. 依全片時間軸選擇約 24 個窗口，每個窗口預設 2 個 HLS segment。
5. FFmpeg 只抽取少量影格與單聲道音訊，建立本機 Evidence。
6. 本機 `qwen2.5vl:7b` 依嚴格 JSON Schema 產出非露骨敘事觀察；僅允許 loopback endpoint。
7. manifest URL 不落盤；分析成功立即清除原始 segment／影格／音訊，失敗最多保留 2 小時。

本機空間採雙重上限：每工作最多下載 1GB，Bridge runtime 最多 2GB。Evidence／Analysis JSON 長期保留；正式 Hero 與 9 秒 MP4 上傳 R2，不保存在本機或 Git。

若 Evidence 未達發布門檻，系統不得把 Metadata-only 文章稱為影評。來源影片分析失敗不影響已發布文章的短影音 retry，但會阻擋新的正式影評。

## 1. 每部作品產出

- 1 張橫式 Hero。
- 2 張直式非露骨情境圖。
- 1 張 poster（可由直式圖與排版合成）。
- 1 支約 8–10 秒、1080×1920 MP4。
- 1 份 media manifest。

圖片數可依品質政策調整，但文章不應因第三張圖片失敗而阻塞。

## 2. 視覺原則

- 原創、非露骨、成年情境。
- 不生成真實演員可辨識的仿冒肖像。
- 不使用未確認授權的原影片畫面。
- 允許場景、剪影、背影、物件、插畫、抽象敘事與海報設計。
- Prompt 由 content brief 的核心切角產生，不直接複製露骨來源描述。

## 3. Remotion 範本

```text
0–2 秒   Logo + 番號 + 演員
2–5 秒   情境圖 1 + 故事 Hook
5–8 秒   情境圖 2 + 影評核心句 + Tags
8–10 秒  Logo + 完整影評 CTA + 網站名稱
```

動畫包括 slow zoom、pan、fade、字幕、Logo 與 CTA。影片在無聲狀態下仍須可理解。

## 4. 編碼規格

- Canvas：1080×1920。
- Frame rate：30 fps。
- Codec：H.264 MP4。
- 建議 fast start／web optimized。
- 短片以合理 bitrate 控制在約 5–10 MB。
- Poster：WebP，提供固定尺寸與 alt text。
- HTML5 `<video>` 使用 `controls`、`playsinline`、`preload="metadata"` 與 poster。

## 5. R2 路徑

```text
production/movies/{MOVIE_ID}/{MEDIA_VERSION}/
├─ hero-1536x1024.webp
├─ scene-01-1024x1536.webp
├─ scene-02-1024x1536.webp
├─ poster-1080x1920.webp
├─ vertical-1080x1920.mp4
└─ media-manifest.json
```

物件不可就地覆寫；更新使用 `v2`。正式站使用自有 `media` 子網域，不以 `r2.dev` 作為生產 URL。

## 6. 失敗策略

- 圖片模型拒絕：轉用安全的抽象／排版模板。
- Hero 成功、其他圖失敗：文章可發布，其他圖 retry。
- 影片失敗：文章可發布，`video_status=retry`。
- 重試使用相同輸入版本；超過上限不重新消耗文章成本。
- R2 上傳後未被任何發布版本引用的 object，經保留期後由 orphan cleanup 清除。


