import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CampaignArchive,
  CampaignArchiveSnapshot,
  CampaignArchiveConflictStrategy,
  CampaignArchivePackage,
  OperationLogEntry,
  Campaign,
  CampaignProgress,
} from '@/types';
import { useCampaignStore } from './useCampaignStore';
import {
  ARCHIVE_STORAGE_KEY,
  ACTIVE_ARCHIVE_KEY,
  ARCHIVE_SNAPSHOTS_KEY,
  ARCHIVE_OPERATION_LOG_KEY,
} from '@/types';
import {
  createCampaignArchive,
  createArchiveSnapshot,
  exportArchivePackage,
  parseArchivePackage,
  importArchivePackageWithMerge,
  generateUniqueArchiveName,
  genArchiveId,
  genCampaignId,
} from '@/utils/serializer';

let opLogIdCounter = 0;

function genOpLogId(): string {
  return `op_arch_${Date.now()}_${++opLogIdCounter}`;
}

interface CampaignArchiveStoreState {
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

  createArchive: (name: string, campaign: Campaign, progress: CampaignProgress, description?: string) => CampaignArchive;
  renameArchive: (id: string, name: string) => void;
  deleteArchive: (id: string) => void;
  duplicateArchive: (id: string, newName?: string) => CampaignArchive | null;
  setArchiveArchived: (id: string, archived: boolean) => void;
  setActiveArchiveId: (id: string | null) => void;
  setArchivePanelOpen: (open: boolean) => void;
  setDeleteConfirmArchiveId: (id: string | null) => void;
  updateArchiveNotes: (id: string, notes: string) => void;

  getActiveArchive: () => CampaignArchive | null;
  getArchiveSnapshots: (archiveId: string) => CampaignArchiveSnapshot[];

  saveArchiveSnapshot: (archiveId: string, name: string, description?: string) => CampaignArchiveSnapshot | null;
  rollbackToArchiveSnapshot: (snapshotId: string) => boolean;
  deleteArchiveSnapshot: (snapshotId: string) => void;

  exportArchive: (archiveId: string, includeSnapshots?: boolean) => void;
  requestArchiveImport: (jsonStr: string) => void;
  resolveArchiveImport: (
    strategy: CampaignArchiveConflictStrategy,
    overrideJson?: string,
    overridePkg?: CampaignArchivePackage
  ) => boolean;
  cancelArchiveImport: () => void;
  setArchiveImportConflictOpen: (open: boolean) => void;

  syncArchiveFromCampaign: (archiveId: string, campaign: Campaign, progress: CampaignProgress) => void;
  syncActiveArchiveFromStores: () => void;

  persist: () => void;
  restoreFromStorage: () => void;
  addOperationLog: (
    action: OperationLogEntry['action'],
    detail?: string,
    archiveId?: string,
    archiveName?: string,
    campaignId?: string,
    campaignName?: string,
  ) => void;
}

