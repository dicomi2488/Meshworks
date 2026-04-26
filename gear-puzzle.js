// Color palette
const GAME_TITLE = "Meshworks";
document.title = GAME_TITLE;

const PALETTE = [
  "#a8b5a0",
  "#b5a8a0",
  "#a0a8b5",
  "#b5b0a0",
  "#a0b5b0",
  "#b0a0b5",
  "#b5b5a0",
  "#a8a0a8",
];
const BG = "#3a3830";
const HEX_BG = "#2e2c28";
const HEX_HOV = "#3e3c38";

// Hex axial directions
const HEX_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const key = (q, r) => `${q},${r}`;

// Grid generation (radius 5 -> 61 cells)
function makeGrid(radius) {
  const cells = new Map();
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) cells.set(key(q, r), { q, r, gearId: null });
  }
  return cells;
}

// Screen projection
// hex size = pixel radius of one cell
const HEX_SIZE = 36;
const ISO_X_SCALE = 1.0;
const ISO_Y_SCALE = 1.0; // Pure 2D top-down view

function hexToScreen(q, r, cx, cy) {
  const x = HEX_SIZE * ((3 / 2) * q);
  const y = HEX_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return {
    x: cx + x * ISO_X_SCALE,
    y: cy + y * ISO_Y_SCALE,
  };
}

function screenToHex(sx, sy, cx, cy) {
  const x = (sx - cx) / ISO_X_SCALE;
  const y = (sy - cy) / ISO_Y_SCALE;
  const q = ((2 / 3) * x) / HEX_SIZE;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / HEX_SIZE;
  return hexRound(q, r);
}

function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q),
    rr = Math.round(r),
    rs = Math.round(s);
  const dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

// Gear definitions
const GEAR_DEFS = {
  small: { radius: 0.5, efficiency: 0.8, cells: 1, color: 0 },
  large: { radius: 1.5, efficiency: 0.6, cells: 7, color: 1 },
};

let gearIdCounter = 0;
const gears = new Map(); // id -> gear object
const grid = makeGrid(5);

// Special cells
const LEGACY_SOURCE_CELL = { q: -4, r: 0 };
const SOURCE_CELL = { ...LEGACY_SOURCE_CELL };
const GEN_CELL = { q: 4, r: 0 }; // single generator cell (rightmost)
const GEN_SET = new Set([key(GEN_CELL.q, GEN_CELL.r)]);
const MIN_SOURCE_DISTANCE_FROM_GENERATOR = 7;
const LEGACY_SOURCE_TORQUE = 24;
const DEFAULT_SOURCE_STATE = { torque: 150, omega: 8.0 };
const SAVE_VERSION = 1;
const SAVE_KEY = "gear-puzzle-save-v1";
const AUTOSAVE_INTERVAL_MS = 1500;

// Source rotor (pre-placed, immovable)
const SOURCE_GEAR = {
  id: "source",
  size: "small",
  origin: SOURCE_CELL,
  cells: [SOURCE_CELL],
  radius: 0.5,
  efficiency: 1.0,
  torque: DEFAULT_SOURCE_STATE.torque,
  omega: DEFAULT_SOURCE_STATE.omega, // ~1.27 rev/s
  color: PALETTE[4],
  fixed: true,
};
gears.set("source", SOURCE_GEAR);
grid.get(key(SOURCE_CELL.q, SOURCE_CELL.r)).gearId = "source";

// Gear graph (adjacency for meshing)
// edges: Map<id, [{neighbor, ratio}]>
const gearGraph = { edges: new Map() };
gearGraph.edges.set("source", []);

function getHexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

function isValidSourceOrigin(origin) {
  if (!origin || !Number.isInteger(origin.q) || !Number.isInteger(origin.r)) {
    return false;
  }

  const gridCell = grid.get(key(origin.q, origin.r));
  if (!gridCell) return false;
  if (GEN_SET.has(key(origin.q, origin.r))) return false;
  if (gridCell.gearId && gridCell.gearId !== "source") return false;
  return getHexDistance(origin, GEN_CELL) >= MIN_SOURCE_DISTANCE_FROM_GENERATOR;
}

function moveSourceGearTo(origin) {
  if (!isValidSourceOrigin(origin)) return false;

  const prevCell = grid.get(key(SOURCE_CELL.q, SOURCE_CELL.r));
  if (prevCell?.gearId === "source") {
    prevCell.gearId = null;
  }

  SOURCE_CELL.q = origin.q;
  SOURCE_CELL.r = origin.r;
  SOURCE_GEAR.origin = SOURCE_CELL;
  SOURCE_GEAR.cells = [SOURCE_CELL];

  const nextCell = grid.get(key(SOURCE_CELL.q, SOURCE_CELL.r));
  if (!nextCell) return false;
  nextCell.gearId = "source";
  return true;
}

function getRandomSourceOrigin() {
  const candidates = [...grid.values()].filter((cell) => isValidSourceOrigin(cell));
  if (!candidates.length) return { ...LEGACY_SOURCE_CELL };

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return { q: chosen.q, r: chosen.r };
}

function randomizeSourceGearPosition() {
  moveSourceGearTo(getRandomSourceOrigin());
}

randomizeSourceGearPosition();

function getGearCells(size, origin) {
  if (size === "small") return [origin];
  return [
    origin,
    ...HEX_DIRS.map((d) => ({ q: origin.q + d.q, r: origin.r + d.r })),
  ];
}

function getGearRadius(size) {
  return GEAR_DEFS[size].radius;
}

function getUpgradeLevelValue(id) {
  if (typeof upgLevels === "undefined" || !upgLevels) return 0;

  const level = upgLevels[id];
  return Number.isInteger(level) && level > 0 ? level : 0;
}

function getGearBaseEfficiency(size) {
  const def = GEAR_DEFS[size];
  if (!def) return 1;

  if (size === "small") {
    return Math.min(1, def.efficiency + getUpgradeLevelValue("small_gear_eff") * 0.02);
  }

  if (size === "large") {
    return Math.min(1, def.efficiency + getUpgradeLevelValue("large_gear_eff") * 0.02);
  }

  return def.efficiency;
}

function syncGearEfficienciesWithUpgrades() {
  for (const gear of gears.values()) {
    if (gear.fixed) continue;

    const currentEfficiency = isFiniteNumber(gear.efficiency)
      ? Math.max(0, Math.min(1, gear.efficiency))
      : 0;
    gear.efficiency = Math.max(
      getGearBaseEfficiency(gear.size),
      currentEfficiency,
    );
  }
}

function getRotorTorqueFromUpgradeLevels() {
  return DEFAULT_SOURCE_STATE.torque + getUpgradeLevelValue("rotor_torque") * 30;
}

// Two gears mesh if any of their cells are hex-adjacent
function findMeshNeighbors(newGear) {
  const neighbors = [];
  const newCellSet = new Set(newGear.cells.map((c) => key(c.q, c.r)));
  for (const [id, g] of gears) {
    if (id === newGear.id) continue;
    let meshes = false;
    outer: for (const nc of newGear.cells) {
      for (const d of HEX_DIRS) {
        if (newCellSet.has(key(nc.q + d.q, nc.r + d.r))) continue; // same gear
        for (const gc of g.cells) {
          if (gc.q === nc.q + d.q && gc.r === nc.r + d.r) {
            meshes = true;
            break outer;
          }
        }
      }
    }
    if (meshes) {
      const ratio = newGear.radius / g.radius; // driven/driver when g drives new
      neighbors.push({ id, ratio });
    }
  }
  return neighbors;
}

