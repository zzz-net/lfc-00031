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
  action: 'save_snapshot' | 'rename_snapshot' | 'delete_snapshot' | 'rollback' | 'import_overwrite' | 'import_as_new' | 'export_package' | 'import_package' | 'import_package_conflict_replace' | 'import_package_conflict_rename' | 'import_package_conflict_skip' | 'import_package_failed' | 'new_level' | 'load_sample' | 'edit_level' | 'import_level' | 'persist_restore' | 'campaign_create' | 'campaign_rename' | 'campaign_delete' | 'campaign_add_level' | 'campaign_remove_level' | 'campaign_reorder_levels' | 'campaign_duplicate_level' | 'campaign_rename_level' | 'campaign_update_level_meta' | 'campaign_export' | 'campaign_import' | 'campaign_import_conflict_replace_campaign' | 'campaign_import_conflict_rename_campaign' | 'campaign_import_conflict_skip_campaign' | 'campaign_import_conflict_replace_level' | 'campaign_import_conflict_rename_level' | 'campaign_import_conflict_skip_level' | 'campaign_import_failed' | 'campaign_progress_update' | 'campaign_persist_restore' | 'archive_create' | 'archive_rename' | 'archive_delete' | 'archive_duplicate' | 'archive_archive' | 'archive_unarchive' | 'archive_switch' | 'archive_export' | 'archive_import' | 'archive_import_conflict_overwrite' | 'archive_import_conflict_keep_both' | 'archive_import_conflict_metadata_only' | 'archive_import_failed' | 'archive_save_snapshot' | 'archive_rollback_snapshot' | 'archive_delete_snapshot' | 'archive_persist_restore' | 'archive_update_notes';
  snapshotId?: string;
  snapshotName?: string;
  campaignId?: string;
  campaignName?: string;
  levelId?: string;
  levelName?: string;
  archiveId?: string;
  archiveName?: string;
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

export enum UnlockConditionType {
  ALWAYS_UNLOCKED = 'always_unlocked',
  PREVIOUS_LEVEL_CLEARED = 'previous_cleared',
  PREVIOUS_LEVEL_STARS = 'previous_stars',
  CUSTOM_CONDITION = 'custom',
}

export interface UnlockCondition {
  type: UnlockConditionType;
  requiredStars?: number;
  requiredLevelId?: string;
  customDescription?: string;
}

export interface LevelPlayResult {
  completed: boolean;
  steps: number;
  stars: number;
  completedAt: number;
  bestSteps?: number;
  bestStars?: number;
}

export interface CampaignLevelMeta {
  goalDescription: string;
  recommendedSteps: number;
  unlockCondition: UnlockCondition;
  notes: string;
  starsThreshold: [number, number, number];
}

export interface CampaignLevel {
  id: string;
  name: string;
  order: number;
  levelData: LevelData;
  meta: CampaignLevelMeta;
  playResult?: LevelPlayResult;
  unlocked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  version: string;
  levels: CampaignLevel[];
  createdAt: number;
  updatedAt: number;
}

export interface CampaignProgress {
  campaignId: string;
  currentLevelId: string | null;
  totalStars: number;
  completedCount: number;
  lastPlayedAt: number | null;
  levelResults: Record<string, LevelPlayResult>;
}

export interface CampaignHistoryEntry {
  campaign: Campaign;
  progress: CampaignProgress | null;
}

export interface CampaignHistoryState {
  past: CampaignHistoryEntry[];
  present: Campaign;
  future: CampaignHistoryEntry[];
  progress: CampaignProgress | null;
}

export type CampaignConflictStrategy = 'replace' | 'rename' | 'skip';
export type CampaignLevelConflictStrategy = 'replace' | 'rename' | 'skip';

export interface CampaignPackage {
  packageVersion: string;
  exportedAt: number;
  campaign: Campaign;
  progress?: CampaignProgress;
  operationLog: OperationLogEntry[];
}

export interface CampaignPackageImportResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  mergedCampaigns: Campaign[];
  logEntries: { action: OperationLogEntry['action']; detail: string; campaignName?: string; levelName?: string }[];
}

export interface CampaignStoreState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  selectedLevelId: string | null;
  progressMap: Record<string, CampaignProgress>;
  campaignPanelOpen: boolean;
  levelMetaEditorOpen: boolean;
  editingLevelId: string | null;
  operationLog: OperationLogEntry[];

  pendingCampaignImport: CampaignPackage | null;
  pendingCampaignImportJson: string | null;
  campaignImportConflictOpen: boolean;
  detectedCampaignConflicts: string[];
  detectedLevelConflicts: { campaignId: string; campaignName: string; levelNames: string[] }[];
}

export const CAMPAIGN_PACKAGE_VERSION = '1.0.0';
export const CAMPAIGN_STORAGE_KEY = 'puzzle-editor:v1:campaigns';
export const CAMPAIGN_PROGRESS_KEY = 'puzzle-editor:v1:campaign-progress';
export const ACTIVE_CAMPAIGN_KEY = 'puzzle-editor:v1:active-campaign';
export const SELECTED_LEVEL_KEY = 'puzzle-editor:v1:selected-level';
export const CAMPAIGN_TYPE_IDENTIFIER = 'puzzle-editor-campaign-package';
export const CAMPAIGN_OPERATION_LOG_KEY = 'puzzle-editor:v1:campaign-operation-log';

export interface CampaignArchive {
  id: string;
  name: string;
  description: string;
  notes: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number | null;
  campaign: Campaign;
  progress: CampaignProgress;
}

export interface CampaignArchiveSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  archiveId: string;
  archive: CampaignArchive;
}

export type CampaignArchiveConflictStrategy = 'overwrite' | 'keep_both' | 'metadata_only';

export interface CampaignArchivePackage {
  packageVersion: string;
  archiveVersion: string;
  exportedAt: number;
  archive: CampaignArchive;
  snapshots: CampaignArchiveSnapshot[];
  operationLog: OperationLogEntry[];
}

export interface CampaignArchiveImportResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  mergedArchives: CampaignArchive[];
  logEntries: { action: OperationLogEntry['action']; detail: string; archiveName?: string }[];
  resolvedArchiveId: string | null;
}

export interface CampaignArchiveStoreState {
  archives: CampaignArchive[];
  activeArchiveId: string | null;
  snapshots: Record<string, CampaignArchiveSnapshot[]>;
  operationLog: OperationLogEntry[];
  archivePanelOpen: boolean;
  deleteConfirmArchiveId: string | null;
  pendingArchiveImport: CampaignArchivePackage | null;
  pendingArchiveImportJson: string | null;
  archiveImportConflictOpen: boolean;
  detectedArchiveConflicts: string[];
}

export const ARCHIVE_PACKAGE_VERSION = '1.0.0';
export const ARCHIVE_STORAGE_KEY = 'puzzle-editor:v1:archives';
export const ACTIVE_ARCHIVE_KEY = 'puzzle-editor:v1:active-archive';
export const ARCHIVE_SNAPSHOTS_KEY = 'puzzle-editor:v1:archive-snapshots';
export const ARCHIVE_OPERATION_LOG_KEY = 'puzzle-editor:v1:archive-operation-log';
export const ARCHIVE_TYPE_IDENTIFIER = 'puzzle-editor-campaign-archive-package';
