import { useState, useCallback, useRef } from 'react';
import { useCampaignArchiveStore } from '@/store/useCampaignArchiveStore';
import { useCampaignStore } from '@/store/useCampaignStore';
import { useEditorStore } from '@/store/useEditorStore';
import {
  Archive,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Copy,
  Download,
  Upload,
  Star,
  History,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  ArchiveRestore,
  Archive as ArchiveIcon,
  Camera,
  RotateCcw,
  BookMarked,
} from 'lucide-react';
import type { CampaignArchive, CampaignArchiveSnapshot } from '@/types';

const ARCHIVE_ACTION_LABELS: Record<string, string> = {
  archive_create: '📦 创建档案',
  archive_rename: '✏️ 重命名档案',
  archive_delete: '🗑️ 删除档案',
  archive_duplicate: '📋 复制档案',
  archive_archive: '📦 归档',
  archive_unarchive: '📤 取消归档',
  archive_switch: '🔄 切换档案',
  archive_export: '📤 导出档案',
  archive_import: '📥 导入档案',
  archive_import_conflict_overwrite: '🔄 覆盖同名档案',
  archive_import_conflict_keep_both: '➕ 并存档案',
  archive_import_conflict_metadata_only: '📝 更新元数据',
  archive_import_failed: '❌ 导入失败',
  archive_save_snapshot: '📸 保存快照',
  archive_rollback_snapshot: '⏪ 回滚快照',
  archive_delete_snapshot: '🗑️ 删除快照',
  archive_persist_restore: '🔄 恢复档案',
  archive_update_notes: '📝 更新备注',
};

