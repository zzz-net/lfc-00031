import type { LevelData, Position, SwitchDoorRule, LevelRules, MoveStep, SnapshotPackage, DraftSnapshot, HistoryState, ValidationResult, OperationLogEntry, SnapshotConflictStrategy, SnapshotPackageImportResult, Campaign, CampaignLevel, CampaignLevelMeta, UnlockCondition, LevelPlayResult, CampaignProgress, CampaignPackage, CampaignPackageImportResult, CampaignConflictStrategy, CampaignLevelConflictStrategy, UnlockConditionType, CampaignArchive, CampaignArchiveSnapshot, CampaignArchivePackage, CampaignArchiveConflictStrategy, CampaignArchiveImportResult } from '@/types';
import { TileType as TT, WinCondition, Direction, DATA_VERSION, SNAPSHOT_PACKAGE_VERSION, PACKAGE_TYPE_IDENTIFIER, CAMPAIGN_PACKAGE_VERSION, CAMPAIGN_TYPE_IDENTIFIER, UnlockConditionType as UCT, ARCHIVE_PACKAGE_VERSION, ARCHIVE_TYPE_IDENTIFIER } from '@/types';
import { createEmptyTiles, findPositions } from './mapOps';

function makeSwitchId(pos: Position): string {
  return `sw_${pos.x}_${pos.y}`;
}

