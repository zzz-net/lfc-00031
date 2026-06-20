import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Campaign,
  CampaignLevel,
  CampaignLevelMeta,
  CampaignProgress,
  CampaignHistoryEntry,
  CampaignConflictStrategy,
  CampaignLevelConflictStrategy,
  CampaignPackage,
  OperationLogEntry,
  LevelData,
  UnlockCondition,
  LevelPlayResult,
} from '@/types';
import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_PROGRESS_KEY,
  ACTIVE_CAMPAIGN_KEY,
  SELECTED_LEVEL_KEY,
  CAMPAIGN_OPERATION_LOG_KEY,
  UnlockConditionType,
} from '@/types';
import {
  createCampaign,
  createCampaignLevel,
  createCampaignProgress,
  exportCampaignPackage,
  parseCampaignPackage,
  importCampaignPackageWithMerge,
  recalculateCampaignProgress,
  updateLevelUnlocks,
  genCampaignId,
  genCampaignLevelId,
} from '@/utils/serializer';

let opLogIdCounter = 0;

function genOpLogId(): string {
  return `op_camp_${Date.now()}_${++opLogIdCounter}`;
}

interface CampaignStoreState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  selectedLevelId: string | null;
  progressMap: Record<string, CampaignProgress>;
  campaignPanelOpen: boolean;
  levelMetaEditorOpen: boolean;
  editingLevelId: string | null;
  operationLog: OperationLogEntry[];

  past: CampaignHistoryEntry[];
  future: CampaignHistoryEntry[];

  pendingCampaignImport: CampaignPackage | null;
  pendingCampaignImportJson: string | null;
  campaignImportConflictOpen: boolean;
  detectedCampaignConflicts: string[];
  detectedLevelConflicts: { campaignId: string; campaignName: string; levelNames: string[] }[];

  createCampaign: (name: string, description?: string) => Campaign;
  renameCampaign: (id: string, name: string) => void;
  deleteCampaign: (id: string) => void;
  setActiveCampaignId: (id: string | null) => void;
  setSelectedLevelId: (id: string | null) => void;
  setCampaignPanelOpen: (open: boolean) => void;
  setLevelMetaEditorOpen: (open: boolean) => void;
  setEditingLevelId: (id: string | null) => void;

  addLevelToCampaign: (campaignId: string, levelData: LevelData, name?: string) => CampaignLevel;
  removeLevelFromCampaign: (campaignId: string, levelId: string) => void;
  renameLevel: (campaignId: string, levelId: string, name: string) => void;
  duplicateLevel: (campaignId: string, levelId: string) => CampaignLevel | null;
  reorderLevels: (campaignId: string, fromIndex: number, toIndex: number) => void;
  updateLevelMeta: (campaignId: string, levelId: string, meta: Partial<CampaignLevelMeta>) => void;
  updateLevelData: (campaignId: string, levelId: string, levelData: LevelData) => void;

  updatePlayResult: (campaignId: string, levelId: string, result: LevelPlayResult) => void;
  getActiveCampaign: () => Campaign | null;
  getActiveProgress: () => CampaignProgress | null;
  getSelectedLevel: () => CampaignLevel | null;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  exportCampaign: (campaignId: string) => void;
  requestCampaignImport: (jsonStr: string) => void;
  resolveCampaignImport: (
    strategy: CampaignConflictStrategy,
    levelStrategy: CampaignLevelConflictStrategy,
    overrideJson?: string,
    overridePkg?: CampaignPackage
  ) => boolean;
  cancelCampaignImport: () => void;
  setCampaignImportConflictOpen: (open: boolean) => void;

  persist: () => void;
  restoreFromStorage: () => void;
  addOperationLog: (
    action: OperationLogEntry['action'],
    detail?: string,
    campaignId?: string,
    campaignName?: string,
    levelId?: string,
    levelName?: string
  ) => void;
}

function pushToCampaignHistory(
  past: CampaignHistoryEntry[],
  present: Campaign,
  progress: CampaignProgress | null,
  newPresent: Campaign,
  newProgress: CampaignProgress | null,
): { past: CampaignHistoryEntry[]; present: Campaign; progress: CampaignProgress | null } {
  return {
    past: [...past, { campaign: present, progress }],
    present: newPresent,
    progress: newProgress,
  };
}

