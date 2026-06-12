# Scratch 風格網頁遊戲工坊 — 設計文件

日期：2026-06-13

## 目標

做一個類似 Scratch 的網頁應用：用拖拉積木設計小遊戲，可儲存、可重複遊玩、可用連結分享給其他人玩。

## 決策（已與使用者確認）

| 議題 | 決定 |
|---|---|
| 分享機制 | 作品 JSON → LZ-String 壓縮 → 網址 `#p=` hash，純前端零後端 |
| 積木編輯器 | Google Blockly（CDN 載入，zh-hant 語系） |
| 第一版積木範圍 | 事件、動作、外觀、控制、偵測、變數（核心遊戲組） |

## 架構

純前端靜態網站，無建置步驟。檔案結構：

```
index.html        — 三欄版面（積木區｜舞台＋角色清單）
js/blocks.js      — 自訂積木定義 + JavaScript 產生器
js/engine.js      — Runtime / Sprite / 渲染與遊戲迴圈
js/storage.js     — localStorage 多作品儲存 + URL 分享編解碼
js/app.js         — Blockly 初始化、角色管理、執行流程、UI
e2e/smoke.test.mjs — Playwright 可重跑驗證腳本
```

## 執行模型

- 每個角色一份 Blockly workspace（JSON 序列化存在角色資料內，切換角色時換載）。
- 按 ▶：為每個角色用 headless workspace 產生 JS 程式碼，包成 async 函式體執行；事件積木向 Runtime 註冊 async handler。
- 程式碼評估安全性：被評估的程式碼僅由固定的積木產生器組裝而成，所有使用者輸入的文字欄位
  一律經 `JSON.stringify` 轉義為字面值，不存在把原始輸入拼進程式碼的路徑（與 Scratch 同級的信任模型：
  執行的是作者設計的積木程式）。
- 迴圈類積木每圈插入 `await runtime.tick()`（requestAnimationFrame 節流＋停止訊號檢查）。
- 每次 ▶ 建立全新 Runtime 實例；舊實例設 stopped 旗標，殘留 thread 在下個 tick 拋出 StopSignal 終止。
- 座標採 Scratch 慣例：舞台 480×360、中心原點、y 向上、方向 90 = 朝右。

## 積木清單（第一版）

- 事件：當▶被點擊、當[鍵]被按下、當角色被點擊（C 形，含執行槽）
- 動作：移動 n 點、左/右轉、移到 x,y、面朝方向、x/y 改變、碰到邊緣就反彈
- 外觀：說…、說…n 秒、顯示/隱藏、尺寸設為、造型換成（emoji）
- 控制：等待、重複 n 次、重複無限次、如果/否則（內建）、停止全部
- 偵測：碰到[角色]？、碰到邊緣？、[鍵]被按下？、x/y 座標
- 變數：Blockly 內建變數分類（產生器改寫為 runtime.vars，舞台左上顯示）
- 運算：內建數字、四則、隨機數、比較、邏輯

## 儲存與分享

- localStorage `scratchy.projects`（name → project JSON）＋ `scratchy.autosave` 防遺失。
- 分享：`#p=<LZString.compressToEncodedURIComponent(JSON)>`；開啟帶 hash 的網址進入「播放模式」（大 ▶、作品名、「✏️ 編輯這個作品」按鈕）。

## 錯誤處理

- 產生程式碼或執行期錯誤 → console + toast 提示，不讓整頁掛掉。
- 分享網址解碼失敗 → 提示並回到編輯模式。
- 變數未初始化視為 0。

## 測試

Playwright 腳本（`e2e/`）：載入頁面無 console error、Blockly 與舞台渲染、儲存後重載可還原、分享連結開啟進入播放模式。
