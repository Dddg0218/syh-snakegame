"use strict";

/* =========================================================
   贪吃蛇 · 网页版 v2
   玩法：吃果实变长，躲开石墙、NPC 蛇和自己。
   反击：Shift 冲刺撕咬（3 格无敌，可撞死 NPC）
         E 蛇蜕陷阱（留下身体，NPC 撞上会死）
   ========================================================= */

var canvas = document.getElementById("game-canvas");
var ctx = canvas.getContext("2d");

var CELL = 25;
var COLS = canvas.width / CELL;
var ROWS = canvas.height / CELL;
var BEST_KEY = "syh-snake-best-v3";
var SETTINGS_KEY = "syh-snake-settings-v3";

var DIFFICULTY = {
  easy:   { tick: 152, npcSpeed: 3, clusters: 2, npcMax: 2, powerup: 8000,  label: "轻松" },
  normal: { tick: 118, npcSpeed: 2, clusters: 3, npcMax: 3, powerup: 9000,  label: "普通" },
  hard:   { tick: 92,  npcSpeed: 1, clusters: 4, npcMax: 4, powerup: 11000, label: "困难" }
};

var DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

var POWERUPS = {
  grow: { color: "#ffcf4d", glyph: "x2" },
  slow: { color: "#63b8ff", glyph: "~" },
  shield: { color: "#c48bff", glyph: "+" },
  shrink: { color: "#5fe6c4", glyph: "2" }
};

var el = {
  landing: document.getElementById("landing-screen"),
  play: document.getElementById("play-screen"),
  overlay: document.getElementById("board-overlay"),
  overlayKicker: document.getElementById("overlay-kicker"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayButton: document.getElementById("overlay-button"),
  status: document.getElementById("game-status"),
  score: document.getElementById("score-value"),
  best: document.getElementById("best-value"),
  level: document.getElementById("level-value"),
  kills: document.getElementById("kill-value"),
  chips: document.getElementById("effect-chips"),
  dashFill: document.getElementById("dash-fill"),
  moltFill: document.getElementById("molt-fill"),
  startButton: document.getElementById("start-button"),
  homeButton: document.getElementById("home-button"),
  restartButton: document.getElementById("restart-button"),
  sfxToggle: document.getElementById("sfx-toggle"),
  sfxText: document.getElementById("sfx-text")
};

var settings = loadSettings();

var G = {
  status: "ready",
  snake: [],
  dir: DIRS.right,
  queue: [],
  npcs: [],
  walls: new Set(),
  traps: [],
  food: null,
  powerups: [],
  particles: [],
  score: 0,
  best: readBest(),
  level: 1,
  eaten: 0,
  kills: 0,
  effects: { slow: 0, shield: 0 },
  cooldown: { dash: 0, molt: 0 },
  dashGlow: 0,
  timer: null,
  raf: null,
  lastFrame: 0,
  tickCount: 0,
  spawnTimer: 0,
  shake: 0,
  flash: 0,
  chipTimer: 0
};

el.best.textContent = pad(G.best);
resizeCanvasForDpr();
window.SYH_SNAKE = G;
window.SYH_SETTINGS = settings;

/* ---------------- 设置 ---------------- */

function loadSettings() {
  var base = { difficulty: "normal", track: "chill", music: true, sfx: true };
  try {
    var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      difficulty: DIFFICULTY[raw.difficulty] ? raw.difficulty : base.difficulty,
      track: raw.track || base.track,
      music: raw.music !== false,
      sfx: raw.sfx !== false
    };
  } catch (error) {
    return base;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) { /* ignore */ }
}

function syncSettingsUI() {
  document.querySelectorAll("[data-setting]").forEach(function (group) {
    var key = group.dataset.setting;
    var value = key === "track" ? (settings.music ? settings.track : "off") : settings.difficulty;
    group.querySelectorAll("button").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.dataset.value === value);
    });
  });
  if (el.sfxToggle) el.sfxToggle.checked = settings.sfx;
  if (el.sfxText) el.sfxText.textContent = settings.sfx ? "开启" : "关闭";
}

