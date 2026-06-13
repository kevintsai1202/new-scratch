/**
 * sound.js — 音效（WebAudio 即時合成）與 TTS 自然語音（Web Speech API）
 *
 * 音效：用振盪器/雜訊即時合成，零音檔、離線可用。
 * 語音：speechSynthesis；在 Edge 瀏覽器會優先挑「Microsoft … Natural」
 *       自然語音（曉臻等），其他瀏覽器則挑系統最佳中文語音。
 */
const SoundFX = (() => {
  'use strict';

  let ctx = null; // AudioContext（第一次播放時建立；需在使用者手勢後）

  /** 取得（必要時建立並喚醒）AudioContext；不支援時回 null */
  function audioCtx() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }

  /** 建一段白噪音 buffer（爆炸音用） */
  function noiseBuffer(ac, secs) {
    const buf = ac.createBuffer(1, ac.sampleRate * secs, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 通用短音：振盪器 + 音量包絡 + 頻率滑移 */
  function tone(ac, { type = 'sine', from = 440, to = from, secs = 0.15, vol = 0.25, delay = 0 }) {
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + secs);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + secs);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + secs + 0.02);
  }

  /** 音效配方表：名稱 → 合成函式 */
  const RECIPES = {
    pop:   (ac) => tone(ac, { type: 'sine', from: 600, to: 150, secs: 0.1, vol: 0.3 }),
    jump:  (ac) => tone(ac, { type: 'square', from: 160, to: 650, secs: 0.18, vol: 0.18 }),
    coin:  (ac) => { tone(ac, { type: 'square', from: 988, to: 988, secs: 0.08, vol: 0.16 });
                     tone(ac, { type: 'square', from: 1319, to: 1319, secs: 0.22, vol: 0.16, delay: 0.08 }); },
    laser: (ac) => tone(ac, { type: 'sawtooth', from: 1400, to: 180, secs: 0.22, vol: 0.18 }),
    ding:  (ac) => tone(ac, { type: 'triangle', from: 880, to: 870, secs: 0.5, vol: 0.25 }),
    boom:  (ac) => {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.5);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, ac.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.45);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.5, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
    },
  };

  /** 播放指定音效（未知名稱或不支援 WebAudio 時靜默略過） */
  function play(name) {
    const ac = audioCtx();
    if (ac && RECIPES[name]) {
      try { RECIPES[name](ac); } catch (e) { console.warn('音效播放失敗：', e); }
    }
  }

  /* ── TTS 自然語音 ── */

  let cachedVoice = null; // 挑選結果快取（voiceschanged 後重挑）

  /**
   * 挑最適合的中文語音：
   *   1. Edge 的「Microsoft … Natural」線上自然語音（zh-TW 優先）
   *   2. 任何 zh-TW 語音 → 任何 zh 語音 → 瀏覽器預設
   */
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    const zh = (v) => v.lang?.toLowerCase().startsWith('zh');
    const tw = (v) => v.lang?.toLowerCase() === 'zh-tw';
    return voices.find(v => /natural/i.test(v.name) && tw(v)) ||
           voices.find(v => /natural/i.test(v.name) && zh(v)) ||
           voices.find(tw) || voices.find(zh) || null;
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoice = pickVoice(); });
  }

  /**
   * 唸出文字。回傳 Promise（唸完 resolve）。
   * headless／無語音環境的保險：依字數估時間，逾時自動 resolve，
   * 避免「唸出…直到結束」積木永遠卡住。
   */
  function speak(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !String(text).trim()) return resolve();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'zh-TW';
      cachedVoice = cachedVoice || pickVoice();
      if (cachedVoice) u.voice = cachedVoice;
      const fallback = setTimeout(resolve, Math.max(1500, String(text).length * 450));
      const done = () => { clearTimeout(fallback); resolve(); };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  /** 停止所有語音（⏹／停止全部時呼叫） */
  function cancelSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  return { play, speak, cancelSpeech, get ctx() { return ctx; } };
})();
