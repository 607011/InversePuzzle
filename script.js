"use strict";

// Color model, piece transforms, and level definitions now live in levels.js (loaded
// before this file), shared with the Node.js solver. This file only handles state,
// rendering, and interaction.

// ---------- Grid geometry (must match style.css) ----------
const CELL_SIZE = 64;
const CELL_GAP = 4;
const STEP = CELL_SIZE + CELL_GAP;

function pieceBoxSize(cells) {
  const size = boundingSize(cells);
  return {
    width: size.w * CELL_SIZE + (size.w - 1) * CELL_GAP,
    height: size.h * CELL_SIZE + (size.h - 1) * CELL_GAP,
  };
}

// ---------- Game state ----------
// Built-in levels plus any dropped in at runtime for quick testing (see the drag-and-drop
// section near the bottom) — kept separate from the LEVELS constant in levels.js so a
// dropped file can never end up looking like it's part of the shipped game.
let levelsList = LEVELS.slice();
let currentLevelIndex = 0;
let GRID_COLS, GRID_ROWS, TARGET, pieces;

let selectedPiece = null; // an unplaced tray piece selected for rotate/flip (no drag in progress)
let dragState = null; // { piece, cells, source: 'tray'|'grid', originalCells, originalOrigin, fractionX, fractionY, ghostEl, hoverCell }
let pointerCandidate = null; // { piece, source, startX, startY, originalOrigin } before drag threshold is exceeded

const DRAG_THRESHOLD = 4; // px

// ---------- Settings ----------
const HARD_MODE_KEY = "overhue-hard-mode";
let hardMode = false;
try {
  hardMode = localStorage.getItem(HARD_MODE_KEY) === "true";
} catch {
  // localStorage can throw (private browsing, disabled storage) — hard mode just defaults off.
}

// ---------- Progress ----------
// Levels must be played in order: level i unlocks once level i-1 has been solved. A level
// you've already solved stays unlocked (and solvable again) even after later ones open up.
// Keyed by level id (not array index), so this survives levels.js being reordered or
// having entries inserted. Dropped/custom levels (see the drag-and-drop section) are never
// gated — they're for testing, not part of the progression.
const SOLVED_LEVELS_KEY = "overhue-solved-levels";
let solvedLevelIds = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(SOLVED_LEVELS_KEY) || "[]");
  if (Array.isArray(stored)) solvedLevelIds = new Set(stored);
} catch {
  // ignore — progress just starts fresh
}

function isLevelUnlocked(index) {
  const level = levelsList[index];
  if (level.custom) return true;
  if (index === 0) return true;
  return solvedLevelIds.has(levelsList[index - 1].id) || solvedLevelIds.has(level.id);
}

function markLevelSolved(level) {
  if (level.custom || solvedLevelIds.has(level.id)) return;
  solvedLevelIds.add(level.id);
  try {
    localStorage.setItem(SOLVED_LEVELS_KEY, JSON.stringify([...solvedLevelIds]));
  } catch {
    // ignore — this solve just won't be remembered across reloads
  }
  renderLevelSelect();
}

// ---------- DOM refs ----------
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const hardModeToggle = document.getElementById("hard-mode-toggle");
const levelSelectEl = document.getElementById("level-select");
const targetGridEl = document.getElementById("target-grid");
const workspaceGridEl = document.getElementById("workspace-grid");
const trayEl = document.getElementById("tray");
const statusEl = document.getElementById("status");
const rotateBtn = document.getElementById("rotate-btn");
const flipBtn = document.getElementById("flip-btn");
const resetBtn = document.getElementById("reset-btn");

