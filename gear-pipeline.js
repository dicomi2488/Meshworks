// Phase 2: Pipeline and incremental system (power strip edition)

// Upgrade definitions
const UPGRADES = [
  {
    id: "rotor_torque",
    name: "Rotor Torque",
    base: 50,
    effect: () => {
      SOURCE_GEAR.torque += 30;
      propagatePhysics();
    },
  },
  {
    id: "small_gear_eff",
    maxLevel: 10,
    name: "Small Gear Efficiency",
    base: 80,
    effect: () => {
      if (typeof syncGearEfficienciesWithUpgrades === "function") {
        syncGearEfficienciesWithUpgrades();
      }
      propagatePhysics();
    },
  },
  {
    id: "large_gear_eff",
    maxLevel: 20,
    name: "Large Gear Efficiency",
    base: 80,
    effect: () => {
      if (typeof syncGearEfficienciesWithUpgrades === "function") {
        syncGearEfficienciesWithUpgrades();
      }
      propagatePhysics();
    },
  },
  {
    id: "gen_eff",
    maxLevel: 12,
    name: "Generator Efficiency",
    base: 100,
    effect: () => {
      energyMult = getGeneratorEfficiencyFromUpgrades();
    },
  },
  {
    id: "belt_speed",
    name: "Belt Speed",
    base: 40,
    effect: () => {
      pipeline.beltSpeed += 20;
    },
  },
  {
    id: "feed_rate",
    name: "Outbound Speed",
    base: 100,
    effect: () => {
      updatePipelineInfoUI();
    },
  },
  {
    id: "packer_eff",
    name: "Packing Efficiency",
    base: 60,
    effect: () => {
      pipeline.packInterval = reducePackInterval(pipeline.packInterval);
      updatePipelineInfoUI();
    },
  },
  {
    id: "truck_cap",
    name: "Truck Capacity",
    base: 120,
    effect: () => {
      for (const line of getPipelineLines()) {
        line.truck.capacity += 2;
      }
    },
  },
  {
    id: "truck_freq",
    name: "Truck Speed",
    base: 90,
    effect: () => {
      for (const line of getPipelineLines()) {
        line.truck.speedMultiplier = getTruckSpeedMultiplierFromUpgrades();
        if (line.truck.state === "waiting") {
          planTruckRoute(line.truck);
        } else {
          line.truck.leaveSpeed = TRUCK_BASE_SPEED * line.truck.speedMultiplier;
          line.truck.returnSpeed =
            line.truck.leaveSpeed * TRUCK_REVERSE_SPEED_FACTOR;
        }
      }
    },
  },
  {
    id: "pipeline_lane",
    name: "Add Line",
    base: 2000,
    costMultiplier: 2,
    effect: () => {
      pipeline.laneCount = getPipelineLineCount() + 1;
      syncPipelineLineCount();
    },
  },
  {
    id: "power_strip_socket",
    name: "Upgrade Power Strip",
    base: 500,
    costMultiplier: 2,
    effect: () => {
      syncSharedPowerStrips();
    },
  },
];

const upgLevels = {};
UPGRADES.forEach((u) => {
  upgLevels[u.id] = 0;
});

function getUpgradeDef(id) {
  return UPGRADES.find((upgrade) => upgrade.id === id) || null;
}

function getUpgradeName(u) {
  if (!u) return "";
  return typeof t === "function" ? t(`upgrade.${u.id}`) : u.name;
}

function isUpgradeMaxed(u) {
  if (u?.id === "packer_eff") {
    return pipeline.packInterval <= MIN_PACK_INTERVAL + 1e-9;
  }
  return Number.isInteger(u.maxLevel) && upgLevels[u.id] >= u.maxLevel;
}

function getUpgradeCostMultiplier(u) {
  return typeof u.costMultiplier === "number" &&
    Number.isFinite(u.costMultiplier) &&
    u.costMultiplier > 1
    ? u.costMultiplier
    : 1.15;
}

function upgCost(u) {
  if (isUpgradeMaxed(u)) return 0;
  return Math.floor(
    u.base * Math.pow(getUpgradeCostMultiplier(u), upgLevels[u.id]),
  );
}

function clampUpgradeLevel(id, level) {
  const upgrade = getUpgradeDef(id);
  if (!Number.isInteger(level) || level < 0) return 0;
  if (!Number.isInteger(upgrade?.maxLevel)) return level;
  return Math.min(level, upgrade.maxLevel);
}

function getUpgradeLevelText(u) {
  if (Number.isInteger(u.maxLevel)) {
    return `Lv.${upgLevels[u.id]}/${u.maxLevel}`;
  }
  return `Lv.${upgLevels[u.id]}`;
}

function getUpgradeCostText(u) {
  return isUpgradeMaxed(u)
    ? (typeof t === "function" ? t("upgrade.maxed") : "Maxed")
    : `$${upgCost(u)}`;
}

function getUpgradeButtonText(u) {
  if (isUpgradeMaxed(u)) {
    return typeof t === "function" ? t("upgrade.owned") : "Owned";
  }
  return typeof t === "function" ? t("upgrade.action") : "Upgrade";
}

function getSavedUpgradeLevel(savedLevels, id) {
  const directLevel = savedLevels[id];
  if (Number.isInteger(directLevel) && directLevel > 0) {
    return clampUpgradeLevel(id, directLevel);
  }

  if (id === "small_gear_eff" || id === "large_gear_eff") {
    const legacyGearLossLevel = savedLevels.gear_loss;
    if (Number.isInteger(legacyGearLossLevel) && legacyGearLossLevel > 0) {
      return clampUpgradeLevel(id, legacyGearLossLevel);
    }
  }

  return 0;
}

function getGeneratorEfficiencyForLevel(level) {
  return Math.min(1, DEFAULT_GENERATOR_EFFICIENCY + Math.max(0, level) * 0.05);
}

function getGeneratorEfficiencyFromUpgrades() {
  return getGeneratorEfficiencyForLevel(upgLevels.gen_eff);
}

function getTruckSpeedMultiplierForLevel(level) {
  return 1 + Math.max(0, level) * 0.5;
}

function getTruckSpeedMultiplierFromUpgrades() {
  return getTruckSpeedMultiplierForLevel(upgLevels.truck_freq);
}

function roundPackInterval(interval) {
  return Math.round(interval * 100) / 100;
}

function reducePackInterval(interval) {
  if (interval > PACK_INTERVAL_FINE_THRESHOLD) {
    return Math.max(
      PACK_INTERVAL_FINE_THRESHOLD,
      roundPackInterval(interval - PACK_INTERVAL_STEP),
    );
  }

  return Math.max(
    MIN_PACK_INTERVAL,
    roundPackInterval(interval - PACK_INTERVAL_FINE_STEP),
  );
}

function getPackIntervalForLevel(level) {
  let interval = DEFAULT_PACK_INTERVAL;
  for (let i = 0; i < Math.max(0, level); i++) {
    interval = reducePackInterval(interval);
    if (interval <= MIN_PACK_INTERVAL) return MIN_PACK_INTERVAL;
  }
  return interval;
}

function getPackIntervalFromUpgrades() {
  return getPackIntervalForLevel(upgLevels.packer_eff || 0);
}

function getFeedOutputRateFromUpgrades() {
  const baseRate = DEFAULT_FEED_OUTPUT_RATE;
  return baseRate + Math.max(0, upgLevels.feed_rate || 0);
}

function getFeedOutputInterval() {
  return 1 / getFeedOutputRateFromUpgrades();
}

// Economy and state
const VICTORY_MONEY_TARGET = 100000;
let money = 0;
const DEFAULT_GENERATOR_EFFICIENCY = 0.4;
let energyMult = DEFAULT_GENERATOR_EFFICIENCY;
let hasClearedGame = false;
let victoryOverlayDismissed = false;
const PARCEL_VALUE = 10;
const DEFAULT_BELT_SPEED = 100;
const DEFAULT_PACK_INTERVAL = 1.2;
const MIN_PACK_INTERVAL = 0.02;
const PACK_INTERVAL_STEP = 0.1;
const PACK_INTERVAL_FINE_THRESHOLD = 0.2;
const PACK_INTERVAL_FINE_STEP = 0.02;
const DEFAULT_FEED_OUTPUT_RATE = 1 / DEFAULT_PACK_INTERVAL;
const BELT_BASE_POWER = 42;
const PACKER_BASE_POWER = 58;
const MAX_PIPELINE_SPEED_FACTOR = 2.4;
const PARCEL_START_X = 20;
const PACKER_STOP_X = 190;
const DISPATCH_WAIT_X = 332;
const TRUCK_LOAD_X = 380;
const TRUCK_CRUISE_DISTANCE = 500;
const TRUCK_LEAVE_DURATION = 0.55;
const TRUCK_BASE_SPEED = 96 / TRUCK_LEAVE_DURATION;
const TRUCK_REVERSE_SPEED_FACTOR = 0.5;
const PARCEL_SPACING = 28;
const DEFAULT_PIPELINE_LANES = 1;
const PIPELINE_LANE_GAP = 24;
const DEFAULT_POWER_STRIP_SOCKETS = 4;
const POWER_STRIP_SOCKET_INCREMENT = 2;
const POWER_STRIP_SOCKET_START_X = 55;
const POWER_STRIP_SOCKET_SPACING = 45;
const POWER_STRIP_END_PADDING = 60;
const PIPELINE_LINE_STACK_GAP = 220;
const SHIPPED_STATES = new Set(["shipped"]);

