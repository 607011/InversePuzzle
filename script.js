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
let currentLevelIndex = 0;
let GRID_COLS, GRID_ROWS, TARGET, pieces;

let selectedPiece = null; // an unplaced tray piece selected for rotate/flip (no drag in progress)
let dragState = null; // { piece, cells, source: 'tray'|'grid', originalCells, originalOrigin, fractionX, fractionY, ghostEl, hoverCell }
let pointerCandidate = null; // { piece, source, startX, startY, originalOrigin } before drag threshold is exceeded

const DRAG_THRESHOLD = 4; // px

// ---------- DOM refs ----------
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
  currentLevelIndex = index;
  const level = LEVELS[index];
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
  LEVELS.forEach((level, i) => {
    const btn = document.createElement("button");
    btn.textContent = level.name;
    btn.className = "level-btn";
    if (i === currentLevelIndex) btn.classList.add("active");
    btn.addEventListener("click", () => loadLevel(i));
    levelSelectEl.appendChild(btn);
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
    // workspace underneath it.
    previewCells.forEach((p, i) => {
      const cellEl = workspaceCellEls[p.row][p.col];
      const base = workspaceBaseColors[p.row][p.col];
      const mixed = addColors(base ? [base, pigment] : [pigment]);
      cellEl.style.backgroundColor = cssColor(mixed);
      cellEl.classList.add("hover-ok");
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
    // A click without movement: toggle rotate/flip selection (tray pieces only).
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

function finishDrag() {
  const { piece, cells, hoverCell, source, originalCells, originalOrigin, ghostEl } = dragState;
  const placement = hoverCell ? cellsForCellsAt(cells, hoverCell.col, hoverCell.row) : null;

  if (placement) {
    piece.cells = cells;
    piece.origin = { col: hoverCell.col, row: hoverCell.row };
    piece.placed = true;
  } else if (source === "grid") {
    piece.cells = originalCells;
    piece.origin = originalOrigin;
    piece.placed = true;
  } else {
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

// ---------- Init ----------
loadLevel(0);
