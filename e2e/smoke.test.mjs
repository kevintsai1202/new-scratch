/**
 * e2e/smoke.test.mjs — 積木遊戲工坊煙霧測試（可重跑）
 *
 * 驗證項目：
 *   1. 頁面載入無 console / page error，Blockly 與舞台正常渲染
 *   2. 注入「當▶被點擊 → 移動 50 點」積木，執行後角色 x 座標確實改變
 *   3. 儲存到 localStorage、重新整理後可從自動保存還原積木
 *   4. 「開啟」對話框能載回已儲存作品
 *   5. 分享連結（#p= 壓縮編碼）開啟後進入播放模式，按 ▶ 可遊玩
 *
 * 執行方式：node e2e/smoke.test.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5183;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** 極簡靜態檔案伺服器（零依賴，測試結束即關閉） */
const server = http.createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0].split('#')[0];
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}/`;

/** 簡易斷言：失敗即丟錯讓整個腳本以非零碼結束 */
let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`❌ 斷言失敗：${msg}`);
  passed++;
  console.log(`✅ ${msg}`);
}

/** 測試用積木程式：當 ▶ 被點擊 → 移動 50 點 */
const TEST_WORKSPACE = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'event_whenflag', x: 20, y: 20,
    inputs: { DO: { block: {
      type: 'motion_move',
      inputs: { STEPS: { shadow: { type: 'math_number', fields: { NUM: 50 } } } },
    } } },
  }] },
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
// 本測試聚焦核心流程：預先標記「教學已完成」，避免首次自動教學遮罩擋住操作
await ctx.addInitScript(() => localStorage.setItem('scratchy.tutorialDone', '1'));
const errors = []; // 收集所有頁面的 console error 與未捕捉例外
const watch = (page) => {
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
};

try {
  /* ── 1. 載入編輯器 ── */
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE);
  await page.waitForSelector('.blocklySvg', { timeout: 15000 });
  assert(await page.locator('#stage').isVisible(), '舞台 canvas 已渲染');
  assert(await page.locator('.sprite-card').count() >= 1, '預設角色出現在角色清單');

  /* ── 2. 注入積木並執行 ── */
  await page.evaluate((state) => {
    Blockly.serialization.workspaces.load(state, Blockly.getMainWorkspace());
  }, TEST_WORKSPACE);
  await page.click('#btnRun');
  await page.waitForTimeout(400); // 給綠旗 handler 一點執行時間
  const x = await page.evaluate(() => App.runtime?.sprites[0]?.x);
  assert(Math.abs(x - 50) < 0.01, `執行後角色移動到 x=50（實際 ${x}）`);
  await page.click('#btnStop');

  /* ── 3. 儲存 + 重新整理後自動保存還原 ── */
  await page.fill('#projectName', 'E2E測試作品');
  await page.dispatchEvent('#projectName', 'change');
  await page.click('#btnSave');
  const saved = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('scratchy.projects') || '{}')));
  assert(saved.includes('E2E測試作品'), '作品已寫入 localStorage');

  await page.waitForTimeout(700); // 等 autosave debounce 落盤
  await page.reload();
  await page.waitForSelector('.blocklySvg');
  const blockCount = await page.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length);
  assert(blockCount >= 2, `重新整理後積木自動還原（${blockCount} 顆）`);

  /* ── 4. 開啟對話框載回作品 ── */
  await page.click('#btnOpen');
  await page.click('.proj-row .open');
  assert((await page.inputValue('#projectName')) === 'E2E測試作品', '可從「開啟」載回已儲存作品');

  /* ── 5. 分享連結 → 播放模式 ── */
  const shareUrl = await page.evaluate(() => Storage.shareUrl(App.project));
  assert(shareUrl.includes('#p='), '分享連結含壓縮作品資料');
  const page2 = await ctx.newPage();
  watch(page2);
  await page2.goto(shareUrl.replace(/^https?:\/\/[^/]+\//, BASE)); // 改指到測試伺服器
  await page2.waitForSelector('#playOverlay.active', { timeout: 15000 });
  assert((await page2.textContent('#playTitle')).includes('E2E測試作品'), '播放模式顯示作品名稱');
  await page2.click('#btnPlayBig');
  await page2.waitForTimeout(400);
  const x2 = await page2.evaluate(() => App.runtime?.sprites[0]?.x);
  assert(Math.abs(x2 - 50) < 0.01, `分享連結開啟後可直接遊玩（x=${x2}）`);

  /* ── 6. 全程無錯誤 ── */
  const realErrors = errors.filter(e => !/favicon/.test(e));
  assert(realErrors.length === 0, `無 console / page 錯誤${realErrors.length ? '：\n' + realErrors.join('\n') : ''}`);

  console.log(`\n🎉 全部 ${passed} 項驗證通過`);
} finally {
  await browser.close();
  server.close();
}