document.querySelectorAll("[data-setting]").forEach(function (group) {
  group.addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var key = group.dataset.setting;
    if (key === "difficulty") {
      settings.difficulty = btn.dataset.value;
    } else if (key === "track") {
      if (btn.dataset.value === "off") {
        settings.music = false;
      } else {
        settings.music = true;
        settings.track = btn.dataset.value;
        SnakeAudio.setTrack(settings.track);
      }
      SnakeAudio.setMusic(settings.music);
    }
    saveSettings();
    syncSettingsUI();
    SnakeAudio.resume();
  });
});

if (el.sfxToggle) {
  el.sfxToggle.addEventListener("change", function () {
    settings.sfx = el.sfxToggle.checked;
    SnakeAudio.setSfx(settings.sfx);
    saveSettings();
    syncSettingsUI();
  });
}

/* ---------------- 启动 / 暂停 / 结束 ---------------- */

el.startButton.addEventListener("click", openGame);
el.homeButton.addEventListener("click", returnHome);
el.restartButton.addEventListener("click", startGame);
el.overlayButton.addEventListener("click", function () {
  if (G.status === "paused") resumeGame();
  else startGame();
});

document.addEventListener("keydown", handleKeydown);
document.querySelectorAll("[data-direction]").forEach(function (button) {
  button.addEventListener("click", function () { queueDirection(button.dataset.direction); });
});
document.querySelectorAll("[data-action]").forEach(function (button) {
  button.addEventListener("click", function () {
    if (button.dataset.action === "dash") tryDash();
    else molt();
  });
});
document.addEventListener("visibilitychange", function () {
  if (document.hidden && G.status === "running") pauseGame();
});

var touchStart = null;
canvas.addEventListener("touchstart", function (event) {
  var t = event.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
canvas.addEventListener("touchend", function (event) {
  if (!touchStart) return;
  var t = event.changedTouches[0];
  var dx = t.clientX - touchStart.x;
  var dy = t.clientY - touchStart.y;
  if (Math.abs(dx) + Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) queueDirection(dx > 0 ? "right" : "left");
  else queueDirection(dy > 0 ? "down" : "up");
  touchStart = null;
}, { passive: true });

function openGame() {
  el.landing.hidden = true;
  el.play.hidden = false;
  SnakeAudio.resume();
  SnakeAudio.start();
  startGame();
}

function returnHome() {
  stopGame();
  G.status = "ready";
  el.play.hidden = true;
  el.landing.hidden = false;
}

function startGame() {
  stopGame();
  var cx = Math.floor(COLS / 2);
  var cy = Math.floor(ROWS / 2);

  G.snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy }
  ];
  G.dir = DIRS.right;
  G.queue = [];
  G.score = 0;
  G.level = 1;
  G.eaten = 0;
  G.kills = 0;
  G.effects = { slow: 0, shield: 0 };
  G.cooldown = { dash: 0, molt: 0 };
  G.powerups = [];
  G.traps = [];
  G.particles = [];
  G.tickCount = 0;
  G.spawnTimer = DIFFICULTY[settings.difficulty].powerup;
  G.shake = 0;
  G.flash = 0;
  G.status = "running";

  buildLevel(1);
  G.food = randomFreeCell();
  el.score.textContent = pad(G.score);
  el.level.textContent = "01";
  el.kills.textContent = "0";
  updateChips();
  updateAbilities();

  hideOverlay();
  setStatus("PLAYING");
  scheduleTick();
  startRender();
  SnakeAudio.play("start");
}

function pauseGame() {
  if (G.status !== "running") return;
  stopTimer();
  G.status = "paused";
  setStatus("PAUSED");
  showOverlay("TAKE A BREATH", "游戏已暂停", "继续游戏", "resume");
}

function resumeGame() {
  if (G.status !== "paused") return;
  G.status = "running";
  hideOverlay();
  setStatus("PLAYING");
  scheduleTick();
  startRender();
}

function endGame(reason) {
  stopTimer();
  G.status = "over";
  G.flash = 1;
  G.shake = 16;
  setStatus("GAME OVER");
  SnakeAudio.play("die");
  if (G.score > G.best) {
    G.best = G.score;
    el.best.textContent = pad(G.best);
    writeBest(G.best);
  }
  var titles = {
    wall: "撞上石墙了",
    self: "咬到自己了",
    npc: "被 NPC 蛇撞了",
    npcHead: "和 NPC 撞了个正着"
  };
  showOverlay("GAME OVER", titles[reason] || "再来一局", "再玩一次", "restart");
}

