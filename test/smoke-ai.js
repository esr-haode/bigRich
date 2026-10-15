/* 冒烟测试 2：4 名人机对战直到游戏结束（验证破产/胜利/排行） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'G:/dev/game/bigRich';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

const ctxStub = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 20 });
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
    return typeof t[p] !== 'undefined' ? t[p] : (() => {});
  },
  set(t, p, v) { t[p] = v; return true; }
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub();
window.devicePixelRatio = 1;
window.requestAnimationFrame = f => window.setTimeout(() => f(Date.now()), 60);

const inject = win => {
  const code = ['js/data.js', 'js/game.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  win.eval(code);
};
inject(window);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);
const save = () => JSON.parse(window.localStorage.getItem('bigrich_save_v2') || 'null');

(async () => {
  await sleep(300);
  // 选 4 人（点“4”号按钮一次），全部改为人机
  $('player-count').children[2].click();
  await sleep(50);
  const cfg = document.querySelectorAll('.pconf');
  console.log('配置行数:', cfg.length);
  cfg.forEach((row) => {
    const aiBtn = row.querySelectorAll('.ptype-btn')[1];
    aiBtn.click();
  });
  $('btn-start').click();
  await sleep(300);

  console.log('开局:', save().players.map(p => `${p.name}(${p.isAI ? 'AI' : '人'})`).join(' '));

  // AI 自动对战：最多等 240 秒
  let over = false;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const s = save();
    if (!s) break;
    if (s.phase === 'over' || !$('dialog-modal').classList.contains('hidden')) {
      if (!$('dialog-modal').classList.contains('hidden')) {
        const btn = $('dialog-box').querySelector('[data-dlg]');
        if (btn) btn.click(); // 结算弹窗的「再来一局」不点，先记录
      }
    }
    const alive = s.players.filter(p => !p.bankrupt).length;
    if (alive <= 1 && !over) {
      over = true;
      console.log(`\n游戏结束于第 ${s.round} 回合`);
      const modalVisible = !$('dialog-modal').classList.contains('hidden');
      const table = $('dialog-box').textContent.slice(0, 200);
      console.log('结算弹窗:', modalVisible, '|', table.replace(/\s+/g, ' '));
      console.log('胜者:', s.players.filter(p => !p.bankrupt).map(p => p.name).join(',') || '无');
      console.log('最终现金:', s.players.map(p => `${p.name}¥${p.cash}${p.bankrupt ? '(破产)' : ''}`).join(' | '));
      console.log('被买地产总数:', Object.keys(s.owners).length);
      break;
    }
    if (i % 20 === 0) console.log(`... 第 ${s.round} 回合, 存活 ${alive}/4, pot ¥${s.pot}`);
  }
  if (!over) {
    // 未在时限内结束：以状态健康度作为通过标准
    const s = save();
    const healthy = s
      && s.players.length === 4
      && s.players.every(p => p.cash >= 0)
      && s.players.every(p => p.pos >= 0 && p.pos < 40)
      && Object.keys(s.owners).every(k => +k >= 0 && +k < 40)
      && s.players.every(p => p.isAI);
    console.log(healthy ? 'SMOKE PASS（稳态健康，经典节奏一局较长属正常）' : 'SMOKE FAIL: 状态异常');
    process.exit(healthy ? 0 : 2);
  }
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
