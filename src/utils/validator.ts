import type { LevelData, ValidationError, ValidationResult, ValidationWarning, Position } from '@/types';
import { TileType as TT } from '@/types';
import { findPositions } from './mapOps';

function checkNoTargets(level: LevelData): ValidationError | null {
  if (level.targets.length === 0) {
    return {
      code: 'E001',
      message: '未设置目标点。请至少放置一个目标（🎯）',
    };
  }
  return null;
}

function checkPlayerCount(level: LevelData): ValidationError | null {
  const starts = findPositions(level.tiles, TT.START);
  if (starts.length === 0) {
    return {
      code: 'E002',
      message: '缺少玩家起点。请放置一个起点（🚶）',
    };
  }
  if (starts.length > 1) {
    return {
      code: 'E002',
      message: `存在 ${starts.length} 个起点，只能有一个。请移除多余的起点`,
      position: starts[1],
    };
  }
  return null;
}

function checkOutOfBounds(level: LevelData): ValidationError | null {
  const checks: { pos: Position; label: string }[] = [];
  if (level.playerStart) checks.push({ pos: level.playerStart, label: '起点' });
  for (const t of level.targets) checks.push({ pos: t, label: '目标' });
  for (const b of level.boxes) checks.push({ pos: b, label: '箱子' });
  for (const s of level.switches) checks.push({ pos: s.pos, label: '机关' });
  for (const d of level.doors) checks.push({ pos: d, label: '门' });

  for (const c of checks) {
    const { x, y } = c.pos;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
      return {
        code: 'E003',
        message: `${c.label}位置 (${x},${y}) 超出边界`,
        position: c.pos,
      };
    }
  }
  return null;
}

function checkTrapped(level: LevelData): ValidationError | null {
  const walkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
    const t = level.tiles[y][x];
    return t !== TT.WALL && t !== TT.DOOR;
  };

  const playerX = level.playerStart.x;
  const playerY = level.playerStart.y;
  const hasAdjacent = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
  ].some(([dx, dy]) => walkable(playerX + dx, playerY + dy));

  if (!hasAdjacent) {
    return {
      code: 'E004',
      message: '玩家起点被墙或门完全包围，无法移动',
      position: level.playerStart,
    };
  }

  for (const box of level.boxes) {
    const bx = box.x;
    const by = box.y;
    const boxAdjacent = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
    ].some(([dx, dy]) => walkable(bx + dx, by + dy));

    if (!boxAdjacent) {
      return {
        code: 'E004',
        message: `箱子 (${bx},${by}) 被完全包围，无法推动`,
        position: box,
      };
    }
  }
  return null;
}

function checkBoxTargetMismatch(level: LevelData): ValidationWarning | null {
  if (level.rules.winCondition === 'all_boxes_on_targets') {
    if (level.boxes.length !== level.targets.length) {
      return {
        code: 'W001',
        message: `箱子数量(${level.boxes.length})与目标数量(${level.targets.length})不一致，部分箱子可能无法推到目标`,
      };
    }
  }
  return null;
}

function checkSwitchRuleConsistency(level: LevelData): ValidationError | null {
  const switchIds = new Set(level.switches.map((s) => s.id));
  for (const rule of level.rules.switchDoors) {
    if (!switchIds.has(rule.switchId)) {
      return {
        code: 'E006',
        message: `机关规则引用了不存在的机关ID: ${rule.switchId}`,
      };
    }
  }
  return null;
}

function checkSwitchWithoutRule(level: LevelData): ValidationWarning | null {
  const ruledIds = new Set(level.rules.switchDoors.map((r) => r.switchId));
  const orphans = level.switches.filter((s) => !ruledIds.has(s.id));
  if (orphans.length > 0) {
    return {
      code: 'W002',
      message: `有 ${orphans.length} 个机关未配置关联规则，它们将不会控制任何门`,
    };
  }
  return null;
}

export function validateLevel(level: LevelData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const e1 = checkNoTargets(level);
  if (e1) errors.push(e1);

  const e2 = checkPlayerCount(level);
  if (e2) errors.push(e2);

  const e3 = checkOutOfBounds(level);
  if (e3) errors.push(e3);

  const e4 = checkTrapped(level);
  if (e4) errors.push(e4);

  const e6 = checkSwitchRuleConsistency(level);
  if (e6) errors.push(e6);

  const w1 = checkBoxTargetMismatch(level);
  if (w1) warnings.push(w1);

  const w2 = checkSwitchWithoutRule(level);
  if (w2) warnings.push(w2);

  return { valid: errors.length === 0, errors, warnings };
}
