# ADR-0018：Source-first Editorial／Media 雙 Queue

狀態：Accepted  
日期：2026-08-27

## 背景

Creative-first 政策允許正文以內容創作為主，因此影片登入、HLS 捕捉與本機視覺分析不應成為所有文章的必要前置條件。來源仍包含足以建立故事種子的標題、簡介、人物關係、系列與 Tag，但原始成人內容不應直接送往第三方 Writer。

## 決策

- 每部 eligible 新片建立兩個獨立工作：`editorial` 與 `media_analysis`。
- `editorial` 是初始主要階段，可在 Media 尚未完成或失敗時先產生 Creative-first draft。
- 本機 Ollama 讀取完整 SourceRecord，輸出非露骨 `Creative Brief`：premise、relationship、role dynamic、central tension、setting、themes 與 creative seeds。
- 第三方 Writer 只接收 Creative Brief、作品身分與安全化 Title Signals，不接收原始標題、簡介、未知 Tag 或原始影片觀察文字。
- Source-only Writer 可創作情節與動機，但所有結果先保存為 draft 並通過同一 QA。
- `media_analysis` 可在之後完成，必要時觸發 video-enhanced rewrite，不覆蓋 SourceRecord。
- 單件 handoff 需要使用者明確執行；批次 cycle 另需 `CC18_ALLOW_EDITORIAL_TRANSMISSION=YES`。
- Windows 與 GitHub 正式排程保持關閉，直到單件 Creative-first canary 通過。

## 結果

每月 200–500 部的文章產能不再受本機影片分析吞吐量限制，同時維持外送資料最小化、工作可重試與 Media 後續加強能力。