export const useCampaignArchiveStore = create<CampaignArchiveStoreState>()(
  subscribeWithSelector((set, get) => ({
    archives: [],
    activeArchiveId: null,
    snapshots: {},
    operationLog: [],
    archivePanelOpen: false,
    deleteConfirmArchiveId: null,
    pendingArchiveImport: null,
    pendingArchiveImportJson: null,
    archiveImportConflictOpen: false,
    detectedArchiveConflicts: [],

    createArchive: (name: string, campaign: Campaign, progress: CampaignProgress, description = '') => {
      const archive = createCampaignArchive(name, campaign, progress, description);
      set((state) => ({
        archives: [...state.archives, archive],
        activeArchiveId: archive.id,
        snapshots: { ...state.snapshots, [archive.id]: [] },
      }));
      get().addOperationLog('archive_create', `创建档案「${name}」`, archive.id, name, campaign.id, campaign.name);
      get().persist();
      return archive;
    },

    renameArchive: (id: string, name: string) => {
      const { archives } = get();
      const archive = archives.find((a) => a.id === id);
      if (!archive) return;
      const oldName = archive.name;

      const newArchives = archives.map((a) =>
        a.id === id ? { ...a, name, updatedAt: Date.now() } : a
      );
      set({ archives: newArchives });
      get().addOperationLog('archive_rename', `重命名「${oldName}」→「${name}」`, id, name);
      get().persist();
    },

    deleteArchive: (id: string) => {
      const { archives, activeArchiveId, snapshots, operationLog } = get();
      const archive = archives.find((a) => a.id === id);
      if (!archive) return;

      const newArchives = archives.filter((a) => a.id !== id);
      const newActiveId = activeArchiveId === id ? null : activeArchiveId;
      const newSnapshots = { ...snapshots };
      delete newSnapshots[id];

      set({
        archives: newArchives,
        activeArchiveId: newActiveId,
        snapshots: newSnapshots,
        deleteConfirmArchiveId: null,
      });
      get().addOperationLog('archive_delete', `删除档案「${archive.name}」`, id, archive.name);
      get().persist();
    },

    duplicateArchive: (id: string, newName?: string) => {
      const { archives, snapshots } = get();
      const archive = archives.find((a) => a.id === id);
      if (!archive) return null;

      const name = newName || generateUniqueArchiveName(`${archive.name} (副本)`, archives);
      const now = Date.now();
      const newCampaignId = genCampaignId();
      const newArchive: CampaignArchive = {
        ...JSON.parse(JSON.stringify(archive)),
        id: genArchiveId(),
        name,
        createdAt: now,
        updatedAt: now,
        lastPlayedAt: null,
        campaign: {
          ...JSON.parse(JSON.stringify(archive.campaign)),
          id: newCampaignId,
        },
        progress: {
          ...JSON.parse(JSON.stringify(archive.progress)),
          campaignId: newCampaignId,
        },
      };

      const archiveSnapshots = snapshots[archive.id] || [];
      const newSnapshotsList = archiveSnapshots.map((s) => ({
        ...JSON.parse(JSON.stringify(s)),
        id: `asnap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        archiveId: newArchive.id,
        archive: {
          ...JSON.parse(JSON.stringify(s.archive)),
          id: newArchive.id,
          name,
        },
      }));

      set((state) => ({
        archives: [...state.archives, newArchive],
        activeArchiveId: newArchive.id,
        snapshots: {
          ...state.snapshots,
          [newArchive.id]: newSnapshotsList,
        },
      }));
      get().addOperationLog('archive_duplicate', `复制档案「${archive.name}」→「${name}」`, newArchive.id, name);
      get().persist();
      return newArchive;
    },

    setArchiveArchived: (id: string, archived: boolean) => {
      const { archives } = get();
      const archive = archives.find((a) => a.id === id);
      if (!archive) return;

      const newArchives = archives.map((a) =>
        a.id === id ? { ...a, archived, updatedAt: Date.now() } : a
      );
      set({ archives: newArchives });
      const action = archived ? 'archive_archive' : 'archive_unarchive';
      const detail = archived ? `归档档案「${archive.name}」` : `取消归档「${archive.name}」`;
      get().addOperationLog(action, detail, id, archive.name);
      get().persist();
    },

    setActiveArchiveId: (id: string | null) => {
      set({ activeArchiveId: id });
      if (id) {
        const archive = get().archives.find((a) => a.id === id);
        if (archive) {
          const newArchives = get().archives.map((a) =>
            a.id === id ? { ...a, lastPlayedAt: Date.now(), updatedAt: Date.now() } : a
          );
          set({ archives: newArchives });
          get().addOperationLog('archive_switch', `切换到档案「${archive.name}」`, id, archive.name);
        }
      }
      try {
        localStorage.setItem(ACTIVE_ARCHIVE_KEY, id ?? '');
      } catch { /* ignore */ }
      get().persist();
    },

    setArchivePanelOpen: (open: boolean) => {
      set({ archivePanelOpen: open });
    },

    setDeleteConfirmArchiveId: (id: string | null) => {
      set({ deleteConfirmArchiveId: id });
    },

    updateArchiveNotes: (id: string, notes: string) => {
      const { archives } = get();
      const archive = archives.find((a) => a.id === id);
      if (!archive) return;

      const newArchives = archives.map((a) =>
        a.id === id ? { ...a, notes, updatedAt: Date.now() } : a
      );
      set({ archives: newArchives });
      get().addOperationLog('archive_update_notes', `更新档案备注`, id, archive.name);
      get().persist();
    },

    getActiveArchive: () => {
      const { archives, activeArchiveId } = get();
      return archives.find((a) => a.id === activeArchiveId) || null;
    },

    getArchiveSnapshots: (archiveId: string) => {
      return get().snapshots[archiveId] || [];
    },

    saveArchiveSnapshot: (archiveId: string, name: string, description = '') => {
      const { archives, snapshots } = get();
      const archive = archives.find((a) => a.id === archiveId);
      if (!archive) return null;

      const snapshot = createArchiveSnapshot(name, archive, description);
      const archiveSnapshots = snapshots[archiveId] || [];
      const newSnapshots = [...archiveSnapshots, snapshot];

      set((state) => ({
        snapshots: { ...state.snapshots, [archiveId]: newSnapshots },
      }));
      get().addOperationLog('archive_save_snapshot', `保存快照「${name}」`, archiveId, archive.name);
      get().persist();
      return snapshot;
    },

    rollbackToArchiveSnapshot: (snapshotId: string) => {
      const { archives, snapshots } = get();

      for (const [archiveId, snapshotList] of Object.entries(snapshots)) {
        const snapshot = snapshotList.find((s) => s.id === snapshotId);
        if (snapshot) {
          const newArchives = archives.map((a) =>
            a.id === archiveId
              ? { ...JSON.parse(JSON.stringify(snapshot.archive)), updatedAt: Date.now() }
              : a
          );
          set({
            archives: newArchives,
            activeArchiveId: archiveId,
          });
          get().addOperationLog(
            'archive_rollback_snapshot',
            `回滚到快照「${snapshot.name}」`,
            archiveId,
            snapshot.archive.name
          );
          get().persist();
          return true;
        }
      }
      return false;
    },

    deleteArchiveSnapshot: (snapshotId: string) => {
      const { snapshots } = get();

      for (const [archiveId, snapshotList] of Object.entries(snapshots)) {
        const snapshot = snapshotList.find((s) => s.id === snapshotId);
        if (snapshot) {
          const newSnapshots = snapshotList.filter((s) => s.id !== snapshotId);
          set((state) => ({
            snapshots: { ...state.snapshots, [archiveId]: newSnapshots },
          }));
          get().addOperationLog(
            'archive_delete_snapshot',
            `删除快照「${snapshot.name}」`,
            archiveId,
            snapshot.archive.name
          );
          get().persist();
          return;
        }
      }
    },

    exportArchive: (archiveId: string, includeSnapshots = true) => {
      const { archives, snapshots, operationLog } = get();
      const archive = archives.find((a) => a.id === archiveId);
      if (!archive) return;

      const archiveSnapshots = includeSnapshots ? snapshots[archiveId] || [] : [];
      const json = exportArchivePackage({
        archive,
        snapshots: archiveSnapshots,
        operationLog,
      });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `archive-${archive.name || 'untitled'}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      get().addOperationLog(
        'archive_export',
        `导出档案包：${archive.campaign.levels.length} 个关卡${includeSnapshots ? `，${archiveSnapshots.length} 个快照` : ''}`,
        archiveId,
        archive.name
      );
    },

    requestArchiveImport: (jsonStr: string) => {
      const parseResult = parseArchivePackage(jsonStr);
      if (!parseResult.pkg) {
        for (const err of parseResult.errors) {
          get().addOperationLog('archive_import_failed', err);
        }
        return;
      }
      const pkg = parseResult.pkg;
      const { archives } = get();
      const existingNames = new Set(archives.map((a) => a.name));
      const conflicts: string[] = [];

      if (existingNames.has(pkg.archive.name)) {
        conflicts.push(pkg.archive.name);
      }

      if (conflicts.length === 0) {
        get().resolveArchiveImport('keep_both', jsonStr, pkg);
        return;
      }

      set({
        pendingArchiveImport: pkg,
        pendingArchiveImportJson: jsonStr,
        archiveImportConflictOpen: true,
        detectedArchiveConflicts: conflicts,
      });
    },

    resolveArchiveImport: (
      strategy: CampaignArchiveConflictStrategy,
      overrideJson?: string,
      overridePkg?: CampaignArchivePackage,
    ): boolean => {
      const stateNow = get();
      const pendingArchiveImport = overridePkg ?? stateNow.pendingArchiveImport;
      const pendingArchiveImportJson = overrideJson ?? stateNow.pendingArchiveImportJson;
      const { archives, snapshots, operationLog, activeArchiveId } = stateNow;

      if (!pendingArchiveImportJson) {
        set({
          archiveImportConflictOpen: false,
          pendingArchiveImport: null,
          pendingArchiveImportJson: null,
          detectedArchiveConflicts: [],
        });
        return false;
      }

      const stateBefore = {
        archives: JSON.parse(JSON.stringify(archives)) as CampaignArchive[],
        snapshots: JSON.parse(JSON.stringify(snapshots)) as Record<string, CampaignArchiveSnapshot[]>,
        operationLog: JSON.parse(JSON.stringify(operationLog)) as OperationLogEntry[],
        activeArchiveId,
      };

      let importResult;
      try {
        importResult = importArchivePackageWithMerge(
          pendingArchiveImportJson,
          stateBefore.archives,
          strategy,
        );
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        get().addOperationLog('archive_import_failed', `导入过程异常：${errMsg}`);
        set({
          archiveImportConflictOpen: false,
          pendingArchiveImport: null,
          pendingArchiveImportJson: null,
          detectedArchiveConflicts: [],
        });
        return false;
      }

      if (!importResult.success) {
        for (const log of importResult.logEntries) {
          get().addOperationLog(log.action, log.detail, undefined, log.archiveName);
        }
        set({
          archiveImportConflictOpen: false,
          pendingArchiveImport: null,
          pendingArchiveImportJson: null,
          detectedArchiveConflicts: [],
        });
        return false;
      }

      try {
        const pkg = pendingArchiveImport;
        if (!pkg) {
          throw new Error('待导入的档案包丢失');
        }

        const finalArchives = importResult.mergedArchives;
        const finalSnapshots = { ...stateBefore.snapshots };

        if (pkg.snapshots && pkg.snapshots.length > 0 && importResult.resolvedArchiveId) {
          const existingSnapshots = finalSnapshots[importResult.resolvedArchiveId] || [];
          const newSnapshots = pkg.snapshots.map((s) => ({
            ...JSON.parse(JSON.stringify(s)),
            id: `asnap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            archiveId: importResult.resolvedArchiveId!,
          }));
          finalSnapshots[importResult.resolvedArchiveId] = [...existingSnapshots, ...newSnapshots];
        }

        const combinedOpLog = [...stateBefore.operationLog];
        for (const log of importResult.logEntries) {
          combinedOpLog.push({
            id: genOpLogId(),
            action: log.action,
            detail: log.detail,
            archiveName: log.archiveName,
            timestamp: Date.now(),
          } as OperationLogEntry);
        }

        const newActiveId = importResult.resolvedArchiveId || stateBefore.activeArchiveId;

        if (newActiveId) {
          const idx = finalArchives.findIndex((a) => a.id === newActiveId);
          if (idx >= 0) {
            finalArchives[idx] = { ...finalArchives[idx], lastPlayedAt: Date.now(), updatedAt: Date.now() };
          }
        }

        set({
          archives: finalArchives,
          snapshots: finalSnapshots,
          activeArchiveId: newActiveId,
          operationLog: combinedOpLog,
          archiveImportConflictOpen: false,
          pendingArchiveImport: null,
          pendingArchiveImportJson: null,
          detectedArchiveConflicts: [],
        });

        let detailMsg = `档案包导入完成`;
        const archiveCount = finalArchives.length - stateBefore.archives.length;
        if (archiveCount > 0) detailMsg += `，新增 ${archiveCount} 个档案`;

        get().addOperationLog('archive_import', detailMsg);
        get().persist();

        return true;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);

        set({
          archives: stateBefore.archives,
          snapshots: stateBefore.snapshots,
          operationLog: stateBefore.operationLog,
          activeArchiveId: stateBefore.activeArchiveId,
          archiveImportConflictOpen: false,
          pendingArchiveImport: null,
          pendingArchiveImportJson: null,
          detectedArchiveConflicts: [],
        });

        get().addOperationLog('archive_import_failed', `导入失败，已回滚：${errMsg}`);
        return false;
      }
    },

    cancelArchiveImport: () => {
      set({
        archiveImportConflictOpen: false,
        pendingArchiveImport: null,
        pendingArchiveImportJson: null,
        detectedArchiveConflicts: [],
      });
    },

    setArchiveImportConflictOpen: (open: boolean) => {
      set({ archiveImportConflictOpen: open });
    },

    syncArchiveFromCampaign: (archiveId: string, campaign: Campaign, progress: CampaignProgress) => {
      const { archives } = get();
      const archive = archives.find((a) => a.id === archiveId);
      if (!archive) return;

      const newArchive: CampaignArchive = {
        ...archive,
        campaign: JSON.parse(JSON.stringify(campaign)),
        progress: JSON.parse(JSON.stringify(progress)),
        updatedAt: Date.now(),
      };

      const newArchives = archives.map((a) =>
        a.id === archiveId ? newArchive : a
      );
      set({ archives: newArchives });
      get().persist();
    },

    syncActiveArchiveFromStores: () => {
      const { activeArchiveId, archives } = get();
      if (!activeArchiveId) return;

      const archive = archives.find((a) => a.id === activeArchiveId);
      if (!archive) return;

      const { campaigns, progressMap, activeCampaignId } = useCampaignStore.getState();
      if (!activeCampaignId) return;

      const campaign = campaigns.find((c) => c.id === activeCampaignId);
      if (!campaign) return;

      const progress = progressMap[activeCampaignId];
      if (!progress) return;

      if (archive.campaign.id !== campaign.id) return;

      const newArchive: CampaignArchive = {
        ...archive,
        campaign: JSON.parse(JSON.stringify(campaign)),
        progress: JSON.parse(JSON.stringify(progress)),
        updatedAt: Date.now(),
      };

      const newArchives = archives.map((a) =>
        a.id === activeArchiveId ? newArchive : a
      );
      set({ archives: newArchives });
      get().persist();
    },

    persist: () => {
      const { archives, snapshots, activeArchiveId, operationLog } = get();
      try {
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
        localStorage.setItem(ARCHIVE_SNAPSHOTS_KEY, JSON.stringify(snapshots));
        localStorage.setItem(ACTIVE_ARCHIVE_KEY, activeArchiveId ?? '');
        const trimmedLog = operationLog.slice(-200);
        localStorage.setItem(ARCHIVE_OPERATION_LOG_KEY, JSON.stringify(trimmedLog));
      } catch {
        // storage full or other error
      }
    },

    restoreFromStorage: () => {
      try {
        let restoredCount = 0;
        let activeName: string | null = null;

        const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const archives: CampaignArchive[] = parsed.filter((a) => a && typeof a === 'object' && 'id' in a);
            set({ archives });
            restoredCount = archives.length;
          }
        }

        const snapshotsRaw = localStorage.getItem(ARCHIVE_SNAPSHOTS_KEY);
        if (snapshotsRaw) {
          const parsed = JSON.parse(snapshotsRaw);
          if (parsed && typeof parsed === 'object') {
            set({ snapshots: parsed });
          }
        }

        const activeId = localStorage.getItem(ACTIVE_ARCHIVE_KEY) || null;
        if (activeId) {
          set({ activeArchiveId: activeId });
          const { archives } = get();
          const activeArchive = archives.find((a) => a.id === activeId);
          if (activeArchive) {
            activeName = activeArchive.name;
            const newArchives = archives.map((a) =>
              a.id === activeId ? { ...a, lastPlayedAt: Date.now(), updatedAt: Date.now() } : a
            );
            set({ archives: newArchives });
          }
        }

        const logRaw = localStorage.getItem(ARCHIVE_OPERATION_LOG_KEY);
        if (logRaw) {
          const log: OperationLogEntry[] = JSON.parse(logRaw);
          if (Array.isArray(log)) {
            set({ operationLog: log });
          }
        }

        if (restoredCount > 0) {
          const activeInfo = activeName ? `，当前档案「${activeName}」` : '';
          get().addOperationLog('archive_persist_restore', `恢复 ${restoredCount} 个档案${activeInfo}`);
        }
      } catch {
        // ignore restore errors
      }
    },

    addOperationLog: (
      action: OperationLogEntry['action'],
      detail?: string,
      archiveId?: string,
      archiveName?: string,
      campaignId?: string,
      campaignName?: string,
    ) => {
      const entry: OperationLogEntry = {
        id: genOpLogId(),
        action,
        archiveId,
        archiveName,
        campaignId,
        campaignName,
        timestamp: Date.now(),
        detail,
      };
      set((s) => ({ operationLog: [...s.operationLog, entry] }));
    },
  }))
);

let archivePersistTimer: ReturnType<typeof setTimeout>;

useCampaignArchiveStore.subscribe(
  (state) => ({
    archives: state.archives,
    snapshots: state.snapshots,
    activeArchiveId: state.activeArchiveId,
    operationLog: state.operationLog,
  }),
  () => {
    clearTimeout(archivePersistTimer);
    archivePersistTimer = setTimeout(() => {
      useCampaignArchiveStore.getState().persist();
    }, 300);
  },
  {
    equalityFn: (a, b) =>
      a.archives === b.archives &&
      a.snapshots === b.snapshots &&
      a.activeArchiveId === b.activeArchiveId &&
      a.operationLog === b.operationLog,
  }
);
