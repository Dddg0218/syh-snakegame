"use strict";

const landingScreen = document.getElementById("landing-screen");
const playScreen = document.getElementById("play-screen");
const canvas = document.getElementById("game-canvas");
const context = canvas.getContext("2d");
const boardOverlay = document.getElementById("board-overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayButton = document.getElementById("overlay-button");
const gameStatus = document.getElementById("game-status");
const scoreValue = document.getElementById("score-value");
const bestValue = document.getElementById("best-value");

const cellSize = 25;
const columns = canvas.width / cellSize;
const rows = canvas.height / cellSize;
const tickDelay = 115;
const highScoreKey = "snake-game-high-score";
const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let snake = [];
let food = { x: 0, y: 0 };
let direction = directions.right;
let turnQueue = [];
let score = 0;
let bestScore = readBestScore();
let gameState = "ready";
let gameTimer = null;

bestValue.textContent = formatScore(bestScore);
drawBoard();

document.getElementById("start-button").addEventListener("click", openGame);
document.getElementById("home-button").addEventListener("click", returnHome);
document.getElementById("restart-button").addEventListener("click", startGame);
overlayButton.addEventListener("click", () => {
  if (gameState === "paused") {
    resumeGame();
  } else {
    startGame();
  }
});

document.addEventListener("keydown", handleKeydown);

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => queueDirection(button.dataset.direction));
});

function openGame() {
  landingScreen.hidden = true;
  playScreen.hidden = false;
  startGame();
}

function returnHome() {
  stopTimer();
  gameState = "ready";
  playScreen.hidden = true;
  landingScreen.hidden = false;
}

function startGame() {
  stopTimer();
  const centerX = Math.floor(columns / 2);
  const centerY = Math.floor(rows / 2);
  snake = [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY },
  ];
  direction = directions.right;
  turnQueue = [];
  score = 0;
  scoreValue.textContent = formatScore(score);
  food = createFood();
  gameState = "running";
  hideOverlay();
  setStatus("PLAYING");
  drawBoard();
  gameTimer = window.setInterval(updateGame, tickDelay);
}

function pauseGame() {
  if (gameState !== "running") return;
  stopTimer();
  gameState = "paused";
  setStatus("PAUSED");
  showOverlay("TAKE A BREATH", "游戏已暂停", "继续游戏", "resume");
  drawBoard();
}

function resumeGame() {
  if (gameState !== "paused") return;
  gameState = "running";
  hideOverlay();
  setStatus("PLAYING");
  gameTimer = window.setInterval(updateGame, tickDelay);
}

function finishGame(won = false) {
  stopTimer();
  gameState = "over";
  setStatus(won ? "YOU WIN" : "GAME OVER");
  showOverlay(
    won ? "BOARD CLEARED" : "NICE TRY",
    won ? "你征服了整个棋盘！" : "再来一局，刷新纪录",
    "再玩一次",
    "restart",
  );
  drawBoard();
}

function updateGame() {
  if (turnQueue.length > 0) direction = turnQueue.shift();

  const head = snake[0];
  const nextHead = {
    x: (head.x + direction.x + columns) % columns,
    y: (head.y + direction.y + rows) % rows,
  };
  const willEat = nextHead.x === food.x && nextHead.y === food.y;
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);

  if (bodyToCheck.some((part) => part.x === nextHead.x && part.y === nextHead.y)) {
    finishGame();
    return;
  }

  snake.unshift(nextHead);
  if (willEat) {
    score += 10;
    scoreValue.textContent = formatScore(score);
    if (score > bestScore) {
      bestScore = score;
      bestValue.textContent = formatScore(bestScore);
      saveBestScore(bestScore);
    }

    const nextFood = findFood();
    if (nextFood === null) {
      finishGame(true);
      return;
    }
    food = nextFood;
  } else {
    snake.pop();
  }

  drawBoard();
}

function queueDirection(name) {
  if (gameState !== "running" || !directions[name]) return;

  const previous = turnQueue.length > 0 ? turnQueue[turnQueue.length - 1] : direction;
  const next = directions[name];
  if (next.x === -previous.x && next.y === -previous.y) return;
  if (next.x === previous.x && next.y === previous.y) return;
  if (turnQueue.length < 2) turnQueue.push(next);
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  const keyDirections = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
  };

  if (keyDirections[key]) {
    if (!playScreen.hidden) {
      event.preventDefault();
      queueDirection(keyDirections[key]);
    }
    return;
  }

  if (event.code === "Space" && !playScreen.hidden) {
    event.preventDefault();
    if (gameState === "running") pauseGame();
    else if (gameState === "paused") resumeGame();
    else if (gameState === "over") startGame();
  }
}

function createFood() {
  return findFood() ?? { x: 0, y: 0 };
}

function findFood() {
  const freeCells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) {
        freeCells.push({ x, y });
      }
    }
  }
  if (freeCells.length === 0) return null;
  return freeCells[Math.floor(Math.random() * freeCells.length)];
}

function drawBoard() {
  context.fillStyle = "#111810";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(195, 245, 106, 0.055)";
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += cellSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += cellSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  if (gameState === "ready") return;

  context.fillStyle = "#ff765e";
  context.beginPath();
  context.arc(
    food.x * cellSize + cellSize / 2,
    food.y * cellSize + cellSize / 2,
    cellSize * 0.34,
    0,
    Math.PI * 2,
  );
  context.fill();

  snake.forEach((part, index) => {
    const inset = index === 0 ? 2 : 3;
    context.fillStyle = index === 0 ? "#d4ff8a" : "#9ccb4d";
    roundedRect(
      context,
      part.x * cellSize + inset,
      part.y * cellSize + inset,
      cellSize - inset * 2,
      cellSize - inset * 2,
      index === 0 ? 7 : 5,
    );
    if (index === 0) drawSnakeEyes(part);
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawSnakeEyes(head) {
  const centerX = head.x * cellSize + cellSize / 2;
  const centerY = head.y * cellSize + cellSize / 2;
  const eyeOffset = direction.x === 0 ? 5 : 6;
  const eyeSpacing = direction.y === 0 ? 7 : 6;

  context.fillStyle = "#26331c";
  for (const side of [-1, 1]) {
    const x = centerX + (direction.x === 0 ? side * eyeSpacing : direction.x * eyeOffset);
    const y = centerY + (direction.y === 0 ? side * eyeSpacing : direction.y * eyeOffset);
    context.beginPath();
    context.arc(x, y, 1.8, 0, Math.PI * 2);
    context.fill();
  }
}

function showOverlay(kicker, title, buttonText, action) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayButton.innerHTML = `${buttonText} <span aria-hidden="true">→</span>`;
  overlayButton.dataset.action = action;
  boardOverlay.classList.remove("is-hidden");
}

function hideOverlay() {
  boardOverlay.classList.add("is-hidden");
}

function setStatus(status) {
  gameStatus.textContent = status;
}

function stopTimer() {
  if (gameTimer !== null) {
    window.clearInterval(gameTimer);
    gameTimer = null;
  }
}

function formatScore(value) {
  return String(value).padStart(3, "0");
}

function readBestScore() {
  try {
    const value = Number(window.localStorage.getItem(highScoreKey));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.warn("无法读取本地最高分记录。", error);
    return 0;
  }
}

function saveBestScore(value) {
  try {
    window.localStorage.setItem(highScoreKey, String(value));
  } catch (error) {
    console.warn("无法保存本地最高分记录。", error);
  }
}