// ---------- Level loading ----------
function loadLevel(index) {
  if (!isLevelUnlocked(index)) return; // solve the previous level first
  if (dropMessageEl) dropMessageEl.hidden = true;
  currentLevelIndex = index;
  const level = levelsList[index];
  GRID_COLS = level.gridCols;
  GRID_ROWS = level.gridRows;
  TARGET = buildTarget(level);

  pieces = level.pieces.map((def) => ({
    id: def.id,
    color: def.color,
    baseCells: def.cells,
    cells: applyStartTransform(def.cells, def.start),
    placed: false,
    origin: null,
  }));

  selectedPiece = null;
  if (dragState) {
    dragState.ghostEl.remove();
    dragState = null;
  }
  pointerCandidate = null;

  renderLevelSelect();
  renderTargetGrid();
  renderAll();
}

function renderLevelSelect() {
  levelSelectEl.innerHTML = "";
  // Built-in levels go directly into the <select>; any dropped/custom ones (see the
  // drag-and-drop section) are visually separated in their own <optgroup>.
  let customGroup = null;

  levelsList.forEach((level, i) => {
    const unlocked = isLevelUnlocked(i);
    const solved = solvedLevelIds.has(level.id);
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = (solved ? "✓ " : unlocked ? "" : "🔒 ") + level.name;
    if (!unlocked) {
      option.disabled = true;
      option.title = "Solve the previous level first";
    }
    if (i === currentLevelIndex) option.selected = true;

    if (level.custom) {
      if (!customGroup) {
        customGroup = document.createElement("optgroup");
        customGroup.label = "Custom (dropped)";
        levelSelectEl.appendChild(customGroup);
      }
      customGroup.appendChild(option);
    } else {
      levelSelectEl.appendChild(option);
    }
  });
}

// ---------- Rendering ----------
function renderTargetGrid() {
  targetGridEl.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL_SIZE}px)`;
  targetGridEl.innerHTML = "";
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const color = TARGET[row][col];
      if (color) cell.style.backgroundColor = cssColor(color);
      targetGridEl.appendChild(cell);
    }
  }
}

function computeWorkspaceColors() {
  const contributions = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => []));
  for (const piece of pieces) {
    if (!piece.placed) continue;
    for (const cell of piece.cells) {
      const col = piece.origin.col + cell.dx;
      const row = piece.origin.row + cell.dy;
      contributions[row][col].push(PIGMENTS[piece.color]);
    }
  }
  const colors = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      colors[row][col] = addColors(contributions[row][col]);
    }
  }
  return colors;
}

function cellsForCellsAt(cells, col, row) {
  const size = boundingSize(cells);
  if (col < 0 || row < 0 || col + size.w > GRID_COLS || row + size.h > GRID_ROWS) return null;
  return cells.map((c) => ({ col: col + c.dx, row: row + c.dy }));
}

let workspaceCellEls = [];
let workspaceBaseColors = []; // the real (non-preview) color of each cell, from placed pieces only

function updateHoverPreview() {
  const previewCells =
    dragState && dragState.hoverCell
      ? cellsForCellsAt(dragState.cells, dragState.hoverCell.col, dragState.hoverCell.row)
      : null;
  const pigment = dragState && PIGMENTS[dragState.piece.color];

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cellEl = workspaceCellEls[row][col];
      cellEl.classList.remove("hover-ok", "hover-bad");
      const base = workspaceBaseColors[row][col];
      cellEl.style.backgroundColor = base ? cssColor(base) : "";
    }
  }

  if (previewCells) {
    // Show what the color would actually become here, not just "this cell is targeted":
    // mix the dragged piece's pigment into whatever is already placed underneath. Paint
    // both the workspace cell AND the ghost cell sitting on top of it — the ghost is what's
    // actually visible while dragging, so it has to show the mixed color, not just the
    // workspace underneath it. Hard mode keeps the positional "you can drop here" outline
    // but withholds the actual resulting color — that's the whole point of hard mode.
    previewCells.forEach((p, i) => {
      const cellEl = workspaceCellEls[p.row][p.col];
      cellEl.classList.add("hover-ok");
      if (hardMode) return;
      const base = workspaceBaseColors[p.row][p.col];
      const mixed = addColors(base ? [base, pigment] : [pigment]);
      cellEl.style.backgroundColor = cssColor(mixed);
      const ghostCellEl = dragState.ghostCellEls[i];
      if (ghostCellEl) ghostCellEl.style.backgroundColor = cssColor(mixed);
    });
  } else if (dragState) {
    // No valid hover: ghost just shows the piece's own color.
    for (const ghostCellEl of dragState.ghostCellEls) {
      if (ghostCellEl) ghostCellEl.style.backgroundColor = cssColor(pigment);
    }
  }

  if (dragState && dragState.ghostEl) {
    dragState.ghostEl.classList.toggle("invalid", !previewCells);
  }
}

function renderWorkspaceGrid() {
  const colors = computeWorkspaceColors();
  workspaceBaseColors = colors;
  workspaceGridEl.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL_SIZE}px)`;
  workspaceGridEl.innerHTML = "";
  workspaceCellEls = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      const color = colors[row][col];
      if (color) cellEl.style.backgroundColor = cssColor(color);
      workspaceCellEls[row][col] = cellEl;

      cellEl.addEventListener("pointerdown", (e) => {
        if (hardMode) return; // dropped pieces are locked in place
        const owner = pieces.find(
          (p) => p.placed && p.cells.some((c) => p.origin.col + c.dx === col && p.origin.row + c.dy === row)
        );
        if (owner) startPointerInteraction(e, owner, "grid");
      });

      workspaceGridEl.appendChild(cellEl);
    }
  }

  updateHoverPreview();
  checkWin(colors);
}

