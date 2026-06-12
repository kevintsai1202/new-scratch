/**
 * e2e/debug-codegen.mjs — 除錯用：印出注入積木後的產生程式碼與執行狀態
 * 執行方式：node e2e/debug-codegen.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5184;
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
const page = await browser.newPage();
page.on('console', m => console.log('[頁面]', m.type(), m.text()));
page.on('pageerror', e => console.log('[頁面錯誤]', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForSelector('.blocklySvg');

const state = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'event_whenflag', x: 20, y: 20,
    inputs: { DO: { block: {
      type: 'motion_move',
      inputs: { STEPS: { shadow: { type: 'math_number', fields: { NUM: 50 } } } },
    } } },
  }] },
};

const info = await page.evaluate((s) => {
  Blockly.serialization.workspaces.load(s, Blockly.getMainWorkspace());
  const mainCode = javascript.javascriptGenerator.workspaceToCode(Blockly.getMainWorkspace());
  // 模擬 run() 的 headless 流程
  const saved = Blockly.serialization.workspaces.save(Blockly.getMainWorkspace());
  const headless = new Blockly.Workspace();
  let headlessCode = '', headlessErr = '';
  try {
    Blockly.serialization.workspaces.load(saved, headless);
    headlessCode = javascript.javascriptGenerator.workspaceToCode(headless);
  } catch (e) { headlessErr = String(e?.stack || e); }
  headless.dispose();
  return { mainCode, headlessCode, headlessErr, savedJson: JSON.stringify(saved).slice(0, 400) };
}, state);
console.log('=== 主工作區產生碼 ===\n' + info.mainCode);
console.log('=== headless 產生碼 ===\n' + info.headlessCode);
if (info.headlessErr) console.log('=== headless 錯誤 ===\n' + info.headlessErr);
console.log('=== 序列化（前 400 字）===\n' + info.savedJson);

await page.click('#btnRun');
await page.waitForTimeout(500);
console.log('執行後狀態：', await page.evaluate(() => ({
  running: !!App.runtime,
  x: App.runtime?.sprites[0]?.x,
  flagHandlers: App.runtime?.flagHandlers.length,
})));

await browser.close();
server.close();
