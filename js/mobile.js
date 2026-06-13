/**
 * mobile.js — 手機版呈現模式
 *
 * 1. 播放模式：舞台依螢幕大小縮放、觸控裝置顯示虛擬方向鍵＋動作鍵
 * 2. 編輯模式：小螢幕觸控裝置顯示「建議用電腦編輯」提示橫幅
 *
 * 虛擬按鍵直接寫入 KEYS_DOWN（給「按鍵被按下？」偵測積木）並轉發
 * runtime.fireKey（給「當按鍵被按下」事件積木），按住時以固定頻率重發，
 * 行為等同實體鍵盤的自動重複。
 */
const Mobile = (() => {
  'use strict';

  /** 是否為觸控為主的裝置（手機/平板） */
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  /** 虛擬按鍵配置：[顯示文字, KeyboardEvent.key, d-pad 格位置] */
  const PAD_KEYS = [
    ['▲', 'ArrowUp', 'up'], ['◀', 'ArrowLeft', 'left'],
    ['▶', 'ArrowRight', 'right'], ['▼', 'ArrowDown', 'down'],
  ];

  const repeatTimers = {}; // key → setInterval id（按住重發）

  /** 按下虛擬鍵：登錄按住狀態＋觸發事件＋啟動重發 */
  function press(key) {
    KEYS_DOWN.add(key);
    App.runtime?.fireKey(key);
    clearInterval(repeatTimers[key]);
    repeatTimers[key] = setInterval(() => App.runtime?.fireKey(key), 130);
  }

  /** 放開虛擬鍵 */
  function release(key) {
    KEYS_DOWN.delete(key);
    clearInterval(repeatTimers[key]);
    delete repeatTimers[key];
  }

  /** 建立單顆虛擬按鍵並綁定觸控/滑鼠事件（滑鼠是為了桌機測試） */
  function makePadButton(label, key, className) {
    const btn = document.createElement('button');
    btn.className = `pad-btn ${className}`;
    btn.dataset.key = key;
    btn.textContent = label;
    const down = (e) => { e.preventDefault(); btn.classList.add('held'); press(key); };
    const up = (e) => { e.preventDefault(); btn.classList.remove('held'); release(key); };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up);
    btn.addEventListener('touchcancel', up);
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
    return btn;
  }

  /** 建立虛擬搖桿（首次進播放模式時呼叫；非觸控裝置不建立） */
  function buildGamepad() {
    if (!isTouch || document.getElementById('gamepad')) return;
    const pad = document.createElement('div');
    pad.id = 'gamepad';
    const dpad = document.createElement('div');
    dpad.className = 'dpad';
    for (const [label, key, pos] of PAD_KEYS) dpad.appendChild(makePadButton(label, key, `pad-${pos}`));
    pad.appendChild(dpad);
    pad.appendChild(makePadButton('空白鍵', ' ', 'pad-action'));
    document.getElementById('playOverlay').appendChild(pad);
  }

  /** 播放模式下把舞台縮放到塞滿螢幕（保留標題與按鍵的空間） */
  function scaleStage() {
    const wrap = document.getElementById('stageWrap');
    if (!document.getElementById('playOverlay').classList.contains('active')) {
      wrap.style.transform = ''; // 回編輯模式還原
      wrap.style.marginBottom = '';
      return;
    }
    const padH = isTouch ? 190 : 150; // 虛擬按鍵／按鈕保留高度
    const scale = Math.max(0.4, Math.min(
      (innerWidth - 16) / 480, (innerHeight - padH - 60) / 360, 2));
    wrap.style.transform = `scale(${scale})`;
    wrap.style.transformOrigin = 'top center';
    // transform 不改變版面佔位：用 margin 補償縮放差（放大補空間、縮小收空間）
    wrap.style.marginBottom = `${(scale - 1) * 360}px`;
  }

  /** 進入播放模式時呼叫（app.js enterPlayMode 內） */
  function onEnterPlayMode() {
    buildGamepad();
    scaleStage();
    document.getElementById('playOverlay').classList.toggle('touch', isTouch);
  }

  /** 離開播放模式時呼叫 */
  function onExitPlayMode() { scaleStage(); }

  /** 編輯模式提示橫幅：小螢幕觸控裝置建議改用電腦編輯 */
  function maybeShowEditorTip() {
    if (!isTouch || innerWidth > 900) return;
    const bar = document.createElement('div');
    bar.id = 'mobileTip';
    bar.append('📱 手機適合「遊玩分享連結」；製作遊戲建議用電腦喔！');
    const ok = document.createElement('button');
    ok.textContent = '知道了';
    ok.addEventListener('click', () => bar.remove());
    bar.appendChild(ok);
    document.body.appendChild(bar);
  }

  window.addEventListener('resize', scaleStage);

  return { isTouch, onEnterPlayMode, onExitPlayMode, maybeShowEditorTip };
})();
