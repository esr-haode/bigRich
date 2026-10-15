/* ===== 大发地产 · 游戏逻辑 ===== */
(function () {
'use strict';

/* ---------- 工具 ---------- */
const $ = id => document.getElementById(id);
const fmt = n => '¥' + Number(n).toLocaleString('en-US');
const rnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const SAVE_KEY = 'bigrich_save_v2';

/* ---------- 棋盘布局：9x9 外环恰 32 格，逆时针，起点在右下 ---------- */
// 右列 9 格 : i 0..8  -> col=8, row = 8-i      （起点在右下角，向上走）
// 顶行 8 格 : i 9..16 -> col = 16-i, row = 0   （从 col7 向左到 col0）
// 左列 8 格 : i 17..24-> col=0, row = i-16     （从 row1 向下到 row8）
// 底行 7 格 : i 25..31-> col = i-24, row = 8   （从 col1 向右到 col7，接回起点）
function tilePos(i) {
  if (i <= 8)  return { col: 8, row: 8 - i };
  if (i <= 16) return { col: 16 - i, row: 0 };
  if (i <= 24) return { col: 0, row: i - 16 };
  return { col: i - 24, row: 8 };
}
function tileRect(i) {
  const p = tilePos(i);
  return { x: p.col * CELL, y: p.row * CELL, w: CELL, h: CELL };
}
function tileName(i) { return BOARD[i].name; }

/* 色条贴中心侧 */
function colorBarSide(i) {
  const { col, row } = tilePos(i);
  if (col === 8) return 'left';
  if (col === 0) return 'right';
  if (row === 0) return 'bottom';
  return 'top';
}

/* ---------- 游戏状态 ---------- */
let state = null;        // 完整对局状态
let saveMeta = null;     // 恢复弹窗用的存档摘要

function newPlayer(id, name, tokenIdx, isAI) {
  return {
    id, name, tokenIdx, isAI,
    cash: START_CASH, pos: 0,
    bankrupt: false, inJail: false, jailTurns: 0,
    props: {},           // tileIdx -> houses
    passes: 0
  };
}
function newGame(cfg) {
  return {
    v: 2,
    players: cfg.map((c, i) => newPlayer(i, c.name, c.tokenIdx, c.isAI)),
    turnIdx: 0, round: 1,
    owners: {},          // tileIdx -> playerId
    pot: 0,
    log: [],
    phase: 'idle',       // idle | rolling | walking | dialog | over
    dice: null,
    deck: { chance: rnd(CHANCE_CARDS.length), fate: rnd(FATE_CARDS.length) },
    createdAt: Date.now()
  };
}
function cp() { return state.players[state.turnIdx]; }
function alivePlayers() { return state.players.filter(p => !p.bankrupt); }

/* ---------- 存档 ---------- */
function saveGame() {
  if (!state) return;
  try {
    const slim = JSON.parse(JSON.stringify(state));
    if (slim.phase === 'rolling' || slim.phase === 'walking' || slim.phase === 'dialog') {
      slim.phase = 'idle';
      if (slim.players[slim.turnIdx]) slim.resumeTile = slim.players[slim.turnIdx].pos;
    }
    slim.log = slim.log.slice(-60);
    localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
  } catch (e) { console.warn('save failed', e); }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 2 || !Array.isArray(s.players) || !s.players.length) return null;
    if (s.phase === 'over') return null;
    return s;
  } catch (e) { return null; }
}
function clearSave() { localStorage.removeItem(SAVE_KEY); }

/* ---------- 日志 ---------- */
function addLog(text, cls) {
  state.log.push({ t: Date.now(), text, cls: cls || '' });
  renderLog();
  saveGame();
}
function renderLog() {
  const box = $('log-box');
  box.innerHTML = '';
  state.log.slice(-80).forEach(l => {
    const div = document.createElement('div');
    div.className = 'log-line ' + (l.cls || '');
    div.textContent = l.text;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

/* ---------- 主画布 ---------- */
const stage = $('stage');
const sctx = stage.getContext('2d');
const view = { x: BOARD_PX / 2, y: BOARD_PX / 2, zoom: 0.72, tx: BOARD_PX / 2, ty: BOARD_PX / 2, tz: 0.72, follow: true };

/* 相机移动边界限制 */
const VIEW_MARGIN = 200; // 允许超出棋盘的边距（像素）
function clampView() {
  view.tx = clamp(view.tx, -VIEW_MARGIN, BOARD_PX + VIEW_MARGIN);
  view.ty = clamp(view.ty, -VIEW_MARGIN, BOARD_PX + VIEW_MARGIN);
}

function resizeStage() {
  const r = stage.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  stage.width = Math.max(1, Math.round(r.width * dpr));
  stage.height = Math.max(1, Math.round(r.height * dpr));
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeStage);

/* 鼠标拖动 / 缩放 / 悬停 */
let drag = null;
stage.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', e => {
  const r = stage.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; view.follow = false; }
    view.tx -= dx / view.zoom; view.ty -= dy / view.zoom;
    clampView();
    drag.x = e.clientX; drag.y = e.clientY;
  }
});
stage.addEventListener('pointerup', e => {
  stage.classList.remove('dragging');
  const wasMoved = drag && drag.moved;
  drag = null;
  if (!wasMoved) onStageClick();
});
stage.addEventListener('pointerleave', () => { mouse.x = -999; mouse.y = -999; hideTip(); });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  view.tz = clamp(view.tz * (e.deltaY < 0 ? 1.12 : 0.9), 0.35, 2.2);
}, { passive: false });
stage.addEventListener('dblclick', () => { centerOnCurrent(); });

const mouse = { x: -999, y: -999 };

function screenToBoard(sx, sy) {
  const w = stage.clientWidth, h = stage.clientHeight;
  return { x: (sx - w / 2) / view.zoom + view.x, y: (sy - h / 2) / view.zoom + view.y };
}
function centerOnCurrent() {
  if (!state) return;
  const p = cp(); if (!p) return;
  const r = tileRect(p.pos);
  view.tx = r.x + CELL / 2; view.ty = r.y + CELL / 2;
  view.follow = true;
}