function stopGame() {
  stopTimer();
  stopRender();
}

/* ---------------- 关卡 ---------------- */

function buildLevel(level) {
  var diff = DIFFICULTY[settings.difficulty];
  G.walls = new Set();
  var baseX = Math.floor(COLS / 2);
  var baseY = Math.floor(ROWS / 2);

  var clusters = diff.clusters + Math.min(2, level - 1);
  for (var c = 0; c < clusters; c += 1) {
    var cx = 3 + Math.floor(Math.random() * (COLS - 6));
    var cy = 3 + Math.floor(Math.random() * (ROWS - 6));
    var size = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < size; i += 1) {
      for (var j = 0; j < size; j += 1) {
        var x = cx + i;
        var y = cy + j;
        if (Math.abs(x - baseX) < 4 && Math.abs(y - baseY) < 2) continue;
        var tooClose = G.snake.some(function (part) {
          return Math.abs(part.x - x) < 2 && Math.abs(part.y - y) < 2;
        });
        if (tooClose) continue;
        G.walls.add(key(x, y));
      }
    }
  }

  G.npcs = [];
  var npcCount = Math.min(diff.npcMax, 1 + Math.floor((level - 1) / 2));
  for (var n = 0; n < npcCount; n += 1) {
    G.npcs.push(makeNpc(n));
  }
}

function makeNpc(index) {
  var diff = DIFFICULTY[settings.difficulty];
  var spot = randomFreeCell(4) || { x: 2, y: 2 };
  var dir = Object.values(DIRS)[Math.floor(Math.random() * 4)];
  var cells = [];
  for (var k = 0; k < 4; k += 1) {
    cells.push({ x: wrapX(spot.x - dir.x * k), y: wrapY(spot.y - dir.y * k) });
  }
  return {
    cells: cells,
    dir: dir,
    color: index === 0 ? "#7bd1ff" : (index === 1 ? "#ffb86b" : "#ff8fb1"),
    speed: diff.npcSpeed,
    deadUntil: 0
  };
}

/* ---------------- 主循环 ---------------- */

function scheduleTick() {
  stopTimer();
  var base = DIFFICULTY[settings.difficulty].tick;
  var delay = G.effects.slow > 0 ? base * 1.65 : base;
  G.timer = window.setTimeout(function () {
    if (G.status !== "running") return;
    step();
    if (G.status === "running") scheduleTick();
  }, delay);
}

function step() {
  if (G.queue.length > 0) G.dir = G.queue.shift();

  var head = G.snake[0];
  var next = { x: wrapX(head.x + G.dir.x), y: wrapY(head.y + G.dir.y) };
  var shielded = G.effects.shield > 0;

  if (!shielded && G.walls.has(key(next.x, next.y))) {
    endGame("wall");
    return;
  }
  if (!shielded && G.snake.slice(0, -1).some(function (part) { return part.x === next.x && part.y === next.y; })) {
    endGame("self");
    return;
  }
  if (!shielded && npcAt(next) >= 0) {
    endGame("npc");
    return;
  }

  G.snake.unshift(next);
  eatAt(next);

  G.tickCount += 1;
  G.npcs.forEach(function (npc) { stepNpc(npc); });

  // 陷阱到期
  var now = performance.now();
  G.traps = G.traps.filter(function (t) { return t.until > now; });
}

function eatAt(cell) {
  if (G.food && cell.x === G.food.x && cell.y === G.food.y) {
    burst(cell.x, cell.y, "#ff765e", 14);
    G.score += 10;
    G.eaten += 1;
    SnakeAudio.play("eat");
    el.score.textContent = pad(G.score);
    G.food = randomFreeCell();
    if (G.eaten % 5 === 0) {
      G.level += 1;
      el.level.textContent = String(G.level).padStart(2, "0");
      buildLevel(G.level);
      setStatus("LEVEL " + G.level);
      SnakeAudio.play("level");
    }
  } else {
    G.snake.pop();
  }

  for (var i = G.powerups.length - 1; i >= 0; i -= 1) {
    var p = G.powerups[i];
    if (p.x === cell.x && p.y === cell.y) {
      applyPowerup(p.type);
      burst(p.x, p.y, POWERUPS[p.type].color, 18);
      G.powerups.splice(i, 1);
    }
  }
}

