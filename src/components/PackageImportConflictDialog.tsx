import { useEditorStore } from '@/store/useEditorStore';
import { AlertTriangle, RefreshCw, FilePlus, SkipForward, X } from 'lucide-react';

export default function PackageImportConflictDialog() {
  const packageImportConflictOpen = useEditorStore((s) => s.packageImportConflictOpen);
  const pendingPackageImport = useEditorStore((s) => s.pendingPackageImport);
  const detectedConflictingSnapshotNames = useEditorStore((s) => s.detectedConflictingSnapshotNames);
  const resolvePackageImport = useEditorStore((s) => s.resolvePackageImport);
  const cancelPackageImport = useEditorStore((s) => s.cancelPackageImport);

  if (!packageImportConflictOpen || !pendingPackageImport) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={cancelPackageImport} />
      <div className="relative glass-panel-strong w-[460px] rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amberx-500/20">
            <AlertTriangle size={20} className="text-amberx-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-abyss-50">快照包导入冲突</h3>
            <p className="text-sm text-abyss-300">
              检测到 {detectedConflictingSnapshotNames.length} 个同名快照
            </p>
          </div>
        </div>

        <div className="bg-abyss-800/60 border border-white/10 rounded-lg p-3 mb-4">
          <div className="text-sm text-abyss-200 mb-2">
            导入来源：
            <span className="text-amberx-400 font-medium ml-1">
              {pendingPackageImport.editorMeta?.levelName || '未命名关卡'}
            </span>
          </div>
          <div className="text-xs text-abyss-400 mb-2">
            包含 {pendingPackageImport.snapshots.length} 个快照 · 
            冲突 {detectedConflictingSnapshotNames.length} 个
          </div>
          <div className="max-h-24 overflow-y-auto space-y-0.5">
            {detectedConflictingSnapshotNames.map((name, idx) => (
              <div key={idx} className="text-xs text-coral-400 font-mono pl-2 border-l-2 border-coral-400/30">
                · {name}
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-abyss-300 mb-4">
          以下快照名称与当前编辑器中已存在的快照重名，请选择处理方式：
        </p>

        <div className="space-y-2">
          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolvePackageImport('replace')}
          >
            <RefreshCw size={18} className="text-coral-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">替换同名快照</div>
              <div className="text-xs text-abyss-400">用导入的快照覆盖当前同名的快照</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolvePackageImport('rename')}
          >
            <FilePlus size={18} className="text-emeraldx-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">保留两份，自动改名</div>
              <div className="text-xs text-abyss-400">为导入的快照自动添加「(导入 N)」后缀</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolvePackageImport('skip')}
          >
            <SkipForward size={18} className="text-abyss-300 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">跳过同名快照</div>
              <div className="text-xs text-abyss-400">只导入名称不冲突的快照</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={cancelPackageImport}
          >
            <X size={18} className="text-abyss-300 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">取消导入</div>
              <div className="text-xs text-abyss-400">放弃此次导入，不做任何修改</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