function renderTray() {
  trayEl.innerHTML = "";
  for (const piece of pieces) {
    const isDragSource = dragState && dragState.piece === piece;
    const shapeCells = isDragSource ? dragState.cells : piece.cells;
    const size = boundingSize(shapeCells);
    const pieceEl = document.createElement("div");
    pieceEl.className = "piece";
    if (piece.placed) pieceEl.classList.add("placed");
    if (selectedPiece === piece) pieceEl.classList.add("selected");
    if (isDragSource && dragState.source === "tray") pieceEl.classList.add("dragging-source");
    pieceEl.style.gridTemplateColumns = `repeat(${size.w}, 32px)`;
    pieceEl.style.gridTemplateRows = `repeat(${size.h}, 32px)`;

    for (let row = 0; row < size.h; row++) {
      for (let col = 0; col < size.w; col++) {
        const cellEl = document.createElement("div");
        const occupied = shapeCells.some((c) => c.dx === col && c.dy === row);
        cellEl.className = "cell";
        cellEl.style.gridColumn = col + 1;
        cellEl.style.gridRow = row + 1;
        if (occupied) {
          cellEl.style.backgroundColor = cssColor(PIGMENTS[piece.color]);
        } else {
          cellEl.style.visibility = "hidden";
        }
        pieceEl.appendChild(cellEl);
      }
    }

    if (!piece.placed) {
      pieceEl.addEventListener("pointerdown", (e) => startPointerInteraction(e, piece, "tray"));
    }

    trayEl.appendChild(pieceEl);
  }
}

function renderAll() {
  renderWorkspaceGrid();
  renderTray();
  const rotatable = dragState || selectedPiece;
  rotateBtn.disabled = !rotatable;
  flipBtn.disabled = !rotatable;
}

