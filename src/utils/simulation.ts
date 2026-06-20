import type { Direction, LevelData, Position, SimulationState, MoveStep } from '@/types';
import { TileType as TT } from '@/types';
import { posEquals, posInList } from './mapOps';

export function directionDelta(dir: Direction): Position {
  switch (dir) {
    case 'UP': return { x: 0, y: -1 };
    case 'DOWN': return { x: 0, y: 1 };
    case 'LEFT': return { x: -1, y: 0 };
    case 'RIGHT': return { x: 1, y: 0 };
  }
}

export function initialSimulationState(level: LevelData): SimulationState {
  return {
    playerPos: { ...level.playerStart },
    boxes: level.boxes.map((b) => ({ ...b })),
    pressedSwitchIds: [],
    won: false,
  };
}

export function getPressedSwitchIds(
  level: LevelData,
  boxes: Position[],
  playerPos: Position
): string[] {
  const pressed: string[] = [];
  for (const sw of level.switches) {
    const onSwitch =
      posEquals(sw.pos, playerPos) ||
      boxes.some((b) => posEquals(b, sw.pos));
    if (onSwitch) pressed.push(sw.id);
  }
  return pressed;
}

export function isDoorOpen(
  level: LevelData,
  doorPos: Position,
  pressedIds: string[]
): boolean {
  for (const rule of level.rules.switchDoors) {
    if (posInList(doorPos, rule.doorPositions)) {
      const pressed = pressedIds.includes(rule.switchId);
      return rule.inverted ? !pressed : pressed;
    }
  }
  return false;
}

export function canEnterPosition(
  level: LevelData,
  pos: Position,
  pressedIds: string[],
  boxes: Position[],
  allowBox: boolean
): { ok: boolean; reason?: string; blockedByBoxIndex?: number } {
  if (pos.x < 0 || pos.y < 0 || pos.x >= level.width || pos.y >= level.height) {
    return { ok: false, reason: '位置超出边界' };
  }
  const tile = level.tiles[pos.y][pos.x];
  if (tile === TT.WALL) return { ok: false, reason: '撞上了墙' };
  if (tile === TT.DOOR && !isDoorOpen(level, pos, pressedIds)) {
    return { ok: false, reason: '门处于关闭状态' };
  }
  const boxIdx = boxes.findIndex((b) => posEquals(b, pos));
  if (boxIdx >= 0 && !allowBox) {
    return { ok: false, reason: '位置被箱子占用', blockedByBoxIndex: boxIdx };
  }
  return { ok: true };
}

export function computeWin(
  level: LevelData,
  boxes: Position[],
  playerPos: Position,
  pressedIds: string[]
): boolean {
  const wc = level.rules.winCondition;
  switch (wc) {
    case 'all_boxes_on_targets': {
      if (boxes.length === 0) return false;
      return boxes.every((b) => posInList(b, level.targets));
    }
    case 'reach_target': {
      return posInList(playerPos, level.targets);
    }
    case 'all_switches_pressed': {
      if (level.switches.length === 0) return false;
      return level.switches.every((s) => pressedIds.includes(s.id));
    }
  }
  return false;
}

export function simulateMove(
  level: LevelData,
  state: SimulationState,
  direction: Direction
): { state: SimulationState; step: MoveStep } | null {
  if (state.won) return null;
  const delta = directionDelta(direction);
  const newPlayerPos: Position = {
    x: state.playerPos.x + delta.x,
    y: state.playerPos.y + delta.y,
  };
  let newBoxes = state.boxes.map((b) => ({ ...b }));
  let pushedBoxIndex: number | undefined;
  let boxFrom: Position | undefined;
  let boxTo: Position | undefined;

  let pressedIds = getPressedSwitchIds(level, newBoxes, state.playerPos);
  const firstCheck = canEnterPosition(level, newPlayerPos, pressedIds, newBoxes, false);

  if (!firstCheck.ok) {
    if (firstCheck.blockedByBoxIndex !== undefined) {
      const boxIdx = firstCheck.blockedByBoxIndex;
      const oldBoxPos = newBoxes[boxIdx];
      const newBoxPos: Position = {
        x: oldBoxPos.x + delta.x,
        y: oldBoxPos.y + delta.y,
      };
      const boxCanEnter = canEnterPosition(level, newBoxPos, pressedIds, newBoxes, false);
      if (!boxCanEnter.ok) return null;
      newBoxes[boxIdx] = newBoxPos;
      pushedBoxIndex = boxIdx;
      boxFrom = { ...oldBoxPos };
      boxTo = newBoxPos;
    } else {
      return null;
    }
  }

  pressedIds = getPressedSwitchIds(level, newBoxes, newPlayerPos);
  const activated = [...pressedIds];
  const won = computeWin(level, newBoxes, newPlayerPos, pressedIds);

  return {
    state: {
      playerPos: newPlayerPos,
      boxes: newBoxes,
      pressedSwitchIds: pressedIds,
      won,
    },
    step: {
      direction,
      timestamp: Date.now(),
      playerFrom: { ...state.playerPos },
      playerTo: newPlayerPos,
      pushedBoxIndex,
      boxFrom,
      boxTo,
      activatedSwitches: activated,
    },
  };
}

export function applyMoveLog(
  level: LevelData,
  log: MoveStep[]
): { state: SimulationState; valid: boolean; failedAtStep: number | null } {
  let state = initialSimulationState(level);
  for (let i = 0; i < log.length; i++) {
    const result = simulateMove(level, state, log[i].direction);
    if (!result) return { state, valid: false, failedAtStep: i };
    state = result.state;
  }
  return { state, valid: true, failedAtStep: null };
}