export const useCampaignStore = create<CampaignStoreState>()(
  subscribeWithSelector((set, get) => ({
    campaigns: [],
    activeCampaignId: null,
    selectedLevelId: null,
    progressMap: {},
    campaignPanelOpen: false,
    levelMetaEditorOpen: false,
    editingLevelId: null,
    operationLog: [],

    past: [],
    future: [],

    pendingCampaignImport: null,
    pendingCampaignImportJson: null,
    campaignImportConflictOpen: false,
    detectedCampaignConflicts: [],
    detectedLevelConflicts: [],

    createCampaign: (name: string, description = '') => {
      const campaign = createCampaign(name, description);
      const progress = createCampaignProgress(campaign.id);
      set((state) => ({
        campaigns: [...state.campaigns, campaign],
        activeCampaignId: campaign.id,
        progressMap: { ...state.progressMap, [campaign.id]: progress },
      }));
      get().addOperationLog('campaign_create', `创建战役「${name}」`, campaign.id, name);
      return campaign;
    },

    renameCampaign: (id: string, name: string) => {
      const { campaigns, activeCampaignId } = get();
      const campaign = campaigns.find((c) => c.id === id);
      if (!campaign) return;
      const oldName = campaign.name;

      const newCampaigns = campaigns.map((c) =>
        c.id === id ? { ...c, name, updatedAt: Date.now() } : c
      );
      set({ campaigns: newCampaigns });
      get().addOperationLog('campaign_rename', `重命名「${oldName}」→「${name}」`, id, name);
      get().persist();
    },

    deleteCampaign: (id: string) => {
      const { campaigns, activeCampaignId, selectedLevelId, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === id);
      if (!campaign) return;

      const newCampaigns = campaigns.filter((c) => c.id !== id);
      const newActiveId = activeCampaignId === id ? null : activeCampaignId;
      const newSelectedId = selectedLevelId && campaign.levels.some((l) => l.id === selectedLevelId)
        ? null
        : selectedLevelId;
      const newProgressMap = { ...progressMap };
      delete newProgressMap[id];

      set({
        campaigns: newCampaigns,
        activeCampaignId: newActiveId,
        selectedLevelId: newSelectedId,
        progressMap: newProgressMap,
        past: [],
        future: [],
      });
      get().addOperationLog('campaign_delete', `删除战役「${campaign.name}」`, id, campaign.name);
      get().persist();
    },

    setActiveCampaignId: (id: string | null) => {
      set({ activeCampaignId: id, selectedLevelId: null, past: [], future: [] });
      try {
        localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id ?? '');
      } catch { /* ignore */ }
    },

    setSelectedLevelId: (id: string | null) => {
      set({ selectedLevelId: id });
      try {
        localStorage.setItem(SELECTED_LEVEL_KEY, id ?? '');
      } catch { /* ignore */ }
    },

    setCampaignPanelOpen: (open: boolean) => {
      set({ campaignPanelOpen: open });
    },

    setLevelMetaEditorOpen: (open: boolean) => {
      set({ levelMetaEditorOpen: open });
    },

    setEditingLevelId: (id: string | null) => {
      set({ editingLevelId: id });
    },

    addLevelToCampaign: (campaignId: string, levelData: LevelData, name?: string) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) {
        return createCampaignLevel(name || '未命名关卡', levelData);
      }

      const levelName = name || `关卡 ${campaign.levels.length + 1}`;
      const newLevel = createCampaignLevel(levelName, levelData, campaign.levels.length);

      const newLevels = [...campaign.levels, newLevel];
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const unlockedCampaign = updateLevelUnlocks(newCampaign, progress);
      const recalculatedProgress = recalculateCampaignProgress(unlockedCampaign, progress);

      const { past: newPast, present: finalCampaign, progress: finalProgress } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        unlockedCampaign,
        recalculatedProgress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
        progressMap: { ...progressMap, [campaignId]: finalProgress },
        selectedLevelId: newLevel.id,
      });
      get().addOperationLog('campaign_add_level', `添加关卡「${levelName}」`, campaignId, campaign.name, newLevel.id, levelName);
      get().persist();
      return newLevel;
    },

    removeLevelFromCampaign: (campaignId: string, levelId: string) => {
      const { campaigns, past, progressMap, selectedLevelId } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const level = campaign.levels.find((l) => l.id === levelId);
      if (!level) return;

      const newLevels = campaign.levels
        .filter((l) => l.id !== levelId)
        .map((l, idx) => ({ ...l, order: idx }));

      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const newLevelResults = { ...progress.levelResults };
      delete newLevelResults[levelId];
      const newProgress = { ...progress, levelResults: newLevelResults };

      const unlockedCampaign = updateLevelUnlocks(newCampaign, newProgress);
      const recalculatedProgress = recalculateCampaignProgress(unlockedCampaign, newProgress);

      if (recalculatedProgress.currentLevelId === levelId) {
        recalculatedProgress.currentLevelId = null;
      }

      const { past: newPast, present: finalCampaign, progress: finalProgress } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        unlockedCampaign,
        recalculatedProgress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
        progressMap: { ...progressMap, [campaignId]: finalProgress },
        selectedLevelId: selectedLevelId === levelId ? null : selectedLevelId,
      });
      get().addOperationLog('campaign_remove_level', `删除关卡「${level.name}」`, campaignId, campaign.name, levelId, level.name);
      get().persist();
    },

    renameLevel: (campaignId: string, levelId: string, name: string) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const level = campaign.levels.find((l) => l.id === levelId);
      if (!level) return;
      const oldName = level.name;

      const newLevels = campaign.levels.map((l) =>
        l.id === levelId ? { ...l, name, updatedAt: Date.now() } : l
      );
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);

      const { past: newPast, present: finalCampaign } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        newCampaign,
        progress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
      });
      get().addOperationLog('campaign_rename_level', `重命名「${oldName}」→「${name}」`, campaignId, campaign.name, levelId, name);
      get().persist();
    },

    duplicateLevel: (campaignId: string, levelId: string) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return null;

      const level = campaign.levels.find((l) => l.id === levelId);
      if (!level) return null;

      const newLevel: CampaignLevel = {
        ...JSON.parse(JSON.stringify(level)),
        id: genCampaignLevelId(),
        name: `${level.name} (副本)`,
        order: campaign.levels.length,
        unlocked: true,
        playResult: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const newLevels = [...campaign.levels, newLevel];
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const unlockedCampaign = updateLevelUnlocks(newCampaign, progress);
      const recalculatedProgress = recalculateCampaignProgress(unlockedCampaign, progress);

      const { past: newPast, present: finalCampaign, progress: finalProgress } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        unlockedCampaign,
        recalculatedProgress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
        progressMap: { ...progressMap, [campaignId]: finalProgress },
        selectedLevelId: newLevel.id,
      });
      get().addOperationLog('campaign_duplicate_level', `复制关卡「${level.name}」`, campaignId, campaign.name, newLevel.id, newLevel.name);
      get().persist();
      return newLevel;
    },

    reorderLevels: (campaignId: string, fromIndex: number, toIndex: number) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const sortedLevels = [...campaign.levels].sort((a, b) => a.order - b.order);
      const [removed] = sortedLevels.splice(fromIndex, 1);
      sortedLevels.splice(toIndex, 0, removed);

      const newLevels = sortedLevels.map((l, idx) => ({ ...l, order: idx }));
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const unlockedCampaign = updateLevelUnlocks(newCampaign, progress);

      const { past: newPast, present: finalCampaign } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        unlockedCampaign,
        progress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
      });
      get().addOperationLog('campaign_reorder_levels', `调整关卡顺序`, campaignId, campaign.name);
      get().persist();
    },

    updateLevelMeta: (campaignId: string, levelId: string, meta: Partial<CampaignLevelMeta>) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const level = campaign.levels.find((l) => l.id === levelId);
      if (!level) return;

      const newMeta = { ...level.meta, ...meta };
      let newUnlocked = level.unlocked;
      if (meta.unlockCondition && meta.unlockCondition.type === UnlockConditionType.CUSTOM_CONDITION &&
          level.meta.unlockCondition.type !== UnlockConditionType.CUSTOM_CONDITION) {
        newUnlocked = false;
      }
      const newLevels = campaign.levels.map((l) =>
        l.id === levelId ? { ...l, meta: newMeta, unlocked: newUnlocked, updatedAt: Date.now() } : l
      );
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const unlockedCampaign = updateLevelUnlocks(newCampaign, progress);
      const recalculatedProgress = recalculateCampaignProgress(unlockedCampaign, progress);

      const { past: newPast, present: finalCampaign, progress: finalProgress } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        unlockedCampaign,
        recalculatedProgress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
        progressMap: { ...progressMap, [campaignId]: finalProgress },
      });
      get().addOperationLog('campaign_update_level_meta', `更新关卡「${level.name}」元数据`, campaignId, campaign.name, levelId, level.name);
      get().persist();
    },

    updateLevelData: (campaignId: string, levelId: string, levelData: LevelData) => {
      const { campaigns, past, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const level = campaign.levels.find((l) => l.id === levelId);
      if (!level) return;

      const newLevels = campaign.levels.map((l) =>
        l.id === levelId ? { ...l, levelData, updatedAt: Date.now() } : l
      );
      const newCampaign = { ...campaign, levels: newLevels, updatedAt: Date.now() };

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);

      const { past: newPast, present: finalCampaign } = pushToCampaignHistory(
        past,
        campaign,
        progress,
        newCampaign,
        progress,
      );

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? finalCampaign : c
      );

      set({
        campaigns: newCampaigns,
        past: newPast,
        future: [],
      });
      get().persist();
    },

    updatePlayResult: (campaignId: string, levelId: string, result: LevelPlayResult) => {
      const { campaigns, progressMap } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;

      const progress = progressMap[campaignId] || createCampaignProgress(campaignId);
      const existingResult = progress.levelResults[levelId];

      const bestSteps = existingResult?.bestSteps
        ? Math.min(existingResult.bestSteps, result.steps)
        : result.steps;
      const bestStars = existingResult?.bestStars
        ? Math.max(existingResult.bestStars, result.stars)
        : result.stars;

      const newResult: LevelPlayResult = {
        ...result,
        bestSteps,
        bestStars,
      };

      const newLevelResults = { ...progress.levelResults, [levelId]: newResult };
      const newProgress: CampaignProgress = {
        ...progress,
        levelResults: newLevelResults,
        currentLevelId: levelId,
        lastPlayedAt: Date.now(),
      };

      const recalculatedProgress = recalculateCampaignProgress(campaign, newProgress);
      const unlockedCampaign = updateLevelUnlocks(campaign, recalculatedProgress);

      const newCampaigns = campaigns.map((c) =>
        c.id === campaignId ? unlockedCampaign : c
      );

      set({
        campaigns: newCampaigns,
        progressMap: { ...progressMap, [campaignId]: recalculatedProgress },
      });
      get().addOperationLog('campaign_progress_update', `更新关卡进度`, campaignId, campaign.name, levelId);
      get().persist();
    },

    getActiveCampaign: () => {
      const { campaigns, activeCampaignId } = get();
      return campaigns.find((c) => c.id === activeCampaignId) || null;
    },

    getActiveProgress: () => {
      const { progressMap, activeCampaignId } = get();
      return activeCampaignId ? progressMap[activeCampaignId] || null : null;
    },

    getSelectedLevel: () => {
      const campaign = get().getActiveCampaign();
      if (!campaign) return null;
      const { selectedLevelId } = get();
      return campaign.levels.find((l) => l.id === selectedLevelId) || null;
    },

    undo: () => {
      const { past, future, activeCampaignId, progressMap, campaigns } = get();
      if (past.length === 0 || !activeCampaignId) return;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);
      const currentCampaign = campaigns.find((c) => c.id === activeCampaignId);
      const currentProgress = progressMap[activeCampaignId] || null;

      if (!currentCampaign) return;

      const newCampaigns = campaigns.map((c) =>
        c.id === activeCampaignId ? previous.campaign : c
      );

      set({
        past: newPast,
        future: [{ campaign: currentCampaign, progress: currentProgress }, ...future],
        campaigns: newCampaigns,
        progressMap: {
          ...progressMap,
          [activeCampaignId]: previous.progress || createCampaignProgress(activeCampaignId),
        },
      });
    },

    redo: () => {
      const { past, future, activeCampaignId, progressMap, campaigns } = get();
      if (future.length === 0 || !activeCampaignId) return;

      const next = future[0];
      const newFuture = future.slice(1);
      const currentCampaign = campaigns.find((c) => c.id === activeCampaignId);
      const currentProgress = progressMap[activeCampaignId] || null;

      if (!currentCampaign) return;

      const newCampaigns = campaigns.map((c) =>
        c.id === activeCampaignId ? next.campaign : c
      );

      set({
        past: [...past, { campaign: currentCampaign, progress: currentProgress }],
        future: newFuture,
        campaigns: newCampaigns,
        progressMap: {
          ...progressMap,
          [activeCampaignId]: next.progress || createCampaignProgress(activeCampaignId),
        },
      });
    },

    canUndo: () => {
      const { past, activeCampaignId } = get();
      return past.length > 0 && activeCampaignId !== null;
    },

    canRedo: () => {
      const { future, activeCampaignId } = get();
      return future.length > 0 && activeCampaignId !== null;
    },

    exportCampaign: (campaignId: string) => {
      const { campaigns, progressMap, operationLog } = get();
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) {
        return;
      }
      const progress = progressMap[campaignId];
      const json = exportCampaignPackage({ campaign, progress, operationLog });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-${campaign.name || 'untitled'}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      get().addOperationLog('campaign_export', `导出战役包：${campaign.levels.length} 个关卡`, campaignId, campaign.name);
    },

    requestCampaignImport: (jsonStr: string) => {
      const parseResult = parseCampaignPackage(jsonStr);
      if (!parseResult.pkg) {
        for (const err of parseResult.errors) {
          get().addOperationLog('campaign_import_failed', err);
        }
        return;
      }
      const pkg = parseResult.pkg;
      for (const warn of parseResult.warnings) {
        // warnings are not critical
      }
      const { campaigns } = get();
      const existingNames = new Set(campaigns.map((c) => c.name));
      const conflicts: string[] = [];

      if (existingNames.has(pkg.campaign.name)) {
        conflicts.push(pkg.campaign.name);
      }

      const levelConflicts: { campaignId: string; campaignName: string; levelNames: string[] }[] = [];
      if (conflicts.length > 0) {
        const existingCampaign = campaigns.find((c) => c.name === pkg.campaign.name);
        if (existingCampaign) {
          const existingLevelNames = new Set(existingCampaign.levels.map((l) => l.name));
          const conflictingLevelNames: string[] = [];
          for (const l of pkg.campaign.levels) {
            if (existingLevelNames.has(l.name)) {
              conflictingLevelNames.push(l.name);
            }
          }
          if (conflictingLevelNames.length > 0) {
            levelConflicts.push({
              campaignId: existingCampaign.id,
              campaignName: existingCampaign.name,
              levelNames: conflictingLevelNames,
            });
          }
        }
      }

      if (conflicts.length === 0 && levelConflicts.length === 0) {
        get().resolveCampaignImport('rename', 'rename', jsonStr, pkg);
        return;
      }

      set({
        pendingCampaignImport: pkg,
        pendingCampaignImportJson: jsonStr,
        campaignImportConflictOpen: true,
        detectedCampaignConflicts: conflicts,
        detectedLevelConflicts: levelConflicts,
      });
    },

    resolveCampaignImport: (
      strategy: CampaignConflictStrategy,
      levelStrategy: CampaignLevelConflictStrategy,
      overrideJson?: string,
      overridePkg?: CampaignPackage,
    ): boolean => {
      const stateNow = get();
      const pendingCampaignImport = overridePkg ?? stateNow.pendingCampaignImport;
      const pendingCampaignImportJson = overrideJson ?? stateNow.pendingCampaignImportJson;
      const { campaigns, progressMap, operationLog, activeCampaignId } = stateNow;

      if (!pendingCampaignImportJson) {
        set({
          campaignImportConflictOpen: false,
          pendingCampaignImport: null,
          pendingCampaignImportJson: null,
          detectedCampaignConflicts: [],
          detectedLevelConflicts: [],
        });
        return false;
      }

      const stateBefore = {
        campaigns: JSON.parse(JSON.stringify(campaigns)) as Campaign[],
        progressMap: JSON.parse(JSON.stringify(progressMap)) as Record<string, CampaignProgress>,
        operationLog: JSON.parse(JSON.stringify(operationLog)) as OperationLogEntry[],
        activeCampaignId,
      };

      let importResult;
      try {
        importResult = importCampaignPackageWithMerge(
          pendingCampaignImportJson,
          stateBefore.campaigns,
          strategy,
          levelStrategy,
        );
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        get().addOperationLog('campaign_import_failed', `导入过程异常：${errMsg}`);
        set({
          campaignImportConflictOpen: false,
          pendingCampaignImport: null,
          pendingCampaignImportJson: null,
          detectedCampaignConflicts: [],
          detectedLevelConflicts: [],
        });
        return false;
      }

      if (!importResult.success) {
        for (const log of importResult.logEntries) {
          get().addOperationLog(log.action, log.detail, undefined, log.campaignName, undefined, log.levelName);
        }
        set({
          campaignImportConflictOpen: false,
          pendingCampaignImport: null,
          pendingCampaignImportJson: null,
          detectedCampaignConflicts: [],
          detectedLevelConflicts: [],
        });
        return false;
      }

      try {
        const pkg = pendingCampaignImport;
        if (!pkg) {
          throw new Error('待导入的战役包丢失');
        }

        const finalCampaigns = importResult.mergedCampaigns;
        const finalProgressMap = { ...stateBefore.progressMap };

        for (const campaign of finalCampaigns) {
          if (!finalProgressMap[campaign.id]) {
            finalProgressMap[campaign.id] = createCampaignProgress(campaign.id);
          }
          if (pkg.progress && pkg.progress.campaignId === (overridePkg?.campaign.id || pendingCampaignImport?.campaign.id)) {
            const incomingProgress = pkg.progress;
            const existingProgress = finalProgressMap[campaign.id];
            if (incomingProgress && campaign.name === pkg.campaign.name) {
              const mergedLevelResults = { ...existingProgress.levelResults };
              for (const [levelId, result] of Object.entries(incomingProgress.levelResults)) {
                const level = campaign.levels.find((l) => l.name === pkg.campaign.levels.find((pl) => pl.id === levelId)?.name);
                if (level) {
                  const existing = mergedLevelResults[level.id];
                  if (!existing || result.stars > (existing.bestStars || 0)) {
                    mergedLevelResults[level.id] = {
                      ...result,
                      bestSteps: Math.min(existing?.bestSteps || Infinity, result.bestSteps || result.steps),
                      bestStars: Math.max(existing?.bestStars || 0, result.bestStars || result.stars),
                    };
                  }
                }
              }
              finalProgressMap[campaign.id] = {
                ...existingProgress,
                levelResults: mergedLevelResults,
                lastPlayedAt: incomingProgress.lastPlayedAt || existingProgress.lastPlayedAt,
              };
              const recalculated = recalculateCampaignProgress(campaign, finalProgressMap[campaign.id]);
              finalProgressMap[campaign.id] = recalculated;
            }
          }
        }

        const combinedOpLog = [...stateBefore.operationLog];
        for (const log of importResult.logEntries) {
          combinedOpLog.push({
            id: genOpLogId(),
            action: log.action,
            detail: log.detail,
            campaignName: log.campaignName,
            levelName: log.levelName,
            timestamp: Date.now(),
          } as OperationLogEntry);
        }

        set({
          campaigns: finalCampaigns,
          progressMap: finalProgressMap,
          operationLog: combinedOpLog,
          campaignImportConflictOpen: false,
          pendingCampaignImport: null,
          pendingCampaignImportJson: null,
          detectedCampaignConflicts: [],
          detectedLevelConflicts: [],
        });

        let detailMsg = `战役包导入完成`;
        const campaignCount = finalCampaigns.length - stateBefore.campaigns.length;
        if (campaignCount > 0) detailMsg += `，新增 ${campaignCount} 个战役`;

        get().addOperationLog('campaign_import', detailMsg);
        get().persist();

        return true;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);

        set({
          campaigns: stateBefore.campaigns,
          progressMap: stateBefore.progressMap,
          operationLog: stateBefore.operationLog,
          campaignImportConflictOpen: false,
          pendingCampaignImport: null,
          pendingCampaignImportJson: null,
          detectedCampaignConflicts: [],
          detectedLevelConflicts: [],
        });

        get().addOperationLog('campaign_import_failed', `导入失败，已回滚：${errMsg}`);
        return false;
      }
    },

    cancelCampaignImport: () => {
      set({
        campaignImportConflictOpen: false,
        pendingCampaignImport: null,
        pendingCampaignImportJson: null,
        detectedCampaignConflicts: [],
        detectedLevelConflicts: [],
      });
    },

    setCampaignImportConflictOpen: (open: boolean) => {
      set({ campaignImportConflictOpen: open });
    },

    persist: () => {
      const { campaigns, progressMap, activeCampaignId, selectedLevelId, operationLog } = get();
      try {
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns));
        localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(progressMap));
        localStorage.setItem(ACTIVE_CAMPAIGN_KEY, activeCampaignId ?? '');
        localStorage.setItem(SELECTED_LEVEL_KEY, selectedLevelId ?? '');
        const trimmedLog = operationLog.slice(-200);
        localStorage.setItem(CAMPAIGN_OPERATION_LOG_KEY, JSON.stringify(trimmedLog));
      } catch {
        // storage full or other error
      }
    },

    restoreFromStorage: () => {
      try {
        let restoredCount = 0;
        let activeName: string | null = null;

        const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const campaigns: Campaign[] = parsed.filter((c) => c && typeof c === 'object' && 'id' in c);
            set({ campaigns });
            restoredCount = campaigns.length;
          }
        }

        const progressRaw = localStorage.getItem(CAMPAIGN_PROGRESS_KEY);
        if (progressRaw) {
          const parsed = JSON.parse(progressRaw);
          if (parsed && typeof parsed === 'object') {
            set({ progressMap: parsed });
          }
        }

        const activeId = localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || null;
        if (activeId) {
          set({ activeCampaignId: activeId });
          const { campaigns } = get();
          const activeCampaign = campaigns.find((c) => c.id === activeId);
          if (activeCampaign) {
            activeName = activeCampaign.name;
          }
        }

        const selectedId = localStorage.getItem(SELECTED_LEVEL_KEY) || null;
        if (selectedId) {
          const { campaigns, activeCampaignId } = get();
          const campaign = campaigns.find((c) => c.id === activeCampaignId);
          if (campaign && campaign.levels.some((l) => l.id === selectedId)) {
            set({ selectedLevelId: selectedId });
          }
        }

        const logRaw = localStorage.getItem(CAMPAIGN_OPERATION_LOG_KEY);
        if (logRaw) {
          const log: OperationLogEntry[] = JSON.parse(logRaw);
          if (Array.isArray(log)) {
            set({ operationLog: log });
          }
        }

        if (restoredCount > 0) {
          const activeInfo = activeName ? `，当前战役「${activeName}」` : '';
          get().addOperationLog('campaign_persist_restore', `恢复 ${restoredCount} 个战役${activeInfo}`);
        }
      } catch {
        // ignore restore errors
      }
    },

    addOperationLog: (
      action: OperationLogEntry['action'],
      detail?: string,
      campaignId?: string,
      campaignName?: string,
      levelId?: string,
      levelName?: string,
    ) => {
      const entry: OperationLogEntry = {
        id: genOpLogId(),
        action,
        campaignId,
        campaignName,
        levelId,
        levelName,
        timestamp: Date.now(),
        detail,
      };
      set((s) => ({ operationLog: [...s.operationLog, entry] }));
    },
  }))
);

let campaignPersistTimer: ReturnType<typeof setTimeout>;

useCampaignStore.subscribe(
  (state) => ({
    campaigns: state.campaigns,
    progressMap: state.progressMap,
    activeCampaignId: state.activeCampaignId,
    selectedLevelId: state.selectedLevelId,
    operationLog: state.operationLog,
  }),
  () => {
    clearTimeout(campaignPersistTimer);
    campaignPersistTimer = setTimeout(() => {
      useCampaignStore.getState().persist();
    }, 300);
  },
  {
    equalityFn: (a, b) =>
      a.campaigns === b.campaigns &&
      a.progressMap === b.progressMap &&
      a.activeCampaignId === b.activeCampaignId &&
      a.selectedLevelId === b.selectedLevelId &&
      a.operationLog === b.operationLog,
  }
);