// ---------- Drag and drop ----------
function startPointerInteraction(e, piece, source) {
  if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
  e.preventDefault();
  selectedPiece = null;
  pointerCandidate = {
    piece,
    source,
    pointerId: e.pointerId,
    startClientX: e.clientX,
    startClientY: e.clientY,
    pickupClientX: e.clientX,
    pickupClientY: e.clientY,
    sourceRect: e.currentTarget.getBoundingClientRect(),
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
}

function beginDrag() {
  const { piece, source, sourceRect, pickupClientX, pickupClientY } = pointerCandidate;
  const originalOrigin = piece.origin ? { ...piece.origin } : null;
  const originalCells = piece.cells;

  if (source === "grid") {
    piece.placed = false;
    piece.origin = null;
  }

  const fractionX = (pickupClientX - sourceRect.left) / sourceRect.width;
  const fractionY = (pickupClientY - sourceRect.top) / sourceRect.height;

  const ghostEl = document.createElement("div");
  ghostEl.className = "piece-ghost";
  document.body.appendChild(ghostEl);

  dragState = {
    piece,
    source,
    cells: piece.cells,
    originalCells,
    originalOrigin,
    fractionX,
    fractionY,
    ghostEl,
    hoverCell: null,
    lastClientX: pickupClientX,
    lastClientY: pickupClientY,
  };

  renderGhost();
  renderAll();
}

function renderGhost() {
  const { ghostEl, cells, piece } = dragState;
  const box = pieceBoxSize(cells);
  const size = boundingSize(cells);
  ghostEl.style.width = `${box.width}px`;
  ghostEl.style.height = `${box.height}px`;
  ghostEl.style.gridTemplateColumns = `repeat(${size.w}, ${CELL_SIZE}px)`;
  ghostEl.style.gridTemplateRows = `repeat(${size.h}, ${CELL_SIZE}px)`;
  ghostEl.innerHTML = "";
  // Parallel to `cells`/`previewCells`, so updateHoverPreview can paint each ghost cell
  // with the color it would actually become, instead of just the piece's own pigment.
  dragState.ghostCellEls = new Array(cells.length);
  for (let row = 0; row < size.h; row++) {
    for (let col = 0; col < size.w; col++) {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      const cellIndex = cells.findIndex((c) => c.dx === col && c.dy === row);
      if (cellIndex !== -1) {
        cellEl.style.backgroundColor = cssColor(PIGMENTS[piece.color]);
        dragState.ghostCellEls[cellIndex] = cellEl;
      } else {
        cellEl.style.visibility = "hidden";
      }
      ghostEl.appendChild(cellEl);
    }
  }
}

function positionGhost(clientX, clientY) {
  const { ghostEl, fractionX, fractionY } = dragState;
  const box = pieceBoxSize(dragState.cells);
  const left = clientX - fractionX * box.width;
  const top = clientY - fractionY * box.height;
  ghostEl.style.left = `${left}px`;
  ghostEl.style.top = `${top}px`;

  const gridRect = workspaceGridEl.getBoundingClientRect();
  const col = Math.round((left - gridRect.left) / STEP);
  const row = Math.round((top - gridRect.top) / STEP);
  dragState.hoverCell = { col, row };
  dragState.lastClientX = clientX;
  dragState.lastClientY = clientY;
}

function onPointerMove(e) {
  if (dragState) {
    positionGhost(e.clientX, e.clientY);
    updateHoverPreview();
    return;
  }
  if (pointerCandidate) {
    const dx = e.clientX - pointerCandidate.startClientX;
    const dy = e.clientY - pointerCandidate.startClientY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      beginDrag();
      positionGhost(e.clientX, e.clientY);
      updateHoverPreview();
    }
  }
}

function onPointerUp() {
  cleanupPointerListeners();
  if (dragState) {
    finishDrag();
  } else if (pointerCandidate) {
    // A click without movement on a tray piece toggles rotate/flip selection. (A click on a
    // placed piece deliberately does nothing — sending it back to the tray takes an actual
    // drag onto the tray, see finishDrag, so it can't happen by an accidental click.)
    const { piece, source } = pointerCandidate;
    if (source === "tray") {
      selectedPiece = selectedPiece === piece ? null : piece;
      renderAll();
    }
  }
  pointerCandidate = null;
}

function onPointerCancel() {
  cleanupPointerListeners();
  if (dragState) cancelDrag();
  pointerCandidate = null;
}

