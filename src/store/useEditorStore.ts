import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LevelData, ToolId, SimulationState, ValidationResult, ToastMessage, Direction, LevelRules, SwitchDoorRule, HistoryEntry, DraftSnapshot, OperationLogEntry, ImportConflictResolution, SnapshotConflictStrategy, SnapshotPackage, HistoryState, SnapshotPackageImportResult } from '@/types';
import { TileType, STORAGE_KEY, SNAPSHOT_STORAGE_KEY, OPERATION_LOG_KEY, ACTIVE_SNAPSHOT_KEY } from '@/types';
import { setTile, rebuildDerivedFromTiles, resizeLevel } from '@/utils/mapOps';
import { simulateMove, initialSimulationState, applyMoveLog } from '@/utils/simulation';
import { validateLevel } from '@/utils/validator';
import { createDefaultLevel, createSampleLevels, exportToJSON, importFromJSON, exportSnapshotPackage, parseSnapshotPackage, importSnapshotPackageWithMerge, mergeSnapshots } from '@/utils/serializer';

interface EditorState {
  past: HistoryEntry[];
  present: LevelData;
  future: HistoryEntry[];
  lastValidation: ValidationResult | null;
  selectedTool: ToolId;
  simulationState: SimulationState | null;
  isRecording: boolean;
  currentStepIndex: number;
  toasts: ToastMessage[];
  rulesPanelOpen: boolean;
  gridZoom: number;

  snapshots: DraftSnapshot[];
  activeSnapshotId: string | null;
  operationLog: OperationLogEntry[];
  pendingImportLevel: LevelData | null;
  pendingImportJson: string | null;
  importConflictOpen: boolean;
  snapshotPanelOpen: boolean;
  deleteConfirmSnapshotId: string | null;

  newLevel: (width?: number, height?: number) => void;
  loadSample: (index: number) => void;
  setTileAt: (x: number, y: number, tile: TileType) => void;
  resizeLevelTo: (width: number, height: number) => void;
  updateRules: (partial: Partial<LevelRules>) => void;
  addSwitchDoorRule: (rule: SwitchDoorRule) => void;
  removeSwitchDoorRule: (index: number) => void;
  setSelectedTool: (tool: ToolId) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  startRecording: () => void;
  stopRecording: () => void;
  recordStep: (direction: Direction) => string | null;
  clearMoveLog: () => void;
  jumpToStep: (index: number) => void;
  resetSimulation: () => void;
  validate: () => ValidationResult;
  exportLevel: () => void;
  importLevel: (jsonStr: string) => boolean;
  loadLevelData: (level: LevelData, pushHistory?: boolean) => void;
  saveDraft: () => void;
  restoreFromStorage: () => void;
  setLevelName: (name: string) => void;
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: number) => void;
  setRulesPanelOpen: (open: boolean) => void;
  setGridZoom: (zoom: number) => void;
  persist: () => void;

  saveSnapshot: (name: string) => DraftSnapshot;
  renameSnapshot: (id: string, newName: string) => void;
  deleteSnapshot: (id: string) => void;
  rollbackToSnapshot: (id: string) => void;
  setActiveSnapshotId: (id: string | null) => void;
  setSnapshotPanelOpen: (open: boolean) => void;
  setDeleteConfirmSnapshotId: (id: string | null) => void;

  requestImportWithConflict: (jsonStr: string) => void;
  resolveImportConflict: (resolution: ImportConflictResolution) => void;
  setImportConflictOpen: (open: boolean) => void;

  persistSnapshots: () => void;
  restoreSnapshotsFromStorage: () => void;
  addOperationLog: (action: OperationLogEntry['action'], detail?: string, snapshotId?: string, snapshotName?: string) => void;

  exportSnapshotPackage: () => void;
  pendingPackageImport: SnapshotPackage | null;
  pendingPackageJson: string | null;
  packageImportConflictOpen: boolean;
  detectedConflictingSnapshotNames: string[];
  requestPackageImport: (jsonStr: string) => void;
  resolvePackageImport: (strategy: SnapshotConflictStrategy, overrideJson?: string, overridePkg?: SnapshotPackage) => boolean;
  cancelPackageImport: () => void;
  setPackageImportConflictOpen: (open: boolean) => void;
}

let toastCounter = 0;
let snapIdCounter = 0;
let opLogIdCounter = 0;

function genSnapshotId(): string {
  return `snap_${Date.now()}_${++snapIdCounter}`;
}

function genOpLogId(): string {
  return `op_${Date.now()}_${++opLogIdCounter}`;
}

