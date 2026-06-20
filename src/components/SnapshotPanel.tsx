import { useState, useCallback, useRef } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { Camera, RotateCcw, Trash2, Edit3, Check, X, History, ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import type { DraftSnapshot, OperationLogEntry } from '@/types';

const ACTION_LABELS: Record<OperationLogEntry['action'], string> = {
  save_snapshot: '💾 保存快照',
  rename_snapshot: '✏️ 重命名',
  delete_snapshot: '🗑️ 删除快照',
  rollback: '⏪ 回滚',
  import_overwrite: '📥 覆盖导入',
  import_as_new: '📥 另存导入',
  export_package: '📦 导出快照包',
  import_package: '📦 导入快照包',
  import_package_conflict_replace: '🔄 替换同名',
  import_package_conflict_rename: '✏️ 重命名导入',
  import_package_conflict_skip: '⏭️ 跳过同名',
  import_package_failed: '❌ 导入失败',
};

function SnapshotItem({ snap, isActive }: { snap: DraftSnapshot; isActive: boolean }) {
  const rollbackToSnapshot = useEditorStore((s) => s.rollbackToSnapshot);
  const renameSnapshot = useEditorStore((s) => s.renameSnapshot);
  const deleteSnapshot = useEditorStore((s) => s.deleteSnapshot);
  const setDeleteConfirmSnapshotId = useEditorStore((s) => s.setDeleteConfirmSnapshotId);
  const deleteConfirmSnapshotId = useEditorStore((s) => s.deleteConfirmSnapshotId);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(snap.name);

  const isConfirming = deleteConfirmSnapshotId === snap.id;

  const handleRenameConfirm = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== snap.name) {
      renameSnapshot(snap.id, renameValue.trim());
    }
    setIsRenaming(false);
  }, [snap.id, snap.name, renameValue, renameSnapshot]);

  const handleRenameCancel = useCallback(() => {
    setRenameValue(snap.name);
    setIsRenaming(false);
  }, [snap.name]);

  const timeStr = new Date(snap.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={`group rounded-lg border p-2.5 transition-all ${
        isActive
          ? 'border-amberx-500/50 bg-amberx-500/10'
          : 'border-white/10 bg-abyss-800/60 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-2">
        {isRenaming ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              className="input-field text-sm flex-1 min-w-0"
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
          <>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-abyss-50 truncate">{snap.name}</div>
              <div className="text-[10px] text-abyss-400 font-mono">{timeStr}</div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="text-abyss-300 hover:text-amberx-400 p-1 transition-colors"
                onClick={() => rollbackToSnapshot(snap.id)}
                title="回滚到此快照"
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="text-abyss-300 hover:text-amberx-400 p-1 transition-colors"
                onClick={() => { setRenameValue(snap.name); setIsRenaming(true); }}
                title="重命名"
              >
                <Edit3 size={14} />
              </button>
              <button
                className="text-abyss-300 hover:text-coral-400 p-1 transition-colors"
                onClick={() => setDeleteConfirmSnapshotId(snap.id)}
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {isActive && (
              <span className="text-[10px] text-amberx-400 bg-amberx-500/20 px-1.5 py-0.5 rounded shrink-0">
                当前
              </span>
            )}
          </>
        )}
      </div>

      {isConfirming && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-coral-400">确认删除此快照？</span>
          <button
            className="btn-danger text-xs px-2 py-0.5"
            onClick={() => deleteSnapshot(snap.id)}
          >
            删除
          </button>
          <button
            className="btn-ghost text-xs px-2 py-0.5"
            onClick={() => setDeleteConfirmSnapshotId(null)}
          >
            取消
          </button>
        </div>
      )}

      <div className="mt-1 flex items-center gap-3 text-[10px] text-abyss-400">
        <span>{snap.level.width}×{snap.level.height}</span>
        <span>步骤: {snap.moveLog.length}</span>
        <span>历史: {snap.past.length}</span>
      </div>
    </div>
  );
}

export default function SnapshotPanel() {
  const snapshotPanelOpen = useEditorStore((s) => s.snapshotPanelOpen);
  const setSnapshotPanelOpen = useEditorStore((s) => s.setSnapshotPanelOpen);
  const snapshots = useEditorStore((s) => s.snapshots);
  const activeSnapshotId = useEditorStore((s) => s.activeSnapshotId);
  const operationLog = useEditorStore((s) => s.operationLog);
  const saveSnapshot = useEditorStore((s) => s.saveSnapshot);
  const exportSnapshotPackage = useEditorStore((s) => s.exportSnapshotPackage);
  const requestPackageImport = useEditorStore((s) => s.requestPackageImport);
  const addToast = useEditorStore((s) => s.addToast);

  const [snapName, setSnapName] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const name = snapName.trim() || `快照 ${snapshots.length + 1}`;
    saveSnapshot(name);
    setSnapName('');
  }, [snapName, snapshots.length, saveSnapshot]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      requestPackageImport(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast('error', `读取文件失败：${msg}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [requestPackageImport, addToast]);

  const sorted = [...snapshots].sort((a, b) => b.createdAt - a.createdAt);
  const recentLog = [...operationLog].reverse().slice(0, 20);

  return (
    <div
      className={`fixed left-2 top-14 z-40 transition-all duration-300 ease-in-out
                  ${snapshotPanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}
    >
      <div className="glass-panel-strong w-72 flex flex-col rounded-xl overflow-hidden shadow-xl border border-white/10">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <h2 className="text-sm font-bold text-abyss-50 flex items-center gap-2">
            <Camera size={16} className="text-amberx-400" />
            草稿快照
            <span className="text-[10px] font-normal text-abyss-400">({snapshots.length})</span>
          </h2>
          <button
            onClick={() => setSnapshotPanelOpen(false)}
            className="text-abyss-300 hover:text-amberx-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <input
              className="input-field text-sm flex-1 h-8"
              placeholder="快照名称"
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
            <button
              className="btn-primary text-xs px-3 py-1.5 h-8 shrink-0"
              onClick={handleSave}
            >
              保存
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={exportSnapshotPackage}
              title="导出全部快照、当前状态和操作记录为 JSON"
            >
              <Download size={14} />
              <span>导出包</span>
            </button>
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={handleImportClick}
              title="从 JSON 文件导入快照包"
            >
              <Upload size={14} />
              <span>导入包</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-80">
          {sorted.length === 0 && (
            <div className="text-center text-abyss-400 text-sm py-6">
              暂无快照<br />
              <span className="text-xs">点击「保存」创建第一个快照</span>
            </div>
          )}
          {sorted.map((snap) => (
            <SnapshotItem
              key={snap.id}
              snap={snap}
              isActive={snap.id === activeSnapshotId}
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
                    <span className="shrink-0">{ACTION_LABELS[entry.action]}</span>
                    {entry.snapshotName && (
                      <span className="text-abyss-200 truncate">「{entry.snapshotName}」</span>
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