function rebuildGearGraph() {
  gearGraph.edges.clear();

  for (const [id, gear] of gears) {
    gearGraph.edges.set(
      id,
      findMeshNeighbors(gear).map((neighbor) => ({
        neighbor: neighbor.id,
        ratio: gear.radius / gears.get(neighbor.id).radius,
      })),
    );
  }
}

// Deadlock detection (bipartite 2-coloring)
function wouldDeadlock(newGear, meshNeighbors) {
  if (meshNeighbors.length === 0) return false;
  // Build tentative full edge list including new gear
  const tempEdges = new Map(gearGraph.edges);
  tempEdges.set(
    newGear.id,
    meshNeighbors.map((n) => ({ neighbor: n.id, ratio: n.ratio })),
  );
  for (const n of meshNeighbors) {
    const existing = tempEdges.get(n.id) || [];
    tempEdges.set(n.id, [
      ...existing,
      { neighbor: newGear.id, ratio: 1 / n.ratio },
    ]);
  }

  // BFS 2-coloring over connected component containing newGear
  const color = new Map();
  color.set(newGear.id, 0);
  const queue = [newGear.id];
  while (queue.length) {
    const cur = queue.shift();
    const c = color.get(cur);
    for (const { neighbor } of tempEdges.get(cur) || []) {
      const expected = 1 - c;
      if (!color.has(neighbor)) {
        color.set(neighbor, expected);
        queue.push(neighbor);
      } else if (color.get(neighbor) !== expected) {
        return true; // contradiction
      }
    }
  }
  return false;
}

// Physics propagation (BFS from source)
let physicsResult = { power: 0, torque: 0, rpm: 0, generatorId: null };

function propagatePhysics() {
  // Reset all non-source gears
  for (const [id, g] of gears) {
    if (id !== "source") {
      g.torque = 0;
      g.omega = 0;
      g.depth = 0;
    }
  }
  SOURCE_GEAR.depth = 0;

  const visited = new Set();
  const queue = [
    {
      id: "source",
      torque: SOURCE_GEAR.torque,
      omega: SOURCE_GEAR.omega,
      depth: 0,
    },
  ];

  let genTorque = 0,
    genOmega = 0,
    genId = null;

  while (queue.length) {
    const { id, torque, omega, depth } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const g = gears.get(id);
    g.torque = torque;
    g.omega = omega;
    g.depth = depth;

    if (GEN_SET.has(key(g.origin.q, g.origin.r)) && id !== "source") {
      genTorque = torque;
      genOmega = Math.abs(omega);
      genId = id;
    }

    for (const { neighbor, ratio } of gearGraph.edges.get(id) || []) {
      if (visited.has(neighbor)) continue;
      const ng = gears.get(neighbor);
      queue.push({
        id: neighbor,
        torque: torque * g.efficiency,
        omega: -omega * (g.radius / ng.radius),
        depth: depth + 1,
      });
    }
  }

  const power = genTorque * genOmega;
  physicsResult = {
    power,
    torque: genTorque,
    rpm: (genOmega * 60) / (2 * Math.PI),
    generatorId: genId,
  };
  updateHUD();
}

function getAverageGearEfficiency(size) {
  const matched = [...gears.values()].filter(
    (gear) => !gear.fixed && gear.size === size,
  );
  if (!matched.length) return getGearBaseEfficiency(size);

  const total = matched.reduce((sum, gear) => sum + gear.efficiency, 0);
  return total / matched.length;
}

function getPipelinePowerCapForHUD() {
  if (
    typeof pipeline === "undefined" ||
    typeof BELT_BASE_POWER === "undefined" ||
    typeof PACKER_BASE_POWER === "undefined"
  ) {
    return 0;
  }

  if (typeof getPipelinePowerCap === "function") {
    return getPipelinePowerCap();
  }

  const laneCount =
    Number.isInteger(pipeline.laneCount) && pipeline.laneCount > 0
      ? pipeline.laneCount
      : 1;
  const beltCap = pipeline.beltConnected
    ? BELT_BASE_POWER * (pipeline.beltSpeed / DEFAULT_BELT_SPEED) * laneCount
    : 0;
  const packerCap = pipeline.packerConnected
    ? PACKER_BASE_POWER *
      (DEFAULT_PACK_INTERVAL / pipeline.packInterval) *
      laneCount
    : 0;
  return beltCap + packerCap;
}

function getTruckSpeedForHUD() {
  if (typeof getPipelineTruckSpeedForHUD === "function") {
    return getPipelineTruckSpeedForHUD();
  }
  if (typeof truck === "undefined") return 0;
  if (truck.state === "leaving") return truck.leaveSpeed;
  if (truck.state === "boosting") return truck.boostSpeed;
  if (truck.state === "returning") return truck.returnSpeed;
  return 0;
}

function renderTruckHUDValue(text, fallbackState, fallbackSpeed) {
  const truckStateEl = document.getElementById("val-truck-state");
  if (!truckStateEl) return;

  const valuesEl = truckStateEl.parentElement;
  if (!valuesEl) {
    truckStateEl.textContent = fallbackState;
    const truckSpeedEl = document.getElementById("val-truck-speed");
    if (truckSpeedEl) truckSpeedEl.textContent = fallbackSpeed;
    return;
  }

  const nextValueEl = document.createElement("span");
  nextValueEl.id = "val-truck-state";
  nextValueEl.className = "val val-multiline";
  nextValueEl.textContent = text;
  valuesEl.replaceChildren(nextValueEl);
}

function updateHUD(drive = null) {
  const powerEl = document.getElementById("val-power");
  const powerCapEl = document.getElementById("val-power-cap");
  const torqueEl = document.getElementById("val-torque");
  const effSmallEl = document.getElementById("val-eff-small");
  const effLargeEl = document.getElementById("val-eff-large");
  const effGenEl = document.getElementById("val-eff-gen");
  const beltSpeedEl = document.getElementById("val-belt-speed");
  const packerSpeedEl = document.getElementById("val-packer-speed");

  const state =
    drive || (typeof getPipelineDriveState === "function" ? getPipelineDriveState() : null);
  const outputPower = state
    ? state.availablePower
    : Math.max(
        0,
        physicsResult.power *
          (typeof energyMult !== "undefined" ? energyMult : 1),
      );
  const pipelinePowerCap =
    state && typeof state.pipelinePowerCap === "number"
      ? state.pipelinePowerCap
      : getPipelinePowerCapForHUD();
  const rotorTorque = SOURCE_GEAR.torque;
  const smallEfficiency = getAverageGearEfficiency("small") * 100;
  const largeEfficiency = getAverageGearEfficiency("large") * 100;
  const generatorEfficiency =
    (typeof energyMult !== "undefined" ? energyMult : 1) * 100;
  const beltSpeed =
    state && typeof pipeline !== "undefined" && state.beltOn
      ? pipeline.beltSpeed * state.speedFactor
      : 0;
  const packerSpeed =
    state &&
    typeof pipeline !== "undefined" &&
    state.packerOn
      ? state.speedFactor * (DEFAULT_PACK_INTERVAL / pipeline.packInterval)
      : 0;
  const truckStatus =
    typeof getTruckStatusText === "function" ? getTruckStatusText() : "-";
  const truckSpeed = getTruckSpeedForHUD();
  const truckHUDText =
    typeof getTruckHUDText === "function"
      ? getTruckHUDText()
      : `${truckStatus} / ${truckSpeed.toFixed(1)} px/s`;

  if (powerEl) powerEl.textContent = outputPower.toFixed(1);
  if (powerCapEl) powerCapEl.textContent = pipelinePowerCap.toFixed(1);
  if (torqueEl) torqueEl.textContent = rotorTorque.toFixed(2);
  if (effSmallEl) effSmallEl.textContent = smallEfficiency.toFixed(0);
  if (effLargeEl) effLargeEl.textContent = largeEfficiency.toFixed(0);
  if (effGenEl) effGenEl.textContent = generatorEfficiency.toFixed(0);
  if (beltSpeedEl) beltSpeedEl.textContent = beltSpeed.toFixed(1);
  if (packerSpeedEl) packerSpeedEl.textContent = packerSpeed.toFixed(2);
  renderTruckHUDValue(truckHUDText, truckStatus, truckSpeed.toFixed(1));
}