function cleanupPointerListeners() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
}

const trayPanelEl = trayEl.closest(".panel");

function isPointOverTray(x, y) {
  const r = trayPanelEl.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function finishDrag() {
  const { piece, cells, hoverCell, source, originalCells, originalOrigin, ghostEl, lastClientX, lastClientY } = dragState;
  const placement = hoverCell ? cellsForCellsAt(cells, hoverCell.col, hoverCell.row) : null;

  if (placement) {
    piece.cells = cells;
    piece.origin = { col: hoverCell.col, row: hoverCell.row };
    piece.placed = true;
  } else if (source === "grid" && !isPointOverTray(lastClientX, lastClientY)) {
    // Dropped somewhere that's neither a valid grid cell nor the tray (e.g. just missed a
    // cell) — revert to where it was, rather than losing the placement to a near-miss.
    piece.cells = originalCells;
    piece.origin = originalOrigin;
    piece.placed = true;
  } else {
    // Either dragged in from the tray and dropped invalidly, or deliberately dragged a
    // placed piece back onto the tray — both send it back unplaced.
    piece.cells = originalCells;
    piece.placed = false;
    piece.origin = null;
  }

  ghostEl.remove();
  dragState = null;
  renderAll();
}

function cancelDrag() {
  const { piece, originalCells, originalOrigin, source, ghostEl } = dragState;
  piece.cells = originalCells;
  if (source === "grid") {
    piece.origin = originalOrigin;
    piece.placed = true;
  } else {
    piece.origin = null;
    piece.placed = false;
  }
  ghostEl.remove();
  dragState = null;
  renderAll();
}

// ---------- Rotate / flip (active drag, or a selected tray piece) ----------
function applyTransform(transformFn) {
  if (dragState) {
    dragState.cells = transformFn(dragState.cells);
    renderGhost();
    positionGhost(dragState.lastClientX, dragState.lastClientY);
    updateHoverPreview();
    renderTray();
  } else if (selectedPiece) {
    selectedPiece.cells = transformFn(selectedPiece.cells);
    renderAll();
  }
}

function checkWin(colors) {
  // Not every piece has to be placed: a level can include decoy pieces that never belong
  // anywhere (see Level 3). Solved just means every cell matches — if a piece that's
  // actually needed is missing, some cell will be wrong or empty, and this still catches it.
  let solved = true;
  for (let row = 0; row < GRID_ROWS && solved; row++) {
    for (let col = 0; col < GRID_COLS && solved; col++) {
      if (!colorsEqual(colors[row][col], TARGET[row][col])) solved = false;
    }
  }
  if (solved) {
    statusEl.textContent = "Solved! 🎉";
    statusEl.classList.add("solved");
    markLevelSolved(levelsList[currentLevelIndex]);
  } else {
    statusEl.textContent = "";
    statusEl.classList.remove("solved");
  }
}

function resetLevel() {
  loadLevel(currentLevelIndex);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    applyTransform(rotate90);
  } else if (e.key === "f" || e.key === "F") {
    applyTransform(flipHorizontal);
  } else if (e.key === "Escape" && dragState) {
    cleanupPointerListeners();
    cancelDrag();
  }
});

rotateBtn.addEventListener("click", () => applyTransform(rotate90));
flipBtn.addEventListener("click", () => applyTransform(flipHorizontal));
resetBtn.addEventListener("click", resetLevel);
levelSelectEl.addEventListener("change", () => loadLevel(Number(levelSelectEl.value)));

// ---------- Settings panel ----------
function setSettingsPanelOpen(open) {
  settingsPanel.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", String(open));
}

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setSettingsPanelOpen(settingsPanel.hidden);
});

document.addEventListener("click", (e) => {
  if (!settingsPanel.hidden && !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    setSettingsPanelOpen(false);
  }
});