const pipeline = {
  connected: false,
  beltConnected: false,
  packerConnected: false,
  beltPowered: false,
  packerPowered: false,
  laneCount: DEFAULT_PIPELINE_LANES,
  beltSpeed: 100,
  packInterval: 1.2,
  originX: 0,
  originY: 0,
  bounds: { x: 0, y: 0, w: 0, h: 0 },
  lines: [],
  sharedStrips: [],
};

const DEFAULT_PIPELINE_STATE = {
  money: 0,
  energyMult: DEFAULT_GENERATOR_EFFICIENCY,
  laneCount: DEFAULT_PIPELINE_LANES,
  beltSpeed: DEFAULT_BELT_SPEED,
  packInterval: DEFAULT_PACK_INTERVAL,
  truckCapacity: 5,
  truckSpeedMultiplier: 1,
};
const VALID_TRUCK_STATES = new Set(["waiting", "leaving", "returning"]);
const VALID_PARCEL_STATES = new Set(["moving", "packing", "shipped"]);

function normalizeTruckState(state) {
  if (state === "boosting" || state === "resetting") {
    return "returning";
  }

  return VALID_TRUCK_STATES.has(state) ? state : "waiting";
}

function getPipelineLaneCount() {
  if (!Number.isInteger(pipeline.laneCount)) return DEFAULT_PIPELINE_LANES;
  return Math.max(DEFAULT_PIPELINE_LANES, pipeline.laneCount);
}

function getPipelineLineCount() {
  return getPipelineLaneCount();
}

function getPipelineStackHeight() {
  return Math.max(0, getPipelineLineCount() - 1) * PIPELINE_LINE_STACK_GAP;
}

function getTruckCapacityForLevel(level) {
  return DEFAULT_PIPELINE_STATE.truckCapacity + Math.max(0, level) * 2;
}

function getTruckCapacityFromUpgrades() {
  return getTruckCapacityForLevel(upgLevels.truck_cap);
}

function getPowerStripSocketCountForLevel(level) {
  return (
    DEFAULT_POWER_STRIP_SOCKETS +
    Math.max(0, level) * POWER_STRIP_SOCKET_INCREMENT
  );
}

function getPowerStripSocketCount() {
  return getPowerStripSocketCountForLevel(upgLevels.power_strip_socket || 0);
}

function getPowerStripWidth() {
  return (
    POWER_STRIP_SOCKET_START_X +
    POWER_STRIP_END_PADDING +
    Math.max(0, getPowerStripSocketCount() - 1) * POWER_STRIP_SOCKET_SPACING
  );
}

function getLinesPerPowerStrip() {
  return Math.max(1, Math.floor(getPowerStripSocketCount() / 2));
}

function createTruckState() {
  return {
    capacity: getTruckCapacityFromUpgrades(),
    load: 0,
    x: TRUCK_LOAD_X,
    state: "waiting",
    speedMultiplier: getTruckSpeedMultiplierFromUpgrades(),
    timer: 0,
    cruiseOutX: TRUCK_LOAD_X + TRUCK_CRUISE_DISTANCE,
    exitX: TRUCK_LOAD_X + TRUCK_CRUISE_DISTANCE,
    returnStartX: TRUCK_LOAD_X + TRUCK_CRUISE_DISTANCE,
    leaveSpeed: TRUCK_BASE_SPEED * getTruckSpeedMultiplierFromUpgrades(),
    returnSpeed:
      TRUCK_BASE_SPEED *
      getTruckSpeedMultiplierFromUpgrades() *
      TRUCK_REVERSE_SPEED_FACTOR,
    wheelAngle: 0,
  };
}

function createPowerStripState() {
  return {
    x: 0,
    y: 0,
    w:
      POWER_STRIP_SOCKET_START_X +
      POWER_STRIP_END_PADDING +
      (DEFAULT_POWER_STRIP_SOCKETS - 1) * POWER_STRIP_SOCKET_SPACING,
    h: 28,
    baseX: 0,
    baseY: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragAnchorX: 0,
    dragAnchorY: 0,
    sockets: [],
    leadStart: { x: 0, y: 0 },
    leadEnd: { x: 0, y: 0 },
  };
}

function createPlug(id, label, color, lineIndex, role) {
  return {
    id,
    label,
    color,
    lineIndex,
    role,
    dragging: false,
    connected: false,
    socketIndex: null,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    homeX: 0,
    homeY: 0,
  };
}

function createPlugSet(lineIndex) {
  return {
    belt: createPlug(`belt_${lineIndex}`, "", "#d6c7a7", lineIndex, "belt"),
    packer: createPlug(
      `packer_${lineIndex}`,
      "",
      "#bcc7d8",
      lineIndex,
      "packer",
    ),
  };
}

function createPipelineLine(lineIndex) {
  const line = {
    id: lineIndex,
    connected: false,
    beltConnected: false,
    packerConnected: false,
    beltPowered: false,
    packerPowered: false,
    packTimer: 0,
    parcels: [],
    originX: 0,
    originY: 0,
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    powerStrip: createPowerStripState(),
    plugs: createPlugSet(lineIndex),
    truck: createTruckState(),
    rollerAngle: 0,
  };
  return line;
}

function syncPowerStripMetrics(targetStrip = null) {
  const width = getPowerStripWidth();
  if (targetStrip) {
    targetStrip.w = width;
    return width;
  }

  for (const line of pipeline.lines) {
    line.powerStrip.w = width;
  }

  return width;
}

function getStripIndexForLine(lineIndex) {
  return Math.floor(lineIndex / getLinesPerPowerStrip());
}

function getLinesForPowerStrip(strip) {
  return getPipelineLines().filter((line) => line.powerStrip === strip);
}

function getSavedPowerStripState(savedSharedStrips, savedLines, stripIndex) {
  const sharedStripState =
    Array.isArray(savedSharedStrips) &&
    savedSharedStrips[stripIndex] &&
    typeof savedSharedStrips[stripIndex] === "object"
      ? savedSharedStrips[stripIndex]
      : null;
  if (sharedStripState) return sharedStripState;

  const startIndex = stripIndex * getLinesPerPowerStrip();
  const endIndex = Math.min(savedLines.length, startIndex + getLinesPerPowerStrip());
  for (let i = startIndex; i < endIndex; i++) {
    const lineState = savedLines[i];
    if (lineState?.powerStrip && typeof lineState.powerStrip === "object") {
      return lineState.powerStrip;
    }
  }

  return null;
}

function syncSharedPowerStrips() {
  const sharedStripCount = Math.max(
    1,
    Math.ceil(getPipelineLineCount() / getLinesPerPowerStrip()),
  );

  while (pipeline.sharedStrips.length < sharedStripCount) {
    pipeline.sharedStrips.push(createPowerStripState());
  }

  if (pipeline.sharedStrips.length > sharedStripCount) {
    pipeline.sharedStrips.length = sharedStripCount;
  }

  for (let i = 0; i < pipeline.lines.length; i++) {
    pipeline.lines[i].powerStrip = pipeline.sharedStrips[getStripIndexForLine(i)];
  }

  syncPowerStripMetrics();
}

function syncPipelineLineCount() {
  const targetCount = getPipelineLineCount();

  while (pipeline.lines.length < targetCount) {
    pipeline.lines.push(createPipelineLine(pipeline.lines.length));
  }

  if (pipeline.lines.length > targetCount) {
    pipeline.lines.length = targetCount;
  }

  syncSharedPowerStrips();
  return pipeline.lines;
}

function getPipelineLines() {
  if (pipeline.lines.length !== getPipelineLineCount()) {
    return syncPipelineLineCount();
  }

  return pipeline.lines;
}

const interactionState = {
  suppressClick: false,
};

function isPipelineNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function setVictoryOverlayVisible(visible) {
  const overlay = document.getElementById("victory-overlay");
  if (!overlay) return;

  overlay.classList.toggle("visible", visible);
  overlay.setAttribute("aria-hidden", visible ? "false" : "true");
}

function updateVictoryProgressUI() {
  const currentEl = document.getElementById("victory-money-current");
  if (currentEl) currentEl.textContent = Math.floor(money);

  const targetEl = document.getElementById("victory-money-target");
  if (targetEl) targetEl.textContent = `${VICTORY_MONEY_TARGET}`;
}

function syncVictoryOverlayState() {
  updateVictoryProgressUI();
  setVictoryOverlayVisible(hasClearedGame && !victoryOverlayDismissed);
}

function initVictoryOverlay() {
  const titleEl = document.getElementById("victory-title");
  if (titleEl) titleEl.textContent = typeof t === "function" ? t("victory.title") : "Goal Reached";

  const messageEl = document.getElementById("victory-message");
  if (messageEl) {
    messageEl.textContent =
      typeof t === "function"
        ? t("victory.message")
        : "You reached 100000 funds and completed this round's goal. Keep expanding the factory to push profits even higher.";
  }

  const progressLabelEl = document.getElementById("victory-progress-label");
  if (progressLabelEl) {
    progressLabelEl.textContent = typeof t === "function" ? t("victory.progress") : "Current Funds";
  }

  const continueBtn = document.getElementById("victory-continue-btn");
  if (continueBtn) continueBtn.textContent = typeof t === "function" ? t("victory.continue") : "Continue";

  const overlay = document.getElementById("victory-overlay");
  if (overlay && overlay.dataset.bound !== "true") {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) continueAfterVictory();
    });
    overlay.dataset.bound = "true";
  }

  syncVictoryOverlayState();
}

function checkVictoryUnlock() {
  if (hasClearedGame || money < VICTORY_MONEY_TARGET) return;

  hasClearedGame = true;
  victoryOverlayDismissed = false;

  if (typeof showMsg === "function") {
    showMsg(typeof t === "function" ? t("message.goalReached") : "Goal reached! You can keep playing.");
  }
  if (typeof playSoundEffect === "function") {
    playSoundEffect("victory");
  }

  if (typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }
}

function continueAfterVictory() {
  if (!hasClearedGame) return;

  victoryOverlayDismissed = true;
  syncVictoryOverlayState();

  if (typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }
}

function resetPipelineState() {
  money = DEFAULT_PIPELINE_STATE.money;
  energyMult = DEFAULT_PIPELINE_STATE.energyMult;
  hasClearedGame = false;
  victoryOverlayDismissed = false;

  for (const u of UPGRADES) {
    upgLevels[u.id] = 0;
  }

  pipeline.laneCount = DEFAULT_PIPELINE_STATE.laneCount;
  pipeline.beltSpeed = DEFAULT_PIPELINE_STATE.beltSpeed;
  pipeline.packInterval = DEFAULT_PIPELINE_STATE.packInterval;
  pipeline.originX = 0;
  pipeline.originY = 0;
  pipeline.bounds = { x: 0, y: 0, w: 0, h: 0 };
  syncPipelineLineCount();

  for (const line of getPipelineLines()) {
    line.connected = false;
    line.beltConnected = false;
    line.packerConnected = false;
    line.beltPowered = false;
    line.packerPowered = false;
    line.packTimer = 0;
    line.parcels = [];
    line.originX = 0;
    line.originY = 0;
    line.bounds = { x: 0, y: 0, w: 0, h: 0 };
    line.rollerAngle = 0;

    line.truck.capacity = DEFAULT_PIPELINE_STATE.truckCapacity;
    line.truck.load = 0;
    line.truck.x = TRUCK_LOAD_X;
    line.truck.state = "waiting";
    line.truck.speedMultiplier = DEFAULT_PIPELINE_STATE.truckSpeedMultiplier;
    line.truck.timer = 0;
    line.truck.wheelAngle = 0;
    planTruckRoute(line.truck);

    line.powerStrip.x = 0;
    line.powerStrip.y = 0;
    line.powerStrip.baseX = 0;
    line.powerStrip.baseY = 0;
    line.powerStrip.offsetX = 0;
    line.powerStrip.offsetY = 0;
    line.powerStrip.dragging = false;
    line.powerStrip.dragAnchorX = 0;
    line.powerStrip.dragAnchorY = 0;
    syncPowerStripMetrics(line.powerStrip);
    line.powerStrip.sockets = [];
    line.powerStrip.leadStart = { x: 0, y: 0 };
    line.powerStrip.leadEnd = { x: 0, y: 0 };

    for (const plug of Object.values(line.plugs)) {
      plug.dragging = false;
      plug.connected = false;
      plug.socketIndex = null;
      plug.x1 = 0;
      plug.y1 = 0;
      plug.x2 = 0;
      plug.y2 = 0;
      plug.homeX = 0;
      plug.homeY = 0;
    }
  }

  interactionState.suppressClick = false;
  syncPipelineConnectionState();
  syncVictoryOverlayState();
  updateMoneyUI();
  updatePipelineInfoUI();
}

function getPipelineSaveData() {
  return {
    money,
    energyMult,
    upgLevels: { ...upgLevels },
    pipeline: {
      lineCount: pipeline.laneCount,
      laneCount: pipeline.laneCount,
      beltSpeed: pipeline.beltSpeed,
      packInterval: pipeline.packInterval,
      sharedStrips: pipeline.sharedStrips.map((strip) => ({
        offsetX: strip.offsetX,
        offsetY: strip.offsetY,
      })),
      lines: getPipelineLines().map((line) => ({
        packTimer: line.packTimer,
        parcels: line.parcels.map((parcel) => ({
          x: parcel.x,
          state: parcel.state,
          alpha: parcel.alpha,
          packProgress: parcel.packProgress,
        })),
        truck: {
          capacity: line.truck.capacity,
          load: line.truck.load,
          x: line.truck.x,
          state: line.truck.state,
          speedMultiplier: line.truck.speedMultiplier,
          timer: line.truck.timer,
        },
        powerStrip: {
          offsetX: line.powerStrip.offsetX,
          offsetY: line.powerStrip.offsetY,
        },
        plugs: Object.fromEntries(
          Object.entries(line.plugs).map(([id, plug]) => [
            id,
            {
              connected: plug.connected,
              socketIndex: plug.socketIndex,
            },
          ]),
        ),
        rollerAngle: line.rollerAngle,
        truckWheelAngle: line.truck.wheelAngle,
      })),
    },
    victory: {
      cleared: hasClearedGame,
      dismissed: victoryOverlayDismissed,
    },
  };
}

