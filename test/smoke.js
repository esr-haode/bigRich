/* 冒烟测试：jsdom 无头跑通 40 格大富翁主流程 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'G:/dev/game/bigRich';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

// ---- Canvas 2D stub ----
const ctxStub = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 20 });
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'canvas') return {};
    return typeof t[p] !== 'undefined' ? t[p] : (() => {});
  },
  set(t, p, v) { t[p] = v; return true; }
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub();
window.devicePixelRatio = 1;

// localStorage stub（jsdom 有，但确保可用）
if (!window.localStorage) {
  const m = new Map();
  window.localStorage = {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// 注入游戏脚本（两文件合并一次 eval：const 顶层声明需同一作用域）
const inject = win => {
  // 节流 rAF：60ms 一帧，降低双实例 CPU 占用
  win.requestAnimationFrame = f => win.setTimeout(() => f(Date.now()), 60);
  const code = ['js/data.js', 'js/game.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  win.eval(code);
};
inject(window);

const errors = [];
window.addEventListener('error', e => errors.push(e.message));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);
const save = () => JSON.parse(window.localStorage.getItem('bigrich_save_v2') || 'null');

(async () => {
  await sleep(300); // 等 DOMContentLoaded → boot()
  console.log('1) boot 完成，开局弹窗可见:', !$('setup-modal').classList.contains('hidden'));

  // 2) 直接以 4 名玩家（1 人 + 3 人机）开局
  $('btn-start').click();
  await sleep(300);
  let s = save();
  console.log('2) 新局存档:', s ? `玩家 ${s.players.length} 人, phase=${s.phase}, round=${s.round}` : 'FAIL');
  console.log('   app 可见:', !$('app').classList.contains('hidden'));

  // 3) 自动跑 120 个动作：人类掷骰 + 处理所有弹窗
  let rolls = 0, dialogs = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(450);
    const dlgOpen = !$('dialog-modal').classList.contains('hidden');
    if (dlgOpen) {
      const btns = $('dialog-box').querySelectorAll('[data-dlg]');
      if (btns.length) { btns[0].click(); dialogs++; }
      continue;
    }
    const st = save();
    if (!st || st.phase === 'over') break;
    const cur = st.players[st.turnIdx];
    if (cur && !cur.isAI && !cur.bankrupt) {
      if (!$('btn-roll').disabled) { $('btn-roll').click(); rolls++; }
    }
  }
  s = save();
  console.log(`3) 跑了 ${rolls} 次掷骰, ${dialogs} 次弹窗交互`);
  console.log('   存档 round:', s.round, ' pot:', s.pot, ' 存活:', s.players.filter(p => !p.bankrupt).length, '/', s.players.length);
  console.log('   各玩家现金:', s.players.map(p => `${p.name}¥${p.cash}`).join(' | '));
  console.log('   已售出地产数:', Object.keys(s.owners).length);
  const anyOwned = Object.keys(s.owners).length;
  console.log('   地产索引合法(0-39):', Object.keys(s.owners).every(k => +k >= 0 && +k < 40));

  // 4) 模拟刷新：重新加载页面应出现恢复弹窗
  const dom2 = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w2 = dom2.window;
  // 共享同一 localStorage（jsdom 的 localStorage 是只读 getter，需 defineProperty 覆盖）
  Object.defineProperty(w2, 'localStorage', { value: window.localStorage, configurable: true });
  w2.HTMLCanvasElement.prototype.getContext = () => ctxStub();
  w2.devicePixelRatio = 1;
  let errors2 = [];
  w2.addEventListener('error', e => errors2.push(e.message));
  inject(w2);
  await sleep(200);
  const resumeVisible = !w2.document.getElementById('resume-modal').classList.contains('hidden');
  console.log('4) 刷新后恢复弹窗出现:', resumeVisible);
  console.log('   恢复信息:', w2.document.getElementById('resume-info').textContent.replace(/\n/g, ' / '));

  // 5) 点击继续游戏
  w2.document.getElementById('btn-resume').click();
  await sleep(300);
  const s2 = JSON.parse(w2.localStorage.getItem('bigrich_save_v2'));
  console.log('5) 恢复对局: round=', s2.round, ' turnIdx=', s2.turnIdx, ' phase=', s2.phase);

  console.log('页面脚本错误:', errors.length ? errors : '无');
  console.log('恢复页错误:', errors2.length ? errors2 : '无');
  console.log(anyOwned > 0 ? 'SMOKE PASS' : 'SMOKE WARN: 无人买地（继续跑）');
  process.exit(errors.length || errors2.length ? 2 : 0);
})().catch(e => { console.error('SMOKE FAIL:', e); process.exit(1); });