function pushToHistory(past: HistoryEntry[], present: LevelData, lastValidation: ValidationResult | null, newPresent: LevelData): { past: HistoryEntry[]; present: LevelData } {
  return {
    past: [...past, { level: present, validation: lastValidation }],
    present: newPresent,
  };
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    past: [],
    present: createDefaultLevel(),
    future: [],
    lastValidation: null,
    selectedTool: 'wall',
    simulationState: null,
    isRecording: false,
    currentStepIndex: -1,
    toasts: [],
    rulesPanelOpen: false,
    gridZoom: 1,

    snapshots: [],
    activeSnapshotId: null,
    operationLog: [],
    pendingImportLevel: null,
    pendingImportJson: null,
    importConflictOpen: false,
    snapshotPanelOpen: false,
    deleteConfirmSnapshotId: null,

    pendingPackageImport: null,
    pendingPackageJson: null,
    packageImportConflictOpen: false,
    detectedConflictingSnapshotNames: [],

    newLevel: (width = 8, height = 8) => {
      const level = createDefaultLevel(width, height);
      set({
        past: [],
        present: level,
        future: [],
        lastValidation: null,
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
        activeSnapshotId: null,
      });
      get().addOperationLog('new_level', `创建 ${width}×${height} 新关卡`);
      get().persistSnapshots();
      get().addToast('info', `已创建 ${width}×${height} 新关卡`);
    },

    loadSample: (index: number) => {
      const samples = createSampleLevels();
      if (index < 0 || index >= samples.length) {
        get().addToast('error', '样例索引不存在');
        return;
      }
      set({
        past: [],
        present: samples[index],
        future: [],
        lastValidation: null,
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
        activeSnapshotId: null,
      });
      get().addOperationLog('load_sample', `加载样例「${samples[index].name}」`);
      get().persistSnapshots();
      get().addToast('success', `已加载样例：${samples[index].name}`);
    },

    setTileAt: (x: number, y: number, tile: TileType) => {
      const { present, past, lastValidation } = get();
      const newTiles = setTile(present.tiles, x, y, tile);
      const updated = rebuildDerivedFromTiles({ ...present, tiles: newTiles, updatedAt: Date.now() });
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({
        past: newPast,
        present: newPresent,
        future: [],
        lastValidation: null,
        activeSnapshotId: null,
      });
    },

    resizeLevelTo: (width: number, height: number) => {
      const { present, past, lastValidation } = get();
      const updated = resizeLevel(present, width, height);
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, { ...updated, updatedAt: Date.now() });
      set({ past: newPast, present: newPresent, future: [], lastValidation: null, activeSnapshotId: null });
      get().addToast('info', `地图已调整为 ${width}×${height}`);
    },

    updateRules: (partial: Partial<LevelRules>) => {
      const { present, past, lastValidation } = get();
      const newRules = { ...present.rules, ...partial };
      const shouldInvalidate =
        'winCondition' in partial ||
        'switchDoors' in partial;
      const updated: LevelData = {
        ...present,
        rules: newRules,
        moveLogInvalidated: shouldInvalidate ? true : present.moveLogInvalidated,
        updatedAt: Date.now(),
      };
      if (shouldInvalidate && present.moveLog.length > 0) {
        get().addToast('warning', '规则已变更，已有解法步骤标记为失效，请重新录制');
      }
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({ past: newPast, present: newPresent, future: [], lastValidation: null, activeSnapshotId: null });
    },

    addSwitchDoorRule: (rule: SwitchDoorRule) => {
      const { present, past, lastValidation } = get();
      const newRules = {
        ...present.rules,
        switchDoors: [...present.rules.switchDoors, rule],
      };
      const updated: LevelData = {
        ...present,
        rules: newRules,
        moveLogInvalidated: present.moveLog.length > 0 ? true : present.moveLogInvalidated,
        updatedAt: Date.now(),
      };
      if (present.moveLog.length > 0) {
        get().addToast('warning', '机关规则已变更，解法步骤已标记失效');
      }
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({ past: newPast, present: newPresent, future: [], lastValidation: null, activeSnapshotId: null });
    },

    removeSwitchDoorRule: (index: number) => {
      const { present, past, lastValidation } = get();
      const newDoors = [...present.rules.switchDoors];
      newDoors.splice(index, 1);
      const newRules = { ...present.rules, switchDoors: newDoors };
      const updated: LevelData = {
        ...present,
        rules: newRules,
        moveLogInvalidated: present.moveLog.length > 0 ? true : present.moveLogInvalidated,
        updatedAt: Date.now(),
      };
      if (present.moveLog.length > 0) {
        get().addToast('warning', '机关规则已变更，解法步骤已标记失效');
      }
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({ past: newPast, present: newPresent, future: [], lastValidation: null, activeSnapshotId: null });
    },

    setSelectedTool: (tool: ToolId) => {
      set({ selectedTool: tool });
    },

    undo: () => {
      const { past, present, future, lastValidation } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);
      set({
        past: newPast,
        present: previous.level,
        future: [{ level: present, validation: lastValidation }, ...future],
        lastValidation: previous.validation,
      });
    },

    redo: () => {
      const { past, present, future, lastValidation } = get();
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      set({
        past: [...past, { level: present, validation: lastValidation }],
        present: next.level,
        future: newFuture,
        lastValidation: next.validation,
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    startRecording: () => {
      const { present, past, lastValidation } = get();
      const result = validateLevel(present);
      if (!result.valid) {
        get().addToast('error', '关卡校验未通过，无法开始录制');
        set({ lastValidation: result });
        return;
      }
      const simState = initialSimulationState(present);
      const newLevel: LevelData = { ...present, moveLog: [], moveLogInvalidated: false, updatedAt: Date.now() };
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, newLevel);
      set({
        isRecording: true,
        simulationState: simState,
        currentStepIndex: -1,
        past: newPast,
        present: newPresent,
        future: [],
        lastValidation: result,
        activeSnapshotId: null,
      });
      get().addToast('success', '录制已开始，使用方向键或按钮移动');
    },

    stopRecording: () => {
      set({ isRecording: false, simulationState: null });
      get().addToast('info', '录制已停止');
    },

    recordStep: (direction: Direction) => {
      const { present, simulationState, isRecording, past, lastValidation } = get();
      if (!isRecording || !simulationState) return null;
      if (present.moveLogInvalidated) {
        get().addToast('error', '解法步骤已失效（规则变更），请清除后重新录制');
        return '解法步骤已失效，请清除后重新录制';
      }

      const result = simulateMove(present, simulationState, direction);
      if (!result) {
        return '无法移动：撞墙、被门阻挡或走出边界';
      }

      const newLog = [...present.moveLog, result.step];
      const updated: LevelData = { ...present, moveLog: newLog, updatedAt: Date.now() };
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({
        simulationState: result.state,
        past: newPast,
        present: newPresent,
        future: [],
        currentStepIndex: newLog.length - 1,
        activeSnapshotId: null,
      });

      if (result.state.won) {
        get().addToast('success', '恭喜！达成胜利条件！');
        set({ isRecording: false });
      }

      return null;
    },

    clearMoveLog: () => {
      const { present, past, lastValidation } = get();
      const updated: LevelData = { ...present, moveLog: [], moveLogInvalidated: false, updatedAt: Date.now() };
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, updated);
      set({
        past: newPast,
        present: newPresent,
        future: [],
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
        activeSnapshotId: null,
      });
      get().addToast('info', '解法步骤已清除');
    },

    jumpToStep: (index: number) => {
      const { present } = get();
      if (index < 0 || index >= present.moveLog.length) return;
      const logSlice = present.moveLog.slice(0, index + 1);
      const replayResult = applyMoveLog(present, logSlice);
      if (replayResult.valid) {
        set({ simulationState: replayResult.state, currentStepIndex: index });
      }
    },

    resetSimulation: () => {
      const { present } = get();
      const simState = initialSimulationState(present);
      set({ simulationState: simState, currentStepIndex: -1 });
    },

    validate: () => {
      const { present } = get();
      const result = validateLevel(present);
      set({ lastValidation: result });
      if (result.valid) {
        get().addToast('success', '关卡校验通过');
      } else {
        get().addToast('error', `校验失败：${result.errors[0]?.message ?? '未知错误'}`);
      }
      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          get().addToast('warning', w.message);
        }
      }
      return result;
    },

    exportLevel: () => {
      const { present } = get();
      const result = validateLevel(present);
      if (!result.valid) {
        get().addToast('error', '关卡校验未通过，无法导出');
        set({ lastValidation: result });
        return;
      }
      const json = exportToJSON(present);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${present.name || 'level'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      get().addToast('success', '关卡已导出为 JSON');
    },

    importLevel: (jsonStr: string) => {
      const result = importFromJSON(jsonStr);
      if (!result.level) {
        for (const err of result.errors) {
          get().addToast('error', `导入失败：${err}`);
        }
        return false;
      }
      const { past, present, lastValidation } = get();
      const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, result.level);
      set({
        past: newPast,
        present: newPresent,
        future: [],
        lastValidation: null,
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
        activeSnapshotId: null,
      });
      get().addOperationLog('import_level', `导入关卡「${result.level.name}」`);
      get().persistSnapshots();
      get().addToast('success', `已导入关卡：${result.level.name}`);
      return true;
    },

    loadLevelData: (level: LevelData, pushHistory = true) => {
      const { past, present, lastValidation } = get();
      const newLevel = { ...level, updatedAt: Date.now() };
      if (pushHistory) {
        const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, newLevel);
        set({
          past: newPast,
          present: newPresent,
          future: [],
          lastValidation: null,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
          activeSnapshotId: null,
        });
      } else {
        set({
          present: newLevel,
          lastValidation: null,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
          activeSnapshotId: null,
        });
      }
    },

    saveDraft: () => {
      get().persist();
      get().addToast('success', '草稿已保存');
    },

    restoreFromStorage: () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.past && data.present) {
          const past = Array.isArray(data.past[0]) || data.past[0]?.level !== undefined
            ? data.past
            : data.past.map((l: LevelData) => ({ level: l, validation: null }));
          const future = Array.isArray(data.future?.[0]) || data.future?.[0]?.level !== undefined
            ? data.future || []
            : (data.future || []).map((l: LevelData) => ({ level: l, validation: null }));
          set({
            past,
            present: data.present,
            future,
            lastValidation: data.lastValidation || null,
          });
          get().addToast('info', '已恢复上次编辑状态');
        }
      } catch {
        get().addToast('warning', '恢复状态失败，将使用空白关卡');
      }
    },

    setLevelName: (name: string) => {
      const { present } = get();
      set({ present: { ...present, name, updatedAt: Date.now() }, activeSnapshotId: null });
    },

    addToast: (type: ToastMessage['type'], message: string) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
      setTimeout(() => {
        get().removeToast(id);
      }, 4000);
    },

    removeToast: (id: number) => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    setRulesPanelOpen: (open: boolean) => {
      set({ rulesPanelOpen: open });
    },

    setGridZoom: (zoom: number) => {
      set({ gridZoom: Math.max(0.5, Math.min(2, zoom)) });
    },

    persist: () => {
      const { past, present, future, lastValidation } = get();
      try {
        const data = JSON.stringify({ past, present, future, lastValidation });
        localStorage.setItem(STORAGE_KEY, data);
        localStorage.setItem('puzzle-editor:v1:last-saved', String(Date.now()));
      } catch {
        get().addToast('error', '保存失败：存储空间不足');
      }
    },

    saveSnapshot: (name: string) => {
      const { present, past, future, lastValidation, snapshots } = get();
      const id = genSnapshotId();
      const snap: DraftSnapshot = {
        id,
        name,
        createdAt: Date.now(),
        level: JSON.parse(JSON.stringify(present)),
        moveLog: [...present.moveLog],
        moveLogInvalidated: present.moveLogInvalidated,
        past: JSON.parse(JSON.stringify(past)),
        future: JSON.parse(JSON.stringify(future)),
        lastValidation: lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null,
      };
      const newSnapshots = [...snapshots, snap];
      set({ snapshots: newSnapshots, activeSnapshotId: id });
      get().addOperationLog('save_snapshot', `保存快照「${name}」`, id, name);
      get().persistSnapshots();
      get().addToast('success', `快照「${name}」已保存`);
      return snap;
    },

    renameSnapshot: (id: string, newName: string) => {
      const { snapshots } = get();
      const snap = snapshots.find((s) => s.id === id);
      if (!snap) return;
      const oldName = snap.name;
      const newSnapshots = snapshots.map((s) =>
        s.id === id ? { ...s, name: newName } : s
      );
      set({ snapshots: newSnapshots });
      get().addOperationLog('rename_snapshot', `重命名「${oldName}」→「${newName}」`, id, newName);
      get().persistSnapshots();
      get().addToast('info', `快照已重命名为「${newName}」`);
    },

    deleteSnapshot: (id: string) => {
      const { snapshots, activeSnapshotId } = get();
      const snap = snapshots.find((s) => s.id === id);
      if (!snap) return;
      const newSnapshots = snapshots.filter((s) => s.id !== id);
      const newActiveId = activeSnapshotId === id ? null : activeSnapshotId;
      set({ snapshots: newSnapshots, activeSnapshotId: newActiveId, deleteConfirmSnapshotId: null });
      get().addOperationLog('delete_snapshot', `删除快照「${snap.name}」`, id, snap.name);
      get().persistSnapshots();
      get().addToast('info', `快照「${snap.name}」已删除`);
    },

    rollbackToSnapshot: (id: string) => {
      const { snapshots } = get();
      const snap = snapshots.find((s) => s.id === id);
      if (!snap) {
        get().addToast('error', '快照不存在');
        return;
      }
      const restoredPast: HistoryEntry[] = JSON.parse(JSON.stringify(snap.past));
      const restoredFuture: HistoryEntry[] = JSON.parse(JSON.stringify(snap.future));
      const restoredPresent: LevelData = {
        ...JSON.parse(JSON.stringify(snap.level)),
        moveLog: [...snap.moveLog],
        moveLogInvalidated: snap.moveLogInvalidated,
        updatedAt: Date.now(),
      };
      set({
        past: restoredPast,
        present: restoredPresent,
        future: restoredFuture,
        lastValidation: snap.lastValidation ? JSON.parse(JSON.stringify(snap.lastValidation)) : null,
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
        activeSnapshotId: id,
      });
      get().addOperationLog('rollback', `回滚到快照「${snap.name}」`, id, snap.name);
      get().persistSnapshots();
      get().addToast('success', `已回滚到快照「${snap.name}」`);
    },

    setActiveSnapshotId: (id: string | null) => {
      set({ activeSnapshotId: id });
      try {
        localStorage.setItem(ACTIVE_SNAPSHOT_KEY, id ?? '');
      } catch { /* ignore */ }
    },

    setSnapshotPanelOpen: (open: boolean) => {
      set({ snapshotPanelOpen: open });
    },

    setDeleteConfirmSnapshotId: (id: string | null) => {
      set({ deleteConfirmSnapshotId: id });
    },

    requestImportWithConflict: (jsonStr: string) => {
      const result = importFromJSON(jsonStr);
      if (!result.level) {
        for (const err of result.errors) {
          get().addToast('error', `导入失败：${err}`);
        }
        return;
      }
      const { present, snapshots, past } = get();
      const hasExistingWork =
        past.length > 0 ||
        present.moveLog.length > 0 ||
        snapshots.length > 0;
      if (!hasExistingWork) {
        const { past: currentPast, present: currentPresent, lastValidation: currentValidation } = get();
        const { past: newPast, present: newPresent } = pushToHistory(currentPast, currentPresent, currentValidation, result.level);
        set({
          past: newPast,
          present: newPresent,
          future: [],
          lastValidation: null,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
        });
        get().addToast('success', `已导入关卡：${result.level.name}`);
        return;
      }
      set({
        pendingImportLevel: result.level,
        pendingImportJson: jsonStr,
        importConflictOpen: true,
      });
    },

    resolveImportConflict: (resolution: ImportConflictResolution) => {
      const { pendingImportLevel, pendingImportJson, past, present, lastValidation } = get();
      if (resolution === 'cancel') {
        set({ pendingImportLevel: null, pendingImportJson: null, importConflictOpen: false });
        get().addToast('info', '导入已取消');
        return;
      }
      if (!pendingImportLevel) {
        set({ importConflictOpen: false });
        return;
      }
      if (resolution === 'overwrite') {
        const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, pendingImportLevel);
        set({
          past: newPast,
          present: newPresent,
          future: [],
          lastValidation: null,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
          activeSnapshotId: null,
          pendingImportLevel: null,
          pendingImportJson: null,
          importConflictOpen: false,
        });
        get().addOperationLog('import_overwrite', `覆盖导入「${pendingImportLevel.name}」`);
        get().persistSnapshots();
        get().addToast('success', `已覆盖当前关卡：${pendingImportLevel.name}`);
      } else if (resolution === 'save_as_new') {
        const snapName = `导入：${pendingImportLevel.name}`;
        get().saveSnapshot(snapName);
        const { past: newPast, present: newPresent } = pushToHistory(past, present, lastValidation, pendingImportLevel);
        set({
          past: newPast,
          present: newPresent,
          future: [],
          lastValidation: null,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
          activeSnapshotId: null,
          pendingImportLevel: null,
          pendingImportJson: null,
          importConflictOpen: false,
        });
        get().addOperationLog('import_as_new', `另存为新快照并导入「${pendingImportLevel.name}」`);
        get().persistSnapshots();
        get().addToast('success', `已将当前状态保存为快照并导入：${pendingImportLevel.name}`);
      }
    },

    setImportConflictOpen: (open: boolean) => {
      set({ importConflictOpen: open });
    },

    persistSnapshots: () => {
      const { snapshots, activeSnapshotId, operationLog } = get();
      try {
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
        localStorage.setItem(ACTIVE_SNAPSHOT_KEY, activeSnapshotId ?? '');
        const trimmedLog = operationLog.slice(-200);
        localStorage.setItem(OPERATION_LOG_KEY, JSON.stringify(trimmedLog));
      } catch {
        get().addToast('error', '快照保存失败：存储空间不足');
      }
    },

    restoreSnapshotsFromStorage: () => {
      try {
        let restoredCount = 0;
        let activeName: string | null = null;
        const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
        if (raw) {
          const parsed: unknown[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const snapshots: DraftSnapshot[] = parsed.map((rawSnap) => {
              if (rawSnap && typeof rawSnap === 'object' && 'id' in rawSnap) {
                const snapObj = rawSnap as Record<string, unknown>;
                const hasNewFormat =
                  Array.isArray(snapObj.past) && Array.isArray(snapObj.future);
                return {
                  ...snapObj,
                  past: hasNewFormat ? snapObj.past : [],
                  future: hasNewFormat ? snapObj.future : [],
                } as DraftSnapshot;
              }
              return null as unknown as DraftSnapshot;
            }).filter(Boolean);
            set({ snapshots });
            restoredCount = snapshots.length;
          }
        }
        const activeId = localStorage.getItem(ACTIVE_SNAPSHOT_KEY) || null;
        if (activeId) {
          set({ activeSnapshotId: activeId });
          const { snapshots } = get();
          const activeSnap = snapshots.find((s) => s.id === activeId);
          if (activeSnap) {
            activeName = activeSnap.name;
          }
        }
        const logRaw = localStorage.getItem(OPERATION_LOG_KEY);
        if (logRaw) {
          const log: OperationLogEntry[] = JSON.parse(logRaw);
          if (Array.isArray(log)) {
            set({ operationLog: log });
          }
        }
        if (restoredCount > 0) {
          const activeInfo = activeName ? `，当前版本「${activeName}」` : '';
          get().addOperationLog('persist_restore', `恢复 ${restoredCount} 个快照${activeInfo}`);
          get().addToast('info', `已恢复 ${restoredCount} 个快照${activeInfo}`);
        }
      } catch {
        get().addToast('warning', '快照恢复失败');
      }
    },

    addOperationLog: (action: OperationLogEntry['action'], detail?: string, snapshotId?: string, snapshotName?: string) => {
      const entry: OperationLogEntry = {
        id: genOpLogId(),
        action,
        snapshotId,
        snapshotName,
        timestamp: Date.now(),
        detail,
      };
      set((s) => ({ operationLog: [...s.operationLog, entry] }));
    },

    exportSnapshotPackage: () => {
      const { present, past, future, lastValidation, snapshots, activeSnapshotId, operationLog } = get();
      const currentHistory: HistoryState = { past, present, future, lastValidation };
      const json = exportSnapshotPackage({
        currentLevel: present,
        currentHistory,
        lastValidation,
        snapshots,
        activeSnapshotId,
        operationLog,
      });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-package-${present.name || 'level'}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      get().addOperationLog('export_package', `导出快照包：${snapshots.length} 个快照`);
      get().addToast('success', `快照包已导出（${snapshots.length} 个快照）`);
    },

    requestPackageImport: (jsonStr: string) => {
      const parseResult = parseSnapshotPackage(jsonStr);
      if (!parseResult.pkg) {
        for (const err of parseResult.errors) {
          get().addToast('error', `导入失败：${err}`);
        }
        for (const warn of parseResult.warnings) {
          get().addToast('warning', warn);
        }
        get().addOperationLog('import_package_failed', parseResult.errors.join('; '));
        return;
      }
      const pkg = parseResult.pkg;
      for (const warn of parseResult.warnings) {
        get().addToast('warning', warn);
      }
      const { snapshots } = get();
      const existingNames = new Set(snapshots.map((s) => s.name));
      const conflicts: string[] = [];
      for (const s of pkg.snapshots) {
        if (existingNames.has(s.name)) {
          conflicts.push(s.name);
        }
      }
      if (conflicts.length === 0) {
        get().resolvePackageImport('rename', jsonStr, pkg);
        return;
      }
      set({
        pendingPackageImport: pkg,
        pendingPackageJson: jsonStr,
        packageImportConflictOpen: true,
        detectedConflictingSnapshotNames: conflicts,
      });
    },

    resolvePackageImport: (strategy: SnapshotConflictStrategy, overrideJson?: string, overridePkg?: SnapshotPackage): boolean => {
      const stateNow = get();
      const pendingPackageImport = overridePkg ?? stateNow.pendingPackageImport;
      const pendingPackageJson = overrideJson ?? stateNow.pendingPackageJson;
      const { snapshots, past, present, future, lastValidation, activeSnapshotId, operationLog } = stateNow;

      if (!pendingPackageJson) {
        set({ packageImportConflictOpen: false, pendingPackageImport: null, pendingPackageJson: null, detectedConflictingSnapshotNames: [] });
        return false;
      }

      const stateBefore = {
        snapshots: JSON.parse(JSON.stringify(snapshots)) as DraftSnapshot[],
        past: JSON.parse(JSON.stringify(past)) as HistoryEntry[],
        present: JSON.parse(JSON.stringify(present)) as LevelData,
        future: JSON.parse(JSON.stringify(future)) as HistoryEntry[],
        lastValidation: lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null,
        activeSnapshotId,
        operationLog: JSON.parse(JSON.stringify(operationLog)) as OperationLogEntry[],
      };

      const parseResult = parseSnapshotPackage(pendingPackageJson);
      const pkgFromParse = parseResult.pkg;
      const originalPkgOperationLog = pkgFromParse?.operationLog ?? [];

      let importResult: SnapshotPackageImportResult;
      try {
        importResult = importSnapshotPackageWithMerge(pendingPackageJson, stateBefore.snapshots, strategy);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        get().addToast('error', `导入异常：${errMsg}`);
        get().addOperationLog('import_package_failed', `导入过程异常：${errMsg}`);
        set({ packageImportConflictOpen: false, pendingPackageImport: null, pendingPackageJson: null, detectedConflictingSnapshotNames: [] });
        return false;
      }

      if (!importResult.success) {
        for (const err of importResult.errors) {
          get().addToast('error', `导入失败：${err}`);
        }
        for (const warn of importResult.warnings) {
          get().addToast('warning', warn);
        }
        for (const log of importResult.logEntries) {
          get().addOperationLog(log.action, log.detail, undefined, log.snapshotName);
        }
        set({ packageImportConflictOpen: false, pendingPackageImport: null, pendingPackageJson: null, detectedConflictingSnapshotNames: [] });
        return false;
      }

      try {
        const pkg = pendingPackageImport;
        if (!pkg) {
          throw new Error('待导入的快照包丢失');
        }
        const mergeResult = mergeSnapshots({
          strategy,
          existingSnapshots: stateBefore.snapshots,
          incomingSnapshots: pkg.snapshots,
          incomingActiveId: pkg.activeSnapshotId,
        });

        const resolvedActiveId = mergeResult.resolvedActiveId ?? pkg.activeSnapshotId;
        const finalSnapshots = importResult.mergedSnapshots;

        const convertHistoryEntry = (entry: unknown): HistoryEntry => {
          const e = entry as Record<string, unknown>;
          if (e && 'level' in e) {
            return e as unknown as HistoryEntry;
          }
          return { level: e as unknown as LevelData, validation: null };
        };

        const newHistory: HistoryState = pkg.currentHistory;
        const newPast: HistoryEntry[] = Array.isArray(newHistory.past)
          ? newHistory.past.map(convertHistoryEntry)
          : [];
        const newFuture: HistoryEntry[] = Array.isArray(newHistory.future)
          ? newHistory.future.map(convertHistoryEntry)
          : [];
        const newPresent: LevelData = {
          ...JSON.parse(JSON.stringify(newHistory.present)),
          updatedAt: Date.now(),
        };
        const newLastValidation = newHistory.lastValidation ? JSON.parse(JSON.stringify(newHistory.lastValidation)) : null;

        let finalPresent: LevelData;
        let finalPast: HistoryEntry[];
        let finalFuture: HistoryEntry[];
        let finalLastValidation: ValidationResult | null;
        let finalActiveId: string | null;

        if (resolvedActiveId && finalSnapshots.some((s) => s.id === resolvedActiveId)) {
          const activeSnap = finalSnapshots.find((s) => s.id === resolvedActiveId)!;
          finalPresent = {
            ...JSON.parse(JSON.stringify(activeSnap.level)),
            moveLog: [...activeSnap.moveLog],
            moveLogInvalidated: activeSnap.moveLogInvalidated,
            updatedAt: Date.now(),
          };
          finalPast = Array.isArray(activeSnap.past)
            ? activeSnap.past.map(convertHistoryEntry)
            : [];
          finalFuture = Array.isArray(activeSnap.future)
            ? activeSnap.future.map(convertHistoryEntry)
            : [];
          finalLastValidation = activeSnap.lastValidation ? JSON.parse(JSON.stringify(activeSnap.lastValidation)) : null;
          finalActiveId = resolvedActiveId;

          const presentTilesStr = JSON.stringify(finalPresent.tiles);
          const activeSnapTilesStr = JSON.stringify(activeSnap.level.tiles);
          if (presentTilesStr !== activeSnapTilesStr) {
            throw new Error('导入后地图与激活快照不一致');
          }
          if (finalLastValidation && activeSnap.lastValidation) {
            const v1 = JSON.stringify(finalLastValidation);
            const v2 = JSON.stringify(activeSnap.lastValidation);
            if (v1 !== v2) {
              throw new Error('导入后校验结果与激活快照不一致');
            }
          }
        } else {
          finalPresent = newPresent;
          finalPast = newPast;
          finalFuture = newFuture;
          finalLastValidation = newLastValidation;
          finalActiveId = null;
        }

        const finalPastStr = JSON.stringify(finalPast);
        const finalFutureStr = JSON.stringify(finalFuture);
        const finalPresentStr = JSON.stringify(finalPresent);
        const finalValidationStr = JSON.stringify(finalLastValidation);

        if (finalPast.length > 0) {
          const lastEntry = finalPast[finalPast.length - 1];
          const prevPresent = JSON.stringify(lastEntry.level);
          const currentPresent = JSON.stringify(finalPresent);
          if (prevPresent === currentPresent) {
            finalPast.pop();
          }
        }

        const combinedOpLog = [...stateBefore.operationLog];

        for (const log of originalPkgOperationLog) {
          combinedOpLog.push({
            id: genOpLogId(),
            action: log.action,
            detail: log.detail,
            snapshotName: log.snapshotName,
            timestamp: Date.now(),
          } as OperationLogEntry);
        }

        for (const log of importResult.logEntries) {
          combinedOpLog.push({
            id: genOpLogId(),
            action: log.action,
            detail: log.detail,
            snapshotName: log.snapshotName,
            timestamp: Date.now(),
          } as OperationLogEntry);
        }

        set({
          snapshots: finalSnapshots,
          past: JSON.parse(finalPastStr),
          present: JSON.parse(finalPresentStr),
          future: JSON.parse(finalFutureStr),
          lastValidation: finalLastValidation ? JSON.parse(finalValidationStr) : null,
          activeSnapshotId: finalActiveId,
          operationLog: combinedOpLog,
          simulationState: null,
          isRecording: false,
          currentStepIndex: -1,
          packageImportConflictOpen: false,
          pendingPackageImport: null,
          pendingPackageJson: null,
          detectedConflictingSnapshotNames: [],
        });

        if (finalActiveId) {
          const activeSnapAfter = finalSnapshots.find((s) => s.id === finalActiveId);
          if (activeSnapAfter) {
            const presentTiles = JSON.stringify(get().present.tiles);
            const snapTiles = JSON.stringify(activeSnapAfter.level.tiles);
            if (presentTiles !== snapTiles) {
              throw new Error('导入后 activeSnapshotId 与当前地图不一致');
            }
          }
        }

        for (const warn of importResult.warnings) {
          get().addToast('warning', warn);
        }

        const totalIncoming = importResult.logEntries.filter(
          (e) => e.action !== 'import_package'
        ).length;
        const replacedCount = importResult.logEntries.filter(
          (e) => e.action === 'import_package_conflict_replace'
        ).length;
        const renamedCount = importResult.logEntries.filter(
          (e) => e.action === 'import_package_conflict_rename'
        ).length;
        const skippedCount = importResult.logEntries.filter(
          (e) => e.action === 'import_package_conflict_skip'
        ).length;
        const importedCount = totalIncoming - skippedCount;

        let detailMsg = `共 ${totalIncoming} 个快照，成功导入 ${importedCount} 个`;
        if (replacedCount > 0) detailMsg += `，替换 ${replacedCount} 个`;
        if (renamedCount > 0) detailMsg += `，重命名 ${renamedCount} 个`;
        if (skippedCount > 0) detailMsg += `，跳过 ${skippedCount} 个`;

        let activeInfo = '';
        if (finalActiveId) {
          const activeSnapAfter = finalSnapshots.find((s) => s.id === finalActiveId);
          if (activeSnapAfter) {
            activeInfo = `，当前版本「${activeSnapAfter.name}」`;
          }
        }

        get().addToast('success', `快照包导入完成：${detailMsg}${activeInfo}`);
        get().persistSnapshots();

        return true;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);

        set({
          snapshots: stateBefore.snapshots,
          past: stateBefore.past,
          present: stateBefore.present,
          future: stateBefore.future,
          lastValidation: stateBefore.lastValidation,
          activeSnapshotId: stateBefore.activeSnapshotId,
          operationLog: stateBefore.operationLog,
          packageImportConflictOpen: false,
          pendingPackageImport: null,
          pendingPackageJson: null,
          detectedConflictingSnapshotNames: [],
        });

        get().addToast('error', `导入失败，已回滚：${errMsg}`);
        get().addOperationLog('import_package_failed', `导入过程异常，已回滚：${errMsg}`);
        return false;
      }
    },

    cancelPackageImport: () => {
      set({
        packageImportConflictOpen: false,
        pendingPackageImport: null,
        pendingPackageJson: null,
        detectedConflictingSnapshotNames: [],
      });
      get().addToast('info', '快照包导入已取消');
    },

    setPackageImportConflictOpen: (open: boolean) => {
      set({ packageImportConflictOpen: open });
    },
  }))
);

useEditorStore.subscribe(
  (state) => ({ past: state.past, present: state.present, future: state.future, lastValidation: state.lastValidation }),
  () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      useEditorStore.getState().persist();
    }, 500);
  },
  { equalityFn: (a, b) => a.present === b.present && a.lastValidation === b.lastValidation }
);

let persistTimer: ReturnType<typeof setTimeout>;

let snapshotPersistTimer: ReturnType<typeof setTimeout>;

useEditorStore.subscribe(
  (state) => ({
    snapshots: state.snapshots,
    activeSnapshotId: state.activeSnapshotId,
    operationLog: state.operationLog,
  }),
  () => {
    clearTimeout(snapshotPersistTimer);
    snapshotPersistTimer = setTimeout(() => {
      useEditorStore.getState().persistSnapshots();
    }, 300);
  },
  { equalityFn: (a, b) => a.snapshots === b.snapshots && a.activeSnapshotId === b.activeSnapshotId && a.operationLog === b.operationLog }
);