function applyPipelineSaveData(data) {
  if (!data || typeof data !== "object") {
    syncPipelineConnectionState();
    updateMoneyUI();
    updatePipelineInfoUI();
    return;
  }

  if (isPipelineNumber(data.money)) money = Math.max(0, data.money);
  const victoryState =
    data.victory && typeof data.victory === "object" ? data.victory : {};
  hasClearedGame =
    Boolean(victoryState.cleared) || money >= VICTORY_MONEY_TARGET;
  victoryOverlayDismissed = hasClearedGame && Boolean(victoryState.dismissed);

  const savedLevels =
    data.upgLevels && typeof data.upgLevels === "object" ? data.upgLevels : {};
  for (const u of UPGRADES) {
    upgLevels[u.id] = getSavedUpgradeLevel(savedLevels, u.id);
  }
  energyMult = getGeneratorEfficiencyFromUpgrades();
  if (typeof syncGearEfficienciesWithUpgrades === "function") {
    syncGearEfficienciesWithUpgrades();
  }

  const pipelineState =
    data.pipeline && typeof data.pipeline === "object" ? data.pipeline : {};
  pipeline.laneCount = Number.isInteger(pipelineState.lineCount)
    ? Math.max(DEFAULT_PIPELINE_LANES, pipelineState.lineCount)
    : Number.isInteger(pipelineState.laneCount)
      ? Math.max(DEFAULT_PIPELINE_LANES, pipelineState.laneCount)
    : Math.max(
        DEFAULT_PIPELINE_LANES,
        DEFAULT_PIPELINE_STATE.laneCount + upgLevels.pipeline_lane,
      );
  pipeline.beltSpeed = isPipelineNumber(pipelineState.beltSpeed)
    ? Math.max(1, pipelineState.beltSpeed)
    : DEFAULT_PIPELINE_STATE.beltSpeed;
  pipeline.packInterval = isPipelineNumber(pipelineState.packInterval)
    ? Math.max(MIN_PACK_INTERVAL, pipelineState.packInterval)
    : upgLevels.packer_eff > 0
      ? getPackIntervalFromUpgrades()
      : DEFAULT_PIPELINE_STATE.packInterval;
  syncPipelineLineCount();

  const savedLines = Array.isArray(pipelineState.lines)
    ? pipelineState.lines
    : [
        {
          packTimer: pipelineState.packTimer,
          parcels: pipelineState.parcels,
          truck: data.truck,
          powerStrip: data.powerStrip,
          plugs: data.plugs,
          rollerAngle: data.rollerAngle,
          truckWheelAngle: data.truckWheelAngle,
        },
      ];
  const savedSharedStrips = Array.isArray(pipelineState.sharedStrips)
    ? pipelineState.sharedStrips
    : null;
  const initializedStrips = new Set();
  const occupiedSocketsByStrip = new Map();

  getPipelineLines().forEach((line, lineIndex) => {
    const savedLine =
      savedLines[lineIndex] && typeof savedLines[lineIndex] === "object"
        ? savedLines[lineIndex]
        : {};

    line.connected = false;
    line.beltConnected = false;
    line.packerConnected = false;
    line.beltPowered = false;
    line.packerPowered = false;
    line.originX = 0;
    line.originY = 0;
    line.bounds = { x: 0, y: 0, w: 0, h: 0 };
    line.packTimer = isPipelineNumber(savedLine.packTimer)
      ? Math.max(0, savedLine.packTimer)
      : 0;
    line.parcels = Array.isArray(savedLine.parcels)
      ? savedLine.parcels
          .map((parcel) => {
            if (
              !parcel ||
              typeof parcel !== "object" ||
              !isPipelineNumber(parcel.x) ||
              !VALID_PARCEL_STATES.has(parcel.state)
            ) {
              return null;
            }

            return {
              x: parcel.x,
              state: parcel.state,
              alpha: isPipelineNumber(parcel.alpha) ? parcel.alpha : 1,
              packProgress: isPipelineNumber(parcel.packProgress)
                ? clamp(parcel.packProgress, 0, 1)
                : 0,
            };
          })
          .filter(Boolean)
      : [];

    const truckState =
      savedLine.truck && typeof savedLine.truck === "object"
        ? savedLine.truck
        : {};
    line.truck.capacity = Number.isInteger(truckState.capacity)
      ? Math.max(1, truckState.capacity)
      : getTruckCapacityFromUpgrades();
    line.truck.load = Number.isInteger(truckState.load)
      ? Math.max(0, Math.min(line.truck.capacity, truckState.load))
      : 0;
    const savedTruckSpeedMultiplier = isPipelineNumber(truckState.speedMultiplier)
      ? clamp(truckState.speedMultiplier, 0.4, 5)
      : isPipelineNumber(truckState.returnTime)
        ? clamp(
            (TRUCK_LEAVE_DURATION * 2) / Math.max(0.01, truckState.returnTime),
            0.4,
            5,
          )
        : DEFAULT_PIPELINE_STATE.truckSpeedMultiplier;
    line.truck.speedMultiplier =
      upgLevels.truck_freq > 0
        ? getTruckSpeedMultiplierFromUpgrades()
        : savedTruckSpeedMultiplier;
    planTruckRoute(line.truck);
    line.truck.state = normalizeTruckState(truckState.state);
    line.truck.timer = isPipelineNumber(truckState.timer)
      ? Math.max(0, truckState.timer)
      : 0;
    line.truck.x = isPipelineNumber(truckState.x) ? truckState.x : TRUCK_LOAD_X;
    if (line.truck.state === "waiting") line.truck.x = TRUCK_LOAD_X;
    if (line.truck.state === "returning") line.truck.load = 0;
    line.truck.wheelAngle = isPipelineNumber(savedLine.truckWheelAngle)
      ? savedLine.truckWheelAngle
      : 0;

    const strip = line.powerStrip;
    if (!initializedStrips.has(strip)) {
      initializedStrips.add(strip);
      const stripState =
        getSavedPowerStripState(
          savedSharedStrips,
          savedLines,
          getStripIndexForLine(lineIndex),
        ) || {};
      strip.offsetX = isPipelineNumber(stripState.offsetX) ? stripState.offsetX : 0;
      strip.offsetY = isPipelineNumber(stripState.offsetY) ? stripState.offsetY : 0;
      strip.dragging = false;
      strip.dragAnchorX = 0;
      strip.dragAnchorY = 0;
      syncPowerStripMetrics(strip);
      strip.sockets = [];
      strip.leadStart = { x: 0, y: 0 };
      strip.leadEnd = { x: 0, y: 0 };
    }

    const savedPlugs =
      savedLine.plugs && typeof savedLine.plugs === "object"
        ? savedLine.plugs
        : {};
    const occupiedSockets = occupiedSocketsByStrip.get(strip) || new Set();
    occupiedSocketsByStrip.set(strip, occupiedSockets);
    for (const [id, plug] of Object.entries(line.plugs)) {
      const savedPlug =
        savedPlugs[id] && typeof savedPlugs[id] === "object"
          ? savedPlugs[id]
          : null;
      const canUseSocket =
        Number.isInteger(savedPlug?.socketIndex) &&
        savedPlug.socketIndex >= 0 &&
        savedPlug.socketIndex < getPowerStripSocketCount() &&
        !occupiedSockets.has(savedPlug.socketIndex);

      plug.dragging = false;
      plug.connected = Boolean(savedPlug?.connected) && canUseSocket;
      plug.socketIndex = plug.connected ? savedPlug.socketIndex : null;
      plug.x1 = 0;
      plug.y1 = 0;
      plug.x2 = 0;
      plug.y2 = 0;
      plug.homeX = 0;
      plug.homeY = 0;
      if (plug.connected) occupiedSockets.add(savedPlug.socketIndex);
    }

    line.rollerAngle = isPipelineNumber(savedLine.rollerAngle)
      ? savedLine.rollerAngle
      : 0;
  });

  syncPipelineConnectionState();
  updateMoneyUI();
  updatePipelineInfoUI();
}

// Basic helpers
function drawRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawRoundedRect(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, w, h, r, color, width) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pointInRect(x, y, rect) {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

function getCanvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  if (typeof scenePointFromScreen === "function") {
    return scenePointFromScreen(screenX, screenY);
  }

  return { x: screenX, y: screenY };
}

function getPowerStripRect(line, padding = 0) {
  syncPowerStripMetrics(line.powerStrip);
  return {
    x: line.powerStrip.x - padding,
    y: line.powerStrip.y - padding,
    w: line.powerStrip.w + padding * 2,
    h: line.powerStrip.h + padding * 2,
  };
}

function findPowerStripAtPoint(x, y) {
  const lines = getPipelineLines();
  for (let i = lines.length - 1; i >= 0; i--) {
    if (pointInRect(x, y, getPowerStripRect(lines[i], 10))) {
      return lines[i];
    }
  }
  return null;
}

function getPowerStripDragBounds(strip) {
  const margin = 12;
  const stripWidth = syncPowerStripMetrics(strip);
  const viewWidth = typeof canvas !== "undefined" ? canvas.width : stripWidth;
  const viewHeight = typeof canvas !== "undefined" ? canvas.height : strip.h;

  return {
    minX: margin,
    maxX: Math.max(margin, viewWidth - stripWidth - margin),
    minY: margin,
    maxY: Math.max(margin, viewHeight - strip.h - margin),
  };
}

function isPipelineVisible() {
  return camTargetX > 0 || camX > 10;
}

function getGeneratorPlugPos(cx, cy) {
  const s = hexToScreen(GEN_CELL.q, GEN_CELL.r, cx, cy);
  return { x: s.x + HEX_SIZE * 0.9, y: s.y };
}

function showPipelineMsg(text) {
  if (typeof showMsg === "function") showMsg(text);
}

function syncLineConnectionState(line) {
  line.beltConnected = line.plugs.belt.connected;
  line.packerConnected = line.plugs.packer.connected;
  line.connected = line.beltConnected && line.packerConnected;
  line.beltPowered = line.beltConnected && physicsResult.power > 0;
  line.packerPowered = line.packerConnected && physicsResult.power > 0;
}

function syncPipelineConnectionState() {
  pipeline.beltConnected = false;
  pipeline.packerConnected = false;
  pipeline.connected = false;
  pipeline.beltPowered = false;
  pipeline.packerPowered = false;

  for (const line of getPipelineLines()) {
    syncLineConnectionState(line);
    pipeline.beltConnected = pipeline.beltConnected || line.beltConnected;
    pipeline.packerConnected = pipeline.packerConnected || line.packerConnected;
    pipeline.connected = pipeline.connected || line.connected;
    pipeline.beltPowered = pipeline.beltPowered || line.beltPowered;
    pipeline.packerPowered = pipeline.packerPowered || line.packerPowered;
  }
}

