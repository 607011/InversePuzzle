"use strict";

// ---------- Color model ----------
// Each base pigment is added channel-wise and clamped to 0-255 ("Licht"-Mischung).
const PIGMENTS = {
  red:   { r: 235, g: 45,  b: 45  },
  green: { r: 60,  g: 210, b: 60  },
  blue:  { r: 45,  g: 70,  b: 235 },
};

function addColors(colors) {
  if (colors.length === 0) return null;
  const sum = { r: 0, g: 0, b: 0 };
  for (const c of colors) {
    sum.r += c.r;
    sum.g += c.g;
    sum.b += c.b;
  }
  return {
    r: Math.min(255, sum.r),
    g: Math.min(255, sum.g),
    b: Math.min(255, sum.b),
  };
}

function colorsEqual(a, b) {
  if (a === null || b === null) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function cssColor(c) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

// ---------- Level definition ----------
// Grid coordinates: col = x (dx), row = y (dy). Grid is exactly the target's bounding box,
// so a solved puzzle covers every cell with exactly the right combination of pigments.
const GRID_COLS = 3;
const GRID_ROWS = 2;

// Piece shapes as relative {dx, dy} cell lists, all cells of a piece share one pigment.
const PIECE_DEFS = [
  {
    id: "green-piece",
    color: "green",
    cells: [
      { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
      { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
    ],
  },
  {
    id: "red-piece",
    color: "red",
    cells: [
      { dx: 0, dy: 0 }, { dx: 1, dy: 0 },
    ],
  },
  {
    id: "blue-piece",
    color: "blue",
    cells: [
      { dx: 0, dy: 0 },
    ],
  },
];

// Target: computed once from the "solution" placement (col, row) of each piece,
// purely so the level data stays in one place and stays consistent by construction.
const SOLUTION = {
  "green-piece": { col: 0, row: 0 },
  "red-piece": { col: 0, row: 1 },
  "blue-piece": { col: 0, row: 0 },
};

function buildTarget() {
  const target = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
  const contributions = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => []));
  for (const def of PIECE_DEFS) {
    const origin = SOLUTION[def.id];
    for (const cell of def.cells) {
      const col = origin.col + cell.dx;
      const row = origin.row + cell.dy;
      contributions[row][col].push(PIGMENTS[def.color]);
    }
  }
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      target[row][col] = addColors(contributions[row][col]);
    }
  }
  return target;
}

const TARGET = buildTarget();

// ---------- Piece transforms ----------
function normalize(cells) {
  const minDx = Math.min(...cells.map((c) => c.dx));
  const minDy = Math.min(...cells.map((c) => c.dy));
  return cells.map((c) => ({ dx: c.dx - minDx, dy: c.dy - minDy }));
}

function rotate90(cells) {
  // (dx, dy) -> (-dy, dx)
  return normalize(cells.map((c) => ({ dx: -c.dy, dy: c.dx })));
}

function flipHorizontal(cells) {
  return normalize(cells.map((c) => ({ dx: -c.dx, dy: c.dy })));
}

function boundingSize(cells) {
  return {
    w: Math.max(...cells.map((c) => c.dx)) + 1,
    h: Math.max(...cells.map((c) => c.dy)) + 1,
  };
}

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
const pieces = PIECE_DEFS.map((def) => ({
  id: def.id,
  color: def.color,
  baseCells: def.cells,
  cells: normalize(def.cells), // current transformed shape
  placed: false,
  origin: null, // { col, row } when placed
}));

let selectedPiece = null; // an unplaced tray piece selected for rotate/flip (no drag in progress)
let dragState = null; // { piece, cells, source: 'tray'|'grid', originalCells, originalOrigin, fractionX, fractionY, ghostEl, hoverCell }
let pointerCandidate = null; // { piece, source, startX, startY, originalOrigin } before drag threshold is exceeded

const DRAG_THRESHOLD = 4; // px

// ---------- DOM refs ----------
const targetGridEl = document.getElementById("target-grid");
const workspaceGridEl = document.getElementById("workspace-grid");
const trayEl = document.getElementById("tray");
const statusEl = document.getElementById("status");
const rotateBtn = document.getElementById("rotate-btn");
const flipBtn = document.getElementById("flip-btn");
const resetBtn = document.getElementById("reset-btn");

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

function updateHoverPreview() {
  const previewCells =
    dragState && dragState.hoverCell
      ? cellsForCellsAt(dragState.cells, dragState.hoverCell.col, dragState.hoverCell.row)
      : null;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cellEl = workspaceCellEls[row][col];
      cellEl.classList.remove("hover-ok", "hover-bad");
      if (previewCells && previewCells.some((p) => p.col === col && p.row === row)) {
        cellEl.classList.add("hover-ok");
      }
    }
  }
  if (dragState && dragState.ghostEl) {
    dragState.ghostEl.classList.toggle("invalid", !previewCells);
  }
}

function renderWorkspaceGrid() {
  const colors = computeWorkspaceColors();
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
  for (let row = 0; row < size.h; row++) {
    for (let col = 0; col < size.w; col++) {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      const occupied = cells.some((c) => c.dx === col && c.dy === row);
      if (occupied) {
        cellEl.style.backgroundColor = cssColor(PIGMENTS[piece.color]);
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
  const allPlaced = pieces.every((p) => p.placed);
  let solved = allPlaced;
  if (allPlaced) {
    for (let row = 0; row < GRID_ROWS && solved; row++) {
      for (let col = 0; col < GRID_COLS && solved; col++) {
        if (!colorsEqual(colors[row][col], TARGET[row][col])) solved = false;
      }
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
  for (const piece of pieces) {
    piece.cells = normalize(piece.baseCells);
    piece.placed = false;
    piece.origin = null;
  }
  selectedPiece = null;
  if (dragState) {
    dragState.ghostEl.remove();
    dragState = null;
  }
  pointerCandidate = null;
  renderAll();
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
renderTargetGrid();
renderAll();
