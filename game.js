// AssetSweeper - Phaser-based IT-flavored Minesweeper
const difficulties = {
  easy: { rows: 10, cols: 10, mineRate: 1 / 12, label: 'Easy' },
  medium: { rows: 16, cols: 16, mineRate: 1 / 10, label: 'Medium' },
  hard: { rows: 22, cols: 22, mineRate: 1 / 8, label: 'Hard' }
};

const numberColors = {
  1: '#27C686',
  2: '#FF8A00',
  3: '#FF5F3D',
  4: '#D1D3D3',
  5: '#F4F4F4',
  6: '#27C686',
  7: '#FF8A00',
  8: '#FF5F3D'
};

class AssetSweeperScene extends Phaser.Scene {
  constructor() {
    super('AssetSweeper');
    this.board = [];
    this.cells = [];
    this.flags = 0;
    this.mines = 0;
    this.revealedSafe = 0;
    this.timer = 0;
    this.timerEvent = null;
    this.powerState = { firewall: 1, scanner: 2, network: 2, undo: 3 };
    this.activePower = null;
    this.undoStack = [];
    this.firstMove = true;
    this.selection = { r: 0, c: 0 };
  }

  create() {
    this.cameras.main.setBackgroundColor('#393E46');
    this.buildInputHandlers();
  }

  buildInputHandlers() {
    // prevent default context menu for right-click tagging
    this.input.mouse.disableContextMenu();
    this.input.keyboard.on('keydown', this.handleKeyInput, this);
  }

  start(difficultyKey) {
    this.difficulty = difficulties[difficultyKey];
    this.resetState();
    this.createBoard();
    this.updateHUD();
  }

