import { useEditorStore } from '@/store/useEditorStore';
import { AlertTriangle, Upload, FilePlus, X } from 'lucide-react';

export default function ImportConflictDialog() {
  const importConflictOpen = useEditorStore((s) => s.importConflictOpen);
  const pendingImportLevel = useEditorStore((s) => s.pendingImportLevel);
  const resolveImportConflict = useEditorStore((s) => s.resolveImportConflict);
  const setImportConflictOpen = useEditorStore((s) => s.setImportConflictOpen);

  if (!importConflictOpen || !pendingImportLevel) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => resolveImportConflict('cancel')} />
      <div className="relative glass-panel-strong w-[420px] rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amberx-500/20">
            <AlertTriangle size={20} className="text-amberx-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-abyss-50">导入冲突</h3>
            <p className="text-sm text-abyss-300">当前编辑器中有未保存的内容</p>
          </div>
        </div>

        <div className="bg-abyss-800/60 border border-white/10 rounded-lg p-3 mb-4">
          <div className="text-sm text-abyss-200 mb-1">
            将导入：<span className="text-amberx-400 font-medium">{pendingImportLevel.name}</span>
          </div>
          <div className="text-xs text-abyss-400">
            {pendingImportLevel.width}×{pendingImportLevel.height} ·
            步骤 {pendingImportLevel.moveLog.length}
          </div>
        </div>

        <p className="text-sm text-abyss-300 mb-4">
          当前编辑器已有草稿或录制步骤，直接导入会覆盖当前内容。请选择处理方式：
        </p>

        <div className="space-y-2">
          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolveImportConflict('overwrite')}
          >
            <Upload size={18} className="text-coral-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">覆盖当前</div>
              <div className="text-xs text-abyss-400">丢弃当前编辑内容，使用导入的关卡替换</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolveImportConflict('save_as_new')}
          >
            <FilePlus size={18} className="text-emeraldx-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">另存为新快照</div>
              <div className="text-xs text-abyss-400">当前状态保存为快照，然后导入新关卡</div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10
                       bg-abyss-800/60 hover:bg-abyss-700/60 transition-colors text-left"
            onClick={() => resolveImportConflict('cancel')}
          >
            <X size={18} className="text-abyss-300 shrink-0" />
            <div>
              <div className="text-sm font-medium text-abyss-50">取消导入</div>
              <div className="text-xs text-abyss-400">不做任何修改，保持当前状态</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
