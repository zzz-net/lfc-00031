import type { LevelData, Position, SwitchDoorRule, LevelRules, MoveStep, SnapshotPackage, DraftSnapshot, HistoryState, ValidationResult, OperationLogEntry, SnapshotConflictStrategy, SnapshotPackageImportResult } from '@/types';
import { TileType as TT, WinCondition, Direction, DATA_VERSION, SNAPSHOT_PACKAGE_VERSION, PACKAGE_TYPE_IDENTIFIER } from '@/types';
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
