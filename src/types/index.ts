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

export interface OperationLogEntry {
  id: string;
  action: 'save_snapshot' | 'rename_snapshot' | 'delete_snapshot' | 'rollback' | 'import_overwrite' | 'import_as_new' | 'export_package' | 'import_package' | 'import_package_conflict_replace' | 'import_package_conflict_rename' | 'import_package_conflict_skip' | 'import_package_failed';
  snapshotId?: string;
  snapshotName?: string;
  timestamp: number;
  detail?: string;
}

export interface DraftSnapshot {
  id: string;
  name: string;
  createdAt: number;
  level: LevelData;
  moveLog: MoveStep[];
  moveLogInvalidated: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastValidation: ValidationResult | null;
}

export type ImportConflictResolution = 'overwrite' | 'save_as_new' | 'cancel';

export type SnapshotConflictStrategy = 'replace' | 'rename' | 'skip';

export interface SnapshotPackage {
  packageVersion: string;
  exportedAt: number;
  currentLevel: LevelData;
  currentHistory: HistoryState;
  lastValidation: ValidationResult | null;
  snapshots: DraftSnapshot[];
  activeSnapshotId: string | null;
  operationLog: OperationLogEntry[];
  editorMeta: {
    levelName: string;
  };
}

export interface SnapshotPackageImportResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  mergedSnapshots: DraftSnapshot[];
  logEntries: { action: OperationLogEntry['action']; detail: string; snapshotName?: string }[];
}

export const DATA_VERSION = '1.0.0';
export const SNAPSHOT_PACKAGE_VERSION = '1.1.0';
export const STORAGE_KEY = 'puzzle-editor:v1:state';
export const SNAPSHOT_STORAGE_KEY = 'puzzle-editor:v1:snapshots';
export const OPERATION_LOG_KEY = 'puzzle-editor:v1:operation-log';
export const ACTIVE_SNAPSHOT_KEY = 'puzzle-editor:v1:active-snapshot';
export const PACKAGE_TYPE_IDENTIFIER = 'puzzle-editor-snapshot-package';