// Gear placement and removal
function placeGear(size, origin) {
  const cells = getGearCells(size, origin);
  const def = GEAR_DEFS[size];

  // 1. Grid cell check
  for (const c of cells) {
    const cell = grid.get(key(c.q, c.r));
    if (!cell || cell.gearId) return false;
  }

  // 2. Physical overlap check (Euclidean distance)
  // hex center dist = HEX_SIZE * sqrt(3)
  const newS = hexToScreen(origin.q, origin.r, 0, 0);
  const minMeshingDist = (def.radius + 0.5) * HEX_SIZE * Math.sqrt(3); // min possible meshing dist

  for (const [id, g] of gears) {
    const s = hexToScreen(g.origin.q, g.origin.r, 0, 0);
    const dx = newS.x - s.x,
      dy = newS.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const combinedR = (def.radius + g.radius) * HEX_SIZE * Math.sqrt(3);

    // If too close but not at meshing distance (within 5% tolerance)
    if (dist < combinedR * 0.98) {
      return "overlap";
    }
  }

  const id = `g${++gearIdCounter}`;
  const newGear = {
    id,
    size,
    origin,
    cells,
    radius: def.radius,
    efficiency: getGearBaseEfficiency(size),
    torque: 0,
    omega: 0,
    color: PALETTE[gearIdCounter % PALETTE.length],
    fixed: false,
  };

  const meshNeighbors = findMeshNeighbors(newGear);
  if (wouldDeadlock(newGear, meshNeighbors)) return "deadlock";

  // Commit
  gears.set(id, newGear);
  for (const c of cells) grid.get(key(c.q, c.r)).gearId = id;

  gearGraph.edges.set(
    id,
    meshNeighbors.map((n) => ({
      neighbor: n.id,
      ratio: newGear.radius / gears.get(n.id).radius,
    })),
  );
  for (const n of meshNeighbors) {
    const existing = gearGraph.edges.get(n.id) || [];
    gearGraph.edges.set(n.id, [
      ...existing,
      { neighbor: id, ratio: gears.get(n.id).radius / newGear.radius },
    ]);
  }

  propagatePhysics();
  scheduleGameSave(0);
  return true;
}

function removeGear(q, r) {
  const cell = grid.get(key(q, r));
  if (!cell || !cell.gearId) return false;
  const id = cell.gearId;
  const g = gears.get(id);
  if (g.fixed) return false;

  // Remove from grid
  for (const c of g.cells) grid.get(key(c.q, c.r)).gearId = null;

  // Remove edges
  for (const { neighbor } of gearGraph.edges.get(id) || []) {
    const edges = gearGraph.edges.get(neighbor) || [];
    gearGraph.edges.set(
      neighbor,
      edges.filter((e) => e.neighbor !== id),
    );
  }
  gearGraph.edges.delete(id);
  gears.delete(id);
  propagatePhysics();
  scheduleGameSave(0);
  return true;
}

// Particle system
const particles = [];
const MAX_PARTICLES = 300;

function spawnParticles(x, y, tangentAngle, speed) {
  if (particles.length >= MAX_PARTICLES) return;
  const count = Math.min(3, Math.floor(speed / 2) + 1);
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 0.6;
    const a = tangentAngle + spread;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * (1 + Math.random() * 2),
      vy: Math.sin(a) * (1 + Math.random() * 2),
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04,
      trail: [{ x, y }],
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // gravity
    p.life -= p.decay;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 5) p.trail.shift();
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    if (p.trail.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = p.life * 0.8;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.trail[0].x, p.trail[0].y);
    for (let i = 1; i < p.trail.length; i++)
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
    ctx.stroke();
    ctx.restore();
  }
}

// Hex polygon path
function hexPath(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    const px = cx + size * ISO_X_SCALE * Math.cos(a);
    const py = cy + size * ISO_Y_SCALE * Math.sin(a);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Build 2D gear path with rectangular teeth
function gearPath(ctx, r, teeth, angle) {
  const toothH = r * 0.15; // tooth height
  const toothW = ((Math.PI * 2) / teeth) * 0.45; // tooth arc half-width
  const Ri = r - toothH; // inner radius

  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const base = angle + ((Math.PI * 2) / teeth) * i;
    const a0 = base - toothW,
      a1 = base - toothW * 0.4;
    const a2 = base + toothW * 0.4,
      a3 = base + toothW;

    ctx.lineTo(Ri * Math.cos(a0), Ri * Math.sin(a0));
    ctx.lineTo(r * Math.cos(a1), r * Math.sin(a1));
    ctx.lineTo(r * Math.cos(a2), r * Math.sin(a2));
    ctx.lineTo(Ri * Math.cos(a3), Ri * Math.sin(a3));
  }
  ctx.closePath();
}