function buildSampleLevel1(): LevelData {
  const width = 7;
  const height = 7;
  const tiles = createEmptyTiles(width, height);
  const wall = TT.WALL;
  const floor = TT.FLOOR;

  const wallPositions = [
    [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],
    [0,1],[6,1],
    [0,2],[2,2],[6,2],
    [0,3],[4,3],[6,3],
    [0,4],[2,4],[6,4],
    [0,5],[6,5],
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],
  ];
  for (const [x, y] of wallPositions) tiles[y][x] = wall;

  const floorPositions = [
    [1,1],[2,1],[3,1],[4,1],[5,1],
    [1,2],[3,2],[5,2],
    [1,3],[2,3],[3,3],[5,3],
    [1,4],[3,4],[4,4],[5,4],
    [1,5],[2,5],[3,5],[4,5],[5,5],
  ];
  for (const [x, y] of floorPositions) tiles[y][x] = floor;

  tiles[1][1] = TT.START;
  tiles[3][1] = TT.TARGET;
  tiles[4][2] = TT.BOX;
  tiles[3][5] = TT.TARGET;
  tiles[5][4] = TT.BOX;

  const starts = findPositions(tiles, TT.START);
  const targets = findPositions(tiles, TT.TARGET);
  const boxes = findPositions(tiles, TT.BOX);
  const switches = findPositions(tiles, TT.SWITCH);
  const doors = findPositions(tiles, TT.DOOR);

  const now = Date.now();
  return {
    version: DATA_VERSION,
    name: '推箱子入门',
    width,
    height,
    tiles,
    boxes,
    playerStart: starts[0] ?? { x: 1, y: 1 },
    targets,
    switches: switches.map((pos) => ({ pos, id: makeSwitchId(pos) })),
    doors,
    rules: {
      switchDoors: [],
      winCondition: WinCondition.ALL_BOXES_ON_TARGETS,
      allowPushBoxOnSwitch: true,
      playerCanWalkOnSwitches: true,
    },
    moveLog: [],
    moveLogInvalidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSampleLevel2(): LevelData {
  const width = 6;
  const height = 6;
  const tiles = createEmptyTiles(width, height);

  const wallPositions = [
    [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],
    [0,1],[5,1],
    [0,2],[3,2],[5,2],
    [0,3],[5,3],
    [0,4],[2,4],[5,4],
    [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],
  ];
  for (const [x, y] of wallPositions) tiles[y][x] = TT.WALL;

  const floorPositions = [
    [1,1],[2,1],[3,1],[4,1],
    [1,2],[2,2],[4,2],
    [1,3],[2,3],[3,3],[4,3],
    [1,4],[3,4],[4,4],
  ];
  for (const [x, y] of floorPositions) tiles[y][x] = TT.FLOOR;

  tiles[1][1] = TT.START;
  tiles[4][3] = TT.TARGET;
  tiles[4][1] = TT.BOX;
  tiles[2][3] = TT.SWITCH;
  tiles[3][2] = TT.DOOR;

  const starts = findPositions(tiles, TT.START);
  const targets = findPositions(tiles, TT.TARGET);
  const boxes = findPositions(tiles, TT.BOX);
  const switchPositions = findPositions(tiles, TT.SWITCH);
  const doors = findPositions(tiles, TT.DOOR);

  const swId = makeSwitchId(switchPositions[0]);
  const rules: LevelRules = {
    switchDoors: [
      {
        switchId: swId,
        doorPositions: doors,
        inverted: false,
      } as SwitchDoorRule,
    ],
    winCondition: WinCondition.REACH_TARGET,
    allowPushBoxOnSwitch: true,
    playerCanWalkOnSwitches: true,
  };

  const now = Date.now();
  return {
    version: DATA_VERSION,
    name: '机关与门',
    width,
    height,
    tiles,
    boxes,
    playerStart: starts[0] ?? { x: 1, y: 1 },
    targets,
    switches: switchPositions.map((pos) => ({ pos, id: makeSwitchId(pos) })),
    doors,
    rules,
    moveLog: [],
    moveLogInvalidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSampleLevel3(): LevelData {
  const width = 5;
  const height = 5;
  const tiles = createEmptyTiles(width, height);

  const wallPositions = [
    [0,0],[1,0],[2,0],[3,0],[4,0],
    [0,1],[4,1],
    [0,2],[2,2],[4,2],
    [0,3],[4,3],
    [0,4],[1,4],[2,4],[3,4],[4,4],
  ];
  for (const [x, y] of wallPositions) tiles[y][x] = TT.WALL;

  const floorPositions = [
    [1,1],[2,1],[3,1],
    [1,2],[3,2],
    [1,3],[2,3],[3,3],
  ];
  for (const [x, y] of floorPositions) tiles[y][x] = TT.FLOOR;

  tiles[1][1] = TT.START;
  tiles[3][3] = TT.TARGET;
  tiles[1][3] = TT.SWITCH;
  tiles[3][2] = TT.SWITCH;

  const starts = findPositions(tiles, TT.START);
  const targets = findPositions(tiles, TT.TARGET);
  const switchPositions = findPositions(tiles, TT.SWITCH);

  const now = Date.now();
  return {
    version: DATA_VERSION,
    name: '全机关挑战',
    width,
    height,
    tiles,
    boxes: [],
    playerStart: starts[0] ?? { x: 1, y: 1 },
    targets,
    switches: switchPositions.map((pos) => ({ pos, id: makeSwitchId(pos) })),
    doors: [],
    rules: {
      switchDoors: [],
      winCondition: WinCondition.ALL_SWITCHES_PRESSED,
      allowPushBoxOnSwitch: true,
      playerCanWalkOnSwitches: true,
    },
    moveLog: [],
    moveLogInvalidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSampleLevels(): LevelData[] {
  return [buildSampleLevel1(), buildSampleLevel2(), buildSampleLevel3()];
}

export function createDefaultLevel(width = 8, height = 8): LevelData {
  const tiles = createEmptyTiles(width, height);
  const now = Date.now();
  return {
    version: DATA_VERSION,
    name: '未命名关卡',
    width,
    height,
    tiles,
    boxes: [],
    playerStart: { x: 0, y: 0 },
    targets: [],
    switches: [],
    doors: [],
    rules: {
      switchDoors: [],
      winCondition: WinCondition.ALL_BOXES_ON_TARGETS,
      allowPushBoxOnSwitch: true,
      playerCanWalkOnSwitches: true,
    },
    moveLog: [],
    moveLogInvalidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function exportToJSON(level: LevelData): string {
  const copy = JSON.parse(JSON.stringify(level)) as LevelData;
  copy.updatedAt = Date.now();
  return JSON.stringify(copy, null, 2);
}

function validateImportStructure(obj: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['JSON 根元素必须是对象'] };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.version !== 'string') errors.push('缺少 version 字段或类型错误');
  if (typeof o.name !== 'string') errors.push('缺少 name 字段或类型错误');
  if (typeof o.width !== 'number' || o.width < 1) errors.push('width 必须为正整数');
  if (typeof o.height !== 'number' || o.height < 1) errors.push('height 必须为正整数');

  if (!Array.isArray(o.tiles)) {
    errors.push('缺少 tiles 字段或不是数组');
  } else {
    const tiles = o.tiles as unknown[][];
    if (tiles.length !== o.height) errors.push(`tiles 行数(${tiles.length})与 height(${o.height}) 不匹配`);
    for (let y = 0; y < tiles.length; y++) {
      if (!Array.isArray(tiles[y])) {
        errors.push(`tiles[${y}] 不是数组`);
      } else if (tiles[y].length !== o.width) {
        errors.push(`tiles[${y}] 列数(${(tiles[y] as unknown[]).length})与 width(${o.width}) 不匹配`);
      }
    }
  }

  if (!o.playerStart || typeof (o.playerStart as Record<string, unknown>).x !== 'number') {
    errors.push('缺少 playerStart 或格式错误');
  }
  if (!Array.isArray(o.targets)) errors.push('缺少 targets 字段或不是数组');
  if (!Array.isArray(o.boxes)) errors.push('缺少 boxes 字段或不是数组');
  if (!Array.isArray(o.switches)) errors.push('缺少 switches 字段或不是数组');
  if (!Array.isArray(o.doors)) errors.push('缺少 doors 字段或不是数组');

  if (!o.rules || typeof o.rules !== 'object') {
    errors.push('缺少 rules 字段');
  } else {
    const rules = o.rules as Record<string, unknown>;
    if (!Array.isArray(rules.switchDoors)) errors.push('rules.switchDoors 不是数组');
    if (typeof rules.winCondition !== 'string') errors.push('rules.winCondition 缺少或不是字符串');
  }

  if (!Array.isArray(o.moveLog)) errors.push('缺少 moveLog 字段或不是数组');

  return { ok: errors.length === 0, errors };
}

export function importFromJSON(str: string): { level: LevelData | null; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return { level: null, errors: ['JSON 解析失败：格式不合法'] };
  }

  const structResult = validateImportStructure(parsed);
  if (!structResult.ok) {
    return { level: null, errors: structResult.errors };
  }

  const level = parsed as LevelData;

  const validWinConditions = new Set(Object.values(WinCondition) as string[]);
  if (!validWinConditions.has(level.rules.winCondition)) {
    return { level: null, errors: [`不支持的胜利条件: ${level.rules.winCondition}`] };
  }

  const validDirections = new Set(Object.values(Direction) as string[]);
  for (let i = 0; i < level.moveLog.length; i++) {
    const step = level.moveLog[i] as MoveStep;
    if (!validDirections.has(step.direction)) {
      return { level: null, errors: [`步骤 ${i + 1} 包含无效方向: ${step.direction}`] };
    }
  }

  const now = Date.now();
  level.updatedAt = now;

  return { level, errors: [] };
}

export function migrateLegacyFormat(obj: Record<string, unknown>): LevelData | null {
  if (!obj.tiles || !Array.isArray(obj.tiles)) return null;

  const width = (obj.width as number) || (obj.tiles as unknown[][])[0]?.length || 8;
  const height = (obj.height as number) || (obj.tiles as unknown[]).length || 8;

  const tiles = obj.tiles as number[][];
  const starts = findPositions(tiles as unknown as TT[][], TT.START);
  const targets = findPositions(tiles as unknown as TT[][], TT.TARGET);
  const boxes = findPositions(tiles as unknown as TT[][], TT.BOX);
  const switchPositions = findPositions(tiles as unknown as TT[][], TT.SWITCH);
  const doors = findPositions(tiles as unknown as TT[][], TT.DOOR);

  const switches = switchPositions.map((pos) => ({ pos, id: makeSwitchId(pos) }));

  const now = Date.now();
  return {
    version: DATA_VERSION,
    name: (obj.name as string) || '迁移关卡',
    width,
    height,
    tiles: tiles as unknown as TT[][],
    boxes,
    playerStart: starts[0] ?? { x: 0, y: 0 },
    targets,
    switches,
    doors,
    rules: {
      switchDoors: [],
      winCondition: WinCondition.ALL_BOXES_ON_TARGETS,
      allowPushBoxOnSwitch: true,
      playerCanWalkOnSwitches: true,
    },
    moveLog: [],
    moveLogInvalidated: false,
    createdAt: (obj.createdAt as number) || now,
    updatedAt: now,
  };
}

export function exportSnapshotPackage(params: {
  currentLevel: LevelData;
  currentHistory: HistoryState;
  lastValidation: ValidationResult | null;
  snapshots: DraftSnapshot[];
  activeSnapshotId: string | null;
  operationLog: OperationLogEntry[];
}): string {
  const pkg: SnapshotPackage = {
    packageVersion: SNAPSHOT_PACKAGE_VERSION,
    exportedAt: Date.now(),
    currentLevel: JSON.parse(JSON.stringify(params.currentLevel)),
    currentHistory: JSON.parse(JSON.stringify(params.currentHistory)),
    lastValidation: params.lastValidation ? JSON.parse(JSON.stringify(params.lastValidation)) : null,
    snapshots: JSON.parse(JSON.stringify(params.snapshots)),
    activeSnapshotId: params.activeSnapshotId,
    operationLog: JSON.parse(JSON.stringify(params.operationLog)),
    editorMeta: {
      levelName: params.currentLevel.name,
    },
  };
  const envelope = {
    _type: PACKAGE_TYPE_IDENTIFIER,
    data: pkg,
  };
  return JSON.stringify(envelope, null, 2);
}

function compareSemver(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
}

function checkVersionCompatibility(pkgVersion: string): { compatible: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const currentMajor = SNAPSHOT_PACKAGE_VERSION.split('.')[0];
  const pkgMajor = pkgVersion.split('.')[0];

  if (currentMajor !== pkgMajor) {
    errors.push(`快照包版本 ${pkgVersion} 与当前版本 ${SNAPSHOT_PACKAGE_VERSION} 主版本号不兼容，无法导入`);
    return { compatible: false, warnings, errors };
  }

  const cmp = compareSemver(pkgVersion, SNAPSHOT_PACKAGE_VERSION);
  if (cmp > 0) {
    warnings.push(`快照包版本 ${pkgVersion} 高于当前版本 ${SNAPSHOT_PACKAGE_VERSION}，部分字段可能无法识别，将尝试兼容导入`);
  } else if (cmp < 0) {
    warnings.push(`快照包版本 ${pkgVersion} 低于当前版本 ${SNAPSHOT_PACKAGE_VERSION}，将按旧格式兼容导入`);
  }

  return { compatible: true, warnings, errors };
}

function validateSnapshotPackageStructure(obj: unknown): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['快照包根元素必须是对象'], warnings };
  }
  const envelope = obj as Record<string, unknown>;

  if (envelope._type !== PACKAGE_TYPE_IDENTIFIER) {
    return { ok: false, errors: ['不是合法的快照包文件（缺少类型标识）'], warnings };
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['快照包缺少 data 字段'], warnings };
  }

  if (typeof data.packageVersion !== 'string') {
    errors.push('缺少 packageVersion 或类型错误');
  } else {
    const versionCheck = checkVersionCompatibility(data.packageVersion);
    if (!versionCheck.compatible) {
      errors.push(...versionCheck.errors);
    }
    warnings.push(...versionCheck.warnings);
  }

  if (typeof data.exportedAt !== 'number') {
    errors.push('缺少 exportedAt 或类型错误');
  }
  if (!data.currentLevel || typeof data.currentLevel !== 'object') {
    errors.push('缺少 currentLevel 或格式错误');
  }
  if (!data.currentHistory || typeof data.currentHistory !== 'object') {
    errors.push('缺少 currentHistory 或格式错误');
  }
  if (!Array.isArray(data.snapshots)) {
    errors.push('缺少 snapshots 或不是数组');
  }
  if (!Array.isArray(data.operationLog)) {
    errors.push('缺少 operationLog 或不是数组');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateLevelInSnapshot(obj: unknown): string[] {
  const levelErrors: string[] = [];
  const result = validateImportStructure(obj);
  if (!result.ok) {
    levelErrors.push(...result.errors.map((e) => `关卡数据错误: ${e}`));
  }
  return levelErrors;
}

function validateSnapshot(obj: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return [`快照 ${index + 1}: 不是对象`];
  }
  const s = obj as Record<string, unknown>;
  if (typeof s.id !== 'string') errors.push(`快照 ${index + 1}: 缺少 id`);
  if (typeof s.name !== 'string') errors.push(`快照 ${index + 1}: 缺少 name`);
  if (typeof s.createdAt !== 'number') errors.push(`快照 ${index + 1}: 缺少 createdAt`);
  if (!s.level || typeof s.level !== 'object') {
    errors.push(`快照 ${index + 1}: 缺少 level 数据`);
  } else {
    errors.push(...validateLevelInSnapshot(s.level));
  }
  if (s.past !== undefined && !Array.isArray(s.past)) {
    errors.push(`快照 ${index + 1}: past 不是数组`);
  }
  if (s.future !== undefined && !Array.isArray(s.future)) {
    errors.push(`快照 ${index + 1}: future 不是数组`);
  }
  return errors;
}

export function parseSnapshotPackage(str: string): { pkg: SnapshotPackage | null; errors: string[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return { pkg: null, errors: ['JSON 解析失败：格式不合法'], warnings: [] };
  }

  const structResult = validateSnapshotPackageStructure(parsed);
  if (!structResult.ok) {
    return { pkg: null, errors: structResult.errors, warnings: structResult.warnings };
  }

  const envelope = parsed as { _type: string; data: SnapshotPackage };
  const pkg = envelope.data;
  const allErrors: string[] = [];
  const allWarnings: string[] = [...structResult.warnings];

  const levelErrors = validateLevelInSnapshot(pkg.currentLevel);
  allErrors.push(...levelErrors);

  if (pkg.currentHistory) {
    const hist = pkg.currentHistory as unknown as Record<string, unknown>;
    if (!Array.isArray(hist.past)) allErrors.push('currentHistory.past 不是数组');
    if (!hist.present || typeof hist.present !== 'object') allErrors.push('currentHistory.present 格式错误');
    if (!Array.isArray(hist.future)) allErrors.push('currentHistory.future 不是数组');
  }

  if (Array.isArray(pkg.snapshots)) {
    for (let i = 0; i < pkg.snapshots.length; i++) {
      allErrors.push(...validateSnapshot(pkg.snapshots[i], i));
    }
  }

  const validWinConditions = new Set(Object.values(WinCondition) as string[]);
  if (pkg.currentLevel && !validWinConditions.has(pkg.currentLevel.rules.winCondition)) {
    allErrors.push(`不支持的胜利条件: ${pkg.currentLevel.rules.winCondition}`);
  }
  const validDirections = new Set(Object.values(Direction) as string[]);
  if (pkg.currentLevel && Array.isArray(pkg.currentLevel.moveLog)) {
    for (let i = 0; i < pkg.currentLevel.moveLog.length; i++) {
      const step = pkg.currentLevel.moveLog[i] as MoveStep;
      if (!validDirections.has(step.direction)) {
        allErrors.push(`currentLevel 步骤 ${i + 1} 包含无效方向: ${step.direction}`);
      }
    }
  }

  if (allErrors.length > 0) {
    return { pkg: null, errors: allErrors, warnings: allWarnings };
  }

  return { pkg, errors: [], warnings: allWarnings };
}

function generateUniqueName(baseName: string, existingNames: Set<string>, counter = 1): string {
  const candidate = counter === 1 ? baseName : `${baseName} (导入 ${counter})`;
  if (!existingNames.has(candidate)) {
    return candidate;
  }
  return generateUniqueName(baseName, existingNames, counter + 1);
}

export interface MergeSnapshotOptions {
  strategy: SnapshotConflictStrategy;
  existingSnapshots: DraftSnapshot[];
  incomingSnapshots: DraftSnapshot[];
  incomingActiveId: string | null;
}

export interface MergeSnapshotResult {
  mergedSnapshots: DraftSnapshot[];
  resolvedActiveId: string | null;
  logEntries: { action: OperationLogEntry['action']; detail: string; snapshotName?: string }[];
  nameMap: Map<string, string>;
}

export function mergeSnapshots(options: MergeSnapshotOptions): MergeSnapshotResult {
  const { strategy, existingSnapshots, incomingSnapshots, incomingActiveId } = options;

  const merged = [...existingSnapshots];
  const existingNames = new Set(existingSnapshots.map((s) => s.name));
  const existingIds = new Set(existingSnapshots.map((s) => s.id));
  const logEntries: MergeSnapshotResult['logEntries'] = [];
  const nameMap = new Map<string, string>();

  let resolvedActiveId: string | null = null;

  for (const incoming of incomingSnapshots) {
    const nameConflict = existingNames.has(incoming.name);
    let finalName = incoming.name;
    let finalId = incoming.id;

    if (existingIds.has(incoming.id)) {
      finalId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    let action: OperationLogEntry['action'] | null = null;
    let detail = '';

    if (nameConflict) {
      if (strategy === 'skip') {
        action = 'import_package_conflict_skip';
        detail = `跳过同名快照「${incoming.name}」`;
        logEntries.push({ action, detail, snapshotName: incoming.name });
        continue;
      } else if (strategy === 'replace') {
        const idx = merged.findIndex((s) => s.name === incoming.name);
        if (idx >= 0) {
          const oldId = merged[idx].id;
          merged.splice(idx, 1);
          existingNames.delete(incoming.name);
          existingIds.delete(oldId);
        }
        action = 'import_package_conflict_replace';
        detail = `替换同名快照「${incoming.name}」`;
        finalName = incoming.name;
      } else {
        finalName = generateUniqueName(incoming.name, existingNames);
        action = 'import_package_conflict_rename';
        detail = `重命名「${incoming.name}」→「${finalName}」`;
      }
    } else {
      action = 'import_package';
      detail = `导入快照「${incoming.name}」`;
    }

    const newSnap: DraftSnapshot = {
      ...JSON.parse(JSON.stringify(incoming)),
      id: finalId,
      name: finalName,
    };

    merged.push(newSnap);
    existingNames.add(finalName);
    existingIds.add(finalId);
    nameMap.set(incoming.id, finalId);

    if (action) {
      logEntries.push({ action, detail, snapshotName: finalName });
    }

    if (incomingActiveId === incoming.id) {
      resolvedActiveId = finalId;
    }
  }

  return {
    mergedSnapshots: merged,
    resolvedActiveId,
    logEntries,
    nameMap,
  };
}

export function importSnapshotPackageWithMerge(
  jsonStr: string,
  existingSnapshots: DraftSnapshot[],
  strategy: SnapshotConflictStrategy,
): SnapshotPackageImportResult {
  const parseResult = parseSnapshotPackage(jsonStr);
  if (!parseResult.pkg) {
    return {
      success: false,
      errors: parseResult.errors,
      warnings: parseResult.warnings,
      mergedSnapshots: existingSnapshots,
      logEntries: [{ action: 'import_package_failed', detail: `快照包解析失败：${parseResult.errors.join('; ')}` }],
    };
  }

  const pkg = parseResult.pkg;
  const warnings: string[] = [...parseResult.warnings];
  const allLogEntries: MergeSnapshotResult['logEntries'] = [];

  const mergeResult = mergeSnapshots({
    strategy,
    existingSnapshots,
    incomingSnapshots: pkg.snapshots,
    incomingActiveId: pkg.activeSnapshotId,
  });

  allLogEntries.push(...mergeResult.logEntries);

  const totalImported = pkg.snapshots.length;
  const skipped = mergeResult.logEntries.filter((e) => e.action === 'import_package_conflict_skip').length;
  const replaced = mergeResult.logEntries.filter((e) => e.action === 'import_package_conflict_replace').length;
  const renamed = mergeResult.logEntries.filter((e) => e.action === 'import_package_conflict_rename').length;

  if (skipped > 0) {
    warnings.push(`共跳过 ${skipped} 个同名快照`);
  }
  if (replaced > 0) {
    warnings.push(`共替换 ${replaced} 个同名快照`);
  }
  if (renamed > 0) {
    warnings.push(`共重命名 ${renamed} 个同名快照`);
  }

  allLogEntries.unshift({
    action: 'import_package',
    detail: `导入快照包成功：共 ${totalImported} 个快照，导入 ${totalImported - skipped} 个`,
  });

  return {
    success: true,
    errors: [],
    warnings,
    mergedSnapshots: mergeResult.mergedSnapshots,
    logEntries: allLogEntries,
  };
}

export function createDefaultMeta(): CampaignLevelMeta {
  return {
    goalDescription: '完成关卡目标',
    recommendedSteps: 20,
    unlockCondition: {
      type: UCT.ALWAYS_UNLOCKED,
    },
    notes: '',
    starsThreshold: [10, 15, 20],
  };
}

let campaignIdCounter = 0;
let campaignLevelIdCounter = 0;

export function genCampaignId(): string {
  return `camp_${Date.now()}_${++campaignIdCounter}`;
}

export function genCampaignLevelId(): string {
  return `clevel_${Date.now()}_${++campaignLevelIdCounter}`;
}

export function createCampaignLevel(name: string, levelData: LevelData, order = 0): CampaignLevel {
  const now = Date.now();
  return {
    id: genCampaignLevelId(),
    name,
    order,
    levelData: JSON.parse(JSON.stringify(levelData)),
    meta: createDefaultMeta(),
    unlocked: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createCampaign(name: string, description = ''): Campaign {
  const now = Date.now();
  return {
    id: genCampaignId(),
    name,
    description,
    version: '1.0.0',
    levels: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createCampaignProgress(campaignId: string): CampaignProgress {
  return {
    campaignId,
    currentLevelId: null,
    totalStars: 0,
    completedCount: 0,
    lastPlayedAt: null,
    levelResults: {},
  };
}

function validateUnlockCondition(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return ['解锁条件不是对象'];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.type !== 'string') {
    errors.push('解锁条件缺少 type 字段');
  } else {
    const validTypes = new Set(Object.values(UCT) as string[]);
    if (!validTypes.has(o.type)) {
      errors.push(`不支持的解锁条件类型: ${o.type}`);
    }
  }
  return errors;
}

function validateCampaignLevelMeta(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return ['关卡元数据不是对象'];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.goalDescription !== 'string') errors.push('缺少 goalDescription 或类型错误');
  if (typeof o.recommendedSteps !== 'number') errors.push('缺少 recommendedSteps 或类型错误');
  if (typeof o.notes !== 'string') errors.push('缺少 notes 或类型错误');
  if (!o.unlockCondition) {
    errors.push('缺少 unlockCondition');
  } else {
    errors.push(...validateUnlockCondition(o.unlockCondition).map((e) => `unlockCondition: ${e}`));
  }
  if (!Array.isArray(o.starsThreshold)) {
    errors.push('缺少 starsThreshold 或不是数组');
  } else if (o.starsThreshold.length !== 3) {
    errors.push('starsThreshold 必须是 3 个元素的数组');
  }
  return errors;
}

function validateLevelPlayResult(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return ['游玩结果不是对象'];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.completed !== 'boolean') errors.push('缺少 completed 或类型错误');
  if (typeof o.steps !== 'number') errors.push('缺少 steps 或类型错误');
  if (typeof o.stars !== 'number') errors.push('缺少 stars 或类型错误');
  if (typeof o.completedAt !== 'number') errors.push('缺少 completedAt 或类型错误');
  return errors;
}

function validateCampaignLevel(obj: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return [`关卡 ${index + 1}: 不是对象`];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string') errors.push(`关卡 ${index + 1}: 缺少 id`);
  if (typeof o.name !== 'string') errors.push(`关卡 ${index + 1}: 缺少 name`);
  if (typeof o.order !== 'number') errors.push(`关卡 ${index + 1}: 缺少 order`);
  if (typeof o.unlocked !== 'boolean') errors.push(`关卡 ${index + 1}: 缺少 unlocked`);
  if (typeof o.createdAt !== 'number') errors.push(`关卡 ${index + 1}: 缺少 createdAt`);
  if (typeof o.updatedAt !== 'number') errors.push(`关卡 ${index + 1}: 缺少 updatedAt`);

  if (!o.levelData || typeof o.levelData !== 'object') {
    errors.push(`关卡 ${index + 1}: 缺少 levelData`);
  } else {
    const levelErrors = validateImportStructure(o.levelData);
    if (!levelErrors.ok) {
      errors.push(...levelErrors.errors.map((e) => `关卡 ${index + 1}.levelData: ${e}`));
    }
  }

  if (!o.meta || typeof o.meta !== 'object') {
    errors.push(`关卡 ${index + 1}: 缺少 meta`);
  } else {
    errors.push(...validateCampaignLevelMeta(o.meta).map((e) => `关卡 ${index + 1}.meta: ${e}`));
  }

  if (o.playResult !== undefined && o.playResult !== null) {
    errors.push(...validateLevelPlayResult(o.playResult).map((e) => `关卡 ${index + 1}.playResult: ${e}`));
  }

  return errors;
}

function validateCampaignProgress(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return ['进度数据不是对象'];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.campaignId !== 'string') errors.push('缺少 campaignId 或类型错误');
  if (typeof o.totalStars !== 'number') errors.push('缺少 totalStars 或类型错误');
  if (typeof o.completedCount !== 'number') errors.push('缺少 completedCount 或类型错误');
  if (!o.levelResults || typeof o.levelResults !== 'object') {
    errors.push('缺少 levelResults 或类型错误');
  }
  return errors;
}

export function validateCampaignStructure(obj: unknown): { ok: boolean; valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, valid: false, errors: ['战役包根元素必须是对象'], warnings };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') errors.push('缺少 id 或类型错误');
  if (typeof o.name !== 'string') errors.push('缺少 name 或类型错误');
  if (typeof o.description !== 'string') errors.push('缺少 description 或类型错误');
  if (typeof o.version !== 'string') errors.push('缺少 version 或类型错误');
  if (typeof o.createdAt !== 'number') errors.push('缺少 createdAt 或类型错误');
  if (typeof o.updatedAt !== 'number') errors.push('缺少 updatedAt 或类型错误');

  if (!Array.isArray(o.levels)) {
    errors.push('缺少 levels 或不是数组');
  } else {
    for (let i = 0; i < o.levels.length; i++) {
      errors.push(...validateCampaignLevel(o.levels[i], i));
    }
  }

  const ok = errors.length === 0;
  return { ok, valid: ok, errors, warnings };
}

export function validateCampaignPackageStructure(obj: unknown): { ok: boolean; valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, valid: false, errors: ['战役包根元素必须是对象'], warnings };
  }
  const envelope = obj as Record<string, unknown>;

  if (envelope._type !== CAMPAIGN_TYPE_IDENTIFIER) {
    return { ok: false, valid: false, errors: ['不是合法的战役包文件（缺少类型标识）'], warnings };
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { ok: false, valid: false, errors: ['战役包缺少 data 字段'], warnings };
  }

  if (typeof data.packageVersion !== 'string') {
    errors.push('缺少 packageVersion 或类型错误');
  } else {
    const versionCheck = checkCampaignVersionCompatibility(data.packageVersion);
    if (!versionCheck.compatible) {
      errors.push(...versionCheck.errors);
    }
    warnings.push(...versionCheck.warnings);
  }

  if (typeof data.exportedAt !== 'number') {
    errors.push('缺少 exportedAt 或类型错误');
  }

  if (!data.campaign || typeof data.campaign !== 'object') {
    errors.push('缺少 campaign 或格式错误');
  } else {
    const campaignCheck = validateCampaignStructure(data.campaign);
    if (!campaignCheck.ok) {
      errors.push(...campaignCheck.errors.map((e) => `campaign: ${e}`));
    }
    warnings.push(...campaignCheck.warnings);
  }

  if (data.progress !== undefined && data.progress !== null) {
    const progressErrors = validateCampaignProgress(data.progress);
    errors.push(...progressErrors.map((e) => `progress: ${e}`));
  }

  if (!Array.isArray(data.operationLog)) {
    errors.push('缺少 operationLog 或不是数组');
  }

  const ok = errors.length === 0;
  return { ok, valid: ok, errors, warnings };
}