/* ---------------- NPC ---------------- */

function npcAt(cell) {
  for (var i = 0; i < G.npcs.length; i += 1) {
    var npc = G.npcs[i];
    if (npc.deadUntil > performance.now()) continue;
    if (npc.cells.some(function (part) { return part.x === cell.x && part.y === cell.y; })) return i;
  }
  return -1;
}

function stepNpc(npc) {
  var now = performance.now();
  if (npc.deadUntil > now) return;
  if (npc.deadUntil && npc.deadUntil <= now) {
    var fresh = makeNpc(G.npcs.indexOf(npc));
    npc.cells = fresh.cells;
    npc.dir = fresh.dir;
    npc.deadUntil = 0;
  }

  var head = npc.cells[0];
  var options = Object.values(DIRS).filter(function (d) {
    if (d.x === -npc.dir.x && d.y === -npc.dir.y) return false;
    var nx = wrapX(head.x + d.x);
    var ny = wrapY(head.y + d.y);
    if (G.walls.has(key(nx, ny))) return false;
    if (npc.cells.some(function (p) { return p.x === nx && p.y === ny; })) return false;
    return true;
  });

  if (!options.length) return;

  var picked = options[Math.floor(Math.random() * options.length)];
  var playerHead = G.snake[0];
  if (Math.random() < 0.5) {
    picked = options.reduce(function (best, d) {
      var bx = wrapX(head.x + best.x);
      var by = wrapY(head.y + best.y);
      var dx = wrapX(head.x + d.x);
      var dy = wrapY(head.y + d.y);
      var bd = Math.abs(bx - playerHead.x) + Math.abs(by - playerHead.y);
      var dd = Math.abs(dx - playerHead.x) + Math.abs(dy - playerHead.y);
      return dd < bd ? d : best;
    }, picked);
  }

  npc.dir = picked;
  var nx = wrapX(head.x + picked.x);
  var ny = wrapY(head.y + picked.y);

  // NPC 撞陷阱 / 撞玩家身体 -> 死
  var hitTrap = G.traps.some(function (t) { return t.x === nx && t.y === ny; });
  var hitPlayer = G.snake.some(function (part) { return part.x === nx && part.y === ny; });

  if (hitTrap || hitPlayer) {
    killNpc(G.npcs.indexOf(npc), nx, ny);
    return;
  }

  npc.cells.unshift({ x: nx, y: ny });
  npc.cells.pop();
}

function killNpc(index, x, y) {
  var npc = G.npcs[index];
  if (!npc) return;
  npc.deadUntil = performance.now() + 3800;
  npc.cells = [];
  G.kills += 1;
  G.score += 30;
  el.kills.textContent = String(G.kills);
  el.score.textContent = pad(G.score);
  burst(x, y, npc.color, 22);
  G.shake = 8;
  SnakeAudio.play("kill");
}

/* ---------------- 技能 ---------------- */

function tryDash() {
  if (G.status !== "running" || G.cooldown.dash > 0) return;
  G.cooldown.dash = 4200;
  G.dashGlow = 1;
  SnakeAudio.play("dash");
  var moved = 0;

  for (var i = 0; i < 3; i += 1) {
    var head = G.snake[0];
    var next = { x: wrapX(head.x + G.dir.x), y: wrapY(head.y + G.dir.y) };
    if (G.walls.has(key(next.x, next.y))) break;
    if (G.snake.some(function (p) { return p.x === next.x && p.y === next.y; })) break;

    var idx = npcAt(next);
    if (idx >= 0) killNpc(idx, next.x, next.y);

    G.snake.unshift(next);
    eatAt(next);
    burst(next.x, next.y, "#d4ff8a", 5);
    moved += 1;
  }

  if (!moved) G.shake = 3;
  updateAbilities();
}

