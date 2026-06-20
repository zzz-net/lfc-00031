import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LevelData, ToolId, SimulationState, ValidationResult, ToastMessage, Direction, LevelRules, SwitchDoorRule, WinCondition } from '@/types';
import { TileType, DATA_VERSION, STORAGE_KEY, TILE_TO_TOOL } from '@/types';
import { setTile, rebuildDerivedFromTiles, resizeLevel, cloneTiles, createEmptyTiles } from '@/utils/mapOps';
import { simulateMove, initialSimulationState, applyMoveLog } from '@/utils/simulation';
import { validateLevel } from '@/utils/validator';
import { createDefaultLevel, createSampleLevels, exportToJSON, importFromJSON } from '@/utils/serializer';

interface EditorState {
  past: LevelData[];
  present: LevelData;
  future: LevelData[];
  lastValidation: ValidationResult | null;
  selectedTool: ToolId;
  simulationState: SimulationState | null;
  isRecording: boolean;
  currentStepIndex: number;
  toasts: ToastMessage[];
  rulesPanelOpen: boolean;
  gridZoom: number;

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
  saveDraft: () => void;
  restoreFromStorage: () => void;
  setLevelName: (name: string) => void;
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: number) => void;
  setRulesPanelOpen: (open: boolean) => void;
  setGridZoom: (zoom: number) => void;
  persist: () => void;
}

let toastCounter = 0;

function pushToHistory(past: LevelData[], present: LevelData, newPresent: LevelData): { past: LevelData[]; present: LevelData } {
  return {
    past: [...past, present],
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
      });
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
      });
      get().addToast('success', `已加载样例：${samples[index].name}`);
    },

    setTileAt: (x: number, y: number, tile: TileType) => {
      const { present, past } = get();
      const newTiles = setTile(present.tiles, x, y, tile);
      const updated = rebuildDerivedFromTiles({ ...present, tiles: newTiles, updatedAt: Date.now() });
      const { past: newPast, present: newPresent } = pushToHistory(past, present, updated);
      set({ past: newPast, present: newPresent, future: [], lastValidation: null });
    },

    resizeLevelTo: (width: number, height: number) => {
      const { present, past } = get();
      const updated = resizeLevel(present, width, height);
      const { past: newPast, present: newPresent } = pushToHistory(past, present, { ...updated, updatedAt: Date.now() });
      set({ past: newPast, present: newPresent, future: [] });
      get().addToast('info', `地图已调整为 ${width}×${height}`);
    },

    updateRules: (partial: Partial<LevelRules>) => {
      const { present, past } = get();
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
      const { past: newPast, present: newPresent } = pushToHistory(past, present, updated);
      set({ past: newPast, present: newPresent, future: [], lastValidation: null });
    },

    addSwitchDoorRule: (rule: SwitchDoorRule) => {
      const { present, past } = get();
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
      const { past: newPast, present: newPresent } = pushToHistory(past, present, updated);
      set({ past: newPast, present: newPresent, future: [] });
    },

    removeSwitchDoorRule: (index: number) => {
      const { present, past } = get();
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
      const { past: newPast, present: newPresent } = pushToHistory(past, present, updated);
      set({ past: newPast, present: newPresent, future: [] });
    },

    setSelectedTool: (tool: ToolId) => {
      set({ selectedTool: tool });
    },

    undo: () => {
      const { past, present, future } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);
      set({
        past: newPast,
        present: previous,
        future: [present, ...future],
        lastValidation: null,
      });
    },

    redo: () => {
      const { past, present, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      set({
        past: [...past, present],
        present: next,
        future: newFuture,
        lastValidation: null,
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    startRecording: () => {
      const { present } = get();
      const result = validateLevel(present);
      if (!result.valid) {
        get().addToast('error', '关卡校验未通过，无法开始录制');
        set({ lastValidation: result });
        return;
      }
      const simState = initialSimulationState(present);
      set({
        isRecording: true,
        simulationState: simState,
        currentStepIndex: -1,
        present: { ...present, moveLog: [], moveLogInvalidated: false },
        lastValidation: result,
      });
      get().addToast('success', '录制已开始，使用方向键或按钮移动');
    },

    stopRecording: () => {
      set({ isRecording: false, simulationState: null });
      get().addToast('info', '录制已停止');
    },

    recordStep: (direction: Direction) => {
      const { present, simulationState, isRecording } = get();
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
      set({
        simulationState: result.state,
        present: updated,
        currentStepIndex: newLog.length - 1,
      });

      if (result.state.won) {
        get().addToast('success', '恭喜！达成胜利条件！');
        set({ isRecording: false });
      }

      return null;
    },

    clearMoveLog: () => {
      const { present, past } = get();
      const updated: LevelData = { ...present, moveLog: [], moveLogInvalidated: false, updatedAt: Date.now() };
      const { past: newPast, present: newPresent } = pushToHistory(past, present, updated);
      set({
        past: newPast,
        present: newPresent,
        future: [],
        simulationState: null,
        isRecording: false,
        currentStepIndex: -1,
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
      const { past, present } = get();
      const { past: newPast, present: newPresent } = pushToHistory(past, present, result.level);
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
      return true;
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
          set({
            past: data.past,
            present: data.present,
            future: data.future || [],
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
      set({ present: { ...present, name, updatedAt: Date.now() } });
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
  { equalityFn: (a, b) => a.present === b.present }
);

let persistTimer: ReturnType<typeof setTimeout>;