export function checkCampaignVersionCompatibility(pkgVersion: string, currentVersion: string = CAMPAIGN_PACKAGE_VERSION): { compatible: boolean; warnings: string[]; warning: boolean; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const currentMajor = currentVersion.split('.')[0];
  const pkgMajor = pkgVersion.split('.')[0];

  if (currentMajor !== pkgMajor) {
    errors.push(`战役包版本 ${pkgVersion} 与当前版本 ${currentVersion} 主版本号不兼容，无法导入`);
    return { compatible: false, warnings, warning: warnings.length > 0, errors };
  }

  const cmp = compareSemver(pkgVersion, currentVersion);
  if (cmp > 0) {
    warnings.push(`战役包版本 ${pkgVersion} 高于当前版本 ${currentVersion}，部分字段可能无法识别，将尝试兼容导入`);
  } else if (cmp < 0) {
    warnings.push(`战役包版本 ${pkgVersion} 低于当前版本 ${currentVersion}，将按旧格式兼容导入`);
  }

  return { compatible: true, warnings, warning: warnings.length > 0, errors };
}

export function exportCampaignPackage(params: {
  campaign: Campaign;
  progress?: CampaignProgress;
  operationLog: OperationLogEntry[];
}): string {
  const pkg: CampaignPackage = {
    packageVersion: CAMPAIGN_PACKAGE_VERSION,
    exportedAt: Date.now(),
    campaign: JSON.parse(JSON.stringify(params.campaign)),
    progress: params.progress ? JSON.parse(JSON.stringify(params.progress)) : undefined,
    operationLog: JSON.parse(JSON.stringify(params.operationLog)),
  };
  const envelope = {
    _type: CAMPAIGN_TYPE_IDENTIFIER,
    data: pkg,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseCampaignPackage(str: string): { pkg: CampaignPackage | null; errors: string[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return { pkg: null, errors: ['JSON 解析失败：格式不合法'], warnings: [] };
  }

  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return { pkg: null, errors: ['战役包根元素必须是对象'], warnings: [] };
  }
  const envelope = parsed as Record<string, unknown>;

  if (envelope._type !== CAMPAIGN_TYPE_IDENTIFIER) {
    return { pkg: null, errors: ['不是合法的战役包文件（缺少类型标识）'], warnings: [] };
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { pkg: null, errors: ['战役包缺少 data 字段'], warnings: [] };
  }

  let packageVersion = CAMPAIGN_PACKAGE_VERSION;
  if (typeof data.packageVersion === 'string') {
    packageVersion = data.packageVersion;
    const versionCheck = checkCampaignVersionCompatibility(packageVersion);
    if (versionCheck.compatible) {
      allWarnings.push(...versionCheck.warnings);
    } else {
      const pkgMajor = parseInt(packageVersion.split('.')[0] || '0', 10);
      const curMajor = parseInt(CAMPAIGN_PACKAGE_VERSION.split('.')[0] || '1', 10);
      if (pkgMajor < curMajor) {
        allWarnings.push(...versionCheck.errors);
        allWarnings.push('旧版本包，将尝试兼容导入，部分数据可能丢失');
      } else {
        allErrors.push(...versionCheck.errors);
        return { pkg: null, errors: allErrors, warnings: allWarnings };
      }
    }
  } else {
    allWarnings.push('缺少 packageVersion 字段，使用当前版本');
  }

  let exportedAt = Date.now();
  if (typeof data.exportedAt === 'number') {
    exportedAt = data.exportedAt;
  } else {
    allWarnings.push('缺少 exportedAt 字段，使用当前时间');
  }

  let campaign: Campaign | null = null;
  if (data.campaign && typeof data.campaign === 'object') {
    const sanitizeResult = sanitizeCampaign(data.campaign);
    campaign = sanitizeResult.campaign;
    allWarnings.push(...sanitizeResult.warnings.map(w => `campaign: ${w}`));
  }

  if (!campaign) {
    return { pkg: null, errors: ['缺少有效的 campaign 数据'], warnings: allWarnings };
  }

  let progress: CampaignProgress | undefined;
  if (data.progress !== undefined && data.progress !== null) {
    progress = sanitizeCampaignProgress(data.progress, campaign.id);
    allWarnings.push('progress 数据已导入');
  }

  let operationLog: OperationLogEntry[] = [];
  if (Array.isArray(data.operationLog)) {
    operationLog = data.operationLog as OperationLogEntry[];
  } else {
    allWarnings.push('缺少 operationLog 或不是数组，已设为空数组');
  }

  const pkg: CampaignPackage = {
    packageVersion,
    exportedAt,
    campaign,
    progress,
    operationLog,
  };

  return { pkg, errors: allErrors, warnings: allWarnings };
}

export function generateUniqueCampaignName(baseName: string, existingCampaigns: Campaign[], counter = 1): string {
  const candidate = counter === 1 ? baseName : `${baseName} (导入 ${counter})`;
  if (!existingCampaigns.some(c => c.name === candidate)) {
    return candidate;
  }
  return generateUniqueCampaignName(baseName, existingCampaigns, counter + 1);
}

export function generateUniqueLevelName(baseName: string, existingLevels: CampaignLevel[], counter = 1): string {
  const candidate = counter === 1 ? baseName : `${baseName} (导入 ${counter})`;
  if (!existingLevels.some(l => l.name === candidate)) {
    return candidate;
  }
  return generateUniqueLevelName(baseName, existingLevels, counter + 1);
}

export interface MergeCampaignOptions {
  strategy: CampaignConflictStrategy;
  levelStrategy: CampaignLevelConflictStrategy;
  existingCampaigns: Campaign[];
  incomingCampaign: Campaign;
  incomingProgress?: CampaignProgress;
}

export interface MergeCampaignResult {
  mergedCampaigns: Campaign[];
  logEntries: { action: OperationLogEntry['action']; detail: string; campaignName?: string; levelName?: string }[];
  resolvedCampaignId: string | null;
  nameMap: Map<string, string>;
  levelIdMap: Map<string, string>;
}

export function mergeCampaigns(options: MergeCampaignOptions): MergeCampaignResult {
  const { strategy, levelStrategy, existingCampaigns, incomingCampaign, incomingProgress } = options;

  const merged = [...existingCampaigns];
  const existingNames = new Set(existingCampaigns.map((c) => c.name));
  const existingIds = new Set(existingCampaigns.map((c) => c.id));
  const logEntries: MergeCampaignResult['logEntries'] = [];
  const nameMap = new Map<string, string>();
  const levelIdMap = new Map<string, string>();

  let resolvedCampaignId: string | null = null;

  const nameConflict = existingNames.has(incomingCampaign.name);
  let finalName = incomingCampaign.name;
  let finalId = incomingCampaign.id;

  if (existingIds.has(incomingCampaign.id)) {
    finalId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  if (nameConflict) {
    if (strategy === 'skip') {
      logEntries.push({
        action: 'campaign_import_conflict_skip_campaign',
        detail: `跳过同名战役「${incomingCampaign.name}」`,
        campaignName: incomingCampaign.name,
      });
      return {
        mergedCampaigns: merged,
        logEntries,
        resolvedCampaignId: null,
        nameMap,
        levelIdMap,
      };
    } else if (strategy === 'replace') {
      const idx = merged.findIndex((c) => c.name === incomingCampaign.name);
      if (idx >= 0) {
        const oldId = merged[idx].id;
        merged.splice(idx, 1);
        existingNames.delete(incomingCampaign.name);
        existingIds.delete(oldId);
      }
      logEntries.push({
        action: 'campaign_import_conflict_replace_campaign',
        detail: `替换同名战役「${incomingCampaign.name}」`,
        campaignName: incomingCampaign.name,
      });
      finalName = incomingCampaign.name;
    } else {
      finalName = generateUniqueCampaignName(incomingCampaign.name, merged);
      logEntries.push({
        action: 'campaign_import_conflict_rename_campaign',
        detail: `重命名战役「${incomingCampaign.name}」→「${finalName}」`,
        campaignName: finalName,
      });
    }
  } else {
    logEntries.push({
      action: 'campaign_import',
      detail: `导入战役「${incomingCampaign.name}」`,
      campaignName: incomingCampaign.name,
    });
  }

  const existingLevelNames = new Set<string>();
  const newCampaign: Campaign = {
    ...JSON.parse(JSON.stringify(incomingCampaign)),
    id: finalId,
    name: finalName,
    levels: [],
    updatedAt: Date.now(),
  };

  const sortedIncomingLevels = [...incomingCampaign.levels].sort((a, b) => a.order - b.order);

  for (const incomingLevel of sortedIncomingLevels) {
    const levelNameConflict = existingLevelNames.has(incomingLevel.name);
    let finalLevelName = incomingLevel.name;
    let finalLevelId = incomingLevel.id;

    if (newCampaign.levels.some(l => l.id === incomingLevel.id)) {
      finalLevelId = `clevel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    let levelAction: OperationLogEntry['action'] | null = null;
    let levelDetail = '';

    if (levelNameConflict) {
      if (levelStrategy === 'skip') {
        levelAction = 'campaign_import_conflict_skip_level';
        levelDetail = `跳过同名关卡「${incomingLevel.name}」`;
        logEntries.push({ action: levelAction, detail: levelDetail, campaignName: finalName, levelName: incomingLevel.name });
        continue;
      } else if (levelStrategy === 'replace') {
        levelAction = 'campaign_import_conflict_replace_level';
        levelDetail = `替换同名关卡「${incomingLevel.name}」`;
        existingLevelNames.delete(incomingLevel.name);
      } else {
        finalLevelName = generateUniqueLevelName(incomingLevel.name, newCampaign.levels);
        levelAction = 'campaign_import_conflict_rename_level';
        levelDetail = `重命名关卡「${incomingLevel.name}」→「${finalLevelName}」`;
      }
    }

    const newLevel: CampaignLevel = {
      ...JSON.parse(JSON.stringify(incomingLevel)),
      id: finalLevelId,
      name: finalLevelName,
      order: newCampaign.levels.length,
      updatedAt: Date.now(),
    };

    newCampaign.levels.push(newLevel);
    existingLevelNames.add(finalLevelName);
    levelIdMap.set(incomingLevel.id, finalLevelId);

    if (levelAction) {
      logEntries.push({ action: levelAction, detail: levelDetail, campaignName: finalName, levelName: finalLevelName });
    }
  }

  if (incomingProgress) {
    const newProgress: CampaignProgress = {
      ...JSON.parse(JSON.stringify(incomingProgress)),
      campaignId: finalId,
      currentLevelId: incomingProgress.currentLevelId ? (levelIdMap.get(incomingProgress.currentLevelId) ?? null) : null,
      levelResults: {},
    };
    for (const [levelId, result] of Object.entries(incomingProgress.levelResults)) {
      const newLevelId = levelIdMap.get(levelId);
      if (newLevelId) {
        newProgress.levelResults[newLevelId] = result;
      }
    }
  }

  merged.push(newCampaign);
  existingNames.add(finalName);
  existingIds.add(finalId);
  nameMap.set(incomingCampaign.id, finalId);
  resolvedCampaignId = finalId;

  return {
    mergedCampaigns: merged,
    logEntries,
    resolvedCampaignId,
    nameMap,
    levelIdMap,
  };
}

export function importCampaignPackageWithMerge(
  jsonStr: string,
  existingCampaigns: Campaign[],
  strategy: CampaignConflictStrategy,
  levelStrategy: CampaignLevelConflictStrategy,
): CampaignPackageImportResult {
  const parseResult = parseCampaignPackage(jsonStr);
  if (!parseResult.pkg) {
    return {
      success: false,
      errors: parseResult.errors,
      warnings: parseResult.warnings,
      mergedCampaigns: existingCampaigns,
      logEntries: [{ action: 'campaign_import_failed', detail: `战役包解析失败：${parseResult.errors.join('; ')}` }],
    };
  }

  const pkg = parseResult.pkg;
  const warnings: string[] = [...parseResult.warnings];
  const allLogEntries: MergeCampaignResult['logEntries'] = [];

  const mergeResult = mergeCampaigns({
    strategy,
    levelStrategy,
    existingCampaigns,
    incomingCampaign: pkg.campaign,
    incomingProgress: pkg.progress,
  });

  allLogEntries.push(...mergeResult.logEntries);

  if (pkg.campaign.levels.length > 0) {
    warnings.push(`战役「${pkg.campaign.name}」包含 ${pkg.campaign.levels.length} 个关卡`);
  }

  return {
    success: true,
    errors: [],
    warnings,
    mergedCampaigns: mergeResult.mergedCampaigns,
    logEntries: allLogEntries,
  };
}

export function recalculateCampaignProgress(
  campaign: Campaign,
  progress: CampaignProgress,
): CampaignProgress {
  let totalStars = 0;
  let completedCount = 0;

  for (const level of campaign.levels) {
    const result = progress.levelResults[level.id];
    if (result?.completed) {
      completedCount++;
      totalStars += result.stars;
    }
  }

  return {
    ...progress,
    totalStars,
    completedCount,
  };
}

export function updateLevelUnlocks(campaign: Campaign, progress: CampaignProgress): Campaign {
  const sortedLevels = [...campaign.levels].sort((a, b) => a.order - b.order);
  const updatedLevels = sortedLevels.map((level, index) => {
    let unlocked = false;
    const condition = level.meta.unlockCondition;

    switch (condition.type) {
      case UCT.ALWAYS_UNLOCKED:
        unlocked = true;
        break;
      case UCT.PREVIOUS_LEVEL_CLEARED:
        if (index === 0) {
          unlocked = true;
        } else {
          const prevLevel = sortedLevels[index - 1];
          const prevResult = progress.levelResults[prevLevel.id];
          unlocked = prevResult?.completed ?? false;
        }
        break;
      case UCT.PREVIOUS_LEVEL_STARS:
        if (index === 0) {
          unlocked = true;
        } else {
          const prevLevel = sortedLevels[index - 1];
          const prevResult = progress.levelResults[prevLevel.id];
          const requiredStars = condition.requiredStars ?? 1;
          unlocked = (prevResult?.stars ?? 0) >= requiredStars;
        }
        break;
      case UCT.CUSTOM_CONDITION:
        unlocked = level.unlocked ?? false;
        break;
    }

    return { ...level, unlocked };
  });

  return {
    ...campaign,
    levels: updatedLevels,
    updatedAt: Date.now(),
  };
}

function sanitizeUnlockCondition(obj: unknown): UnlockCondition {
  if (!obj || typeof obj !== 'object') {
    return { type: UCT.ALWAYS_UNLOCKED };
  }
  const o = obj as Record<string, unknown>;
  const validTypes = new Set(Object.values(UCT) as string[]);
  const type = (typeof o.type === 'string' && validTypes.has(o.type)) 
    ? o.type as UnlockConditionType 
    : UCT.ALWAYS_UNLOCKED;
  
  const condition: UnlockCondition = { type };
  if (type === UCT.PREVIOUS_LEVEL_STARS && typeof o.requiredStars === 'number') {
    condition.requiredStars = o.requiredStars;
  }
  if (type === UCT.CUSTOM_CONDITION && typeof o.customDescription === 'string') {
    condition.customDescription = o.customDescription;
  }
  return condition;
}

function sanitizeCampaignLevelMeta(obj: unknown): CampaignLevelMeta {
  const defaultMeta = createDefaultMeta();
  if (!obj || typeof obj !== 'object') {
    return defaultMeta;
  }
  const o = obj as Record<string, unknown>;
  
  return {
    goalDescription: typeof o.goalDescription === 'string' ? o.goalDescription : defaultMeta.goalDescription,
    recommendedSteps: typeof o.recommendedSteps === 'number' ? o.recommendedSteps : defaultMeta.recommendedSteps,
    unlockCondition: sanitizeUnlockCondition(o.unlockCondition),
    notes: typeof o.notes === 'string' ? o.notes : defaultMeta.notes,
    starsThreshold: Array.isArray(o.starsThreshold) && o.starsThreshold.length === 3
      ? o.starsThreshold as [number, number, number]
      : defaultMeta.starsThreshold,
  };
}

function sanitizeCampaignLevel(obj: unknown, index: number): { level: CampaignLevel | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { level: null, warnings: [`关卡 ${index + 1}: 不是对象，已跳过`] };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') {
    warnings.push(`关卡 ${index + 1}: 缺少 id，已生成新 id`);
  }
  if (typeof o.name !== 'string') {
    warnings.push(`关卡 ${index + 1}: 缺少 name，已使用默认名称`);
  }
  if (typeof o.order !== 'number') {
    warnings.push(`关卡 ${index + 1}: 缺少 order，已使用索引`);
  }
  if (typeof o.unlocked !== 'boolean') {
    warnings.push(`关卡 ${index + 1}: 缺少 unlocked，已设为默认值`);
  }
  if (typeof o.createdAt !== 'number') {
    warnings.push(`关卡 ${index + 1}: 缺少 createdAt，已使用当前时间`);
  }
  if (typeof o.updatedAt !== 'number') {
    warnings.push(`关卡 ${index + 1}: 缺少 updatedAt，已使用当前时间`);
  }
  if (!o.levelData || typeof o.levelData !== 'object') {
    return { level: null, warnings: [`关卡 ${index + 1}: 缺少 levelData，已跳过`] };
  }

  const levelDataResult = validateImportStructure(o.levelData);
  if (!levelDataResult.ok) {
    return { level: null, warnings: [`关卡 ${index + 1}: levelData 无效，已跳过: ${levelDataResult.errors.join('; ')}`] };
  }

  const meta = sanitizeCampaignLevelMeta(o.meta);
  if (!o.meta || typeof o.meta !== 'object') {
    warnings.push(`关卡 ${index + 1}: 缺少 meta，已使用默认元数据`);
  }

  const now = Date.now();
  const level: CampaignLevel = {
    id: typeof o.id === 'string' ? o.id : genCampaignLevelId(),
    name: typeof o.name === 'string' ? o.name : `关卡 ${index + 1}`,
    order: typeof o.order === 'number' ? o.order : index,
    levelData: o.levelData as LevelData,
    meta,
    unlocked: typeof o.unlocked === 'boolean' ? o.unlocked : true,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
  };

  if (o.playResult !== undefined && o.playResult !== null) {
    const pr = o.playResult as Record<string, unknown>;
    if (typeof pr.completed === 'boolean' && typeof pr.steps === 'number' &&
        typeof pr.stars === 'number' && typeof pr.completedAt === 'number') {
      level.playResult = o.playResult as LevelPlayResult;
    } else {
      warnings.push(`关卡 ${index + 1}: playResult 无效，已忽略`);
    }
  }

  return { level, warnings };
}

export function sanitizeCampaign(obj: unknown): { campaign: Campaign | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { campaign: null, warnings: ['战役数据不是对象'] };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') warnings.push('缺少 id，已生成新 id');
  if (typeof o.name !== 'string') warnings.push('缺少 name，已使用默认名称');
  if (typeof o.description !== 'string') warnings.push('缺少 description，已设为空');
  if (typeof o.version !== 'string') warnings.push('缺少 version，已使用默认版本');
  if (typeof o.createdAt !== 'number') warnings.push('缺少 createdAt，已使用当前时间');
  if (typeof o.updatedAt !== 'number') warnings.push('缺少 updatedAt，已使用当前时间');

  const levels: CampaignLevel[] = [];
  if (Array.isArray(o.levels)) {
    for (let i = 0; i < o.levels.length; i++) {
      const result = sanitizeCampaignLevel(o.levels[i], i);
      if (result.level) {
        levels.push(result.level);
      }
      warnings.push(...result.warnings);
    }
    levels.sort((a, b) => a.order - b.order);
    levels.forEach((l, idx) => { l.order = idx; });
  } else {
    warnings.push('缺少 levels 或不是数组，已设为空数组');
  }

  const now = Date.now();
  const campaign: Campaign = {
    id: typeof o.id === 'string' ? o.id : genCampaignId(),
    name: typeof o.name === 'string' ? o.name : '未命名战役',
    description: typeof o.description === 'string' ? o.description : '',
    version: typeof o.version === 'string' ? o.version : '1.0.0',
    levels,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
  };

  return { campaign, warnings };
}

function sanitizeCampaignProgress(obj: unknown, campaignId: string): CampaignProgress {
  const defaultProgress = createCampaignProgress(campaignId);
  if (!obj || typeof obj !== 'object') {
    return defaultProgress;
  }
  const o = obj as Record<string, unknown>;
  
  return {
    campaignId: typeof o.campaignId === 'string' ? o.campaignId : campaignId,
    currentLevelId: typeof o.currentLevelId === 'string' ? o.currentLevelId : null,
    totalStars: typeof o.totalStars === 'number' ? o.totalStars : 0,
    completedCount: typeof o.completedCount === 'number' ? o.completedCount : 0,
    lastPlayedAt: typeof o.lastPlayedAt === 'number' ? o.lastPlayedAt : null,
    levelResults: o.levelResults && typeof o.levelResults === 'object' 
      ? { ...(o.levelResults as Record<string, LevelPlayResult>) }
      : {},
  };
}

let archiveIdCounter = 0;
let archiveSnapshotIdCounter = 0;

export function genArchiveId(): string {
  return `arch_${Date.now()}_${++archiveIdCounter}`;
}

export function genArchiveSnapshotId(): string {
  return `asnap_${Date.now()}_${++archiveSnapshotIdCounter}`;
}

export function createCampaignArchive(
  name: string,
  campaign: Campaign,
  progress: CampaignProgress,
  description = '',
): CampaignArchive {
  const now = Date.now();
  return {
    id: genArchiveId(),
    name,
    description,
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: null,
    campaign: JSON.parse(JSON.stringify(campaign)),
    progress: JSON.parse(JSON.stringify(progress)),
  };
}

export function createArchiveSnapshot(
  name: string,
  archive: CampaignArchive,
  description = '',
): CampaignArchiveSnapshot {
  return {
    id: genArchiveSnapshotId(),
    name,
    description,
    createdAt: Date.now(),
    archiveId: archive.id,
    archive: JSON.parse(JSON.stringify(archive)),
  };
}

export function exportArchivePackage(params: {
  archive: CampaignArchive;
  snapshots?: CampaignArchiveSnapshot[];
  operationLog: OperationLogEntry[];
}): string {
  const pkg: CampaignArchivePackage = {
    packageVersion: ARCHIVE_PACKAGE_VERSION,
    archiveVersion: '1.0.0',
    exportedAt: Date.now(),
    archive: JSON.parse(JSON.stringify(params.archive)),
    snapshots: params.snapshots ? JSON.parse(JSON.stringify(params.snapshots)) : [],
    operationLog: JSON.parse(JSON.stringify(params.operationLog)),
  };
  const envelope = {
    _type: ARCHIVE_TYPE_IDENTIFIER,
    data: pkg,
  };
  return JSON.stringify(envelope, null, 2);
}

export function validateArchiveStructure(obj: unknown): { ok: boolean; valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!obj || typeof obj !== 'object') {
    return { ok: false, valid: false, errors: ['档案数据不是对象'], warnings };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') errors.push('缺少 id 或类型错误');
  if (typeof o.name !== 'string') errors.push('缺少 name 或类型错误');
  if (typeof o.description !== 'string') errors.push('缺少 description 或类型错误');
  if (typeof o.notes !== 'string') errors.push('缺少 notes 或类型错误');
  if (typeof o.archived !== 'boolean') errors.push('缺少 archived 或类型错误');
  if (typeof o.createdAt !== 'number') errors.push('缺少 createdAt 或类型错误');
  if (typeof o.updatedAt !== 'number') errors.push('缺少 updatedAt 或类型错误');
  if (o.lastPlayedAt !== undefined && o.lastPlayedAt !== null && typeof o.lastPlayedAt !== 'number') {
    errors.push('lastPlayedAt 类型错误');
  }

  if (!o.campaign || typeof o.campaign !== 'object') {
    errors.push('缺少 campaign 或格式错误');
  } else {
    const campaignCheck = validateCampaignStructure(o.campaign);
    if (!campaignCheck.ok) {
      errors.push(...campaignCheck.errors.map((e) => `campaign: ${e}`));
    }
    warnings.push(...campaignCheck.warnings);
  }

  if (!o.progress || typeof o.progress !== 'object') {
    errors.push('缺少 progress 或格式错误');
  } else {
    const progressErrors = validateCampaignProgress(o.progress);
    errors.push(...progressErrors.map((e) => `progress: ${e}`));
  }

  return { ok: errors.length === 0, valid: errors.length === 0, errors, warnings };
}

function validateArchiveSnapshotStructure(obj: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return [`快照 ${index + 1}: 不是对象`];
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string') errors.push(`快照 ${index + 1}: 缺少 id`);
  if (typeof o.name !== 'string') errors.push(`快照 ${index + 1}: 缺少 name`);
  if (typeof o.createdAt !== 'number') errors.push(`快照 ${index + 1}: 缺少 createdAt`);
  if (typeof o.archiveId !== 'string') errors.push(`快照 ${index + 1}: 缺少 archiveId`);
  if (!o.archive || typeof o.archive !== 'object') {
    errors.push(`快照 ${index + 1}: 缺少 archive 数据`);
  } else {
    const archiveCheck = validateArchiveStructure(o.archive);
    errors.push(...archiveCheck.errors.map((e) => `快照 ${index + 1}.archive: ${e}`));
  }
  return errors;
}

export function checkArchiveVersionCompatibility(pkgVersion: string, currentVersion: string = ARCHIVE_PACKAGE_VERSION): { compatible: boolean; warnings: string[]; errors: string[]; warning: boolean } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const currentMajor = currentVersion.split('.')[0];
  const pkgMajor = pkgVersion.split('.')[0];

  if (currentMajor !== pkgMajor) {
    errors.push(`档案包版本 ${pkgVersion} 与当前版本 ${currentVersion} 主版本号不兼容，无法导入`);
    return { compatible: false, warnings, errors, warning: false };
  }

  const cmp = compareSemver(pkgVersion, currentVersion);
  if (cmp > 0) {
    warnings.push(`档案包版本 ${pkgVersion} 高于当前版本 ${currentVersion}，部分字段可能无法识别，将尝试兼容导入`);
  } else if (cmp < 0) {
    warnings.push(`档案包版本 ${pkgVersion} 低于当前版本 ${currentVersion}，将按旧格式兼容导入`);
  }

  return { compatible: true, warnings, errors, warning: warnings.length > 0 };
}

export function validateArchivePackageStructure(obj: unknown): { ok: boolean; valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!obj || typeof obj !== 'object') {
    return { ok: false, valid: false, errors: ['档案包不是对象'], warnings };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.packageVersion !== 'string') {
    errors.push('缺少 packageVersion 或类型错误');
  }
  if (typeof o.exportedAt !== 'number') {
    warnings.push('缺少 exportedAt，将使用当前时间');
  }

  if (!o.archive || typeof o.archive !== 'object') {
    errors.push('缺少 archive 或格式错误');
  } else {
    const archiveCheck = validateArchiveStructure(o.archive);
    if (!archiveCheck.ok) {
      errors.push(...archiveCheck.errors.map((e) => `archive: ${e}`));
    }
    warnings.push(...archiveCheck.warnings);
  }

  if (o.snapshots !== undefined) {
    if (!Array.isArray(o.snapshots)) {
      errors.push('snapshots 必须是数组');
    } else {
      for (let i = 0; i < o.snapshots.length; i++) {
        const snapshotErrors = validateArchiveSnapshotStructure(o.snapshots[i], i);
        errors.push(...snapshotErrors);
      }
    }
  }

  if (o.operationLog !== undefined && !Array.isArray(o.operationLog)) {
    errors.push('operationLog 必须是数组');
  }

  return { ok: errors.length === 0, valid: errors.length === 0, errors, warnings };
}

export function parseArchivePackage(str: string): { pkg: CampaignArchivePackage | null; errors: string[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return { pkg: null, errors: ['JSON 解析失败：格式不合法'], warnings: [] };
  }

  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return { pkg: null, errors: ['档案包根元素必须是对象'], warnings: [] };
  }
  const envelope = parsed as Record<string, unknown>;

  if (envelope._type !== ARCHIVE_TYPE_IDENTIFIER) {
    return { pkg: null, errors: ['不是合法的档案包文件（缺少类型标识）'], warnings: [] };
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { pkg: null, errors: ['档案包缺少 data 字段'], warnings: [] };
  }

  let packageVersion = ARCHIVE_PACKAGE_VERSION;
  if (typeof data.packageVersion === 'string') {
    packageVersion = data.packageVersion;
    const versionCheck = checkArchiveVersionCompatibility(packageVersion);
    if (versionCheck.compatible) {
      allWarnings.push(...versionCheck.warnings);
    } else {
      const pkgMajor = parseInt(packageVersion.split('.')[0] || '0', 10);
      const curMajor = parseInt(ARCHIVE_PACKAGE_VERSION.split('.')[0] || '1', 10);
      if (pkgMajor < curMajor) {
        allWarnings.push(...versionCheck.errors);
        allWarnings.push('旧版本档案包，将尝试兼容导入，部分数据可能丢失');
      } else {
        allErrors.push(...versionCheck.errors);
        return { pkg: null, errors: allErrors, warnings: allWarnings };
      }
    }
  } else {
    allWarnings.push('缺少 packageVersion 字段，使用当前版本');
  }

  let exportedAt = Date.now();
  if (typeof data.exportedAt === 'number') {
    exportedAt = data.exportedAt;
  } else {
    allWarnings.push('缺少 exportedAt 字段，使用当前时间');
  }

  let archive: CampaignArchive | null = null;
  if (data.archive && typeof data.archive === 'object') {
    const sanitizeResult = sanitizeArchive(data.archive);
    archive = sanitizeResult.archive;
    allWarnings.push(...sanitizeResult.warnings.map(w => `archive: ${w}`));
  }

  if (!archive) {
    return { pkg: null, errors: ['缺少有效的 archive 数据'], warnings: allWarnings };
  }

  let snapshots: CampaignArchiveSnapshot[] = [];
  if (Array.isArray(data.snapshots)) {
    for (let i = 0; i < data.snapshots.length; i++) {
      const s = data.snapshots[i];
      const sanitizeResult = sanitizeArchiveSnapshot(s, i);
      if (sanitizeResult.snapshot) {
        snapshots.push(sanitizeResult.snapshot);
      }
      allWarnings.push(...sanitizeResult.warnings.map(w => `snapshots[${i}]: ${w}`));
    }
  } else {
    allWarnings.push('缺少 snapshots 或不是数组，已设为空数组');
  }

  let operationLog: OperationLogEntry[] = [];
  if (Array.isArray(data.operationLog)) {
    operationLog = data.operationLog as OperationLogEntry[];
  } else {
    allWarnings.push('缺少 operationLog 或不是数组，已设为空数组');
  }

  const pkg: CampaignArchivePackage = {
    packageVersion,
    archiveVersion: typeof data.archiveVersion === 'string' ? data.archiveVersion : '1.0.0',
    exportedAt,
    archive,
    snapshots,
    operationLog,
  };

  if (allErrors.length > 0) {
    return { pkg: null, errors: allErrors, warnings: allWarnings };
  }

  return { pkg, errors: [], warnings: allWarnings };
}

export function sanitizeArchive(obj: unknown): { archive: CampaignArchive | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { archive: null, warnings: ['档案数据不是对象'] };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') warnings.push('缺少 id，已生成新 id');
  if (typeof o.name !== 'string') warnings.push('缺少 name，已使用默认名称');
  if (typeof o.description !== 'string') warnings.push('缺少 description，已设为空');
  if (typeof o.notes !== 'string') warnings.push('缺少 notes，已设为空');
  if (typeof o.archived !== 'boolean') warnings.push('缺少 archived，已设为 false');
  if (typeof o.createdAt !== 'number') warnings.push('缺少 createdAt，已使用当前时间');
  if (typeof o.updatedAt !== 'number') warnings.push('缺少 updatedAt，已使用当前时间');

  const campaignResult = sanitizeCampaign(o.campaign);
  const campaign = campaignResult.campaign;
  warnings.push(...campaignResult.warnings.map(w => `campaign: ${w}`));

  if (!campaign) {
    warnings.push('campaign 数据无效，无法创建档案');
    return { archive: null, warnings };
  }

  const now = Date.now();
  const archive: CampaignArchive = {
    id: typeof o.id === 'string' ? o.id : genArchiveId(),
    name: typeof o.name === 'string' ? o.name : '未命名档案',
    description: typeof o.description === 'string' ? o.description : '',
    notes: typeof o.notes === 'string' ? o.notes : '',
    archived: typeof o.archived === 'boolean' ? o.archived : false,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
    lastPlayedAt: typeof o.lastPlayedAt === 'number' ? o.lastPlayedAt : null,
    campaign,
    progress: sanitizeCampaignProgress(o.progress, campaign.id),
  };

  return { archive, warnings };
}

function sanitizeArchiveSnapshot(obj: unknown, index: number): { snapshot: CampaignArchiveSnapshot | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { snapshot: null, warnings: [`快照 ${index + 1}: 不是对象，已跳过`] };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') warnings.push(`快照 ${index + 1}: 缺少 id，已生成新 id`);
  if (typeof o.name !== 'string') warnings.push(`快照 ${index + 1}: 缺少 name，已使用默认名称`);
  if (typeof o.createdAt !== 'number') warnings.push(`快照 ${index + 1}: 缺少 createdAt，已使用当前时间`);

  const archiveResult = sanitizeArchive(o.archive);
  if (!archiveResult.archive) {
    warnings.push(`快照 ${index + 1}: archive 数据无效，已跳过`);
    return { snapshot: null, warnings: [...warnings, ...archiveResult.warnings] };
  }

  const now = Date.now();
  const snapshot: CampaignArchiveSnapshot = {
    id: typeof o.id === 'string' ? o.id : genArchiveSnapshotId(),
    name: typeof o.name === 'string' ? o.name : `快照 ${index + 1}`,
    description: typeof o.description === 'string' ? o.description : '',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
    archiveId: typeof o.archiveId === 'string' ? o.archiveId : archiveResult.archive.id,
    archive: archiveResult.archive,
  };

  return { snapshot, warnings: [...warnings, ...archiveResult.warnings] };
}

export function generateUniqueArchiveName(baseName: string, existingArchives: CampaignArchive[], counter = 1): string {
  const candidate = counter === 1 ? baseName : `${baseName} (导入 ${counter})`;
  if (!existingArchives.some(a => a.name === candidate)) {
    return candidate;
  }
  return generateUniqueArchiveName(baseName, existingArchives, counter + 1);
}

export interface MergeArchiveOptions {
  strategy: CampaignArchiveConflictStrategy;
  existingArchives: CampaignArchive[];
  incomingArchive: CampaignArchive;
  incomingSnapshots: CampaignArchiveSnapshot[];
}

export interface MergeArchiveResult {
  mergedArchives: CampaignArchive[];
  logEntries: { action: OperationLogEntry['action']; detail: string; archiveName?: string }[];
  resolvedArchiveId: string | null;
  nameMap: Map<string, string>;
}

export function mergeArchives(options: MergeArchiveOptions): MergeArchiveResult {
  const { strategy, existingArchives, incomingArchive, incomingSnapshots } = options;

  if (!['overwrite', 'keep_both', 'metadata_only'].includes(strategy)) {
    throw new Error(`无效的冲突处理策略: ${strategy}`);
  }

  const merged = [...existingArchives];
  const existingNames = new Set(existingArchives.map((a) => a.name));
  const existingIds = new Set(existingArchives.map((a) => a.id));
  const logEntries: MergeArchiveResult['logEntries'] = [];
  const nameMap = new Map<string, string>();

  let resolvedArchiveId: string | null = null;

  const nameConflict = existingNames.has(incomingArchive.name);
  let finalName = incomingArchive.name;
  let finalId = incomingArchive.id;

  if (existingIds.has(incomingArchive.id)) {
    finalId = `arch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  if (nameConflict) {
    if (strategy === 'overwrite') {
      const idx = merged.findIndex((a) => a.name === incomingArchive.name);
      if (idx >= 0) {
        const oldId = merged[idx].id;
        merged.splice(idx, 1);
        existingNames.delete(incomingArchive.name);
        existingIds.delete(oldId);
      }
      logEntries.push({
        action: 'archive_import_conflict_overwrite',
        detail: `覆盖同名档案「${incomingArchive.name}」`,
        archiveName: incomingArchive.name,
      });
      finalName = incomingArchive.name;
    } else if (strategy === 'keep_both') {
      finalName = generateUniqueArchiveName(incomingArchive.name, merged);
      logEntries.push({
        action: 'archive_import_conflict_keep_both',
        detail: `并存档案「${incomingArchive.name}」→「${finalName}」`,
        archiveName: finalName,
      });
    } else if (strategy === 'metadata_only') {
      const idx = merged.findIndex((a) => a.name === incomingArchive.name);
      if (idx >= 0) {
        const existing = merged[idx];
        const updatedArchive: CampaignArchive = {
          ...existing,
          name: incomingArchive.name,
          description: incomingArchive.description || existing.description,
          notes: incomingArchive.notes || existing.notes,
          updatedAt: Date.now(),
        };
        merged[idx] = updatedArchive;
        logEntries.push({
          action: 'archive_import_conflict_metadata_only',
          detail: `仅更新元数据「${incomingArchive.name}」`,
          archiveName: incomingArchive.name,
        });
        resolvedArchiveId = existing.id;
        nameMap.set(incomingArchive.id, existing.id);
        return {
          mergedArchives: merged,
          logEntries,
          resolvedArchiveId,
          nameMap,
        };
      }
    }
  } else {
    logEntries.push({
      action: 'archive_import',
      detail: `导入档案「${incomingArchive.name}」`,
      archiveName: incomingArchive.name,
    });
  }

  const newArchive: CampaignArchive = {
    ...JSON.parse(JSON.stringify(incomingArchive)),
    id: finalId,
    name: finalName,
    updatedAt: Date.now(),
  };

  merged.push(newArchive);
  existingNames.add(finalName);
  existingIds.add(finalId);
  nameMap.set(incomingArchive.id, finalId);
  resolvedArchiveId = finalId;

  return {
    mergedArchives: merged,
    logEntries,
    resolvedArchiveId,
    nameMap,
  };
}

export function importArchivePackageWithMerge(
  jsonStr: string,
  existingArchives: CampaignArchive[],
  strategy: CampaignArchiveConflictStrategy,
): CampaignArchiveImportResult {
  const parseResult = parseArchivePackage(jsonStr);
  if (!parseResult.pkg) {
    return {
      success: false,
      errors: parseResult.errors,
      warnings: parseResult.warnings,
      mergedArchives: existingArchives,
      logEntries: [{ action: 'archive_import_failed', detail: `档案包解析失败：${parseResult.errors.join('; ')}` }],
      resolvedArchiveId: null,
    };
  }

  const pkg = parseResult.pkg;
  const warnings: string[] = [...parseResult.warnings];
  const allLogEntries: MergeArchiveResult['logEntries'] = [];

  const mergeResult = mergeArchives({
    strategy,
    existingArchives,
    incomingArchive: pkg.archive,
    incomingSnapshots: pkg.snapshots,
  });

  allLogEntries.push(...mergeResult.logEntries);

  if (pkg.archive.campaign.levels.length > 0) {
    warnings.push(`档案「${pkg.archive.name}」包含 ${pkg.archive.campaign.levels.length} 个关卡`);
  }

  const skipped = mergeResult.logEntries.filter((e) => e.action === 'archive_import_conflict_keep_both').length;
  const overwritten = mergeResult.logEntries.filter((e) => e.action === 'archive_import_conflict_overwrite').length;
  const metadataOnly = mergeResult.logEntries.filter((e) => e.action === 'archive_import_conflict_metadata_only').length;

  if (overwritten > 0) warnings.push(`共覆盖 ${overwritten} 个同名档案`);
  if (skipped > 0) warnings.push(`共并存 ${skipped} 个同名档案`);
  if (metadataOnly > 0) warnings.push(`共更新 ${metadataOnly} 个档案元数据`);

  allLogEntries.unshift({
    action: 'archive_import',
    detail: `导入档案包成功：共 1 个档案`,
  });

  return {
    success: true,
    errors: [],
    warnings,
    mergedArchives: mergeResult.mergedArchives,
    logEntries: allLogEntries,
    resolvedArchiveId: mergeResult.resolvedArchiveId,
  };
}