function molt() {
  if (G.status !== "running" || G.cooldown.molt > 0) return;
  if (G.snake.length < 5) return;
  var tail = G.snake[G.snake.length - 1];
  G.traps.push({ x: tail.x, y: tail.y, until: performance.now() + 9000 });
  G.snake.pop();
  G.snake.pop();
  G.cooldown.molt = 7200;
  el.score.textContent = pad(G.score);
  SnakeAudio.play("molt");
  burst(tail.x, tail.y, "#8fd6a8", 10);
  updateAbilities();
}

function applyPowerup(type) {
  if (type === "grow") {
    var extra = Math.min(G.snake.length, 40);
    for (var i = 0; i < extra; i += 1) {
      G.snake.push({ x: G.snake[G.snake.length - 1].x, y: G.snake[G.snake.length - 1].y });
    }
    G.score += 25;
  } else if (type === "shrink") {
    var keep = Math.max(3, Math.ceil(G.snake.length / 2));
    G.snake = G.snake.slice(0, keep);
    G.score += 15;
  } else if (type === "slow") {
    G.effects.slow = 6000;
  } else if (type === "shield") {
    G.effects.shield = 6000;
  }
  el.score.textContent = pad(G.score);
  SnakeAudio.play("power");
  updateChips();
}

function spawnPowerup() {
  var types = Object.keys(POWERUPS);
  var type = types[Math.floor(Math.random() * types.length)];
  var cell = randomFreeCell();
  if (!cell) return;
  G.powerups.push({ x: cell.x, y: cell.y, type: type });
  if (G.powerups.length > 2) G.powerups.shift();
}

function queueDirection(name) {
  if (G.status !== "running" || !DIRS[name]) return;
  var previous = G.queue.length ? G.queue[G.queue.length - 1] : G.dir;
  var next = DIRS[name];
  if (next.x === -previous.x && next.y === -previous.y) return;
  if (next.x === previous.x && next.y === previous.y) return;
  if (G.queue.length < 2) G.queue.push(next);
}

function handleKeydown(event) {
  var map = {
    arrowup: "up", w: "up",
    arrowdown: "down", s: "down",
    arrowleft: "left", a: "left",
    arrowright: "right", d: "right"
  };
  var name = map[event.key.toLowerCase()];
  if (name) {
    if (!el.play.hidden) {
      event.preventDefault();
      queueDirection(name);
    }
    return;
  }

  if (el.play.hidden) return;

  if (event.key === "Shift") {
    event.preventDefault();
    tryDash();
    return;
  }
  if (event.key.toLowerCase() === "e") {
    event.preventDefault();
    molt();
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (G.status === "running") pauseGame();
    else if (G.status === "paused") resumeGame();
    else if (G.status === "over") startGame();
  }
}

/* ---------------- 渲染 ---------------- */

function startRender() {
  if (G.raf) return;
  G.lastFrame = performance.now();
  var frame = function (now) {
    var dt = Math.min(50, now - G.lastFrame);
    G.lastFrame = now;
    tickEffects(dt);
    draw(now);
    G.raf = window.requestAnimationFrame(frame);
  };
  G.raf = window.requestAnimationFrame(frame);
}

function stopRender() {
  if (G.raf) {
    window.cancelAnimationFrame(G.raf);
    G.raf = null;
  }
}

function tickEffects(dt) {
  if (G.effects.slow > 0) G.effects.slow = Math.max(0, G.effects.slow - dt);
  if (G.effects.shield > 0) G.effects.shield = Math.max(0, G.effects.shield - dt);
  if (G.cooldown.dash > 0) G.cooldown.dash = Math.max(0, G.cooldown.dash - dt);
  if (G.cooldown.molt > 0) G.cooldown.molt = Math.max(0, G.cooldown.molt - dt);
  if (G.dashGlow > 0) G.dashGlow = Math.max(0, G.dashGlow - dt * 0.004);

  if (G.status === "running") {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      spawnPowerup();
      G.spawnTimer = DIFFICULTY[settings.difficulty].powerup + Math.random() * 4000;
    }
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 0.06);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 0.003);

  G.chipTimer -= dt;
  if (G.chipTimer <= 0) {
    G.chipTimer = 120;
    updateChips();
    updateAbilities();
  }

  for (var i = G.particles.length - 1; i >= 0; i -= 1) {
    var p = G.particles[i];
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}