/* 玩家在同一格内的散布 */
function playerOffsets(n) {
  const arr = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
    arr.push({ dx: Math.cos(ang) * 34, dy: Math.sin(ang) * 34 });
  }
  return arr;
}

/* 绘制单格 */
function drawTile(i, ctx) {
  const b = BOARD[i];
  const r = tileRect(i);
  const x = r.x + 3, y = r.y + 3, w = CELL - 6, h = CELL - 6;

  // 底座
  ctx.fillStyle = '#fffdf4';
  ctx.fillRect(x, y, w, h);
  const owner = state ? state.owners[i] : undefined;
  const op = owner != null ? state.players[owner] : null;
  ctx.lineWidth = 3;
  ctx.strokeStyle = op && !op.bankrupt ? op.tokenColorCss : '#a5875a';
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = '#3a2f1d';
  ctx.textAlign = 'center';

  if (b.t === 'prop' || b.t === 'station') {
    // 色条
    const side = colorBarSide(i);
    const bw = Math.max(14, 22 * view.zoom);
    ctx.fillStyle = b.t === 'prop' ? b.color : '#6b7280';
    if (side === 'left')   ctx.fillRect(x, y, bw, h);
    if (side === 'right')  ctx.fillRect(x + w - bw, y, bw, h);
    if (side === 'top')    ctx.fillRect(x, y, w, bw);
    if (side === 'bottom') ctx.fillRect(x, y + h - bw, w, bw);
    // 名称
    ctx.font = `700 ${Math.max(11, 13.5)}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const cx = x + w / 2 + (side === 'left' ? bw / 2 : side === 'right' ? -bw / 2 : 0);
    const cy = y + h / 2 + (side === 'top' ? bw / 2 : side === 'bottom' ? -bw / 2 : 0);
    ctx.fillStyle = '#3a2f1d';
    wrapText(ctx, b.name, cx, cy - 6, w - 8, 15, 2);
    ctx.font = `600 ${Math.max(10, 11.5)}px sans-serif`;
    ctx.fillStyle = '#8a6b3d';
    ctx.fillText(b.t === 'prop' ? fmt(b.price) : '过路费', cx, cy + 14);
    // 房子
    const houses = op ? (op.props[i] || 0) : 0;
    if (houses > 0) {
      ctx.font = `${Math.max(11, 13)}px sans-serif`;
      ctx.fillText('🏠'.repeat(houses), cx, y + h - 8);
    }
  } else {
    // 特殊格
    let bg = '#f3ecd9', emoji = '', label = b.name, sub = '';
    if (b.t === 'go')       { bg = '#e8f7ec'; emoji = '🚩'; sub = '工资 2,000'; }
    if (b.t === 'jailGo')   { bg = '#fbe3e0'; emoji = '🚔'; sub = '直接入狱'; }
    if (b.t === 'rest')     { bg = '#e3eaf7'; emoji = '⛓️'; sub = '探监'; }
    if (b.t === 'free')     { bg = '#fff3c9'; emoji = '🅿️'; sub = '领奖金'; }
    if (b.t === 'chance')   { bg = '#ffe9d6'; emoji = '❓'; sub = '机会卡'; }
    if (b.t === 'fate')     { bg = '#e6ddf7'; emoji = '🔮'; sub = '命运卡'; }
    if (b.t === 'tax')      { bg = '#f6dcd6'; emoji = '💸'; label = b.name; sub = b.taxType === 'income' ? '所得税' : '奢侈税'; }
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.font = `${Math.max(20, 30)}px sans-serif`;
    ctx.fillText(emoji, x + w / 2, y + h / 2 - 4);
    ctx.font = `700 ${Math.max(11, 12.5)}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillStyle = '#3a2f1d';
    ctx.fillText(label, x + w / 2, y + h / 2 + 20);
    ctx.font = `600 ${Math.max(9, 10.5)}px sans-serif`;
    ctx.fillStyle = '#8a6b3d';
    ctx.fillText(sub, x + w / 2, y + h / 2 + 34);
  }
  // 经过玩家高亮（当前所在格画光圈）
  if (state) {
    const cp0 = cp();
    if (cp0 && cp0.pos === i) {
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 5;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    }
  }
}

function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const lines = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  const n = Math.min(lines.length, maxLines || 2);
  const startY = y - (n - 1) * lh / 2;
  for (let k = 0; k < n; k++) ctx.fillText(lines[k], x, startY + k * lh);
}

