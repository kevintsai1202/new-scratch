/**
 * e2e/screenshot.mjs — 截圖工具：編輯模式與播放模式各拍一張，供視覺檢查
 * 執行方式：node e2e/screenshot.mjs（輸出到 e2e/shots/）
 */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'e2e', 'shots');
await mkdir(OUT, { recursive: true });
const PORT = 5185;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const file = join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForSelector('.blocklySvg');

// 注入示範積木讓畫面有內容
await page.evaluate(() => {
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
    type: 'event_whenflag', x: 30, y: 30,
    inputs: { DO: { block: { type: 'control_forever', inputs: { DO: { block: {
      type: 'motion_move',
      inputs: { STEPS: { shadow: { type: 'math_number', fields: { NUM: 5 } } } },
      next: { block: { type: 'motion_bounce' } },
    } } } } } },
  }] } }, Blockly.getMainWorkspace());
});
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'editor.png') });

// 播放模式截圖
const shareUrl = await page.evaluate(() => Storage.shareUrl(App.project));
await page.goto(shareUrl.replace(/^https?:\/\/[^/]+\//, `http://127.0.0.1:${PORT}/`));
await page.waitForSelector('#playOverlay.active');
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'play-mode.png') });

// 兒童教學截圖（全新使用者自動開始，停在第 1 關放積木）
const tctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
const tpage = await tctx.newPage();
await tpage.goto(`http://127.0.0.1:${PORT}/`);
await tpage.waitForSelector('#tutorialCard');
await tpage.click('.tut-next'); // 積木箱
await tpage.waitForTimeout(400);
await tpage.screenshot({ path: join(OUT, 'tutorial.png') });

// 手機播放模式截圖（iPhone 模擬＋虛擬按鍵）
const { devices } = await import('playwright');
const mctx = await browser.newContext({ ...devices['iPhone 13'] });
const mpage = await mctx.newPage();
await mpage.goto(shareUrl.replace(/^https?:\/\/[^/]+\//, `http://127.0.0.1:${PORT}/`));
await mpage.waitForSelector('#playOverlay.active');
await mpage.waitForTimeout(400);
await mpage.screenshot({ path: join(OUT, 'mobile-play.png') });

console.log('截圖已輸出：e2e/shots/{editor,play-mode,tutorial,mobile-play}.png');
await browser.close();
server.close();