function draw(now) {
  ctx.save();
  if (G.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }

  ctx.fillStyle = "#0e150e";
  ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

  ctx.strokeStyle = "rgba(150, 220, 120, 0.07)";
  ctx.lineWidth = 1;
  for (var gx = 0; gx <= COLS; gx += 1) {
    ctx.beginPath();
    ctx.moveTo(gx * CELL, 0);
    ctx.lineTo(gx * CELL, canvas.height);
    ctx.stroke();
  }
  for (var gy = 0; gy <= ROWS; gy += 1) {
    ctx.beginPath();
    ctx.moveTo(0, gy * CELL);
    ctx.lineTo(canvas.width, gy * CELL);
    ctx.stroke();
  }

  G.walls.forEach(function (k) {
    var parts = k.split(",");
    var x = Number(parts[0]);
    var y = Number(parts[1]);
    ctx.fillStyle = "#1d2a1c";
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = "rgba(120, 160, 110, 0.25)";
    ctx.strokeRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3);
  });

  G.traps.forEach(function (t) {
    var alpha = 0.35 + Math.sin(now / 200) * 0.15;
    ctx.fillStyle = "rgba(143, 214, 168, " + alpha * 0.5 + ")";
    ctx.fillRect(t.x * CELL + 4, t.y * CELL + 4, CELL - 8, CELL - 8);
    ctx.strokeStyle = "rgba(143, 214, 168, " + alpha + ")";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(t.x * CELL + 3.5, t.y * CELL + 3.5, CELL - 7, CELL - 7);
    ctx.setLineDash([]);
  });

  if (G.food) {
    var pulse = 0.5 + Math.sin(now / 260) * 0.08;
    ctx.fillStyle = "#ff765e";
    ctx.beginPath();
    ctx.arc(G.food.x * CELL + CELL / 2, G.food.y * CELL + CELL / 2, CELL * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 118, 94, 0.35)";
    ctx.beginPath();
    ctx.arc(G.food.x * CELL + CELL / 2, G.food.y * CELL + CELL / 2, CELL * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }

  G.powerups.forEach(function (p) {
    var meta = POWERUPS[p.type];
    var cx = p.x * CELL + CELL / 2;
    var cy = p.y * CELL + CELL / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now / 600);
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0e150e";
    ctx.font = "600 9px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(meta.glyph, cx, cy + 0.5);
  });

  G.npcs.forEach(function (npc) {
    if (!npc.cells.length) return;
    npc.cells.forEach(function (part, index) {
      ctx.fillStyle = index === 0 ? npc.color : hexA(npc.color, 0.72);
      roundRect(part.x * CELL + 3, part.y * CELL + 3, CELL - 6, CELL - 6, index === 0 ? 7 : 5);
      ctx.fill();
    });
    var head = npc.cells[0];
    ctx.fillStyle = "#0e150e";
    ctx.beginPath();
    ctx.arc(head.x * CELL + CELL / 2 - 3, head.y * CELL + CELL / 2 - 3, 1.7, 0, Math.PI * 2);
    ctx.arc(head.x * CELL + CELL / 2 + 3, head.y * CELL + CELL / 2 - 3, 1.7, 0, Math.PI * 2);
    ctx.fill();
  });

  var shieldOn = G.effects.shield > 0;
  if (G.dashGlow > 0.02) {
    ctx.shadowColor = "#d4ff8a";
    ctx.shadowBlur = 18 * G.dashGlow;
  }
  G.snake.forEach(function (part, index) {
    var inset = index === 0 ? 2 : 3;
    ctx.fillStyle = index === 0 ? "#d4ff8a" : (shieldOn ? "#9fe8c4" : "#9ccb4d");
    roundRect(part.x * CELL + inset, part.y * CELL + inset, CELL - inset * 2, CELL - inset * 2, index === 0 ? 7 : 5);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  if (G.snake.length) drawEyes(G.snake[0]);

  G.particles.forEach(function (p) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  if (G.flash > 0) {
    ctx.fillStyle = "rgba(255, 90, 70, " + (G.flash * 0.35) + ")";
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
  }

  ctx.restore();
}

function drawEyes(head) {
  var cx = head.x * CELL + CELL / 2;
  var cy = head.y * CELL + CELL / 2;
  var sideways = G.dir.x === 0;
  ctx.fillStyle = "#26331c";
  [-1, 1].forEach(function (side) {
    var x = cx + (sideways ? side * 5 : G.dir.x * 6);
    var y = cy + (sideways ? G.dir.y * 6 : side * 5);
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.fill();
  });
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function burst(cx, cy, color, count) {
  var n = count || 12;
  for (var i = 0; i < n; i += 1) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 1 + Math.random() * 2.4;
    G.particles.push({
      x: cx * CELL + CELL / 2,
      y: cy * CELL + CELL / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      life: 380 + Math.random() * 260,
      max: 640,
      color: color
    });
  }
}

function hexA(hex, alpha) {
  var n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
}

/* ---------------- 界面 ---------------- */

function showOverlay(kicker, title, buttonText, action) {
  el.overlayKicker.textContent = kicker;
  el.overlayTitle.textContent = title;
  el.overlayButton.innerHTML = buttonText + ' <span aria-hidden="true">→</span>';
  el.overlayButton.dataset.action = action;
  el.overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  el.overlay.classList.add("is-hidden");
}

function setStatus(text) {
  el.status.textContent = text;
}

function updateChips() {
  if (!el.chips) return;
  var html = "";
  if (G.effects.shield > 0) {
    html += '<span class="effect-chip chip-shield">无敌 ' + (G.effects.shield / 1000).toFixed(1) + "s</span>";
  }
  if (G.effects.slow > 0) {
    html += '<span class="effect-chip chip-slow">减速 ' + (G.effects.slow / 1000).toFixed(1) + "s</span>";
  }
  if (el.chips.dataset.html !== html) {
    el.chips.innerHTML = html;
    el.chips.dataset.html = html;
  }
}

function updateAbilities() {
  var dashMax = 4200;
  var moltMax = 7200;
  if (el.dashFill) {
    var ready = Math.max(0, 1 - G.cooldown.dash / dashMax);
    el.dashFill.style.transform = "scaleX(" + ready.toFixed(3) + ")";
    el.dashFill.classList.toggle("is-ready", G.cooldown.dash <= 0);
  }
  if (el.moltFill) {
    var ready2 = Math.max(0, 1 - G.cooldown.molt / moltMax);
    el.moltFill.style.transform = "scaleX(" + ready2.toFixed(3) + ")";
    el.moltFill.classList.toggle("is-ready", G.cooldown.molt <= 0);
  }
}

/* ---------------- 工具 ---------------- */

function key(x, y) {
  return x + "," + y;
}

function wrapX(x) {
  return (x + COLS) % COLS;
}

function wrapY(y) {
  return (y + ROWS) % ROWS;
}

function randomFreeCell(minDistance) {
  var free = [];
  for (var y = 0; y < ROWS; y += 1) {
    for (var x = 0; x < COLS; x += 1) {
      if (G.walls.has(key(x, y))) continue;
      if (G.snake.some(function (p) { return p.x === x && p.y === y; })) continue;
      if (G.npcs.some(function (n) {
        return n.cells.some(function (p) { return p.x === x && p.y === y; });
      })) continue;
      if (G.traps.some(function (t) { return t.x === x && t.y === y; })) continue;
      if (G.food && G.food.x === x && G.food.y === y) continue;
      if (G.powerups.some(function (p) { return p.x === x && p.y === y; })) continue;
      if (minDistance) {
        var head = G.snake[0];
        if (head && Math.abs(head.x - x) + Math.abs(head.y - y) < minDistance) continue;
      }
      free.push({ x: x, y: y });
    }
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function pad(value) {
  return String(value).padStart(3, "0");
}

function readBest() {
  try {
    var v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (error) {
    return 0;
  }
}

function writeBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch (error) { /* ignore */ }
}

function stopTimer() {
  if (G.timer !== null) {
    window.clearTimeout(G.timer);
    G.timer = null;
  }
}

function resizeCanvasForDpr() {
  canvas.width = 600;
  canvas.height = 600;
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  draw(performance.now());
}

syncSettingsUI();
SnakeAudio.setSfx(settings.sfx);