function ArchiveItem({
  archive,
  isActive,
}: {
  archive: CampaignArchive;
  isActive: boolean;
}) {
  const {
    renameArchive,
    deleteArchive,
    duplicateArchive,
    setActiveArchiveId,
    setArchiveArchived,
    setDeleteConfirmArchiveId,
    saveArchiveSnapshot,
    exportArchive,
    getArchiveSnapshots,
    updateArchiveNotes,
  } = useCampaignArchiveStore();

  const { campaigns, progressMap, setActiveCampaignId, setSelectedLevelId } = useCampaignStore();
  const { addToast } = useEditorStore();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(archive.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(archive.notes);
  const [snapshotName, setSnapshotName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const snapshots = getArchiveSnapshots(archive.id);

  const handleRenameConfirm = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== archive.name) {
      renameArchive(archive.id, renameValue.trim());
      addToast('success', `档案已重命名为「${renameValue.trim()}」`);
    }
    setIsRenaming(false);
  }, [archive.id, archive.name, renameValue, renameArchive, addToast]);

  const handleRenameCancel = useCallback(() => {
    setRenameValue(archive.name);
    setIsRenaming(false);
  }, [archive.name]);

  const handleDuplicate = useCallback(() => {
    const newArchive = duplicateArchive(archive.id);
    if (newArchive) {
      addToast('success', `已复制档案「${archive.name}」→「${newArchive.name}」`);
    }
  }, [archive.id, archive.name, duplicateArchive, addToast]);

  const handleDelete = useCallback(() => {
    deleteArchive(archive.id);
    setShowDeleteConfirm(false);
    addToast('info', `档案「${archive.name}」已删除`);
  }, [archive.id, archive.name, deleteArchive, addToast]);

  const handleToggleArchive = useCallback(() => {
    setArchiveArchived(archive.id, !archive.archived);
    addToast('info', archive.archived ? `档案「${archive.name}」已取消归档` : `档案「${archive.name}」已归档`);
  }, [archive.id, archive.name, archive.archived, setArchiveArchived, addToast]);

  const handleSwitchTo = useCallback(() => {
    setActiveArchiveId(archive.id);
    const campaign = campaigns.find((c) => c.id === archive.campaign.id);
    if (!campaign) {
      useCampaignStore.setState({
        campaigns: [...campaigns, archive.campaign],
        activeCampaignId: archive.campaign.id,
        progressMap: { ...progressMap, [archive.campaign.id]: archive.progress },
      });
    } else {
      useCampaignStore.setState({
        activeCampaignId: archive.campaign.id,
        progressMap: { ...progressMap, [archive.campaign.id]: archive.progress },
      });
      setActiveCampaignId(archive.campaign.id);
    }
    setSelectedLevelId(null);
    addToast('success', `已切换到档案「${archive.name}」`);
  }, [archive, campaigns, progressMap, setActiveArchiveId, setActiveCampaignId, setSelectedLevelId, addToast]);

  const handleSaveSnapshot = useCallback(() => {
    const name = snapshotName.trim() || `快照 ${new Date().toLocaleString('zh-CN')}`;
    const snap = saveArchiveSnapshot(archive.id, name);
    if (snap) {
      addToast('success', `已保存快照「${name}」`);
      setSnapshotName('');
    }
  }, [archive.id, snapshotName, saveArchiveSnapshot, addToast]);

  const handleExport = useCallback(() => {
    exportArchive(archive.id, true);
    addToast('success', `档案「${archive.name}」已导出`);
  }, [archive.id, archive.name, exportArchive, addToast]);

  const handleNotesSave = useCallback(() => {
    updateArchiveNotes(archive.id, notesValue);
    setIsEditingNotes(false);
    addToast('info', '备注已更新');
  }, [archive.id, notesValue, updateArchiveNotes, addToast]);

  const totalStars = archive.progress.totalStars;
  const maxStars = archive.campaign.levels.length * 3;
  const completedCount = archive.progress.completedCount;
  const totalLevels = archive.campaign.levels.length;

  const timeStr = new Date(archive.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const lastPlayedStr = archive.lastPlayedAt
    ? new Date(archive.lastPlayedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '未游玩';

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        isActive
          ? 'border-emeraldx-500/50 bg-emeraldx-500/10'
          : archive.archived
          ? 'border-white/5 bg-abyss-900/40 opacity-60'
          : 'border-white/10 bg-abyss-800/60 hover:border-white/20'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {archive.archived ? (
              <ArchiveIcon size={14} className="text-abyss-400 shrink-0" />
            ) : (
              <BookMarked size={14} className="text-amberx-400 shrink-0" />
            )}
            {isRenaming ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  className="input-field text-sm flex-1 min-w-0 h-7"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameConfirm();
                    if (e.key === 'Escape') handleRenameCancel();
                  }}
                  autoFocus
                />
                <button className="text-emeraldx-400 hover:text-emeraldx-300 p-0.5" onClick={handleRenameConfirm}>
                  <Check size={14} />
                </button>
                <button className="text-abyss-300 hover:text-abyss-100 p-0.5" onClick={handleRenameCancel}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                className={`text-sm font-medium truncate cursor-pointer hover:text-amberx-400 transition-colors flex-1 ${
                  isActive ? 'text-emeraldx-400' : 'text-abyss-50'
                }`}
                onClick={handleSwitchTo}
                title="点击切换到此档案"
              >
                {archive.name}
              </div>
            )}
            {isActive && (
              <span className="text-[10px] text-emeraldx-400 bg-emeraldx-500/20 px-1.5 py-0.5 rounded shrink-0">
                当前
              </span>
            )}
            {archive.archived && (
              <span className="text-[10px] text-abyss-400 bg-abyss-700/50 px-1.5 py-0.5 rounded shrink-0">
                已归档
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 text-[10px] text-abyss-400">
            <span className="flex items-center gap-1">
              <Star size={10} className="text-amberx-400" />
              {totalStars}/{maxStars}
            </span>
            <span>{completedCount}/{totalLevels} 通关</span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {lastPlayedStr}
            </span>
          </div>

          <div className="mt-1.5 h-1.5 bg-abyss-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amberx-500 transition-all duration-300"
              style={{
                width: totalLevels > 0 ? `${(totalStars / maxStars) * 100}%` : '0%',
              }}
            />
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-abyss-500 font-mono">
            <span>{archive.campaign.name}</span>
            <span>·</span>
            <span>{timeStr}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-0.5">
            <button
              className="text-abyss-300 hover:text-amberx-400 p-1 transition-colors"
              onClick={() => { setRenameValue(archive.name); setIsRenaming(true); }}
              title="重命名"
            >
              <Edit3 size={12} />
            </button>
            <button
              className="text-abyss-300 hover:text-emeraldx-400 p-1 transition-colors"
              onClick={handleDuplicate}
              title="复制"
            >
              <Copy size={12} />
            </button>
            <button
              className="text-abyss-300 hover:text-coral-400 p-1 transition-colors"
              onClick={() => setShowDeleteConfirm(true)}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              className={`p-1 transition-colors ${
                archive.archived ? 'text-emeraldx-400 hover:text-emeraldx-300' : 'text-abyss-300 hover:text-amberx-400'
              }`}
              onClick={handleToggleArchive}
              title={archive.archived ? '取消归档' : '归档'}
            >
              {archive.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
            <button
              className="text-abyss-300 hover:text-cyanx-400 p-1 transition-colors"
              onClick={handleExport}
              title="导出"
            >
              <Download size={12} />
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="mt-2 flex items-center gap-2 text-xs p-2 bg-coral-500/10 border border-coral-500/30 rounded">
          <span className="text-coral-400">确认删除？</span>
          <button className="btn-danger text-xs px-2 py-0.5" onClick={handleDelete}>
            删除
          </button>
          <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => setShowDeleteConfirm(false)}>
            取消
          </button>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-white/5">
        <div className="flex items-center gap-1">
          <input
            className="input-field text-xs flex-1 h-6"
            placeholder="快照名称..."
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSnapshot(); }}
          />
          <button
            className="btn-ghost text-xs px-2 py-1 h-6 flex items-center gap-1"
            onClick={handleSaveSnapshot}
          >
            <Camera size={12} />
            快照
          </button>
          <button
            className="btn-ghost text-xs px-2 py-1 h-6 flex items-center gap-1"
            onClick={() => setSnapshotsExpanded((v) => !v)}
          >
            <History size={12} />
            {snapshots.length}
            {snapshotsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {snapshotsExpanded && snapshots.length > 0 && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {[...snapshots].reverse().map((snap) => (
              <SnapshotItem key={snap.id} snapshot={snap} />
            ))}
          </div>
        )}

        {snapshotsExpanded && snapshots.length === 0 && (
          <div className="mt-2 text-center text-abyss-500 text-xs py-2">
            暂无快照，点击「快照」保存当前状态
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-white/5">
        {isEditingNotes ? (
          <div className="flex items-start gap-1">
            <textarea
              className="input-field text-xs flex-1 min-h-[60px] resize-none"
              placeholder="添加备注..."
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <button className="text-emeraldx-400 hover:text-emeraldx-300 p-0.5" onClick={handleNotesSave}>
                <Check size={12} />
              </button>
              <button
                className="text-abyss-300 hover:text-abyss-100 p-0.5"
                onClick={() => { setNotesValue(archive.notes); setIsEditingNotes(false); }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-xs text-abyss-400 cursor-pointer hover:text-abyss-200 transition-colors"
            onClick={() => setIsEditingNotes(true)}
          >
            <FileText size={10} className="inline mr-1" />
            {archive.notes || '点击添加备注...'}
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotItem({ snapshot }: { snapshot: CampaignArchiveSnapshot }) {
  const { rollbackToArchiveSnapshot, deleteArchiveSnapshot } = useCampaignArchiveStore();
  const { addToast } = useEditorStore();
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleRollback = useCallback(() => {
    const success = rollbackToArchiveSnapshot(snapshot.id);
    if (success) {
      const { campaigns, progressMap, setActiveCampaignId, setSelectedLevelId } = useCampaignStore.getState();
      const currentArchive = useCampaignArchiveStore.getState().getActiveArchive();
      if (currentArchive) {
        const campaign = campaigns.find((c) => c.id === currentArchive.campaign.id);
        if (!campaign) {
          useCampaignStore.setState({
            campaigns: [...campaigns, currentArchive.campaign],
            activeCampaignId: currentArchive.campaign.id,
            progressMap: { ...progressMap, [currentArchive.campaign.id]: currentArchive.progress },
          });
        } else {
          useCampaignStore.setState({
            activeCampaignId: currentArchive.campaign.id,
            progressMap: { ...progressMap, [currentArchive.campaign.id]: currentArchive.progress },
          });
          setActiveCampaignId(currentArchive.campaign.id);
        }
        setSelectedLevelId(null);
      }
      addToast('success', `已回滚到快照「${snapshot.name}」`);
    }
    setShowRollbackConfirm(false);
  }, [snapshot.id, snapshot.name, rollbackToArchiveSnapshot, addToast]);

  const handleDelete = useCallback(() => {
    deleteArchiveSnapshot(snapshot.id);
    addToast('info', `快照「${snapshot.name}」已删除`);
    setShowDeleteConfirm(false);
  }, [snapshot.id, snapshot.name, deleteArchiveSnapshot, addToast]);

  const timeStr = new Date(snapshot.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center gap-2 p-1.5 bg-abyss-900/50 rounded text-xs group">
      <History size={10} className="text-abyss-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-abyss-200 truncate">{snapshot.name}</div>
        <div className="text-abyss-500 font-mono text-[10px]">{timeStr}</div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
        {showRollbackConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-coral-400 text-[10px]">确认回滚？</span>
            <button className="text-emeraldx-400 hover:text-emeraldx-300 p-0.5" onClick={handleRollback}>
              <Check size={10} />
            </button>
            <button className="text-abyss-300 hover:text-abyss-100 p-0.5" onClick={() => setShowRollbackConfirm(false)}>
              <X size={10} />
            </button>
          </div>
        ) : showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-coral-400 text-[10px]">确认删除？</span>
            <button className="text-coral-400 hover:text-coral-300 p-0.5" onClick={handleDelete}>
              <Check size={10} />
            </button>
            <button className="text-abyss-300 hover:text-abyss-100 p-0.5" onClick={() => setShowDeleteConfirm(false)}>
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            <button
              className="text-abyss-300 hover:text-emeraldx-400 p-0.5 transition-colors"
              onClick={() => setShowRollbackConfirm(true)}
              title="回滚到此快照"
            >
              <RotateCcw size={10} />
            </button>
            <button
              className="text-abyss-300 hover:text-coral-400 p-0.5 transition-colors"
              onClick={() => setShowDeleteConfirm(true)}
              title="删除快照"
            >
              <Trash2 size={10} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CampaignArchivePanel() {
  const {
    archives,
    activeArchiveId,
    archivePanelOpen,
    setArchivePanelOpen,
    createArchive,
    requestArchiveImport,
    operationLog,
  } = useCampaignArchiveStore();

  const { campaigns, activeCampaignId: activeCampaignStoreId, progressMap, getActiveProgress } = useCampaignStore();
  const { addToast } = useEditorStore();

  const [newArchiveName, setNewArchiveName] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignStoreId);
  const activeProgress = activeCampaignStoreId ? progressMap[activeCampaignStoreId] : null;

  const canCreateArchive = activeCampaign && activeProgress;

  const handleCreateArchive = useCallback(() => {
    if (!canCreateArchive) {
      addToast('warning', '请先创建或选择一个战役');
      return;
    }
    const name = newArchiveName.trim() || `${activeCampaign.name} - 档案 ${archives.length + 1}`;
    const archive = createArchive(name, activeCampaign, activeProgress);
    setNewArchiveName('');
    addToast('success', `已创建档案「${archive.name}」`);
  }, [canCreateArchive, newArchiveName, activeCampaign, activeProgress, archives.length, createArchive, addToast]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      requestArchiveImport(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast('error', `读取文件失败：${msg}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [requestArchiveImport, addToast]);

  const visibleArchives = showArchived ? archives : archives.filter((a) => !a.archived);
  const archivedCount = archives.filter((a) => a.archived).length;
  const recentLog = [...operationLog].reverse().slice(0, 20);

  return (
    <div
      className={`fixed left-2 top-14 z-40 transition-all duration-300 ease-in-out
                  ${archivePanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}
    >
      <div className="glass-panel-strong w-80 flex flex-col rounded-xl overflow-hidden shadow-xl border border-white/10 max-h-[calc(100vh-120px)]">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <h2 className="text-sm font-bold text-abyss-50 flex items-center gap-2">
            <Archive size={16} className="text-amberx-400" />
            战役档案库
            <span className="text-[10px] font-normal text-abyss-400">({visibleArchives.length})</span>
          </h2>
          <button
            onClick={() => setArchivePanelOpen(false)}
            className="text-abyss-300 hover:text-amberx-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <input
              className="input-field text-sm flex-1 h-8"
              placeholder="新档案名称"
              value={newArchiveName}
              onChange={(e) => setNewArchiveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateArchive(); }}
            />
            <button
              className="btn-primary text-xs px-3 py-1.5 h-8 shrink-0 flex items-center gap-1 disabled:opacity-50"
              onClick={handleCreateArchive}
              disabled={!canCreateArchive}
              title={!canCreateArchive ? '请先选择战役' : ''}
            >
              <Plus size={14} />
              新建
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={handleImportClick}
            >
              <Upload size={12} />
              导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <label className="btn-ghost text-xs px-2 py-1.5 h-7 flex items-center justify-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                className="mr-1"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              显示归档 ({archivedCount})
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleArchives.length === 0 && (
            <div className="text-center text-abyss-400 text-sm py-8">
              {archives.length === 0 ? (
                <>
                  暂无档案<br />
                  <span className="text-xs">选择战役后点击「新建」创建第一个档案</span>
                </>
              ) : (
                <>
                  暂无未归档档案<br />
                  <span className="text-xs">勾选「显示归档」查看已归档档案</span>
                </>
              )}
            </div>
          )}
          {visibleArchives.map((archive) => (
            <ArchiveItem
              key={archive.id}
              archive={archive}
              isActive={archive.id === activeArchiveId}
            />
          ))}
        </div>

        {recentLog.length > 0 && (
          <div className="border-t border-white/10">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-abyss-300 hover:text-abyss-100 transition-colors"
              onClick={() => setLogExpanded((v) => !v)}
            >
              <History size={14} />
              <span className="flex-1 text-left">操作记录 ({recentLog.length})</span>
              {logExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {logExpanded && (
              <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-1">
                {recentLog.map((entry) => (
                  <div key={entry.id} className="text-[10px] text-abyss-400 flex items-center gap-2">
                    <span className="shrink-0">
                      {ARCHIVE_ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    {entry.archiveName && (
                      <span className="text-abyss-200 truncate">「{entry.archiveName}」</span>
                    )}
                    <span className="ml-auto font-mono shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
