export enum TileType {
  EMPTY = 0,
  WALL = 1,
  START = 2,
  TARGET = 3,
  BOX = 4,
  SWITCH = 5,
  DOOR = 6,
  FLOOR = 7,
}

export interface Position {
  x: number;
  y: number;
}

export interface SwitchDoorRule {
  switchId: string;
  doorPositions: Position[];
  inverted: boolean;
}

export enum WinCondition {
  ALL_BOXES_ON_TARGETS = 'all_boxes_on_targets',
  REACH_TARGET = 'reach_target',
  ALL_SWITCHES_PRESSED = 'all_switches_pressed',
}

export interface LevelRules {
  switchDoors: SwitchDoorRule[];
  winCondition: WinCondition;
  allowPushBoxOnSwitch: boolean;
  playerCanWalkOnSwitches: boolean;
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export interface MoveStep {
  direction: Direction;
  timestamp: number;
  playerFrom: Position;
  playerTo: Position;
  pushedBoxIndex?: number;
  boxFrom?: Position;
  boxTo?: Position;
  activatedSwitches?: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  position?: Position;
}

export interface ValidationWarning {
  code: string;
  message: string;
  position?: Position;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface LevelData {
  version: string;
  name: string;
  width: number;
  height: number;
  tiles: TileType[][];
  boxes: Position[];
  playerStart: Position;
  targets: Position[];
  switches: { pos: Position; id: string }[];
  doors: Position[];
  rules: LevelRules;
  moveLog: MoveStep[];
  moveLogInvalidated: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  level: LevelData;
  validation: ValidationResult | null;
}

export interface HistoryState {
  past: HistoryEntry[];
  present: LevelData;
  future: HistoryEntry[];
  lastValidation: ValidationResult | null;
}

export type ToolId =
  | 'empty'
  | 'wall'
  | 'start'
  | 'target'
  | 'box'
  | 'switch'
  | 'door'
  | 'floor';

export interface SimulationState {
  playerPos: Position;
  boxes: Position[];
  pressedSwitchIds: string[];
  won: boolean;
}

export interface ToastMessage {
  id: number;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export const TILE_LABELS: { id: ToolId; tile: TileType; label: string; emoji: string; hotkey: string }[] = [
  { id: 'empty', tile: TileType.EMPTY, label: '擦除', emoji: '🧹', hotkey: '1' },
  { id: 'wall', tile: TileType.WALL, label: '墙', emoji: '🧱', hotkey: '2' },
  { id: 'start', tile: TileType.START, label: '起点', emoji: '🚶', hotkey: '3' },
  { id: 'target', tile: TileType.TARGET, label: '目标', emoji: '🎯', hotkey: '4' },
  { id: 'box', tile: TileType.BOX, label: '箱子', emoji: '📦', hotkey: '5' },
  { id: 'switch', tile: TileType.SWITCH, label: '机关', emoji: '🔘', hotkey: '6' },
  { id: 'door', tile: TileType.DOOR, label: '门', emoji: '🚪', hotkey: '7' },
  { id: 'floor', tile: TileType.FLOOR, label: '地板', emoji: '🟫', hotkey: '8' },
];

export const TOOL_TO_TILE: Record<ToolId, TileType> = {
  empty: TileType.EMPTY,
  wall: TileType.WALL,
  start: TileType.START,
  target: TileType.TARGET,
  box: TileType.BOX,
  switch: TileType.SWITCH,
  door: TileType.DOOR,
  floor: TileType.FLOOR,
};

export const TILE_TO_TOOL: Record<number, ToolId> = {
  [TileType.EMPTY]: 'empty',
  [TileType.WALL]: 'wall',
  [TileType.START]: 'start',
  [TileType.TARGET]: 'target',
  [TileType.BOX]: 'box',
  [TileType.SWITCH]: 'switch',
  [TileType.DOOR]: 'door',
  [TileType.FLOOR]: 'floor',
};

export const DATA_VERSION = '1.0.0';
export const STORAGE_KEY = 'puzzle-editor:v1:state';