/* 中心区 */
function drawCenter(ctx) {
  const cx = BOARD_PX / 2, cy = BOARD_PX / 2;
  const r = 4 * CELL;
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7c5a2a';
  ctx.font = `900 ${Math.max(44, 64)}px "PingFang SC","Microsoft YaHei",serif`;
  ctx.fillText('大发地产', cx, cy - 26);
  ctx.font = `600 ${Math.max(14, 20)}px "PingFang SC",sans-serif`;
  ctx.fillText('BIG RICH · 经典大富翁', cx, cy + 6);
  if (state) {
    // 奖金池
    ctx.font = `800 ${Math.max(18, 26)}px sans-serif`;
    ctx.fillStyle = '#b3402a';
    ctx.fillText('🅿️ 奖金池 ' + fmt(state.pot), cx, cy + 48);
    // 当前骰子
    if (state.dice) {
      drawDiceBig(ctx, cx, cy + 110, state.dice[0], state.dice[1]);
    }
  }
}
function drawDiceBig(ctx, cx, cy, a, b) {
  const s = Math.max(30, 44);
  [[cx - s - 8, a], [cx + 8, b]].forEach(([px, n]) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    roundRect(ctx, px - s / 2, cy - s / 2, s, s, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222';
    const o = s * 0.26;
    const pts = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
    pts.forEach(([gx, gy]) => {
      ctx.beginPath(); ctx.arc(px + gx * o, cy + gy * o, s * 0.09, 0, 7); ctx.fill();
    });
  });
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 绘制玩家棋子 */
function drawPlayers(ctx) {
  if (!state) return;
  const groups = {};
  state.players.forEach(p => {
    if (p.bankrupt) return;
    const r = tileRect(p.pos);
    const cx = r.x + CELL / 2, cy = r.y + CELL / 2;
    (groups[p.pos] = groups[p.pos] || []).push({ p, cx, cy });
  });
  Object.values(groups).forEach(list => {
    const offs = playerOffsets(list.length);
    list.forEach((it, k) => {
      const px = it.cx + offs[k].dx, py = it.cy + offs[k].dy;
      const rad = Math.max(15, 22 * view.zoom);
      // 阴影
      ctx.beginPath(); ctx.arc(px + 2, py + 3, rad, 0, 7);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
      // 棋子
      ctx.beginPath(); ctx.arc(px, py, rad, 0, 7);
      ctx.fillStyle = it.p.tokenColorCss; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      // 当前玩家金色光环
      if (state.turnIdx === it.p.id) {
        ctx.beginPath(); ctx.arc(px, py, rad + 5, 0, 7);
        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.font = `${Math.round(rad * 1.15)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(TOKENS[it.p.tokenIdx].emoji, px, py + 1);
      ctx.textBaseline = 'alphabetic';
    });
  });
}

/* ---------- 主渲染循环 ---------- */
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(50, ts - lastTs); lastTs = ts;
  updateWalk(dt);
  // 相机平滑
  if (view.follow && state) {
    const p = cp();
    if (p && !p.bankrupt) {
      const r = tileRect(p.pos);
      view.tx = r.x + CELL / 2; view.ty = r.y + CELL / 2;
    }
  }
  clampView();
  const k = 1 - Math.pow(0.001, dt / 1000);
  view.x += (view.tx - view.x) * k;
  view.y += (view.ty - view.y) * k;
  view.zoom += (view.tz - view.zoom) * k;
  renderStage();
  if (ts % 4 < 2) drawMinimap();
  requestAnimationFrame(loop);
}

function renderStage() {
  const w = stage.clientWidth, h = stage.clientHeight;
  sctx.clearRect(0, 0, w, h);
  // 木桌背景
  const g = sctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#caa670'); g.addColorStop(.5, '#d9b98c'); g.addColorStop(1, '#c4a173');
  sctx.fillStyle = g; sctx.fillRect(0, 0, w, h);
  sctx.save();
  sctx.translate(w / 2, h / 2);
  sctx.scale(view.zoom, view.zoom);
  sctx.translate(-view.x, -view.y);
  if (state) {
    for (let i = 0; i < BOARD.length; i++) drawTile(i, sctx);
    drawCenter(sctx);
    drawPlayers(sctx);
  }
  sctx.restore();
  renderTip();
}
requestAnimationFrame(loop);

/* ---------- 小地图 ---------- */
const mini = $('minimap');
const mctx = mini.getContext('2d');
function drawMinimap() {
  const S = mini.width, c = S / GRID;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = '#c4a173'; mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = '#fffdf4';
  for (let i = 0; i < BOARD.length; i++) {
    const { col, row } = tilePos(i);
    const b = BOARD[i];
    mctx.fillStyle = b.t === 'prop' ? b.color : b.t === 'station' ? '#9aa3ad' : '#f3ecd9';
    mctx.fillRect(col * c + 1, row * c + 1, c - 2, c - 2);
  }
  if (state) {
    state.players.forEach(p => {
      if (p.bankrupt) return;
      const { col, row } = tilePos(p.pos);
      const x = col * c + c / 2, y = row * c + c / 2;
      mctx.beginPath(); mctx.arc(x, y, c * 0.32, 0, 7);
      mctx.fillStyle = p.tokenColorCss; mctx.fill();
      mctx.lineWidth = 1.5; mctx.strokeStyle = p.id === state.turnIdx ? '#ffd76a' : '#fff';
      mctx.stroke();
    });
  }
  // 视野框
  const w = stage.clientWidth, h = stage.clientHeight;
  const vw = w / view.zoom * (S / BOARD_PX), vh = h / view.zoom * (S / BOARD_PX);
  const vx = view.x * (S / BOARD_PX) - vw / 2, vy = view.y * (S / BOARD_PX) - vh / 2;
  mctx.strokeStyle = 'rgba(255,215,106,.95)'; mctx.lineWidth = 2;
  mctx.strokeRect(vx, vy, vw, vh);
}
mini.addEventListener('click', e => {
  const r = mini.getBoundingClientRect();
  const bx = (e.clientX - r.left) / r.width * BOARD_PX;
  const by = (e.clientY - r.top) / r.height * BOARD_PX;
  view.tx = bx; view.ty = by; view.follow = false;
});

/* ---------- 面板渲染 ---------- */
function totalAssets(p) {
  let v = p.cash;
  Object.keys(p.props).forEach(k => {
    const idx = Number(k), b = BOARD[idx];
    if (!b || b.t !== 'prop' && b.t !== 'station') return;
    v += b.price + (p.props[k] || 0) * Math.round(b.price * HOUSES.costFactor);
  });
  return v;
}

function renderPlayers() {
  const box = $('player-list');
  box.innerHTML = '';
  const rank = state.players.slice().sort((a, b) => totalAssets(b) - totalAssets(a));
  rank.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pcard' + (p.id === state.turnIdx ? ' current' : '') +
      (p.bankrupt ? ' bankrupt' : '') + (p.isAI ? '' : ' me-card');
    const ownCount = Object.keys(p.props).length;
    div.innerHTML = `
      <span class="pcard-rank">${['🥇','🥈','🥉'][i] || (i + 1)}</span>
      <span class="pcard-token" style="background:${p.tokenColorCss}">${TOKENS[p.tokenIdx].emoji}</span>
      <span class="pcard-info">
        <span class="pcard-name">${p.name}</span><br>
        <span class="pcard-tag">${p.isAI ? '<span class="ai-tag">🤖 人机</span>' : '🧑 玩家'} · ${ownCount} 块地产${p.inJail ? ' · <span class="pcard-jail">狱中</span>' : ''}</span>
      </span>
      <span style="text-align:right">
        <span class="pcard-cash">${fmt(p.cash)}</span><br>
        <span class="pcard-assets">身家 ${fmt(totalAssets(p))}</span>
      </span>`;
    box.appendChild(div);
  });
  $('stat-round').textContent = state.round;
  $('stat-pot').textContent = fmt(state.pot);
  updateTurnBanner();
}

function updateTurnBanner() {
  const p = cp();
  const dot = $('turn-dot'), txt = $('turn-text');
  const banner = $('turn-banner');
  if (!p) return;
  dot.style.background = p.tokenColorCss;
  dot.style.color = p.tokenColorCss;
  let extra = '';
  if (p.inJail) extra = '（监狱中）';
  if (state.phase === 'over') { txt.textContent = '游戏结束'; banner.classList.remove('mine'); return; }
  txt.textContent = `第 ${state.round} 回合 · ${p.name} 的回合${p.isAI ? ' 🤖' : ''}${extra}`;
  banner.classList.toggle('mine', !p.isAI && !p.bankrupt);
  $('btn-roll').disabled = p.isAI || p.bankrupt || state.phase !== 'idle';
}

function renderEstates() {
  const box = $('estate-list');
  box.innerHTML = '';
  const p = cp(); if (!p) return;
  const idxs = Object.keys(p.props).map(Number).sort((a, b) => a - b);
  if (!idxs.length) {
    box.innerHTML = '<div class="estate-empty">名下暂无地产</div>';
    return;
  }
  idxs.forEach(i => {
    const b = BOARD[i];
    const houses = p.props[i] || 0;
    const canBuild = b.t === 'prop' && hasFullGroup(p, b.group) && houses < HOUSES.max;
    const div = document.createElement('div');
    div.className = 'estate-item' + (canBuild ? ' buildable' : '');
    div.innerHTML = `<span class="estate-color" style="background:${b.color}"></span>
      <span style="flex:1">${b.name}</span>
      <span class="estate-houses">${houses ? '🏠'.repeat(houses) : ''}</span>
      ${canBuild ? '<span style="color:#ffd76a;font-size:10px">可建</span>' : ''}`;
    if (canBuild) div.onclick = () => onBuildClick(i);
    box.appendChild(div);
  });
}

/* ---------- 规则计算 ---------- */
function hasFullGroup(p, group) {
  return BOARD.every((b, i) =>
    !(b.t === 'prop' && b.group === group) || state.owners[i] === p.id);
}
function rentOf(idx) {
  const b = BOARD[idx];
  const ownerId = state.owners[idx];
  const owner = state.players[ownerId];
  if (!owner) return 0;
  if (b.t === 'prop') {
    const houses = owner.props[idx] || 0;
    let r = Math.round(b.price * 0.1) * HOUSES.mult[houses];
    if (hasFullGroup(owner, b.group)) r *= 2;
    return Math.round(r);
  }
  if (b.t === 'station') {
    let n = 0;
    BOARD.forEach((bb, i) => { if (bb.t === 'station' && state.owners[i] === ownerId) n++; });
    return STATION_RENT[clamp(n - 1, 0, 3)];
  }
  return 0;
}

/* ---------- 格子悬停提示 ---------- */
function onStageClick() {
  if (!state) return;
  const b = screenToBoard(mouse.x, mouse.y);
  const col = Math.floor(b.x / CELL), row = Math.floor(b.y / CELL);
  for (let i = 0; i < BOARD.length; i++) {
    const p = tilePos(i);
    if (p.col === col && p.row === row) {
      // 点击自己的可建地块 → 建造面板
      if (state.owners[i] === state.turnIdx && !cp().bankrupt) onBuildClick(i);
      return;
    }
  }
}

function renderTip() {
  const tip = $('tile-tip');
  if (!state || mouse.x < 0) { tip.classList.add('hidden'); return; }
  const b = screenToBoard(mouse.x, mouse.y);
  const col = Math.floor(b.x / CELL), row = Math.floor(b.y / CELL);
  let found = -1;
  for (let i = 0; i < BOARD.length; i++) {
    const p = tilePos(i);
    if (p.col === col && p.row === row) { found = i; break; }
  }
  if (found < 0) { tip.classList.add('hidden'); return; }
  const t = BOARD[found], lines = [];
  lines.push(`<div class="tt-name">${t.name}</div>`);
  if (t.t === 'prop' || t.t === 'station') {
    lines.push(`<div class="tt-row"><span>购入价</span><b>${fmt(t.price)}</b></div>`);
    lines.push(`<div class="tt-row"><span>当前租金</span><b>${fmt(rentOf(found))}</b></div>`);
    const oid = state.owners[found];
    if (oid != null) {
      const op = state.players[oid];
      lines.push(`<div class="tt-row"><span>拥有者</span><span class="tt-owner" style="color:${op.tokenColorCss}">${op.name}${op.props[found] ? ' 🏠'.repeat(op.props[found]) : ''}</span></div>`);
    } else {
      lines.push(`<div class="tt-row"><span>状态</span><span style="color:#9db3a4">无主空地</span></div>`);
    }
  } else {
    lines.push(`<div style="color:#cbbf9f">${t.desc || '特殊地块'}</div>`);
  }
  tip.innerHTML = lines.join('');
  tip.classList.remove('hidden');
  const r = stage.parentElement.getBoundingClientRect();
  const tw = 230, th = tip.offsetHeight || 110;
  let lx = mouse.x + 16, ly = mouse.y + 14;
  if (lx + tw > r.width) lx = mouse.x - tw - 12;
  if (ly + th > r.height) ly = mouse.y - th - 12;
  tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
}
function hideTip() { $('tile-tip').classList.add('hidden'); }

/* ---------- 对话框 ---------- */
function showDialog(html) {
  const mask = $('dialog-modal'), box = $('dialog-box');
  box.innerHTML = html;
  mask.classList.remove('hidden');
  bindDialogButtons();
}
function closeDialog() {
  $('dialog-modal').classList.add('hidden');
  $('dialog-box').innerHTML = '';
  state.phase = 'idle';
  refreshAll(); saveGame();
  maybeAI();
}
function dlgBtn(id, label, cls) {
  return `<button class="btn ${cls}" data-dlg="${id}">${label}</button>`;
}
function bindDialogButtons() {
  $('dialog-box').querySelectorAll('[data-dlg]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.dlg;
      const fn = dlgHandlers[id];
      if (fn) fn();
    };
  });
}
const dlgHandlers = {};

/* ---------- 掷骰与移动 ---------- */
function onRoll() {
  if (!state || state.phase !== 'idle') return;
  const p = cp();
  if (p.inJail) { showJailDialog(); return; }
  doRoll();
}

function doRoll() {
  const p = cp();
  state.phase = 'rolling';
  $('btn-roll').disabled = true;
  // 骰子翻滚动画
  let ticks = 0;
  const anim = setInterval(() => {
    state.dice = [1 + rnd(6), 1 + rnd(6)];
    ticks++;
    if (ticks >= 8) {
      clearInterval(anim);
      const steps = state.dice[0] + state.dice[1];
      addLog(`🎲 ${p.name} 掷出 ${state.dice[0]} + ${state.dice[1]} = ${steps} 点`, 'gold');
      startWalk(p, steps);
    }
  }, 70);
}

let walk = null;
function startWalk(p, steps) {
  walk = { pid: p.id, left: steps };
  state.phase = 'walking';
}
function updateWalk(dt) {
  if (!walk) return;
  walk._acc = (walk._acc || 0) + dt;
  if (walk._acc < 170) return;
  walk._acc = 0;
  const p = state.players[walk.pid];
  if (!p || p.bankrupt) { walk = null; state.phase = 'idle'; return; }
  p.pos = (p.pos + 1) % BOARD.length;
  view.follow = true;
  walk.left--;
  if (walk.left <= 0) {
    walk = null;
    landing(p);
  }
}

function landing(p) {
  state.phase = 'dialog';
  const i = p.pos;
  const b = BOARD[i];
  // 经过/停在起点
  if (b.t === 'go') {
    p.cash += GO_SALARY;
    addLog(`🚩 ${p.name} 回到起点，领取工资 ${fmt(GO_SALARY)}`, 'good');
  }
  resolveTile(p, i);
}

function resolveTile(p, i) {
  const b = BOARD[i];
  if (b.t === 'prop' || b.t === 'station') {
    const oid = state.owners[i];
    if (oid == null) {
      if (p.cash >= b.price) {
        showBuyDialog(i);
      } else {
        addLog(`💸 ${p.name} 现金不足，买不起${b.name}`, 'bad');
        endTurn();
      }
    } else if (oid === p.id) {
      if (b.t === 'prop' && hasFullGroup(p, b.group) && (p.props[i] || 0) < HOUSES.max) {
        addLog(`🏗 ${p.name} 停在自家${b.name}，可建造房产`, 'sys');
      }
      endTurn();
    } else {
      const rent = rentOf(i);
      const owner = state.players[oid];
      payRent(p, owner, rent, b.name);
    }
    return;
  }
  switch (b.t) {
    case 'tax':
      let tax = b.taxType === 'income' ? clamp(Math.floor(p.cash * 0.1), 200, 2000) : 750;
      tax = Math.min(tax, p.cash);
      p.cash -= tax; state.pot += tax;
      addLog(`💸 ${p.name} 缴纳${b.name} ${fmt(tax)}（进入奖金池）`, 'bad');
      endTurn();
      break;
    case 'chance':
    case 'fate': {
      const deck = b.t === 'chance' ? CHANCE_CARDS : FATE_CARDS;
      const card = deck[state.deck[b.t] % deck.length];
      state.deck[b.t]++;
      if (p.isAI) {
        addLog(`${b.t === 'chance' ? '❓ 机会卡' : '🔮 命运卡'}：${card.text}`, 'sys');
        const async = applyCard(card, p);
        renderAll();
        if (!async) endTurn();
      } else {
        showCardDialog(b.t === 'chance' ? '机会卡' : '命运卡', card, p);
      }
      break;
    }
    case 'jailGo':
      p.inJail = true; p.jailTurns = 0;
      addLog(`🚔 ${p.name} 被送进监狱！`, 'bad');
      endTurn();
      break;
    case 'free':
      const pot = state.pot; state.pot = 0;
      p.cash += pot;
      addLog(`🅿️ ${p.name} 停在免费停车，拿走奖金池 ${fmt(pot)}！`, pot > 0 ? 'gold' : 'sys');
      endTurn();
      break;
    case 'rest':
      addLog(`⛓️ ${p.name} 只是去监狱探监，平安离开`, 'sys');
      endTurn();
      break;
    default:
      endTurn();
  }
}

function payRent(payer, owner, rent, tileName2) {
  rent = Math.min(rent, payer.cash);
  payer.cash -= rent;
  if (!owner.bankrupt) owner.cash += rent;
  addLog(`🏠 ${payer.name} 向 ${owner.name} 支付 ${tileName2} 租金 ${fmt(rent)}`, 'bad');
  if (payer.cash <= 0) { bankruptPlayer(payer, owner); return; }
  endTurn();
}

function bankruptPlayer(p, creditor) {
  p.bankrupt = true; p.cash = 0; p.inJail = false;
  Object.keys(p.props).forEach(k => delete p.props[k]);
  Object.keys(state.owners).forEach(k => {
    if (Number(state.owners[k]) === p.id) delete state.owners[Number(k)];
  });
  addLog(`💀 ${p.name} 破产了！退出游戏`, 'bad');
  checkGameOver();
  endTurn();
}

function checkGameOver() {
  const alive = alivePlayers();
  if (alive.length <= 1) {
    state.phase = 'over';
    showGameOver(alive[0]);
  }
}

function endTurn() {
  if (state.phase === 'over') return;
  renderAll(); saveGame();
  state.phase = 'idle';
  // 找下一个存活玩家
  let guard = 0;
  do {
    state.turnIdx = (state.turnIdx + 1) % state.players.length;
    if (state.turnIdx === 0) state.round++;
    guard++;
  } while (cp().bankrupt && guard < 100);
  refreshAll(); saveGame();
  maybeAI();
}

function maybeAI() {
  if (!state || state.phase !== 'idle') return;
  const p = cp();
  if (!p || !p.isAI || p.bankrupt) return;
  state.phase = 'ai';
  setTimeout(() => aiStep(), 850);
}

/* ---------- AI ---------- */
function aiStep() {
  if (!state || state.phase !== 'ai') return;
  const p = cp();
  if (p.inJail) {
    if (p.cash >= 1500 || p.jailTurns >= 2) {
      p.cash -= JAIL_FINE; p.inJail = false; p.jailTurns = 0;
      addLog(`🤖 ${p.name} 缴纳 ${fmt(JAIL_FINE)} 保释出狱`, 'sys');
      doRoll();
    } else {
      p.jailTurns++;
      const d = [1 + rnd(6), 1 + rnd(6)];
      state.dice = d;
      if (d[0] === d[1]) {
        p.inJail = false;
        addLog(`🤖 ${p.name} 掷出双 ${d[0]}，越狱成功！`, 'good');
        doRoll();
      } else {
        addLog(`🤖 ${p.name} 掷骰 ${d[0]}+${d[1]}，未能出狱`, 'sys');
        endTurn();
      }
    }
    return;
  }
  doRoll();
}

/* AI 购买决策（在 showBuyDialog 中调用） */
function aiBuyDecision(i) {
  const p = cp(), b = BOARD[i];
  const reserve = 600;
  if (p.cash - b.price >= reserve) return true;
  // 现金少但能凑齐全色组也可以
  const others = BOARD.filter((x, j) => x.t === 'prop' && x.group === b.group && state.owners[j] === p.id);
  if (others.length >= 1 && p.cash - b.price >= 100) return true;
  return false;
}

/* ---------- 各类对话框 ---------- */
function showBuyDialog(i) {
  const p = cp(), b = BOARD[i];
  if (p.isAI) {
    const buy = aiBuyDecision(i);
    if (buy) {
      p.cash -= b.price;
      state.owners[i] = p.id; p.props[i] = 0;
      addLog(`🤖 ${p.name} 买下 ${b.name}（${fmt(b.price)}）`, 'good');
    } else {
      addLog(`🤖 ${p.name} 放弃购买 ${b.name}`, 'sys');
    }
    endTurn();
    return;
  }
  state.phase = 'dialog';
  showDialog(`
    <div class="dlg-title">要买下这块地吗？</div>
    <div class="dlg-sub">${p.name} 停在「${b.name}」</div>
    <div class="card-face" style="background:${b.color}22;border-color:${b.color}">
      <div style="font-size:18px">${b.name}</div>
      <div style="font-size:13px;margin-top:4px">购入价 ${fmt(b.price)} · 无房租金 ${fmt(Math.round(b.price * 0.1))}</div>
    </div>
    <div class="dlg-detail">
      <div class="drow"><span>当前现金</span><b>${fmt(p.cash)}</b></div>
      <div class="drow"><span>购地后剩余</span><b>${fmt(p.cash - b.price)}</b></div>
    </div>
    <div class="dlg-actions">
      ${dlgBtn('buy-yes', '买 入', 'dlg-btn-buy')}
      ${dlgBtn('buy-no', '放 弃', 'dlg-btn-skip')}
    </div>`);
  dlgHandlers['buy-yes'] = () => {
    p.cash -= b.price;
    state.owners[i] = p.id; p.props[i] = 0;
    addLog(`✅ ${p.name} 买下 ${b.name}（${fmt(b.price)}）`, 'good');
    closeDialog(); renderAll(); endTurn();
  };
  dlgHandlers['buy-no'] = () => {
    addLog(`🤔 ${p.name} 放弃了 ${b.name}`, 'sys');
    closeDialog(); endTurn();
  };
}

function showJailDialog() {
  const p = cp();
  state.phase = 'dialog';
  const forced = p.jailTurns >= 3;
  showDialog(`
    <div class="dlg-title">⛓️ 监狱中</div>
    <div class="dlg-sub">${p.name} 还剩 ${Math.max(0, 3 - p.jailTurns)} 次机会</div>
    <div class="dlg-body" style="text-align:center">
      缴纳 <span class="big-money">${fmt(JAIL_FINE)}</span> 保释金立即出狱，<br>或赌一把掷出双数直接越狱！
    </div>
    <div class="dlg-actions">
      ${forced ? '' : dlgBtn('jail-pay', `缴纳 ${fmt(JAIL_FINE)}`, 'dlg-btn-buy')}
      ${dlgBtn('jail-dice', '掷骰赌双数', 'dlg-btn-danger')}
    </div>`);
  dlgHandlers['jail-pay'] = () => {
    p.cash -= Math.min(JAIL_FINE, p.cash);
    p.inJail = false; p.jailTurns = 0;
    addLog(`🔓 ${p.name} 缴纳保释金出狱`, 'sys');
    closeDialog(); renderAll(); doRoll();
  };
  dlgHandlers['jail-dice'] = () => {
    p.jailTurns++;
    const d = [1 + rnd(6), 1 + rnd(6)];
    state.dice = d;
    if (d[0] === d[1]) {
      p.inJail = false; p.jailTurns = 0;
      addLog(`🎉 ${p.name} 掷出双 ${d[0]}，越狱成功并前进！`, 'good');
      closeDialog(); renderAll();
      state.phase = 'rolling'; $('btn-roll').disabled = true;
      startWalk(p, d[0] + d[1]);
    } else {
      addLog(`😣 ${p.name} 掷出 ${d[0]}+${d[1]}，继续坐牢`, 'bad');
      if (p.jailTurns >= 3) {
        p.cash -= Math.min(JAIL_FINE, p.cash);
        p.inJail = false; p.jailTurns = 0;
        addLog(`🔓 ${p.name} 关满三天，缴纳 ${fmt(JAIL_FINE)} 强制出狱`, 'sys');
        closeDialog(); renderAll(); endTurn();
      } else {
        closeDialog(); endTurn();
      }
    }
  };
}

function showCardDialog(tag, card, p) {
  state.phase = 'dialog';
  showDialog(`
    <div class="dlg-title">${tag === '机会卡' ? '❓ 机会' : '🔮 命运'}</div>
    <div class="card-face"><span class="card-tag">${tag}</span><br>${card.text}</div>
    <div class="dlg-actions">${dlgBtn('card-ok', '接 受', 'btn-primary')}</div>`);
  dlgHandlers['card-ok'] = () => {
    const async = applyCard(card, p);
    closeDialog(); renderAll();
    if (!async) endTurn();
  };
}

function applyCard(card, p) {
  let async = false;
  if (card.cash) {
    p.cash += card.cash;
    addLog(`${card.cash > 0 ? '💰' : '💸'} ${p.name} ${card.text}`, card.cash > 0 ? 'good' : 'bad');
    if (p.cash <= 0) { bankruptPlayer(p, null); renderAll(); endTurn(); return false; }
  }
  if (card.collectFromAll) {
    let got = 0;
    state.players.forEach(o => {
      if (o.id !== p.id && !o.bankrupt) { got += Math.min(card.collectFromAll, o.cash); o.cash -= Math.min(card.collectFromAll, o.cash); }
    });
    p.cash += got;
    addLog(`🎁 ${p.name} 收到红包共 ${fmt(got)}`, 'good');
  }
  if (card.payAll) {
    let paid = 0;
    state.players.forEach(o => {
      if (o.id !== p.id && !o.bankrupt) { paid += Math.min(card.payAll, o.cash); o.cash -= Math.min(card.payAll, o.cash); }
    });
    state.pot += paid;
    addLog(`🍻 ${p.name} 请客，${fmt(paid)} 流入奖金池`, 'bad');
  }
  if (card.gotoJail) {
    p.inJail = true; p.jailTurns = 0;
    addLog(`🚔 ${p.name} 因卡片入狱`, 'bad');
  }
  if (card.moveSteps) {
    walkSteps(p, card.moveSteps);
    async = true;
  }
  if (card.moveTo != null) {
    const target = card.moveTo;
    const steps = (target - p.pos + BOARD.length) % BOARD.length;
    if (card.goSalary) { p.cash += GO_SALARY; addLog(`🚩 ${p.name} 经过起点 +${fmt(GO_SALARY)}`, 'good'); }
    p.pos = target;
    addLog(`➡️ ${p.name} 移动到「${BOARD[target].name}」`, 'sys');
    // 移动后再结算落点
    state.phase = 'dialog';
    setTimeout(() => resolveTile(p, target), 300);
    return true;
  }
  return async;
}

/* 卡片相对移动逐格走 */
function walkSteps(p, steps) {
  const dir = steps >= 0 ? 1 : -1;
  let n = Math.abs(steps);
  addLog(`➡️ ${p.name} ${dir > 0 ? '前进' : '后退'} ${n} 格`, 'sys');
  const stepOne = () => {
    if (n <= 0) {
      state.phase = 'dialog';
      resolveTile(p, p.pos);
      return;
    }
    p.pos = (p.pos + dir + BOARD.length) % BOARD.length;
    view.follow = true;
    n--;
    setTimeout(stepOne, 170);
  };
  setTimeout(stepOne, 200);
}

/* ---------- 建造 ---------- */
function onBuildClick(i) {
  if (!state || state.phase !== 'idle') return;
  const p = cp();
  if (state.owners[i] !== p.id || p.bankrupt) return;
  const b = BOARD[i];
  if (b.t !== 'prop') return;
  if (!hasFullGroup(p, b.group)) return;
  const houses = p.props[i] || 0;
  if (houses >= HOUSES.max) return;
  const cost = Math.round(b.price * HOUSES.costFactor);
  if (p.isAI) {
    if (p.cash - cost > 2500) { doBuild(p, i, cost); }
    return;
  }
  state.phase = 'dialog';
  showDialog(`
    <div class="dlg-title">🏗 建造房产</div>
    <div class="dlg-sub">${b.name}（${b.group}色组 · 已垄断）</div>
    <div class="dlg-detail">
      <div class="drow"><span>建造费用</span><b>${fmt(cost)}</b></div>
      <div class="drow"><span>建造后等级</span><b>🏠 × ${houses + 1} / ${HOUSES.max}</b></div>
      <div class="drow"><span>建造后租金</span><b>${fmt(Math.round(b.price * 0.1) * HOUSES.mult[houses + 1] * 2)}</b></div>
      <div class="drow"><span>当前现金</span><b>${fmt(p.cash)}</b></div>
    </div>
    <div class="dlg-actions">
      ${p.cash >= cost ? dlgBtn('build-yes', '建 造', 'dlg-btn-buy') : ''}
      ${dlgBtn('build-no', '以后再说', 'dlg-btn-skip')}
    </div>`);
  dlgHandlers['build-yes'] = () => { doBuild(p, i, cost); state.phase = 'idle'; refreshAll(); saveGame(); maybeAI(); };
  dlgHandlers['build-no'] = () => { closeDialog(); };
}
function doBuild(p, i, cost) {
  p.cash -= cost;
  p.props[i] = (p.props[i] || 0) + 1;
  addLog(`🏗 ${p.name} 在 ${BOARD[i].name} 建造了第 ${p.props[i]} 栋房（-${fmt(cost)}）`, 'good');
}

/* ---------- 游戏结束 ---------- */
function showGameOver(winner) {
  const rank = state.players.slice().sort((a, b) => totalAssets(b) - totalAssets(a));
  const rows = rank.map((p, i) => `
    <tr>
      <td class="${i === 0 ? 'r1' : ''}">${i + 1}</td>
      <td><span class="pcard-token" style="background:${p.tokenColorCss};width:22px;height:22px;font-size:12px;display:inline-flex">${TOKENS[p.tokenIdx].emoji}</span> ${p.name}${p.isAI ? ' 🤖' : ''}</td>
      <td>${p.bankrupt ? '已破产' : fmt(p.cash)}</td>
      <td>${Object.keys(p.props).length}</td>
      <td class="${i === 0 ? 'r1' : ''}">${fmt(totalAssets(p))}</td>
    </tr>`).join('');
  state.phase = 'over';
  $('btn-roll').disabled = true;
  showDialog(`
    <div class="dlg-title">🏆 游戏结束</div>
    <div class="dlg-sub">${winner ? `${winner.name} 成为最后的大富翁！` : '排行如下'}</div>
    <table class="final-table">
      <tr><th>#</th><th>玩家</th><th>现金</th><th>地产</th><th>身家</th></tr>
      ${rows}
    </table>
    <div class="dlg-actions">${dlgBtn('over-again', '再来一局', 'btn-primary')}</div>`);
  dlgHandlers['over-again'] = () => {
    closeDialog();
    clearSave();
    location.reload();
  };
}

/* ---------- 整体刷新 ---------- */
function renderAll() {
  renderPlayers();
  renderEstates();
  renderLog();
  updateTurnBanner();
  drawMinimap();
}
function refreshAll() { renderAll(); saveGame(); }

/* ---------- 开局设置 ---------- */
let setupCount = 2;
function buildSetup() {
  const seg = $('player-count');
  seg.innerHTML = '';
  for (let n = 2; n <= 8; n++) {
    const b = document.createElement('button');
    b.className = 'seg-item' + (n === setupCount ? ' active' : '');
    b.textContent = n;
    b.onclick = () => { setupCount = n; buildSetup(); };
    seg.appendChild(b);
  }
  const box = $('player-configs');
  box.innerHTML = '';
  for (let i = 0; i < setupCount; i++) {
    const t = TOKENS[i];
    const row = document.createElement('div');
    row.className = 'pconf';
    row.innerHTML = `
      <span class="token-preview" style="background:${t.color}">${t.emoji}</span>
      <input class="pname" maxlength="8" value="${i === 0 ? '小猪' : t.name + (i + 1)}" placeholder="玩家 ${i + 1} 名字">
      <span class="ptype">
        <button class="ptype-btn active-human" data-i="${i}">玩家</button>
        <button class="ptype-btn" data-i="${i}">人机</button>
      </span>`;
    box.appendChild(row);
  }
  box.querySelectorAll('.ptype-btn').forEach(btn => {
    btn.onclick = () => {
      const i = btn.dataset.i;
      const human = btn.textContent === '玩家';
      box.querySelectorAll(`.ptype-btn[data-i="${i}"]`).forEach((b, k) => {
        b.classList.toggle('active-human', k === 0 && human);
        b.classList.toggle('active-ai', k === 1 && !human);
      });
    };
  });
}
function collectSetup() {
  const names = [...$('player-configs').querySelectorAll('.pname')].map(x => x.value.trim() || '无名玩家');
  const cfgs = names.map((name, i) => {
    const isHuman = $('player-configs').querySelector(`.ptype-btn[data-i="${i}"]`).classList.contains('active-human');
    return { name: name.slice(0, 8), tokenIdx: i, isAI: !isHuman };
  });
  return cfgs;
}

/* ---------- 进入 / 恢复对局 ---------- */
function enterGame(st) {
  state = st;
  state.players.forEach(p => { p.tokenColorCss = TOKENS[p.tokenIdx].color; });
  if (!state.log) state.log = [];
  if (!state.owners) state.owners = {};
  if (!state.deck) state.deck = { chance: 0, fate: 0 };
  if (!state.pot) state.pot = 0;
  $('setup-modal').classList.add('hidden');
  $('resume-modal').classList.add('hidden');
  $('app').classList.remove('hidden');
  resizeStage();
  // 视角落到当前玩家
  const p = cp();
  if (p) { const r = tileRect(p.pos); view.x = view.tx = r.x + CELL / 2; view.y = view.ty = r.y + CELL / 2; }
  renderAll();
  addLog(`🎮 对局继续 · 轮到 ${cp().name}${cp().isAI ? '（人机）' : ''}`, 'sys');
  if (st.resumeTile) {
    st.resumeTile = null;
    resolveStanding(st.players[st.turnIdx]);
  }
  maybeAI();
}

/* 恢复存档后补完停留格事件 */
function resolveStanding(p) {
  if (!p || p.bankrupt || state.phase === 'over') return;
  if (p.inJail) { state.phase = 'dialog'; showJailDialog(); return; }
  const i = p.pos, b = BOARD[i];
  if (b.t === 'prop' || b.t === 'station') {
    const oid = state.owners[i];
    if (oid == null && p.cash >= b.price) { showBuyDialog(i); return; }
  }
}

function tryResume() {
  const save = loadSave();
  if (!save) { startFresh(); return; }
  saveMeta = save;
  const cur = save.players[save.turnIdx] || save.players[0];
  const alive = save.players.filter(p => !p.bankrupt).length;
  $('resume-info').textContent =
    `玩家 ${save.players.length} 人（存活 ${alive}）· 第 ${save.round} 回合\n当前轮到：${cur ? cur.name : '-'}${cur && cur.isAI ? '（人机）' : ''}\n保存时间：${new Date(save.createdAt || Date.now()).toLocaleString('zh-CN')}`;
  $('resume-modal').classList.remove('hidden');
}
function startFresh() {
  $('resume-modal').classList.add('hidden');
  $('setup-modal').classList.remove('hidden');
  buildSetup();
}

/* ---------- 菜单 ---------- */
function initMenu() {
  $('btn-menu').onclick = () => $('menu-drawer').classList.toggle('hidden');
  $('menu-close').onclick = () => $('menu-drawer').classList.add('hidden');
  $('menu-save').onclick = () => { saveGame(); $('menu-drawer').classList.add('hidden'); flashBanner('已保存'); };
  $('menu-restart').onclick = () => {
    if (!confirm('确定重新开始？当前进度将被清除。')) return;
    clearSave(); location.reload();
  };
  $('menu-wipe').onclick = () => {
    if (!confirm('确定清空存档并回到开局设置？')) return;
    clearSave(); location.reload();
  };
}
function flashBanner(msg) {
  const el = $('turn-text'), old = el.textContent;
  el.textContent = msg;
  setTimeout(() => { el.textContent = old; }, 1200);
}

function startGame(cfg) {
  const st = newGame(cfg);
  enterGame(st);
  if (st.players.length) {
    st.log.push({ t: Date.now(), text: `🎮 新对局开始！${cfg.length} 名玩家入场`, cls: 'gold' });
    saveGame(); renderAll();
    maybeAI();
  }
}

/* ---------- 启动 ---------- */
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  // 存档恢复
  $('btn-resume').onclick = () => { if (saveMeta) enterGame(saveMeta); };
  $('btn-newgame').onclick = () => { clearSave(); startFresh(); };
  $('btn-start').onclick = () => {
    const cfg = collectSetup();
    clearSave();
    const st = newGame(cfg);
    enterGame(st);
    st.log.push({ t: Date.now(), text: `🎮 新对局开始！${cfg.length} 名玩家入场`, cls: 'gold' });
    saveGame(); renderAll();
    maybeAI();
  };
  $('btn-roll').onclick = onRoll;
  initMenu();
  buildSetup();
  resizeStage();
  tryResume();
}
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
})();