function getLineForPlug(plug) {
  return getPipelineLines()[plug.lineIndex] || null;
}

function getSocketCenter(line, index) {
  return line.powerStrip.sockets[index] || null;
}

function isSocketOccupied(line, index, exceptPlugId = null) {
  return getLinesForPowerStrip(line.powerStrip).some((sharedLine) =>
    Object.values(sharedLine.plugs).some(
      (plug) =>
        plug.connected && plug.socketIndex === index && plug.id !== exceptPlugId,
    ),
  );
}

function closestSocketIndex(line, x, y, plug) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < line.powerStrip.sockets.length; i++) {
    if (isSocketOccupied(line, i, plug.id)) continue;
    const socket = line.powerStrip.sockets[i];
    const dist = Math.hypot(x - socket.x, y - socket.y);
    if (dist < 26 && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

function disconnectPlug(plug, keepDragging = false) {
  const line = getLineForPlug(plug);
  if (!line) return;
  plug.connected = false;
  plug.socketIndex = null;
  if (!keepDragging) {
    plug.x2 = plug.homeX;
    plug.y2 = plug.homeY;
  }
  syncPipelineConnectionState();
  if (typeof playSoundEffect === "function") {
    playSoundEffect("disconnect");
  }
  if (!keepDragging && typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }
}

function connectPlug(plug, socketIndex) {
  const line = getLineForPlug(plug);
  if (!line) return;
  const socket = getSocketCenter(line, socketIndex);
  if (!socket) return;
  plug.connected = true;
  plug.dragging = false;
  plug.socketIndex = socketIndex;
  plug.x2 = socket.x;
  plug.y2 = socket.y;
  syncPipelineConnectionState();
  if (typeof playSoundEffect === "function") {
    playSoundEffect("connect");
  }
  if (typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }

  if (line.connected) {
    showPipelineMsg(typeof t === "function" ? t("message.pipelineBoth") : "Both machines are connected to the strip.");
  } else if (plug.role === "belt") {
    showPipelineMsg(typeof t === "function" ? t("message.pipelineLeft") : "Left machine connected to the strip.");
  } else if (plug.role === "packer") {
    showPipelineMsg(typeof t === "function" ? t("message.pipelineRight") : "Right machine connected to the strip.");
  }
}

function updatePlugLayout(plug, x1, y1, homeX, homeY) {
  const line = getLineForPlug(plug);
  if (!line) return;
  plug.x1 = x1;
  plug.y1 = y1;
  plug.homeX = homeX;
  plug.homeY = homeY;

  if (plug.dragging) return;

  if (plug.connected && plug.socketIndex !== null) {
    const socket = getSocketCenter(line, plug.socketIndex);
    if (socket) {
      plug.x2 = socket.x;
      plug.y2 = socket.y;
      return;
    }
  }

  plug.x2 = homeX;
  plug.y2 = homeY;
}

function findPlugAtPoint(x, y) {
  const candidates = getPipelineLines().flatMap((line) =>
    Object.values(line.plugs),
  );
  for (let i = candidates.length - 1; i >= 0; i--) {
    const plug = candidates[i];
    const dx = x - plug.x2;
    const dy = y - plug.y2;
    if (Math.hypot(dx, dy) <= 18) return plug;
  }
  return null;
}

function canSpawnParcel(line) {
  return !line.parcels.some((parcel) => parcel.x < PARCEL_START_X + PARCEL_SPACING);
}

function getParcelStopX(line, parcel, targetX = PACKER_STOP_X, states = null) {
  let stopX = targetX;

  for (const other of line.parcels) {
    if (other === parcel || other.x <= parcel.x) continue;
    if (states && !states.has(other.state)) continue;
    stopX = Math.min(stopX, other.x - PARCEL_SPACING);
  }

  return Math.max(parcel.x, stopX);
}

function planTruckRoute(truckState) {
  const cruiseOutX = TRUCK_LOAD_X + TRUCK_CRUISE_DISTANCE;

  truckState.cruiseOutX = cruiseOutX;
  truckState.exitX = cruiseOutX;
  truckState.returnStartX = cruiseOutX;
  truckState.leaveSpeed = TRUCK_BASE_SPEED * truckState.speedMultiplier;
  truckState.returnSpeed = truckState.leaveSpeed * TRUCK_REVERSE_SPEED_FACTOR;
}

function getLinePowerCap(line) {
  const beltCap = line.beltConnected
    ? BELT_BASE_POWER * (pipeline.beltSpeed / DEFAULT_BELT_SPEED)
    : 0;
  const packerCap = line.packerConnected
    ? PACKER_BASE_POWER * (DEFAULT_PACK_INTERVAL / pipeline.packInterval)
    : 0;
  return beltCap + packerCap;
}

function getPipelinePowerCap() {
  return getPipelineLines().reduce(
    (sum, line) => sum + getLinePowerCap(line),
    0,
  );
}

function getPipelineDriveState() {
  const availablePower = Math.max(0, physicsResult.power * energyMult);
  const lineStates = getPipelineLines().map((line) => {
    const packingActive = line.parcels.some((parcel) => parcel.state === "packing");
    const beltDemandBase = line.beltConnected
      ? BELT_BASE_POWER * (pipeline.beltSpeed / DEFAULT_BELT_SPEED)
      : 0;
    const packerDemandBase =
      line.packerConnected && packingActive
        ? PACKER_BASE_POWER * (DEFAULT_PACK_INTERVAL / pipeline.packInterval)
        : 0;

    return {
      line,
      packingActive,
      beltDemandBase,
      packerDemandBase,
      activeDemandBase: beltDemandBase + packerDemandBase,
    };
  });
  const pipelinePowerCap = getPipelinePowerCap();
  const activeDemandBase = lineStates.reduce(
    (sum, lineState) => sum + lineState.activeDemandBase,
    0,
  );
  const speedFactor =
    activeDemandBase > 0
      ? clamp(availablePower / activeDemandBase, 0, MAX_PIPELINE_SPEED_FACTOR)
      : 0;

  for (const lineState of lineStates) {
    lineState.beltOn = lineState.line.beltConnected && speedFactor > 0;
    lineState.packerOn =
      lineState.line.packerConnected &&
      lineState.packingActive &&
      speedFactor > 0;
  }

  return {
    availablePower,
    beltOn: lineStates.some((lineState) => lineState.beltOn),
    packerOn: lineStates.some((lineState) => lineState.packerOn),
    packingActive: lineStates.some((lineState) => lineState.packingActive),
    laneCount: getPipelineLineCount(),
    lineStates,
    speedFactor,
    beltDemandBase: lineStates.reduce(
      (sum, lineState) => sum + lineState.beltDemandBase,
      0,
    ),
    packerDemandBase: lineStates.reduce(
      (sum, lineState) => sum + lineState.packerDemandBase,
      0,
    ),
    pipelinePowerCap,
    activeDemandBase,
    actualDraw: Math.min(availablePower, activeDemandBase),
  };
}

// Power and economy logic
function updatePipeline(dt) {
  syncPipelineConnectionState();

  const drive = getPipelineDriveState();
  const { speedFactor } = drive;
  const beltDx = pipeline.beltSpeed * speedFactor * dt;
  const feedInterval = getFeedOutputInterval();
  const packerRate = speedFactor / Math.max(MIN_PACK_INTERVAL, pipeline.packInterval);

  for (const lineState of drive.lineStates) {
    const line = lineState.line;

    if (lineState.beltOn) {
      line.rollerAngle += beltDx / 10;
      line.packTimer += dt * speedFactor;

      while (line.packTimer >= feedInterval) {
        line.packTimer -= feedInterval;

        if (canSpawnParcel(line)) {
          line.parcels.push({
            x: PARCEL_START_X,
            state: "moving",
            alpha: 1,
            packProgress: 0,
          });
        } else {
          line.packTimer = feedInterval;
          break;
        }
      }
    }

    for (let i = line.parcels.length - 1; i >= 0; i--) {
      const p = line.parcels[i];

      if (p.state === "moving") {
        if (lineState.beltOn) {
          if (p.x < PACKER_STOP_X) {
            p.x = Math.min(getParcelStopX(line, p), p.x + beltDx);
            if (p.x >= PACKER_STOP_X) {
              p.x = PACKER_STOP_X;
              p.state = "packing";
            }
          } else {
            p.state = "packing";
          }
        }
      } else if (p.state === "packing") {
        if (lineState.packerOn) {
          p.packProgress += dt * packerRate;
          if (p.packProgress >= 1.0) {
            p.packProgress = 1.0;
            p.state = "shipped";
          }
        }
      } else if (p.state === "shipped") {
        const stopX =
          line.truck.state === "waiting" ? TRUCK_LOAD_X : DISPATCH_WAIT_X;
        if (lineState.beltOn && p.x < stopX) {
          p.x = Math.min(
            getParcelStopX(line, p, stopX, SHIPPED_STATES),
            p.x + beltDx,
          );
        }

        if (p.x >= TRUCK_LOAD_X && line.truck.state === "waiting") {
          line.parcels.splice(i, 1);
          line.truck.load++;
          money += PARCEL_VALUE;
          if (typeof playSoundEffect === "function") {
            playSoundEffect("coin");
          }
          updateMoneyUI();
          if (typeof scheduleGameSave === "function") {
            scheduleGameSave(0);
          }
          if (line.truck.load >= line.truck.capacity) {
            departTruck(line.truck);
          }
        }
      }
    }

    updateTruck(line.truck, dt);
  }
  updatePipelineInfoUI(getPipelineDriveState());
}

function updateTruck(truckState, dt) {
  if (truckState.state === "waiting") return;

  truckState.timer += dt;
  const prevX = truckState.x;

  if (truckState.state === "leaving") {
    truckState.x = Math.min(
      truckState.cruiseOutX,
      truckState.x + truckState.leaveSpeed * dt,
    );
    if (truckState.x >= truckState.cruiseOutX) {
      truckState.x = truckState.cruiseOutX;
      truckState.load = 0;
      truckState.state = "returning";
      truckState.timer = 0;
    }
  } else if (truckState.state === "returning") {
    truckState.load = 0;
    truckState.x = Math.max(
      TRUCK_LOAD_X,
      truckState.x - truckState.returnSpeed * dt,
    );
    if (truckState.x <= TRUCK_LOAD_X) {
      truckState.x = TRUCK_LOAD_X;
      truckState.state = "waiting";
    }
  }

  truckState.wheelAngle += (truckState.x - prevX) / 15;
}

function getLegacyTruckStatusText() {
  const truckState = getPipelineLines()[0]?.truck;
  if (!truckState) return "-";
  const loadText = `${truckState.load}/${truckState.capacity}`;

  if (truckState.state === "waiting") {
    return `${typeof t === "function" ? t("truck.loading") : "Loading"} ${loadText}`;
  }
  if (truckState.state === "leaving") {
    return `${typeof t === "function" ? t("truck.departing") : "Departing"} ${loadText}`;
  }
  if (truckState.state === "returning") {
    return `${typeof t === "function" ? t("truck.returning") : "Returning"} ${loadText}`;
  }
  return loadText;
}

function getSingleTruckStatusText(truckState) {
  const loadText = `${truckState.load}/${truckState.capacity}`;

  if (truckState.state === "waiting") {
    return `${typeof t === "function" ? t("truck.loading") : "Loading"} ${loadText}`;
  }
  if (truckState.state === "leaving") {
    return `${typeof t === "function" ? t("truck.departing") : "Departing"} ${loadText}`;
  }
  if (truckState.state === "returning") {
    return `${typeof t === "function" ? t("truck.returning") : "Returning"} ${loadText}`;
  }
  return loadText;
}

function getSingleTruckSpeedForHUD(truckState) {
  if (truckState.state === "leaving") return truckState.leaveSpeed;
  if (truckState.state === "returning") return truckState.returnSpeed;
  return 0;
}

function getTruckHUDText() {
  const lines = getPipelineLines();
  if (!lines.length) return "-";
  if (lines.length <= 1) {
    const truckState = lines[0].truck;
    return `${getSingleTruckStatusText(truckState)} / ${getSingleTruckSpeedForHUD(truckState).toFixed(1)} px/s`;
  }

  return lines
    .map(
      (line, index) =>
        `${typeof t === "function" ? t("truck.line", { index: index + 1 }) : `L${index + 1}`}: ${getSingleTruckStatusText(line.truck)} / ${getSingleTruckSpeedForHUD(line.truck).toFixed(1)} px/s`,
    )
    .join("\n");
}

function getTruckStatusText() {
  const lines = getPipelineLines();
  if (lines.length <= 1) return getSingleTruckStatusText(lines[0].truck);
  return lines
    .map(
      (line, index) =>
        `${typeof t === "function" ? t("truck.line", { index: index + 1 }) : `L${index + 1}`}:${getSingleTruckStatusText(line.truck)}`,
    )
    .join(" | ");
}

function getPipelineTruckSpeedForHUD() {
  return getPipelineLines().reduce((maxSpeed, line) => {
    return Math.max(maxSpeed, getSingleTruckSpeedForHUD(line.truck));
  }, 0);
}

function updatePipelineInfoUI(drive = null) {
  if (typeof updateHUD === "function") {
    updateHUD(drive || getPipelineDriveState());
  }
}

// Rendering helpers
function drawStatusLamp(ctx, x, y, on) {
  ctx.save();
  ctx.fillStyle = on ? "#56f58a" : "#392b2b";
  if (on) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#56f58a";
  }
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getCableCurve(x1, y1, x2, y2, wireOffset = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const ox = nx * wireOffset;
  const oy = ny * wireOffset;

  return {
    start: { x: x1 + ox, y: y1 + oy },
    c1: { x: x1 + dx * 0.35 + ox, y: y1 + oy },
    c2: { x: x1 + dx * 0.65 + ox, y: y2 + oy },
    end: { x: x2 + ox, y: y2 + oy },
  };
}

function getCubicBezierPoint(curve, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      mt3 * curve.start.x +
      3 * mt2 * t * curve.c1.x +
      3 * mt * t2 * curve.c2.x +
      t3 * curve.end.x,
    y:
      mt3 * curve.start.y +
      3 * mt2 * t * curve.c1.y +
      3 * mt * t2 * curve.c2.y +
      t3 * curve.end.y,
  };
}

function drawTwinCable(ctx, x1, y1, x2, y2, color, powered) {
  const offset = 3;

  ctx.save();
  ctx.lineCap = "round";

  if (powered) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(190,255,240,0.55)";
  }

  for (const sign of [-1, 1]) {
    const curve = getCableCurve(x1, y1, x2, y2, offset * sign);

    ctx.beginPath();
    ctx.moveTo(curve.start.x, curve.start.y);
    ctx.bezierCurveTo(
      curve.c1.x,
      curve.c1.y,
      curve.c2.x,
      curve.c2.y,
      curve.end.x,
      curve.end.y,
    );
    ctx.strokeStyle = powered ? "#c8f0de" : color;
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawPowerPulse(ctx, x1, y1, x2, y2, t, wireOffset = 0) {
  const point = getCubicBezierPoint(
    getCableCurve(x1, y1, x2, y2, wireOffset),
    clamp(t, 0, 1),
  );
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 8;
  ctx.shadowColor = "#ffffff";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlugHead(ctx, x, y, color, connected, powered) {
  ctx.save();
  ctx.translate(x, y);

  if (powered) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
  }

  drawRoundedRect(ctx, -11, -7, 22, 14, 4, connected ? "#e8ddd0" : "#d2c8bc");
  drawRoundedRect(ctx, -4, -4, 8, 8, 2, color);

  ctx.fillStyle = "#6a665f";
  ctx.fillRect(10, -3, 5, 2);
  ctx.fillRect(10, 1, 5, 2);

  ctx.restore();
}

function drawSocket(ctx, x, y, occupied, powered) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = occupied ? "#49453d" : "#5b564d";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1d1b18";
  ctx.fillRect(-3, -4, 2, 8);
  ctx.fillRect(1, -4, 2, 8);

  if (powered) {
    ctx.strokeStyle = occupied ? "#82f0b3" : "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPowerStrip(ctx, cx, cy, px, py, line) {
  const strip = line.powerStrip;
  const socketCount = getPowerStripSocketCount();
  const generatorPlug = getGeneratorPlugPos(cx, cy);
  const baseX = Math.max(generatorPlug.x + 90, px - 185);
  const baseY = py - 118;
  syncPowerStripMetrics(strip);
  const dragBounds = getPowerStripDragBounds(strip);

  strip.baseX = baseX;
  strip.baseY = baseY;
  strip.x = clamp(
    strip.baseX + strip.offsetX,
    dragBounds.minX,
    dragBounds.maxX,
  );
  strip.y = clamp(
    strip.baseY + strip.offsetY,
    dragBounds.minY,
    dragBounds.maxY,
  );
  strip.offsetX = strip.x - strip.baseX;
  strip.offsetY = strip.y - strip.baseY;
  strip.leadStart = { x: generatorPlug.x + 10, y: generatorPlug.y };
  strip.leadEnd = {
    x: strip.x + 10,
    y: strip.y + strip.h / 2,
  };

  strip.sockets = Array.from({ length: socketCount }, (_, i) => ({
    x: strip.x + POWER_STRIP_SOCKET_START_X + i * POWER_STRIP_SOCKET_SPACING,
    y: strip.y + strip.h / 2,
  }));

  drawTwinCable(
    ctx,
    strip.leadStart.x,
    strip.leadStart.y,
    strip.leadEnd.x,
    strip.leadEnd.y,
    "#8a8878",
    physicsResult.power > 0,
  );

  if (physicsResult.power > 0) {
    const pulseT = (Date.now() % 1200) / 1200;
    drawPowerPulse(
      ctx,
      strip.leadStart.x,
      strip.leadStart.y,
      strip.leadEnd.x,
      strip.leadEnd.y,
      pulseT,
      -3,
    );
    drawPowerPulse(
      ctx,
      strip.leadStart.x,
      strip.leadStart.y,
      strip.leadEnd.x,
      strip.leadEnd.y,
      (pulseT + 0.45) % 1,
      3,
    );
  }

  drawRoundedRect(
    ctx,
    strip.x,
    strip.y,
    strip.w,
    strip.h,
    8,
    "#d9cfba",
  );
  strokeRoundedRect(
    ctx,
    strip.x,
    strip.y,
    strip.w,
    strip.h,
    8,
    "rgba(0,0,0,0.18)",
    1.2,
  );

  ctx.fillStyle = "#b2a893";
  ctx.fillRect(strip.x + 8, strip.y + 5, 10, strip.h - 10);

  ctx.fillStyle = "#6f675b";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(typeof t === "function" ? t("pipeline.powerLabel") : "POWER", strip.x + 24, strip.y + 18);

  for (let i = 0; i < strip.sockets.length; i++) {
    drawSocket(
      ctx,
      strip.sockets[i].x,
      strip.sockets[i].y,
      isSocketOccupied(line, i),
      physicsResult.power > 0,
    );
  }
}

function drawBeltMachine(ctx, line, px, py) {
  const beltDeckY = py + 30;

  for (let x = px + 40; x < px + 440; x += 80) {
    drawRect(ctx, x, beltDeckY + 10, 6, 20, "#2a2825");
  }

  drawRoundedRect(ctx, px, beltDeckY, 440, 10, 4, "#3a3835");

  const bX = px + 40;
  const bY = py + 5;
  const bW = 400;

  const drawRoller = (rx, ry) => {
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(line.rollerAngle);
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.fillRect(-7, -1, 14, 2);
    ctx.fillRect(-1, -7, 2, 14);
    ctx.restore();
  };

  drawRoundedRect(ctx, bX, bY, bW, 15, 7, "#4a4842");

  if (line.beltPowered) {
    drawRoller(bX + 7, bY + 7);
    drawRoller(bX + bW - 7, bY + 7);
    return;
  }

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(bX + 7, bY + 7, 7, 0, Math.PI * 2);
  ctx.arc(bX + bW - 7, bY + 7, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawFeedMachine(ctx, line, x, y) {
  const feedSocketY = y + 66;
  drawRoundedRect(ctx, x, y, 50, 90, 4, "#8a9098");
  drawRect(ctx, x + 45, y + 65, 8, 30, "#1a1a1a");
  drawRect(ctx, x + 5, y + 60, 5, 12, "#2c2c2c");
  drawStatusLamp(ctx, x + 11, y + 12, line.beltPowered);

  return {
    feedPort: { x: x + 8, y: feedSocketY },
    feedHome: { x: x - 6, y: feedSocketY },
  };
}

function drawParcels(ctx, line, px, py) {
  for (const p of line.parcels) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(px + p.x, py + 5);

    if (p.state === "moving" || p.state === "packing") {
      const fold = 10 * (1 - p.packProgress);
      ctx.fillStyle = "#c8bc9e";
      ctx.fillRect(-fold, 0, fold, 2);
      ctx.fillRect(20, 0, fold, 2);
      ctx.fillRect(0, -fold, 20, fold);
      drawRoundedRect(ctx, 0, 0, 20, 20, 2, "#e6d5b8");
    } else {
      drawRoundedRect(ctx, 0, 0, 20, 20, 2, "#e6d5b8");
      drawRect(ctx, 0, 8, 20, 4, "#b8ac90");
    }

    ctx.restore();
  }
}

function drawPacker(ctx, line, px, py) {
  const gx = px + 175;
  const gy = py - 60;

  drawRect(ctx, gx, gy, 8, 65, "#7a8088");
  drawRect(ctx, gx + 40, gy, 8, 65, "#7a8088");
  drawRoundedRect(ctx, gx - 5, gy, 58, 15, 2, "#a0a8b5");
  drawRect(ctx, gx - 5, gy + 5, 5, 8, "#2c2c2c");

  const activeParcel = line.parcels.find((p) => p.state === "packing");
  const pressHeight = activeParcel
    ? (activeParcel.packProgress < 0.5
        ? activeParcel.packProgress * 2
        : (1 - activeParcel.packProgress) * 2) * 25
    : 0;

  drawRect(ctx, gx + 22, gy + 15, 6, 20 + pressHeight, "#7a8088");
  drawRect(ctx, gx + 15, gy + 35 + pressHeight, 20, 4, "#6a7078");
  drawStatusLamp(ctx, gx + 46, gy + 8, line.packerPowered);

  return {
    packerPort: { x: gx + 49, y: gy + 12 },
    packerHome: { x: gx + 88, y: gy + 26 },
  };
}

function drawTruck(ctx, line, px, py) {
  const bodyHeight = 40;
  const truckState = line.truck;
  const ty =
    py -
    10 +
    (truckState.state !== "waiting" ? Math.sin(Date.now() * 0.02) * 0.5 : 0);
  const tx = px + truckState.x;

  drawRoundedRect(ctx, tx, ty, 70, bodyHeight, 4, "#a8b5a0");
  drawRoundedRect(ctx, tx + 72, ty + 10, 30, 30, 4, "#b5a8a0");
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(tx + 85, ty + 15, 12, 10);

  const drawWheel = (wx, wy) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(truckState.wheelAngle);
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
  };

  drawWheel(tx + 15, ty + bodyHeight);
  drawWheel(tx + 55, ty + bodyHeight);
  drawWheel(tx + 85, ty + bodyHeight);

  for (let i = 0; i < truckState.load; i++) {
    const ox = (i % 3) * 18;
    const oy = Math.floor(i / 3) * 10;
    drawRect(ctx, tx + 5 + ox, ty + bodyHeight - 10 - oy, 15, 10, "#e6d5b8");
  }
}

function drawPlugCable(ctx, plug, powered) {
  drawTwinCable(ctx, plug.x1, plug.y1, plug.x2, plug.y2, "#8a8878", powered);
  drawPlugHead(ctx, plug.x2, plug.y2, plug.color, plug.connected, powered);

  if (powered) {
    const t = (Date.now() % 1400) / 1400;
    drawPowerPulse(ctx, plug.x2, plug.y2, plug.x1, plug.y1, t, -3);
    drawPowerPulse(ctx, plug.x2, plug.y2, plug.x1, plug.y1, (t + 0.4) % 1, 3);
  }
}

function drawPipelineBackdrop(ctx) {
  const { x, y, w, h } = pipeline.bounds;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x, y + h - 20, w, 18);
  ctx.restore();
}

// Main render entry
function drawPipeline(ctx, cx, cy) {
  const viewCenterX = canvas.width / 2;
  const viewCenterY = canvas.height / 2;
  const revealProgress = camTargetX > 0 ? clamp(camX / camTargetX, 0, 1) : 0;
  const slideOffset = (1 - revealProgress) * (canvas.width * 0.42);
  const stripWidth = getPowerStripWidth();
  const stackHeight = getPipelineStackHeight();
  const px = viewCenterX - 150 + slideOffset;
  const basePy = viewCenterY - 20 - stackHeight / 2;

  pipeline.originX = px;
  pipeline.originY = basePy;
  pipeline.bounds = {
    x: px - 230,
    y: basePy - 165,
    w: Math.max(790, stripWidth + 45),
    h: 260 + stackHeight,
  };

  drawPipelineBackdrop(ctx);
  const lines = getPipelineLines();
  lines.forEach((line, index) => {
    const py = basePy + index * PIPELINE_LINE_STACK_GAP;
    line.originX = px;
    line.originY = py;
    line.bounds = {
      x: px - 230,
      y: py - 165,
      w: Math.max(790, stripWidth + 45),
      h: 260,
    };
  });

  const drawnStrips = new Set();
  lines.forEach((line) => {
    if (drawnStrips.has(line.powerStrip)) return;
    drawnStrips.add(line.powerStrip);

    const stripLines = getLinesForPowerStrip(line.powerStrip);
    const stripPy =
      stripLines.reduce((sum, stripLine) => sum + stripLine.originY, 0) /
      stripLines.length;
    drawPowerStrip(ctx, cx, cy, px, stripPy, line);
  });

  lines.forEach((line) => {
    const py = line.originY;
    drawBeltMachine(ctx, line, px, py);
    drawParcels(ctx, line, px, py);
    const feedLayout = drawFeedMachine(ctx, line, px, py - 60);
    const packerLayout = drawPacker(ctx, line, px, py);
    drawTruck(ctx, line, px, py);

    updatePlugLayout(
      line.plugs.belt,
      feedLayout.feedPort.x,
      feedLayout.feedPort.y,
      feedLayout.feedHome.x,
      feedLayout.feedHome.y,
    );
    updatePlugLayout(
      line.plugs.packer,
      packerLayout.packerPort.x,
      packerLayout.packerPort.y,
      packerLayout.packerHome.x,
      packerLayout.packerHome.y,
    );

    drawPlugCable(ctx, line.plugs.belt, line.beltPowered);
    drawPlugCable(ctx, line.plugs.packer, line.packerPowered);
  });
}

function pipelineFrame(ctx, cx, cy, dt) {
  updatePipeline(dt);
  if (isPipelineVisible()) drawPipeline(ctx, cx, cy);
}

// Events
function departTruck(truckState) {
  planTruckRoute(truckState);
  truckState.x = TRUCK_LOAD_X;
  truckState.state = "leaving";
  truckState.timer = 0;
  if (typeof playSoundEffect === "function") {
    playSoundEffect("truck");
  }
}

function buyUpgrade(id) {
  const u = getUpgradeDef(id);
  if (!u || isUpgradeMaxed(u)) return;
  const cost = upgCost(u);
  if (money < cost) return;
  money -= cost;
  upgLevels[u.id]++;
  u.effect();
  if (typeof playSoundEffect === "function") {
    playSoundEffect("upgrade");
  }
  refreshUpgradeUI();
  updateMoneyUI();
  if (typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }
}

function buildUpgradePanel() {
  const list = document.getElementById("upg-list");
  if (!list) return;
  list.innerHTML = "";

  UPGRADES.forEach((u) => {
    const div = document.createElement("div");
    div.className = "upg-item";
    div.innerHTML =
      `<div class="upg-name"><span class="upg-label">${getUpgradeName(u)}</span> <small>${getUpgradeLevelText(u)}</small></div>` +
      `<div class="upg-row">` +
      `<span class="upg-cost" id="uc-${u.id}">${getUpgradeCostText(u)}</span>` +
      `<button class="upg-btn" id="ub-${u.id}" onclick="buyUpgrade('${u.id}')">${getUpgradeButtonText(u)}</button>` +
      `</div>`;
    list.appendChild(div);
  });
}

function refreshUpgradeUI() {
  UPGRADES.forEach((u) => {
    const btn = document.getElementById(`ub-${u.id}`);
    if (btn) {
      btn.disabled = isUpgradeMaxed(u) || money < upgCost(u);
      btn.textContent = getUpgradeButtonText(u);
    }

    const cost = document.getElementById(`uc-${u.id}`);
    if (cost) cost.textContent = getUpgradeCostText(u);

    const name = btn?.closest(".upg-item")?.querySelector(".upg-name small");
    if (name) name.textContent = getUpgradeLevelText(u);

    const label = btn?.closest(".upg-item")?.querySelector(".upg-label");
    if (label) label.textContent = getUpgradeName(u);
  });
}

function updateMoneyUI() {
  const moneyEl = document.getElementById("val-money");
  if (moneyEl) moneyEl.textContent = Math.floor(money);
  const moneyGoalEl = document.getElementById("val-money-goal");
  if (moneyGoalEl) {
    const hasReachedGoal = hasClearedGame || money >= VICTORY_MONEY_TARGET;
    moneyGoalEl.textContent = hasReachedGoal ? "/∞" : `/${VICTORY_MONEY_TARGET}`;
  }
  checkVictoryUnlock();
  syncVictoryOverlayState();
  updatePipelineInfoUI();
  refreshUpgradeUI();
}

function initCableEvents() {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  canvas.addEventListener(
    "mousedown",
    (e) => {
      if (!isPipelineVisible()) return;
      const { x, y } = getCanvasPoint(canvas, e);
      const plug = findPlugAtPoint(x, y);
      if (plug) {
        interactionState.suppressClick = true;
        e.preventDefault();
        e.stopPropagation();

        if (plug.connected) disconnectPlug(plug, true);

        plug.dragging = true;
        plug.x2 = x;
        plug.y2 = y;
        return;
      }

      const stripLine = findPowerStripAtPoint(x, y);
      if (!stripLine) return;

      stripLine.powerStrip.dragging = true;
      stripLine.powerStrip.dragAnchorX = x - stripLine.powerStrip.x;
      stripLine.powerStrip.dragAnchorY = y - stripLine.powerStrip.y;
      interactionState.suppressClick = true;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  canvas.addEventListener(
    "mousemove",
    (e) => {
      const active = getPipelineLines()
        .flatMap((line) => Object.values(line.plugs))
        .find((plug) => plug.dragging);
      const { x, y } = getCanvasPoint(canvas, e);
      if (active) {
        active.x2 = x;
        active.y2 = y;
        interactionState.suppressClick = true;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const draggingLine = getPipelineLines().find(
        (line) => line.powerStrip.dragging,
      );
      if (!draggingLine) return;

      const strip = draggingLine.powerStrip;
      const bounds = getPowerStripDragBounds(strip);
      const nextX = clamp(x - strip.dragAnchorX, bounds.minX, bounds.maxX);
      const nextY = clamp(y - strip.dragAnchorY, bounds.minY, bounds.maxY);
      strip.offsetX = nextX - strip.baseX;
      strip.offsetY = nextY - strip.baseY;
      strip.x = nextX;
      strip.y = nextY;
      interactionState.suppressClick = true;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  canvas.addEventListener(
    "mouseup",
    (e) => {
      const active = getPipelineLines()
        .flatMap((line) => Object.values(line.plugs))
        .find((plug) => plug.dragging);
      if (active) {
        const { x, y } = getCanvasPoint(canvas, e);
        active.dragging = false;

        const line = getLineForPlug(active);
        const socketIndex = line ? closestSocketIndex(line, x, y, active) : null;
        if (socketIndex !== null) {
          connectPlug(active, socketIndex);
        } else {
          disconnectPlug(active);
        }

        interactionState.suppressClick = true;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const draggingLine = getPipelineLines().find(
        (line) => line.powerStrip.dragging,
      );
      if (!draggingLine) return;

      draggingLine.powerStrip.dragging = false;
      if (typeof scheduleGameSave === "function") {
        scheduleGameSave(0);
      }
      interactionState.suppressClick = true;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      const active = getPipelineLines()
        .flatMap((line) => Object.values(line.plugs))
        .find((plug) => plug.dragging);
      if (active) {
        active.dragging = false;
        disconnectPlug(active);
        interactionState.suppressClick = true;
      }

      const draggingLine = getPipelineLines().find(
        (line) => line.powerStrip.dragging,
      );
      if (draggingLine) {
        draggingLine.powerStrip.dragging = false;
        if (typeof scheduleGameSave === "function") {
          scheduleGameSave(0);
        }
        interactionState.suppressClick = true;
      }
    },
    true,
  );

  canvas.addEventListener(
    "click",
    (e) => {
      if (!isPipelineVisible()) return;

      const { x, y } = getCanvasPoint(canvas, e);
      if (
        interactionState.suppressClick ||
        pointInRect(x, y, pipeline.bounds)
      ) {
        interactionState.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

window.addEventListener("load", () => {
  initVictoryOverlay();
  buildUpgradePanel();
  updateMoneyUI();
  initCableEvents();

  const hint = document.getElementById("pipeline-hint");
  if (hint) {
    hint.innerHTML = "";
  }

  syncPipelineConnectionState();

  const restored = typeof loadGame === "function" ? loadGame() : false;
  if (typeof startAutosave === "function") {
    startAutosave();
  }
  if (!restored && typeof scheduleGameSave === "function") {
    scheduleGameSave(0);
  }
});
