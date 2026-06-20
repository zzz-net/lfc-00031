import type { LevelData, Position, SwitchDoorRule, LevelRules, MoveStep } from '@/types';
import { TileType as TT, WinCondition, Direction, DATA_VERSION } from '@/types';
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
  } catch (e) {
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