hardModeToggle.checked = hardMode;
hardModeToggle.addEventListener("change", () => {
  hardMode = hardModeToggle.checked;
  try {
    localStorage.setItem(HARD_MODE_KEY, String(hardMode));
  } catch {
    // ignore — setting just won't persist across reloads
  }
  updateHoverPreview(); // harmless no-op if nothing is being dragged right now
});

// ---------- Drop a level JSON onto the target panel (quick testing, e.g. for levels made
// with solver-rs's generator) ----------
const targetPanelEl = document.getElementById("target-panel");
const dropMessageEl = document.getElementById("drop-message");

function showDropMessage(text, isError) {
  dropMessageEl.textContent = text;
  dropMessageEl.hidden = false;
  dropMessageEl.classList.toggle("error", !!isError);
}

// Accepts either one level object (the shape solver-rs's `generate` writes, or one entry
// from levels.json) or a full export ({ pigments, levels: [...] } from export-levels.js) —
// in which case every level in it is loaded. Returns { levels } or { error }.
function parseDroppedLevels(data, fallbackName) {
  const raw = Array.isArray(data.levels) ? data.levels : [data];
  const parsed = [];
  for (const level of raw) {
    const error = validateLevelShape(level);
    if (error) return { error };
    parsed.push({
      id: level.id || `custom-${Date.now()}-${parsed.length}`,
      name: level.name || `Custom: ${fallbackName}`,
      gridCols: level.gridCols,
      gridRows: level.gridRows,
      pieces: level.pieces,
      custom: true,
    });
  }
  return { levels: parsed };
}

function validateLevelShape(level) {
  if (!level || typeof level !== "object") return "not a JSON object";
  if (!Number.isInteger(level.gridCols) || level.gridCols <= 0) return "gridCols must be a positive integer";
  if (!Number.isInteger(level.gridRows) || level.gridRows <= 0) return "gridRows must be a positive integer";
  if (!Array.isArray(level.pieces) || level.pieces.length === 0) return "pieces must be a non-empty array";
  for (const p of level.pieces) {
    if (!p.id || typeof p.id !== "string") return "every piece needs a string id";
    if (!PIGMENTS[p.color]) return `piece "${p.id}" has an unknown color "${p.color}" (known: ${Object.keys(PIGMENTS).join(", ")})`;
    if (!Array.isArray(p.cells) || p.cells.length === 0 || !p.cells.every((c) => Number.isInteger(c.dx) && Number.isInteger(c.dy))) {
      return `piece "${p.id}" has invalid cells`;
    }
    if (!p.decoy && (!p.origin || !Number.isInteger(p.origin.col) || !Number.isInteger(p.origin.row))) {
      return `piece "${p.id}" needs an origin (or decoy: true)`;
    }
  }
  return null;
}

["dragenter", "dragover"].forEach((type) => {
  targetPanelEl.addEventListener(type, (e) => {
    e.preventDefault();
    targetPanelEl.classList.add("drag-over");
  });
});

targetPanelEl.addEventListener("dragleave", () => {
  targetPanelEl.classList.remove("drag-over");
});

targetPanelEl.addEventListener("drop", async (e) => {
  e.preventDefault();
  targetPanelEl.classList.remove("drag-over");

  const file = e.dataTransfer.files[0];
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    showDropMessage(`Could not read "${file.name}" as JSON: ${err.message}`, true);
    return;
  }

  const fallbackName = file.name.replace(/\.json$/i, "");
  const result = parseDroppedLevels(data, fallbackName);
  if (result.error) {
    showDropMessage(`Invalid level in "${file.name}": ${result.error}`, true);
    return;
  }

  levelsList = LEVELS.slice().concat(result.levels);
  loadLevel(LEVELS.length);
  showDropMessage(
    result.levels.length === 1
      ? `Loaded "${result.levels[0].name}" from ${file.name}.`
      : `Loaded ${result.levels.length} levels from ${file.name}.`,
    false
  );
});

// ---------- Init ----------
loadLevel(0);