// Gear rendering
function drawGear(ctx, gear, cx, cy, time) {
  const s = hexToScreen(gear.origin.q, gear.origin.r, cx, cy);

  // Radius based on hex center distance (sqrt(3) * HEX_SIZE)
  const pitchR = gear.radius * HEX_SIZE * Math.sqrt(3);
  const r = pitchR * 1.05;
  const teeth = gear.size === "large" ? 24 : 12;

  // Physics rotation
  const rotation = gear.omega * time;

  // Bipartite meshing: Every second gear in the chain is offset by half a tooth
  const meshPhase = gear.depth % 2 === 1 ? Math.PI / teeth : 0;

  const angle = rotation + meshPhase;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Gear body
  ctx.fillStyle = gear.color;
  gearPath(ctx, r, teeth, angle);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Inner decorative circle
  ctx.fillStyle = shadeColor(gear.color, -15);
  ctx.beginPath();
  ctx.arc(0, 0, pitchR * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // Center hub
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.arc(0, 0, pitchR * 0.25, 0, Math.PI * 2);
  ctx.fill();

  if (gear.fixed) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `${Math.round(pitchR * 0.6)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", 0, 0);
  }

  ctx.restore();
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// Spawn mesh particles between two gears
function spawnMeshParticles(g1, g2, cx, cy, time) {
  if (Math.abs(g1.omega) < 0.1) return;
  const s1 = hexToScreen(g1.origin.q, g1.origin.r, cx, cy);
  const s2 = hexToScreen(g2.origin.q, g2.origin.r, cx, cy);
  const dx = s2.x - s1.x,
    dy = s2.y - s1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const t = (g1.radius * HEX_SIZE * 1.8 * ISO_X_SCALE) / dist;
  const mx = s1.x + dx * t;
  const my = s1.y + dy * t;
  const rotationDirection = Math.sign(g1.omega) || 1;
  const tangent = Math.atan2(dy, dx) + rotationDirection * (Math.PI / 2);
  if (Math.random() < 0.3) spawnParticles(mx, my, tangent, Math.abs(g1.omega));
}

// Main render loop
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

let camX = 0,
  camTargetX = 0;
const camera = {
  unlocked: false,
  panX: 0,
  panY: 0,
  zoom: 1,
  minZoom: 0.7,
  maxZoom: 2.2,
  pointerDown: false,
  dragging: false,
  suppressClick: false,
  dragStartX: 0,
  dragStartY: 0,
  dragOriginPanX: 0,
  dragOriginPanY: 0,
  moveUp: false,
  moveDown: false,
  moveLeft: false,
  moveRight: false,
};
let hoveredCell = null;
let selectedTool = "small";
let flashCell = null,
  flashTimer = 0;
let lastTime = 0;
let savePauseDepth = 0;
let autosaveHandle = 0;
let pendingSaveTimer = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getSaveStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

// Localization
const LANGUAGE_SETTINGS_KEY = "meshworks-language-v1";
const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "zh"]);
const UI_TEXT = {
  en: {
    "ui.languageToggle": "中文",
    "ui.newGame": "New Game",
    "ui.soundOn": "Sound On",
    "ui.soundOff": "Sound Off",
    "ui.soundUnavailable": "Sound N/A",
    "hud.title": "Status",
    "hud.power": "Output/Capacity  Power",
    "hud.torque": "Rotor Torque",
    "hud.efficiency": "Small/Large/Generator  Efficiency",
    "hud.rate": "Belt/Packer  Rate",
    "hud.truck": "Truck Status/Speed",
    "upgrade.title": "Upgrades",
    "upgrade.rotor_torque": "Rotor Torque",
    "upgrade.small_gear_eff": "Small Gear Efficiency",
    "upgrade.large_gear_eff": "Large Gear Efficiency",
    "upgrade.gen_eff": "Generator Efficiency",
    "upgrade.belt_speed": "Belt Speed",
    "upgrade.feed_rate": "Outbound Speed",
    "upgrade.packer_eff": "Packing Efficiency",
    "upgrade.truck_cap": "Truck Capacity",
    "upgrade.truck_freq": "Truck Speed",
    "upgrade.pipeline_lane": "Add Line",
    "upgrade.power_strip_socket": "Upgrade Power Strip",
    "upgrade.maxed": "Maxed",
    "upgrade.owned": "Owned",
    "upgrade.action": "Upgrade",
    "victory.kicker": "Stage Clear",
    "victory.title": "Goal Reached",
    "victory.message":
      "You reached 100000 funds and completed this round's goal. Keep expanding the factory to push profits even higher.",
    "victory.progress": "Current Funds",
    "victory.continue": "Continue",
    "tool.small": "Small Gear",
    "tool.large": "Large Gear",
    "tool.delete": "Delete",
    "info.main":
      "Click a hex to place a gear - connect to the generator to produce power",
    "message.newGameConfirm": "Start a new game? Current progress will be cleared.",
    "message.newGameStarted": "New game started.",
    "message.deadlock": "Cannot place gear: this would lock the drivetrain.",
    "message.overlap": "Gears would overlap here.",
    "message.occupied": "That position is already occupied.",
    "message.goalReached": "Goal reached! You can keep playing.",
    "message.pipelineBoth": "Both machines are connected to the strip.",
    "message.pipelineLeft": "Left machine connected to the strip.",
    "message.pipelineRight": "Right machine connected to the strip.",
    "truck.loading": "Loading",
    "truck.departing": "Departing",
    "truck.returning": "Returning",
    "truck.line": "L{index}",
    "pipeline.powerLabel": "POWER",
  },
  zh: {
    "ui.languageToggle": "English",
    "ui.newGame": "重新开始",
    "ui.soundOn": "声音开",
    "ui.soundOff": "声音关",
    "ui.soundUnavailable": "声音不可用",
    "hud.title": "状态",
    "hud.power": "输出/容量  功率",
    "hud.torque": "转子扭矩",
    "hud.efficiency": "小/大/发电机  效率",
    "hud.rate": "传送带/打包  速率",
    "hud.truck": "货车状态/速度",
    "upgrade.title": "升级",
    "upgrade.rotor_torque": "转子扭矩",
    "upgrade.small_gear_eff": "小齿轮效率",
    "upgrade.large_gear_eff": "大齿轮效率",
    "upgrade.gen_eff": "发电机效率",
    "upgrade.belt_speed": "传送带速度",
    "upgrade.feed_rate": "出库速度",
    "upgrade.packer_eff": "打包效率",
    "upgrade.truck_cap": "货车容量",
    "upgrade.truck_freq": "货车速度",
    "upgrade.pipeline_lane": "新增产线",
    "upgrade.power_strip_socket": "升级插排",
    "upgrade.maxed": "已满级",
    "upgrade.owned": "已拥有",
    "upgrade.action": "升级",
    "victory.kicker": "阶段完成",
    "victory.title": "目标达成",
    "victory.message":
      "你已达到 100000 资金并完成本轮目标。继续扩建工厂，把利润推得更高。",
    "victory.progress": "当前资金",
    "victory.continue": "继续",
    "tool.small": "小齿轮",
    "tool.large": "大齿轮",
    "tool.delete": "删除",
    "info.main": "点击六边形放置齿轮，连接到发电机后即可供电",
    "message.newGameConfirm": "要开始新游戏吗？当前进度会被清除。",
    "message.newGameStarted": "新的游戏已开始。",
    "message.deadlock": "无法放置齿轮：这会让传动系统卡死。",
    "message.overlap": "齿轮会在这里发生重叠。",
    "message.occupied": "这个位置已经被占用。",
    "message.goalReached": "目标已达成！你可以继续游玩。",
    "message.pipelineBoth": "两台机器都已接入插排。",
    "message.pipelineLeft": "左侧机器已接入插排。",
    "message.pipelineRight": "右侧机器已接入插排。",
    "truck.loading": "装货中",
    "truck.departing": "出发中",
    "truck.returning": "返回中",
    "truck.line": "{index}号线",
    "pipeline.powerLabel": "电源",
  },
};
let currentLanguage = DEFAULT_LANGUAGE;

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
}

function loadLanguagePreference() {
  const storage = getSaveStorage();
  if (!storage) return DEFAULT_LANGUAGE;

  try {
    return normalizeLanguage(storage.getItem(LANGUAGE_SETTINGS_KEY));
  } catch (error) {
    return DEFAULT_LANGUAGE;
  }
}

function saveLanguagePreference() {
  const storage = getSaveStorage();
  if (!storage) return;

  try {
    storage.setItem(LANGUAGE_SETTINGS_KEY, currentLanguage);
  } catch (error) {
    // Ignore storage write failures for optional settings.
  }
}

function t(key, params = null) {
  const dict = UI_TEXT[currentLanguage] || UI_TEXT[DEFAULT_LANGUAGE];
  const fallbackDict = UI_TEXT[DEFAULT_LANGUAGE];
  const template = dict[key] ?? fallbackDict[key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? `${params[name]}` : `{${name}}`,
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateLanguageToggleUI() {
  const button = document.getElementById("language-toggle-btn");
  if (!button) return;
  button.textContent = t("ui.languageToggle");
}

function updateStaticUIText() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = GAME_TITLE;

  setText("hud-panel-title", t("hud.title"));
  setText("label-power", t("hud.power"));
  setText("label-torque", t("hud.torque"));
  setText("label-efficiency", t("hud.efficiency"));
  setText("label-rate", t("hud.rate"));
  setText("label-truck", t("hud.truck"));
  setText("new-game-btn", t("ui.newGame"));
  setText("upgrade-panel-title", t("upgrade.title"));
  setText("victory-kicker", t("victory.kicker"));
  setText("btn-small-label", t("tool.small"));
  setText("btn-large-label", t("tool.large"));
  setText("btn-delete-label", t("tool.delete"));
  setText("info", t("info.main"));
  setText("val-truck-state", `${t("truck.loading")} 0/5`);
  updateLanguageToggleUI();
}

function applyLanguage(savePreference = true) {
  currentLanguage = normalizeLanguage(currentLanguage);
  if (savePreference) saveLanguagePreference();

  updateStaticUIText();
  updateSoundToggleUI();

  if (typeof initVictoryOverlay === "function") {
    initVictoryOverlay();
  }
  if (typeof buildUpgradePanel === "function") {
    buildUpgradePanel();
  }
  if (typeof refreshUpgradeUI === "function") {
    refreshUpgradeUI();
  }
  if (typeof updateMoneyUI === "function") {
    updateMoneyUI();
  } else if (typeof updateHUD === "function") {
    updateHUD();
  }
}

function setLanguage(language, savePreference = true) {
  currentLanguage = normalizeLanguage(language);
  applyLanguage(savePreference);
}

function toggleLanguage() {
  setLanguage(currentLanguage === "en" ? "zh" : "en");
}

currentLanguage = loadLanguagePreference();
updateStaticUIText();

let wavedashBridgeInitPromise = null;

async function initWavedashBridge() {
  if (!("WavedashJS" in window) || !window.WavedashJS) return null;
  if (wavedashBridgeInitPromise) return wavedashBridgeInitPromise;

  wavedashBridgeInitPromise = (async () => {
    try {
      const wavedash = await Promise.resolve(window.WavedashJS);
      if (!wavedash || typeof wavedash.init !== "function") return null;

      if (typeof wavedash.updateLoadProgressZeroToOne === "function") {
        wavedash.updateLoadProgressZeroToOne(1);
      }

      await Promise.resolve(wavedash.init({ debug: true }));
      return wavedash;
    } catch (error) {
      console.warn("Wavedash init failed:", error);
      return null;
    }
  })();

  return wavedashBridgeInitPromise;
}

// Sound effects
const SOUND_SETTINGS_KEY = "gear-puzzle-sound-enabled-v1";
const AudioContextClass = window.AudioContext || window.webkitAudioContext || null;
const soundState = {
  supported: Boolean(AudioContextClass),
  enabled: true,
  context: null,
  masterGain: null,
  lastPlayedAt: Object.create(null),
};

function loadSoundPreference() {
  const storage = getSaveStorage();
  if (!storage) return true;

  try {
    return storage.getItem(SOUND_SETTINGS_KEY) !== "0";
  } catch (error) {
    return true;
  }
}

function saveSoundPreference() {
  const storage = getSaveStorage();
  if (!storage) return;

  try {
    storage.setItem(SOUND_SETTINGS_KEY, soundState.enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage write failures for optional settings.
  }
}

soundState.enabled = loadSoundPreference();

function ensureAudioContext() {
  if (!soundState.supported) return null;

  if (!soundState.context) {
    const ctx = new AudioContextClass();
    const masterGain = ctx.createGain();
    masterGain.gain.value = soundState.enabled ? 1 : 0.0001;
    masterGain.connect(ctx.destination);
    soundState.context = ctx;
    soundState.masterGain = masterGain;
  }

  return soundState.context;
}

function syncSoundMasterGain() {
  if (!soundState.context || !soundState.masterGain) return;

  const now = soundState.context.currentTime;
  soundState.masterGain.gain.cancelScheduledValues(now);
  soundState.masterGain.gain.setTargetAtTime(
    soundState.enabled ? 1 : 0.0001,
    now,
    0.02,
  );
}

function resumeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx) return null;

  syncSoundMasterGain();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function updateSoundToggleUI() {
  const button = document.getElementById("sound-toggle-btn");
  if (!button) return;

  if (!soundState.supported) {
    button.textContent = t("ui.soundUnavailable");
    button.disabled = true;
    button.setAttribute("aria-pressed", "false");
    return;
  }

  button.disabled = false;
  button.textContent = soundState.enabled ? t("ui.soundOn") : t("ui.soundOff");
  button.setAttribute("aria-pressed", soundState.enabled ? "true" : "false");
}

function setSoundEnabled(enabled) {
  soundState.enabled = Boolean(enabled) && soundState.supported;
  saveSoundPreference();
  syncSoundMasterGain();
  updateSoundToggleUI();
}

function toggleSound() {
  const nextEnabled = !soundState.enabled;
  setSoundEnabled(nextEnabled);
  if (!nextEnabled) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  const playToggleConfirm = () => playSoundEffect("toggle");
  if (ctx.state === "suspended") {
    ctx.resume().then(playToggleConfirm).catch(() => {});
  } else {
    playToggleConfirm();
  }
}

function shouldPlaySound(name, throttleMs = 0) {
  if (!soundState.enabled || !soundState.supported) return false;

  const ctx = soundState.context;
  if (!ctx || ctx.state !== "running") return false;

  const now = performance.now();
  const lastAt = soundState.lastPlayedAt[name] || 0;
  if (throttleMs > 0 && now - lastAt < throttleMs) return false;
  soundState.lastPlayedAt[name] = now;
  return true;
}

function scheduleTone(
  ctx,
  {
    frequency,
    endFrequency = frequency,
    type = "triangle",
    gain = 0.035,
    duration = 0.12,
    attack = 0.004,
    delay = 0,
  },
) {
  if (!soundState.masterGain) return;

  const startTime = ctx.currentTime + delay;
  const endTime = startTime + duration;
  const safeStart = Math.max(40, frequency);
  const safeEnd = Math.max(40, endFrequency);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(safeStart, startTime);
  if (safeStart !== safeEnd) {
    osc.frequency.exponentialRampToValueAtTime(safeEnd, endTime);
  }

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(safeStart, safeEnd) * 4, startTime);
  filter.Q.value = 0.3;

  amp.gain.setValueAtTime(0.0001, startTime);
  amp.gain.linearRampToValueAtTime(gain, startTime + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(filter);
  filter.connect(amp);
  amp.connect(soundState.masterGain);

  osc.start(startTime);
  osc.stop(endTime + 0.02);
}

function playSoundEffect(name) {
  const throttleMap = {
    coin: 80,
    invalid: 120,
    connect: 80,
    disconnect: 80,
  };
  const throttleMs = throttleMap[name] || 0;
  if (!shouldPlaySound(name, throttleMs)) return;

  const ctx = soundState.context;
  if (!ctx) return;

  switch (name) {
    case "toggle":
      scheduleTone(ctx, {
        frequency: 480,
        endFrequency: 640,
        gain: 0.022,
        duration: 0.08,
      });
      scheduleTone(ctx, {
        frequency: 720,
        endFrequency: 900,
        gain: 0.016,
        duration: 0.08,
        delay: 0.04,
        type: "sine",
      });
      break;
    case "place-small":
      scheduleTone(ctx, {
        frequency: 320,
        endFrequency: 470,
        gain: 0.03,
        duration: 0.09,
      });
      scheduleTone(ctx, {
        frequency: 540,
        endFrequency: 720,
        gain: 0.014,
        duration: 0.07,
        delay: 0.035,
        type: "sine",
      });
      break;
    case "place-large":
      scheduleTone(ctx, {
        frequency: 210,
        endFrequency: 320,
        gain: 0.036,
        duration: 0.12,
      });
      scheduleTone(ctx, {
        frequency: 360,
        endFrequency: 460,
        gain: 0.018,
        duration: 0.1,
        delay: 0.045,
        type: "sine",
      });
      break;
    case "remove":
      scheduleTone(ctx, {
        frequency: 360,
        endFrequency: 170,
        gain: 0.028,
        duration: 0.1,
      });
      break;
    case "invalid":
      scheduleTone(ctx, {
        frequency: 180,
        endFrequency: 120,
        gain: 0.028,
        duration: 0.08,
        type: "square",
      });
      scheduleTone(ctx, {
        frequency: 160,
        endFrequency: 110,
        gain: 0.022,
        duration: 0.08,
        delay: 0.05,
        type: "square",
      });
      break;
    case "upgrade":
      scheduleTone(ctx, {
        frequency: 320,
        endFrequency: 420,
        gain: 0.024,
        duration: 0.08,
        type: "sine",
      });
      scheduleTone(ctx, {
        frequency: 460,
        endFrequency: 600,
        gain: 0.022,
        duration: 0.09,
        delay: 0.05,
        type: "triangle",
      });
      scheduleTone(ctx, {
        frequency: 620,
        endFrequency: 820,
        gain: 0.02,
        duration: 0.12,
        delay: 0.1,
        type: "sine",
      });
      break;
    case "connect":
      scheduleTone(ctx, {
        frequency: 520,
        endFrequency: 760,
        gain: 0.022,
        duration: 0.07,
      });
      scheduleTone(ctx, {
        frequency: 860,
        endFrequency: 980,
        gain: 0.012,
        duration: 0.06,
        delay: 0.025,
        type: "sine",
      });
      break;
    case "disconnect":
      scheduleTone(ctx, {
        frequency: 240,
        endFrequency: 150,
        gain: 0.022,
        duration: 0.08,
      });
      break;
    case "coin":
      scheduleTone(ctx, {
        frequency: 820,
        endFrequency: 1040,
        gain: 0.015,
        duration: 0.05,
        type: "sine",
      });
      scheduleTone(ctx, {
        frequency: 1180,
        endFrequency: 1420,
        gain: 0.011,
        duration: 0.04,
        delay: 0.025,
        type: "sine",
      });
      break;
    case "truck":
      scheduleTone(ctx, {
        frequency: 110,
        endFrequency: 90,
        gain: 0.03,
        duration: 0.14,
        type: "sawtooth",
      });
      scheduleTone(ctx, {
        frequency: 180,
        endFrequency: 150,
        gain: 0.018,
        duration: 0.12,
        delay: 0.02,
        type: "triangle",
      });
      break;
    case "victory":
      scheduleTone(ctx, {
        frequency: 392,
        endFrequency: 392,
        gain: 0.024,
        duration: 0.22,
        type: "sine",
      });
      scheduleTone(ctx, {
        frequency: 494,
        endFrequency: 494,
        gain: 0.02,
        duration: 0.24,
        delay: 0.06,
        type: "sine",
      });
      scheduleTone(ctx, {
        frequency: 659,
        endFrequency: 659,
        gain: 0.018,
        duration: 0.28,
        delay: 0.12,
        type: "triangle",
      });
      break;
    case "reset":
      scheduleTone(ctx, {
        frequency: 300,
        endFrequency: 200,
        gain: 0.02,
        duration: 0.11,
        type: "triangle",
      });
      scheduleTone(ctx, {
        frequency: 520,
        endFrequency: 280,
        gain: 0.014,
        duration: 0.12,
        delay: 0.03,
        type: "sine",
      });
      break;
    default:
      break;
  }
}

updateSoundToggleUI();
window.addEventListener("load", () => {
  applyLanguage(false);
  void initWavedashBridge();
});

function withSavePaused(callback) {
  savePauseDepth++;
  try {
    return callback();
  } finally {
    savePauseDepth = Math.max(0, savePauseDepth - 1);
  }
}

function setProgressUIVisible(visible) {
  const ids = ["upgrade-panel", "money-bar"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("visible", visible);
  }
}

function resetCameraState() {
  camX = 0;
  camTargetX = 0;
  camera.unlocked = false;
  camera.panX = 0;
  camera.panY = 0;
  camera.zoom = 1;
  camera.pointerDown = false;
  camera.dragging = false;
  camera.suppressClick = false;
  camera.moveUp = false;
  camera.moveDown = false;
  camera.moveLeft = false;
  camera.moveRight = false;
}

function resetPuzzleState(randomizeSource = true) {
  for (const cell of grid.values()) {
    if (cell.gearId !== "source") cell.gearId = null;
  }

  for (const id of [...gears.keys()]) {
    if (id !== "source") gears.delete(id);
  }

  gearIdCounter = 0;
  SOURCE_GEAR.torque = DEFAULT_SOURCE_STATE.torque;
  SOURCE_GEAR.omega = DEFAULT_SOURCE_STATE.omega;
  SOURCE_GEAR.depth = 0;
  gearGraph.edges.clear();
  gearGraph.edges.set("source", []);
  particles.length = 0;
  hoveredCell = null;
  flashCell = null;
  flashTimer = 0;
  resetCameraState();
  const hint = document.getElementById("pipeline-hint");
  if (hint) hint.innerHTML = "";
  selectTool("small");
  setProgressUIVisible(false);
  if (randomizeSource) {
    randomizeSourceGearPosition();
  }
  propagatePhysics();
}

function getPuzzleSaveData() {
  return {
    gearIdCounter,
    source: {
      origin: { q: SOURCE_CELL.q, r: SOURCE_CELL.r },
      torque: SOURCE_GEAR.torque,
      omega: DEFAULT_SOURCE_STATE.omega,
    },
    gears: [...gears.values()]
      .filter((gear) => !gear.fixed)
      .map((gear) => ({
        id: gear.id,
        size: gear.size,
        origin: { q: gear.origin.q, r: gear.origin.r },
        efficiency: gear.efficiency,
        color: gear.color,
      })),
    camera: {
      unlocked: camera.unlocked,
      panX: camera.panX,
      panY: camera.panY,
      zoom: camera.zoom,
    },
    reveal: {
      camX,
      camTargetX,
    },
    selectedTool,
  };
}

function applyPuzzleSaveData(data) {
  if (!data || typeof data !== "object") return;

  const sourceState =
    data.source && typeof data.source === "object" ? data.source : {};
  const savedSourceOrigin =
    sourceState.origin &&
    Number.isInteger(sourceState.origin.q) &&
    Number.isInteger(sourceState.origin.r)
      ? sourceState.origin
      : LEGACY_SOURCE_CELL;
  if (!moveSourceGearTo(savedSourceOrigin)) {
    moveSourceGearTo(LEGACY_SOURCE_CELL);
  }

  if (data.source && typeof data.source === "object") {
    let savedTorque = getRotorTorqueFromUpgradeLevels();
    if (isFiniteNumber(sourceState.torque)) {
      savedTorque = Math.max(0, sourceState.torque);
    }
    if (isFiniteNumber(sourceState.omega)) {
      const omegaFactor = Math.max(
        0,
        sourceState.omega / DEFAULT_SOURCE_STATE.omega,
      );
      savedTorque *= omegaFactor || 1;
    }
    if (
      savedTorque > 0 &&
      savedTorque < DEFAULT_SOURCE_STATE.torque * 0.75
    ) {
      savedTorque *= DEFAULT_SOURCE_STATE.torque / LEGACY_SOURCE_TORQUE;
    }
    SOURCE_GEAR.torque = Math.max(
      DEFAULT_SOURCE_STATE.torque,
      getRotorTorqueFromUpgradeLevels(),
      savedTorque,
    );
    SOURCE_GEAR.omega = DEFAULT_SOURCE_STATE.omega;
  }

  const savedGears = Array.isArray(data.gears) ? data.gears : [];
  let maxSavedGearId = 0;

  for (const entry of savedGears) {
    const size =
      entry?.size === "small" || entry?.size === "large" ? entry.size : null;
    if (!size) continue;

    const origin = entry.origin;
    if (!origin || !Number.isInteger(origin.q) || !Number.isInteger(origin.r)) {
      continue;
    }

    const cells = getGearCells(size, origin);
    if (
      cells.some((cell) => {
        const gridCell = grid.get(key(cell.q, cell.r));
        return !gridCell || gridCell.gearId;
      })
    ) {
      continue;
    }

    const requestedId =
      typeof entry.id === "string" && entry.id && !gears.has(entry.id)
        ? entry.id
        : `g${maxSavedGearId + 1}`;

    const match = /^g(\d+)$/.exec(requestedId);
    if (match) {
      maxSavedGearId = Math.max(maxSavedGearId, Number(match[1]));
    }

    const gear = {
      id: requestedId,
      size,
      origin: { q: origin.q, r: origin.r },
      cells,
      radius: getGearRadius(size),
      efficiency: isFiniteNumber(entry.efficiency)
        ? Math.max(0, Math.min(1, entry.efficiency))
        : getGearBaseEfficiency(size),
      torque: 0,
      omega: 0,
      color:
        typeof entry.color === "string" && entry.color
          ? entry.color
          : PALETTE[maxSavedGearId % PALETTE.length],
      fixed: false,
    };

    gears.set(gear.id, gear);
    for (const cell of cells) grid.get(key(cell.q, cell.r)).gearId = gear.id;
  }

  const requestedCounter = Number.isInteger(data.gearIdCounter)
    ? data.gearIdCounter
    : 0;
  gearIdCounter = Math.max(maxSavedGearId, requestedCounter);
  syncGearEfficienciesWithUpgrades();
  rebuildGearGraph();

  const cameraState =
    data.camera && typeof data.camera === "object" ? data.camera : {};
  const revealState =
    data.reveal && typeof data.reveal === "object" ? data.reveal : {};

  camera.unlocked = Boolean(cameraState.unlocked);
  camera.panX = isFiniteNumber(cameraState.panX) ? cameraState.panX : 0;
  camera.panY = isFiniteNumber(cameraState.panY) ? cameraState.panY : 0;
  camera.zoom = isFiniteNumber(cameraState.zoom)
    ? Math.max(camera.minZoom, Math.min(camera.maxZoom, cameraState.zoom))
    : 1;
  camera.pointerDown = false;
  camera.dragging = false;
  camera.suppressClick = false;
  camera.moveUp = false;
  camera.moveDown = false;
  camera.moveLeft = false;
  camera.moveRight = false;

  camX = isFiniteNumber(revealState.camX) ? revealState.camX : 0;
  camTargetX = isFiniteNumber(revealState.camTargetX)
    ? revealState.camTargetX
    : 0;
  if (camera.unlocked && camTargetX === 0) camTargetX = camX;

  const savedTool =
    data.selectedTool === "small" ||
    data.selectedTool === "large" ||
    data.selectedTool === "delete"
      ? data.selectedTool
      : "small";
  selectTool(savedTool);
  setProgressUIVisible(camTargetX > 0 || camera.unlocked);
}

function buildSavePayload() {
  return {
    version: SAVE_VERSION,
    puzzle: getPuzzleSaveData(),
    pipeline:
      typeof getPipelineSaveData === "function" ? getPipelineSaveData() : null,
  };
}

function saveGame() {
  if (savePauseDepth > 0) return false;

  const storage = getSaveStorage();
  if (!storage) return false;

  try {
    storage.setItem(SAVE_KEY, JSON.stringify(buildSavePayload()));
    return true;
  } catch (error) {
    return false;
  }
}

function scheduleGameSave(delay = 120) {
  if (savePauseDepth > 0) return;

  if (pendingSaveTimer) {
    window.clearTimeout(pendingSaveTimer);
  }

  pendingSaveTimer = window.setTimeout(() => {
    pendingSaveTimer = 0;
    saveGame();
  }, delay);
}

function loadGame() {
  const storage = getSaveStorage();
  if (!storage) return false;

  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return false;

  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return false;

    return withSavePaused(() => {
      resetPuzzleState(false);
      if (typeof resetPipelineState === "function") resetPipelineState();
      if (typeof applyPipelineSaveData === "function") {
        applyPipelineSaveData(data.pipeline);
      }
      applyPuzzleSaveData(data.puzzle);
      propagatePhysics();
      setProgressUIVisible(camTargetX > 0 || camera.unlocked);
      return true;
    });
  } catch (error) {
    return false;
  }
}

function startAutosave() {
  if (autosaveHandle) return;
  autosaveHandle = window.setInterval(() => {
    saveGame();
  }, AUTOSAVE_INTERVAL_MS);
}

function startNewGame() {
  if (!window.confirm(t("message.newGameConfirm"))) return;

  withSavePaused(() => {
    resetPuzzleState();
    if (typeof resetPipelineState === "function") resetPipelineState();
  });

  const storage = getSaveStorage();
  if (storage) {
    try {
      storage.removeItem(SAVE_KEY);
    } catch (error) {
      // Ignore storage cleanup errors and keep the fresh in-memory state.
    }
  }

  saveGame();
  showMsg(t("message.newGameStarted"));
  playSoundEffect("reset");
}

window.addEventListener("pagehide", () => {
  saveGame();
});

function centerX() {
  return canvas.width / 2 - camX;
}
function centerY() {
  return canvas.height / 2;
}

function getCanvasScreenPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function scenePointFromScreen(x, y) {
  const viewportCenterX = canvas.width / 2;
  const viewportCenterY = canvas.height / 2;

  return {
    x: viewportCenterX + (x - camera.panX - viewportCenterX) / camera.zoom,
    y: viewportCenterY + (y - camera.panY - viewportCenterY) / camera.zoom,
  };
}

function getScenePoint(canvas, e) {
  const point = getCanvasScreenPoint(canvas, e);
  return scenePointFromScreen(point.x, point.y);
}

function applySceneCameraTransform(ctx) {
  ctx.translate(camera.panX, camera.panY);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
}

function zoomCameraAt(screenX, screenY, zoomFactor) {
  const nextZoom = Math.max(
    camera.minZoom,
    Math.min(camera.maxZoom, camera.zoom * zoomFactor),
  );
  if (nextZoom === camera.zoom) return;

  const worldPoint = scenePointFromScreen(screenX, screenY);
  const viewportCenterX = canvas.width / 2;
  const viewportCenterY = canvas.height / 2;

  camera.zoom = nextZoom;
  camera.panX =
    screenX - viewportCenterX - (worldPoint.x - viewportCenterX) * camera.zoom;
  camera.panY =
    screenY - viewportCenterY - (worldPoint.y - viewportCenterY) * camera.zoom;
  scheduleGameSave();
}

function updateFreeCamera(dt) {
  if (!camera.unlocked) return;

  const moveX = Number(camera.moveRight) - Number(camera.moveLeft);
  const moveY = Number(camera.moveDown) - Number(camera.moveUp);
  if (moveX === 0 && moveY === 0) return;

  const moveLen = Math.hypot(moveX, moveY);
  const moveSpeed = 460;
  camera.panX += (moveX / moveLen) * moveSpeed * dt;
  camera.panY += (moveY / moveLen) * moveSpeed * dt;
}

function unlockFreeCamera() {
  if (camera.unlocked) return;

  camera.unlocked = true;
  camX = camTargetX;
  setProgressUIVisible(true);
  scheduleGameSave(0);
}

function render(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  // Camera pan
  camX += (camTargetX - camX) * 0.06;
  updateFreeCamera(dt);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applySceneCameraTransform(ctx);

  const cx = centerX(),
    cy = centerY();

  // Draw hex grid
  for (const [k, cell] of grid) {
    const s = hexToScreen(cell.q, cell.r, cx, cy);
    const isHov =
      hoveredCell && hoveredCell.q === cell.q && hoveredCell.r === cell.r;
    const isFlash =
      flashCell && flashCell.q === cell.q && flashCell.r === cell.r;
    const isGen = GEN_SET.has(k);
    const isSrc = cell.q === SOURCE_CELL.q && cell.r === SOURCE_CELL.r;

    hexPath(ctx, s.x, s.y, HEX_SIZE - 2);
    if (isFlash && flashTimer > 0) {
      ctx.fillStyle = `rgba(200,80,80,${flashTimer})`;
    } else if (isGen) {
      ctx.fillStyle = "#3a4030";
    } else if (isSrc) {
      ctx.fillStyle = "#303a38";
    } else if (isHov && !cell.gearId) {
      ctx.fillStyle = HEX_HOV;
    } else {
      ctx.fillStyle = HEX_BG;
    }
    ctx.fill();
  }

  // Draw gears (back to front by r+q for iso depth)
  const sortedGears = [...gears.values()].sort(
    (a, b) => a.origin.r + a.origin.q - (b.origin.r + b.origin.q),
  );
  for (const g of sortedGears) drawGear(ctx, g, cx, cy, ts / 1000);

  // Mesh particles
  for (const [id, edges] of gearGraph.edges) {
    const g1 = gears.get(id);
    if (!g1) continue;
    for (const { neighbor } of edges) {
      if (neighbor > id) continue; // avoid double
      const g2 = gears.get(neighbor);
      if (g2) spawnMeshParticles(g1, g2, cx, cy, ts / 1000);
    }
  }

  updateParticles(dt);
  drawParticles(ctx);

  // Flash decay
  if (flashTimer > 0) flashTimer -= dt * 2;

  // Preview ghost gear on hover
  if (
    hoveredCell &&
    !grid.get(key(hoveredCell.q, hoveredCell.r))?.gearId &&
    selectedTool !== "delete"
  ) {
    const s = hexToScreen(hoveredCell.q, hoveredCell.r, cx, cy);
    const def = GEAR_DEFS[selectedTool];

    // Check overlap for preview
    let isOverlap = false;
    const newS = hexToScreen(hoveredCell.q, hoveredCell.r, 0, 0);
    for (const [id, g] of gears) {
      const gs = hexToScreen(g.origin.q, g.origin.r, 0, 0);
      const dist = Math.sqrt((newS.x - gs.x) ** 2 + (newS.y - gs.y) ** 2);
      const combinedPitchR = (def.radius + g.radius) * HEX_SIZE * Math.sqrt(3);
      if (dist < combinedPitchR * 0.98) {
        isOverlap = true;
        break;
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = isOverlap ? "#ff4444" : PALETTE[0];
    ctx.beginPath();
    ctx.arc(
      s.x,
      s.y,
      def.radius * HEX_SIZE * Math.sqrt(3) * 1.05,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  // Camera trigger: if generator powered, pan right
  if (physicsResult.power > 0 && camTargetX === 0) {
    camTargetX = Math.max(canvas.width * 0.78, canvas.width / 2 + HEX_SIZE * 9);
    setProgressUIVisible(true);
    scheduleGameSave(0);
  }

  // Phase 2: pipeline frame (decoupled)
  if (typeof pipelineFrame === "function") pipelineFrame(ctx, cx, cy, dt);

  ctx.restore();

  if (
    !camera.unlocked &&
    camTargetX > 0 &&
    typeof pipeline !== "undefined" &&
    pipeline.connected &&
    Math.abs(camTargetX - camX) < 6
  ) {
    unlockFreeCamera();
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Input handling
function selectTool(t) {
  selectedTool = t;
  ["small", "large", "delete"].forEach((id) => {
    document.getElementById(`btn-${id}`).classList.toggle("active", id === t);
  });
}

function showMsg(text) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1200);
}

window.addEventListener(
  "pointerdown",
  () => {
    if (soundState.enabled) resumeAudioContext();
  },
  true,
);

window.addEventListener(
  "keydown",
  () => {
    if (soundState.enabled) resumeAudioContext();
  },
  true,
);

canvas.addEventListener("mousemove", (e) => {
  if (camera.pointerDown) {
    const point = getCanvasScreenPoint(canvas, e);

    if (
      !camera.dragging &&
      Math.hypot(point.x - camera.dragStartX, point.y - camera.dragStartY) > 4
    ) {
      camera.dragging = true;
      camera.suppressClick = true;
    }

    if (camera.dragging) {
      camera.panX = camera.dragOriginPanX + (point.x - camera.dragStartX);
      camera.panY = camera.dragOriginPanY + (point.y - camera.dragStartY);
      hoveredCell = null;
      return;
    }
  }

  const point = getScenePoint(canvas, e);
  hoveredCell = screenToHex(point.x, point.y, centerX(), centerY());
  if (!grid.has(key(hoveredCell.q, hoveredCell.r))) hoveredCell = null;
});

canvas.addEventListener("mousedown", (e) => {
  if (!camera.unlocked || e.button !== 0) return;

  const point = getCanvasScreenPoint(canvas, e);
  camera.pointerDown = true;
  camera.dragging = false;
  camera.dragStartX = point.x;
  camera.dragStartY = point.y;
  camera.dragOriginPanX = camera.panX;
  camera.dragOriginPanY = camera.panY;
});

canvas.addEventListener("mouseup", () => {
  if (!camera.pointerDown) return;

  const wasDragging = camera.dragging;
  camera.pointerDown = false;
  camera.dragging = false;
  if (wasDragging) scheduleGameSave();
});

canvas.addEventListener("mouseleave", () => {
  hoveredCell = null;
  camera.pointerDown = false;
  camera.dragging = false;
});

canvas.addEventListener("click", (e) => {
  if (camera.suppressClick) {
    camera.suppressClick = false;
    return;
  }

  if (!hoveredCell) return;
  const { q, r } = hoveredCell;

  if (selectedTool === "delete") {
    if (removeGear(q, r)) {
      playSoundEffect("remove");
    } else {
      playSoundEffect("invalid");
    }
    return;
  }

  const result = placeGear(selectedTool, { q, r });
  if (result === "deadlock") {
    flashCell = { q, r };
    flashTimer = 1.0;
    showMsg(t("message.deadlock"));
    playSoundEffect("invalid");
  } else if (result === "overlap") {
    flashCell = { q, r };
    flashTimer = 1.0;
    showMsg(t("message.overlap"));
    playSoundEffect("invalid");
  } else if (!result) {
    showMsg(t("message.occupied"));
    playSoundEffect("invalid");
  } else {
    playSoundEffect(selectedTool === "large" ? "place-large" : "place-small");
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!camera.unlocked) return;

    const point = getCanvasScreenPoint(canvas, e);
    zoomCameraAt(point.x, point.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    e.preventDefault();
  },
  { passive: false },
);

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.key === "1") selectTool("small");
  if (e.key === "2") selectTool("large");
  if (e.key === "x" || e.key === "X" || e.key === "Delete") {
    selectTool("delete");
  }

  if (!camera.unlocked) {
    if (e.key === "d" || e.key === "D") selectTool("delete");
    return;
  }

  if (e.code === "KeyW" || e.code === "ArrowUp") camera.moveUp = true;
  if (e.code === "KeyS" || e.code === "ArrowDown") camera.moveDown = true;
  if (e.code === "KeyA" || e.code === "ArrowLeft") camera.moveLeft = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") camera.moveRight = true;

  if (
    e.code === "KeyW" ||
    e.code === "KeyA" ||
    e.code === "KeyS" ||
    e.code === "KeyD" ||
    e.code === "ArrowUp" ||
    e.code === "ArrowDown" ||
    e.code === "ArrowLeft" ||
    e.code === "ArrowRight"
  ) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowUp") camera.moveUp = false;
  if (e.code === "KeyS" || e.code === "ArrowDown") camera.moveDown = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") camera.moveLeft = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") camera.moveRight = false;

  if (
    camera.unlocked &&
    (e.code === "KeyW" ||
      e.code === "KeyA" ||
      e.code === "KeyS" ||
      e.code === "KeyD" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight")
  ) {
    scheduleGameSave();
  }
});
