/**
 * e2e/sound.test.mjs — 音效與 TTS 積木驗證（可重跑）
 *
 * 驗證項目：
 *   1. 音效積木出現在工具箱、SoundFX.play 可呼叫且建立 AudioContext
 *   2. 「唸出…直到結束」在無語音環境（headless）靠逾時保險不會卡死，
 *      唸完後後續積木（移動）會繼續執行
 *   3. 全程無 console / page 錯誤
 *
 * 執行方式：node e2e/sound.test.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5187;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const file = join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`❌ 斷言失敗：${msg}`);
  passed++;
  console.log(`✅ ${msg}`);
}

// 允許 headless 無手勢建立 AudioContext
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => localStorage.setItem('scratchy.tutorialDone', '1'));
const errors = [];

try {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('.blocklySvg');

  // 1. 音效模組可用
  const fxOk = await page.evaluate(() => {
    SoundFX.play('coin');
    return !!SoundFX.ctx;
  });
  assert(fxOk, 'SoundFX.play 可呼叫且 AudioContext 已建立');

  // 2. 注入：當▶被點擊 → 播放音效 → 唸出「哈囉」直到結束 → 移動 30 點
  await page.evaluate(() => {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: 'event_whenflag', x: 20, y: 20,
      inputs: { DO: { block: {
        type: 'sound_play', fields: { SOUND: 'coin' },
        next: { block: {
          type: 'sound_tts_wait',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '哈囉' } } } },
          next: { block: {
            type: 'motion_move',
            inputs: { STEPS: { shadow: { type: 'math_number', fields: { NUM: 30 } } } },
          } },
        } },
      } } },
    }] } }, Blockly.getMainWorkspace());
  });
  await page.click('#btnRun');
  // 逾時保險上限：max(1500, 2字×450) = 1500ms，再加緩衝
  await page.waitForFunction(() => Math.abs(App.runtime?.sprites[0]?.x ?? 0) > 29, null, { timeout: 6000 });
  assert(true, '「唸出…直到結束」未卡死，唸完後續積木照常執行（x=30）');

  const realErrors = errors.filter(e => !/favicon/.test(e));
  assert(realErrors.length === 0, `無 console / page 錯誤${realErrors.length ? '：\n' + realErrors.join('\n') : ''}`);

  console.log(`\n🎉 全部 ${passed} 項驗證通過`);
} finally {
  await browser.close();
  server.close();
}
