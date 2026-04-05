# 影片文字生成語音 (Video to Speech)

這是一個基於 Google Gemini AI 的應用程式，可以從影片中提取文字內容，並將其轉換為自然流暢的語音。同時支援直接貼上文字進行語音生成。

## 功能特點

*   **影片轉語音**：上傳影片，AI 自動提取文字並生成語音。
*   **文字轉語音**：直接輸入或貼上文字，快速生成語音檔。
*   **多語言支援**：支援普通話、粵語、英語、日語、韓語及台語。
*   **高度自定義**：
    *   多種聲音類型（男聲、女聲、小孩）。
    *   語音風格設定（溫柔、活潑、專業）。
    *   可調整語速及語調。
*   **重新生成**：一鍵套用新設定並重新生成音訊。

## 技術架構

*   **前端**：React + Vite + Tailwind CSS
*   **動畫**：Framer Motion
*   **AI 模型**：
    *   `gemini-3-flash-preview` (用於影片文字提取)
    *   `gemini-2.5-flash-preview-tts` (用於語音生成)

## 本地開發指南

### 1. 取得 API Key
前往 [Google AI Studio](https://aistudio.google.com/) 取得你的 Gemini API Key。

### 2. 設定環境變數
在專案根目錄建立 `.env` 檔案，並加入以下內容：
```env
VITE_GEMINI_API_KEY=你的_API_KEY
```

### 3. 安裝依賴並啟動
```bash
npm install
npm run dev
```

## 注意事項
*   影片檔案大小建議限制在 15MB 以內以確保穩定性。
*   請確保你的 API Key 具有足夠的額度。

## 授權
本專案採用 Apache-2.0 授權。
