import { useCampaignArchiveStore } from '@/store/useCampaignArchiveStore';
import { useEditorStore } from '@/store/useEditorStore';
import { AlertTriangle, X, Check } from 'lucide-react';
import type { CampaignArchiveConflictStrategy } from '@/types';

export default function ArchiveImportConflictDialog() {
  const {
    pendingArchiveImport,
    archiveImportConflictOpen,
    detectedArchiveConflicts,
    resolveArchiveImport,
    cancelArchiveImport,
    setArchiveImportConflictOpen,
  } = useCampaignArchiveStore();

  const { addToast } = useEditorStore();

  if (!archiveImportConflictOpen || !pendingArchiveImport) {
    return null;
  }

  const handleResolve = (strategy: CampaignArchiveConflictStrategy) => {
    const success = resolveArchiveImport(strategy);
    if (success) {
      const strategyLabel =
        strategy === 'overwrite' ? '覆盖' :
        strategy === 'keep_both' ? '并存' : '仅更新元数据';
      addToast('success', `导入成功，策略：${strategyLabel}');
    } else {
      addToast('error', '导入失败');
    }
  };

  const handleCancel = () => {
    cancelArchiveImport();
    setArchiveImportConflictOpen(false);
    addToast('info', '已取消导入');
  };

  const archive = pendingArchiveImport.archive;
  const levelCount = archive.campaign.levels.length;
  const totalStars = archive.progress.totalStars;
  const maxStars = levelCount * 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel-strong w-[480px max-w-[90vw] rounded-xl overflow-hidden shadow-2xl border border-white/10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-amberx-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amberx-500/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-amberx-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-abyss-50">
                同名档案冲突
              </h3>
              <p className="text-xs text-abyss-400">
                导入的档案名称已存在，请选择处理方式
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-abyss-400 hover:text-abyss-100 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <div className="text-sm text-abyss-300 mb-2">待导入档案：
            </div>
            <div className="bg-abyss-800/60 rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-abyss-100">{archive.name}</span>
                <span className="text-xs text-abyss-400">
                  {archive.campaign.name}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-abyss-400">
                <span>{levelCount} 个关卡</span>
                <span>{totalStars}/{maxStars} 星</span>
                <span>{archive.progress.completedCount}/{levelCount} 通关</span>
              </div>
              {pendingArchiveImport.snapshots.length > 0 && (
                <div className="mt-1 text-xs text-abyss-500">
                  包含 {pendingArchiveImport.snapshots.length} 个历史快照
                </div>
              )}
            </div>
          </div>

          {detectedArchiveConflicts.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-abyss-300 mb-2">冲突的档案：
              </div>
              <div className="flex flex-wrap gap-2">
                {detectedArchiveConflicts.map((name, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-coral-500/20 text-coral-300 px-2 py-1 rounded border border-coral-500/30">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => handleResolve('overwrite')}
              className="w-full text-left px-4 py-3 rounded-lg border border-white/10 bg-abyss-800/60 hover:bg-coral-500/10 hover:border-coral-500/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-coral-500/20 flex items-center justify-center group-hover:bg-coral-500/30 transition-colors">
                  <Check size={16} className="text-coral-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-abyss-100">
                    覆盖已有档案
                  </div>
                  <div className="text-xs text-abyss-400">
                    用导入的档案完全替换现有的同名档案，所有进度和快照都将被覆盖
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleResolve('keep_both')}
              className="w-full text-left px-4 py-3 rounded-lg border border-white/10 bg-abyss-800/60 hover:bg-emeraldx-500/10 hover:border-emeraldx-500/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emeraldx-500/20 flex items-center justify-center group-hover:bg-emeraldx-500/30 transition-colors">
                  <Check size={16} className="text-emeraldx-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-abyss-100">
                    并存（自动重命名）
                  </div>
                  <div className="text-xs text-abyss-400">
                    保留两个档案都保存，导入的档案将自动重命名为 "（导入 2）"
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleResolve('metadata_only')}
              className="w-full text-left px-4 py-3 rounded-lg border border-white/10 bg-abyss-800/60 hover:bg-amberx-500/10 hover:border-amberx-500/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amberx-500/20 flex items-center justify-center group-hover:bg-amberx-500/30 transition-colors">
                  <Check size={16} className="text-amberx-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-abyss-100">
                    仅导入元数据
                  </div>
                  <div className="text-xs text-abyss-400">
                    只更新名称、描述、备注等元数据，保留已有进度和关卡数据不变
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="btn-ghost text-sm px-4 py-2">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