  resetState() {
    this.firstMove = true;
    this.flags = 0;
    this.undoStack = [];
    this.activePower = null;
    this.powerState = { firewall: 1, scanner: 2, network: 2, undo: 3 };
    this.timer = 0;
    if (this.timerEvent) this.timerEvent.remove(false);
    this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => {
      this.timer += 1;
      updateTimerLabel(this.timer);
    }});
  }

  createBoard() {
    const { rows, cols, mineRate } = this.difficulty;
    const totalTiles = rows * cols;
    const mineCount = Math.max(1, Math.floor(totalTiles * mineRate));
    this.mines = mineCount;
    this.revealedSafe = 0;

    this.board = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        r,
        c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0
      }))
    );

    this.placeMines(mineCount);
    this.countAllNeighbors();
    this.buildGridGraphics();
  }

  placeMines(count) {
    const positions = [];
    this.board.forEach(row => row.forEach(cell => positions.push(cell)));
    Phaser.Utils.Array.Shuffle(positions);
    for (let i = 0; i < count; i++) {
      positions[i].isMine = true;
    }
  }

  countAllNeighbors() {
    const dirs = [-1, 0, 1];
    this.board.forEach(row => row.forEach(cell => {
      let total = 0;
      dirs.forEach(dr => dirs.forEach(dc => {
        if (dr === 0 && dc === 0) return;
        const nr = cell.r + dr;
        const nc = cell.c + dc;
        if (this.inBounds(nr, nc) && this.board[nr][nc].isMine) total += 1;
      }));
      cell.neighborMines = total;
    }));
  }

  buildGridGraphics() {
    const { width, height } = this.scale.gameSize;
    const { rows, cols } = this.difficulty;
    const margin = 24;
    const usableWidth = width - margin * 2;
    const usableHeight = height - margin * 2;
    const tileSize = Math.min(40, Math.floor(Math.min(usableWidth / cols, usableHeight / rows)));
    const offsetX = (width - cols * tileSize) / 2;
    const offsetY = (height - rows * tileSize) / 2;

    if (this.cells) {
      this.cells.forEach(row => row.forEach(cell => cell.container.destroy()));
    }
    this.cells = Array.from({ length: rows }, () => []);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = offsetX + c * tileSize + tileSize / 2;
        const y = offsetY + r * tileSize + tileSize / 2;
    const rect = this.add.rectangle(x, y, tileSize - 4, tileSize - 4, 0x4b5057)
      .setStrokeStyle(1, 0xd1d3d3, 0.6)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, '', { fontFamily: 'Inter', fontSize: `${tileSize * 0.5}px`, color: '#393e46' })
      .setOrigin(0.5);
    const highlight = this.add.rectangle(x, y, tileSize - 6, tileSize - 6, 0xffffff, 0)
      .setStrokeStyle(1, 0xff8a00, 0.35);

        const containerObj = this.add.container(0, 0, [rect, text, highlight]);
        containerObj.depth = 1;

        rect.on('pointerdown', (pointer) => this.handlePointerDown(pointer, r, c));
        rect.on('pointerup', (pointer) => this.handlePointerUp(pointer, r, c));
        rect.on('pointerout', () => this.cancelLongPress());

        this.cells[r][c] = { rect, text, highlight, container: containerObj, tileSize };
      }
    }
    this.redrawBoardState();
    this.updateSelectionHighlight();
  }

  redrawBoardState() {
    this.board?.forEach(row => row.forEach(cell => {
      const visuals = this.cells[cell.r][cell.c];
      if (cell.isFlagged) {
        visuals.text.setText('⚠');
        visuals.text.setColor('#ff5f3d');
        visuals.rect.setFillStyle(0xfff1e0).setStrokeStyle(1, 0xff8a00, 0.6);
      } else if (cell.isRevealed) {
        visuals.rect.setFillStyle(0xf4f4f4).setStrokeStyle(1.5, 0xff8a00, 0.65);
        if (cell.isMine) {
          visuals.text.setText('💥');
        } else if (cell.neighborMines > 0) {
          visuals.text.setText(cell.neighborMines.toString());
          visuals.text.setColor(numberColors[cell.neighborMines] || '#393e46');
        } else {
          visuals.text.setText('');
        }
      } else {
        visuals.text.setText('');
        visuals.rect.setFillStyle(0x4b5057).setStrokeStyle(1, 0xd1d3d3, 0.6);
      }
    }));
  }

  inBounds(r, c) {
    return r >= 0 && c >= 0 && r < this.board.length && c < this.board[0].length;
  }

  handlePointerDown(pointer, r, c) {
    if (pointer.rightButtonDown()) {
      this.toggleFlag(r, c);
      return;
    }
    this.pressTime = this.time.now;
    this.longPressTimer = this.time.delayedCall(400, () => {
      this.toggleFlag(r, c);
      this.longPressTimer = null;
    });
  }

  handlePointerUp(pointer, r, c) {
    if (this.longPressTimer) {
      this.longPressTimer.remove(false);
      this.longPressTimer = null;
      if (pointer.rightButtonDown()) return; // already handled by context menu disable
      this.onRevealRequest(r, c);
    }
  }

  cancelLongPress() {
    if (this.longPressTimer) {
      this.longPressTimer.remove(false);
      this.longPressTimer = null;
    }
  }

  onRevealRequest(r, c) {
    if (this.activePower === 'scanner') {
      this.usePortScanner(r, c);
      return;
    }
    this.revealTile(r, c);
  }

  toggleFlag(r, c) {
    const cell = this.board[r][c];
    if (cell.isRevealed) return;
    cell.isFlagged = !cell.isFlagged;
    this.flags += cell.isFlagged ? 1 : -1;
    const visuals = this.cells[r][c];
    visuals.text.setText(cell.isFlagged ? '⚠' : '');
    visuals.text.setColor('#ff5f3d');
    visuals.rect.setFillStyle(cell.isFlagged ? 0xfff1e0 : 0x4b5057);
    this.updateHUD();
    this.checkWinCondition();
  }

  revealTile(r, c, opts = { bypassMine: false, fromPower: false }, sharedBatch = null) {
    if (!this.inBounds(r, c)) return;
    const cell = this.board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    if (this.firstMove) {
      this.ensureFirstMoveSafe(cell);
      this.firstMove = false;
    }

    const batch = sharedBatch || [];
    const success = this.performReveal(cell, batch, opts);
    if (batch.length && !sharedBatch) this.undoStack.push({ tiles: batch });

    if (!opts.fromPower) this.checkWinCondition();
    return success;
  }

  performReveal(cell, batch, opts) {
    if (cell.isRevealed || cell.isFlagged) return true;
    cell.isRevealed = true;
    batch.push({ r: cell.r, c: cell.c, prev: { ...cell, isRevealed: false } });

    const visuals = this.cells[cell.r][cell.c];
    visuals.rect.setFillStyle(0xf4f4f4);
    visuals.rect.setStrokeStyle(1.5, 0xff8a00, 0.65);
    visuals.text.setText('');

    if (cell.isMine) {
      if (opts.bypassMine) {
        // scanner keeps mines hidden
        cell.isRevealed = false;
        batch.pop();
        return true;
      }
      if (this.powerState.firewall > 0) {
        this.powerState.firewall -= 1;
        updatePowerCount('firewall', this.powerState.firewall);
        this.tweens.add({ targets: visuals.rect, duration: 240, ease: 'Sine.easeInOut', alpha: { from: 1, to: 0.3 }, yoyo: true, repeat: 2 });
        showToast('Firewall contained the incident.');
        cell.isFlagged = true;
        visuals.text.setText('🛡');
        visuals.text.setColor('#27c686');
        visuals.rect.setFillStyle(0xe0f8ef);
        this.flags += 1;
        this.updateHUD();
        return true;
      }
      this.revealAllMines(cell);
      this.endGame(false);
      return false;
    }

    this.revealedSafe += 1;
    if (cell.neighborMines > 0) {
      visuals.text.setText(cell.neighborMines.toString());
      visuals.text.setColor(numberColors[cell.neighborMines] || '#393e46');
    } else {
      visuals.text.setText('');
      this.floodReveal(cell, batch);
    }

    this.add.tween({ targets: visuals.container, scale: { from: 0.92, to: 1 }, duration: 120, ease: 'Back.easeOut' });
    return true;
  }

  ensureFirstMoveSafe(cell) {
    if (!cell.isMine) return;
    // swap mine with a safe tile elsewhere
    for (const row of this.board) {
      for (const target of row) {
        if (!target.isMine && !(target.r === cell.r && target.c === cell.c)) {
          cell.isMine = false;
          target.isMine = true;
          this.countAllNeighbors();
          return;
        }
      }
    }
  }

  floodReveal(cell, batch) {
    const queue = [cell];
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      const key = `${current.r}-${current.c}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const visuals = this.cells[current.r][current.c];
      visuals.rect.setFillStyle(0xf4f4f4);
      visuals.rect.setStrokeStyle(1.5, 0xff8a00, 0.5);
      if (!current.isRevealed) {
        current.isRevealed = true;
        batch.push({ r: current.r, c: current.c, prev: { ...current, isRevealed: false } });
        this.revealedSafe += 1;
      }
      if (current.neighborMines > 0) {
        visuals.text.setText(current.neighborMines.toString());
        visuals.text.setColor(numberColors[current.neighborMines] || '#393e46');
        continue;
      }
      const dirs = [-1, 0, 1];
      dirs.forEach(dr => dirs.forEach(dc => {
        if (dr === 0 && dc === 0) return;
        const nr = current.r + dr;
        const nc = current.c + dc;
        if (this.inBounds(nr, nc)) {
          const neighbor = this.board[nr][nc];
          if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
            queue.push(neighbor);
          }
        }
      }));
    }
  }

  revealAllMines(triggeredCell) {
    this.board.flat().forEach(cell => {
      if (cell.isMine) {
        const visuals = this.cells[cell.r][cell.c];
        visuals.rect.setFillStyle(cell === triggeredCell ? 0xffb7a3 : 0xffcfc1);
        visuals.text.setText('💥');
      }
    });
  }

  checkWinCondition() {
    const totalSafe = this.board.length * this.board[0].length - this.mines;
    const allSafeRevealed = this.revealedSafe >= totalSafe;
    const correctlyFlagged = this.board.flat().every(cell => {
      if (cell.isMine) return cell.isFlagged || cell.isRevealed;
      return !cell.isFlagged;
    });
    if (allSafeRevealed && correctlyFlagged) {
      this.endGame(true);
    }
  }

  endGame(won) {
    if (this.timerEvent) this.timerEvent.remove(false);
    if (won) {
      const stats = `Time: ${formatTime(this.timer)} · Flags used: ${this.flags} · Power-ups used: ${this.powerUsageCount()}`;
      document.getElementById('win-stats').textContent = stats;
      toggleModal('win-modal', true);
    } else {
      toggleModal('loss-modal', true);
    }
  }

  powerUsageCount() {
    const base = { firewall: 1, scanner: 2, network: 2, undo: 3 };
    return Object.keys(base).reduce((acc, key) => acc + (base[key] - this.powerState[key]), 0);
  }

  updateHUD() {
    document.getElementById('mine-count').textContent = Math.max(0, this.mines - this.flags);
    const activeDifficulty = document.getElementById('difficulty-label');
    activeDifficulty.textContent = this.difficulty?.label || '-';
    updatePowerCount('firewall', this.powerState.firewall);
    updatePowerCount('scanner', this.powerState.scanner);
    updatePowerCount('network', this.powerState.network);
    updatePowerCount('undo', this.powerState.undo);
  }

  // Power-up implementations
  setActivePower(power) {
    if (this.powerState[power] <= 0 && power !== 'undo') return;
    if (power === 'undo') {
      this.useUndo();
      return;
    }
    if (power === 'network') {
      this.revealCluster();
      return;
    }
    if (power === 'firewall') {
      showToast('Firewall auto-blocks the next incident.');
      return;
    }
    this.activePower = this.activePower === power ? null : power;
    highlightPowerButton(this.activePower);
  }

  usePortScanner(r, c) {
    if (this.powerState.scanner <= 0) return;
    const cells = [];
    const dirs = [-1, 0, 1];
    dirs.forEach(dr => dirs.forEach(dc => {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc)) cells.push({ r: nr, c: nc });
    }));
    const batch = [];
    cells.forEach(({ r: nr, c: nc }) => this.revealTile(nr, nc, { bypassMine: true, fromPower: true }, batch));
    if (batch.length) this.undoStack.push({ tiles: batch });
    this.powerState.scanner -= 1;
    updatePowerCount('scanner', this.powerState.scanner);
    this.activePower = null;
    highlightPowerButton(null);
    this.flashArea(cells);
    this.checkWinCondition();
  }

  revealCluster() {
    if (this.powerState.network <= 0) return;
    const candidates = this.board.flat().filter(cell => !cell.isRevealed && !cell.isMine);
    if (!candidates.length) return;
    const origin = Phaser.Utils.Array.GetRandom(candidates);
    const batch = [];
    this.firstMove = false;
    this.performReveal(origin, batch, { fromPower: true });
    if (origin.neighborMines === 0) {
      this.floodReveal(origin, batch);
    }
    this.undoStack.push({ tiles: batch });
    this.powerState.network -= 1;
    updatePowerCount('network', this.powerState.network);
    this.activePower = null;
    highlightPowerButton(null);
    this.pulseCluster(batch.map(entry => ({ r: entry.r, c: entry.c })));
    this.checkWinCondition();
  }

  useUndo() {
    if (this.powerState.undo <= 0 || !this.undoStack.length) return;
    const last = this.undoStack.pop();
    last.tiles.forEach(entry => {
      const cell = this.board[entry.r][entry.c];
      Object.assign(cell, entry.prev);
      const visuals = this.cells[entry.r][entry.c];
      visuals.rect.setFillStyle(0x4b5057).setStrokeStyle(1, 0xd1d3d3, 0.6);
      visuals.text.setText(cell.isFlagged ? '⚠' : '');
      visuals.text.setColor(cell.isFlagged ? '#ff5f3d' : '#393e46');
    });
    this.recomputeRevealedSafe();
    this.powerState.undo -= 1;
    updatePowerCount('undo', this.powerState.undo);
    this.updateHUD();
  }

  recomputeRevealedSafe() {
    this.revealedSafe = this.board.flat().filter(c => c.isRevealed && !c.isMine).length;
    this.flags = this.board.flat().filter(c => c.isFlagged).length;
  }

  flashArea(cells) {
    cells.forEach(cell => {
      const visuals = this.cells[cell.r][cell.c];
      this.tweens.add({ targets: visuals.rect, duration: 200, alpha: 0.3, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
    });
  }

  pulseCluster(cells) {
    cells.forEach(cell => {
      const visuals = this.cells[cell.r][cell.c];
      this.tweens.add({ targets: visuals.container, duration: 180, scale: 1.08, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
    });
  }

  handleKeyInput(event) {
    const { rows, cols } = this.difficulty || {};
    if (!rows) return;
    const { r, c } = this.selection;
    if (event.key === 'ArrowUp') this.selection.r = Phaser.Math.Clamp(r - 1, 0, rows - 1);
    if (event.key === 'ArrowDown') this.selection.r = Phaser.Math.Clamp(r + 1, 0, rows - 1);
    if (event.key === 'ArrowLeft') this.selection.c = Phaser.Math.Clamp(c - 1, 0, cols - 1);
    if (event.key === 'ArrowRight') this.selection.c = Phaser.Math.Clamp(c + 1, 0, cols - 1);
    if (event.key === ' ' || event.key === 'Enter') this.onRevealRequest(this.selection.r, this.selection.c);
    if (event.key.toLowerCase() === 'f') this.toggleFlag(this.selection.r, this.selection.c);
    this.updateSelectionHighlight();
  }

  updateSelectionHighlight() {
    this.board?.forEach(row => row.forEach(cell => {
      const visuals = this.cells[cell.r][cell.c];
      visuals.highlight.setFillStyle(0xffffff, (cell.r === this.selection.r && cell.c === this.selection.c) ? 0.04 : 0);
    }));
  }
}

// DOM helpers
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerLabel(seconds) {
  document.getElementById('timer').textContent = formatTime(seconds);
}

function toggleModal(id, show) {
  const modal = document.getElementById(id);
  modal.classList.toggle('show', show);
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 1800);
}

function updatePowerCount(key, value) {
  const span = document.querySelector(`[data-power-count="${key}"]`);
  if (span) span.textContent = value;
}

function highlightPowerButton(activeKey) {
  document.querySelectorAll('.power-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.power === activeKey);
  });
}

// Game wiring
const config = {
  type: Phaser.AUTO,
  width: 1000,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#393E46',
  scene: [AssetSweeperScene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
};

const game = new Phaser.Game(config);
let scene;
const setSceneRef = () => {
  scene = game.scene.getScene('AssetSweeper');
};
game.events.on('ready', setSceneRef);
if (game.isBooted) setSceneRef();

function bindUI() {
  const startWithDifficulty = (diff) => {
    const kickoff = () => scene?.start(diff);
    if (scene) kickoff(); else game.events.once('ready', kickoff);
  };

  document.querySelectorAll('.difficulty-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
      const diff = btn.dataset.difficulty;
      toggleModal('start-modal', false);
      startWithDifficulty(diff);
    });
  });

  document.getElementById('how-to-play').addEventListener('click', () => toggleModal('howto-modal', true));
  document.getElementById('open-howto').addEventListener('click', () => toggleModal('howto-modal', true));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => toggleModal(btn.dataset.close, false)));

  document.getElementById('play-again-win').addEventListener('click', () => {
    toggleModal('win-modal', false);
    toggleModal('start-modal', true);
  });
  document.getElementById('play-again-loss').addEventListener('click', () => {
    toggleModal('loss-modal', false);
    toggleModal('start-modal', true);
  });

  document.querySelectorAll('.power-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kickoff = () => scene?.setActivePower(btn.dataset.power);
      if (scene) kickoff(); else game.events.once('ready', kickoff);
    });
  });

  game.scale.on('resize', () => {
    if (scene?.board?.length) scene.buildGridGraphics();
  });
}

bindUI();
toggleModal('start-modal', true);
