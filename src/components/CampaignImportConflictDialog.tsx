import { useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { AlertTriangle, RefreshCw, FilePlus, SkipForward, X, BookOpen, Layers } from 'lucide-react';
import type { CampaignConflictStrategy, CampaignLevelConflictStrategy } from '@/types';

export default function CampaignImportConflictDialog() {
  const {
    campaignImportConflictOpen,
    pendingCampaignImport,
    detectedCampaignConflicts,
    detectedLevelConflicts,
    resolveCampaignImport,
    cancelCampaignImport,
  } = useCampaignStore();

  const [campaignStrategy, setCampaignStrategy] = useState<CampaignConflictStrategy>('rename');
  const [levelStrategy, setLevelStrategy] = useState<CampaignLevelConflictStrategy>('rename');

  if (!campaignImportConflictOpen || !pendingCampaignImport) return null;

  const handleConfirm = () => {
    resolveCampaignImport(campaignStrategy, levelStrategy);
  };

  const hasCampaignConflict = detectedCampaignConflicts.length > 0;
  const hasLevelConflict = detectedLevelConflicts.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={cancelCampaignImport} />
      <div className="relative glass-panel-strong w-[520px] rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amberx-500/20">
            <AlertTriangle size={20} className="text-amberx-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-abyss-50">战役包导入冲突</h3>
            <p className="text-sm text-abyss-300">
              检测到 {hasCampaignConflict ? detectedCampaignConflicts.length + ' 个同名战役' : ''}
              {hasCampaignConflict && hasLevelConflict ? '、' : ''}
              {hasLevelConflict ? detectedLevelConflicts.reduce((acc, c) => acc + c.levelNames.length, 0) + ' 个同名关卡' : ''}
            </p>
          </div>
        </div>

        <div className="bg-abyss-800/60 border border-white/10 rounded-lg p-3 mb-4">
          <div className="text-sm text-abyss-200 mb-2 flex items-center gap-2">
            <BookOpen size={14} className="text-emeraldx-400" />
            导入战役：
            <span className="text-amberx-400 font-medium">
              {pendingCampaignImport.campaign.name}
            </span>
          </div>
          <div className="text-xs text-abyss-400 mb-3">
            包含 {pendingCampaignImport.campaign.levels.length} 个关卡
            {pendingCampaignImport.progress ? ' · 含进度数据' : ''}
          </div>

          {hasCampaignConflict && (
            <div className="mb-3">
              <div className="text-xs text-coral-400 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                战役名称冲突：
              </div>
              <div className="max-h-16 overflow-y-auto space-y-0.5">
                {detectedCampaignConflicts.map((name, idx) => (
                  <div key={idx} className="text-xs text-coral-400 font-mono pl-2 border-l-2 border-coral-400/30">
                    · {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasLevelConflict && (
            <div>
              <div className="text-xs text-coral-400 mb-1 flex items-center gap-1">
                <Layers size={12} />
                关卡名称冲突：
              </div>
              <div className="max-h-20 overflow-y-auto space-y-1">
                {detectedLevelConflicts.map((conflict, idx) => (
                  <div key={idx} className="text-xs text-abyss-300">
                    <div className="text-abyss-200 mb-0.5">「{conflict.campaignName}」内：</div>
                    <div className="pl-3 space-y-0.5">
                      {conflict.levelNames.map((name, nIdx) => (
                        <div key={nIdx} className="text-xs text-coral-400 font-mono pl-2 border-l-2 border-coral-400/30">
                          · {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasCampaignConflict && (
          <div className="mb-4">
            <p className="text-sm text-abyss-200 font-medium mb-2">战役冲突处理方式：</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="campaignStrategy"
                  checked={campaignStrategy === 'replace'}
                  onChange={() => setCampaignStrategy('replace')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <RefreshCw size={14} className="text-coral-400" />
                    替换同名战役
                  </div>
                  <div className="text-xs text-abyss-400">用导入的战役完全覆盖当前同名战役（包括所有关卡和进度）</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="campaignStrategy"
                  checked={campaignStrategy === 'rename'}
                  onChange={() => setCampaignStrategy('rename')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <FilePlus size={14} className="text-emeraldx-400" />
                    保留两份，自动改名
                  </div>
                  <div className="text-xs text-abyss-400">为导入的战役自动添加「(导入 N)」后缀</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="campaignStrategy"
                  checked={campaignStrategy === 'skip'}
                  onChange={() => setCampaignStrategy('skip')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <SkipForward size={14} className="text-abyss-300" />
                    跳过同名战役
                  </div>
                  <div className="text-xs text-abyss-400">不导入同名的战役，只导入名称不冲突的</div>
                </div>
              </label>
            </div>
          </div>
        )}

        {hasLevelConflict && campaignStrategy !== 'replace' && campaignStrategy !== 'skip' && (
          <div className="mb-4">
            <p className="text-sm text-abyss-200 font-medium mb-2">关卡冲突处理方式：</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="levelStrategy"
                  checked={levelStrategy === 'replace'}
                  onChange={() => setLevelStrategy('replace')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <RefreshCw size={14} className="text-coral-400" />
                    替换同名关卡
                  </div>
                  <div className="text-xs text-abyss-400">用导入的关卡覆盖当前同名关卡</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="levelStrategy"
                  checked={levelStrategy === 'rename'}
                  onChange={() => setLevelStrategy('rename')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <FilePlus size={14} className="text-emeraldx-400" />
                    保留两份，自动改名
                  </div>
                  <div className="text-xs text-abyss-400">为导入的关卡自动添加后缀</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-white/10 bg-abyss-800/40 cursor-pointer hover:bg-abyss-700/40 transition-colors">
                <input
                  type="radio"
                  name="levelStrategy"
                  checked={levelStrategy === 'skip'}
                  onChange={() => setLevelStrategy('skip')}
                  className="mt-0.5 text-emeraldx-500"
                />
                <div>
                  <div className="text-sm font-medium text-abyss-50 flex items-center gap-2">
                    <SkipForward size={14} className="text-abyss-300" />
                    跳过同名关卡
                  </div>
                  <div className="text-xs text-abyss-400">只导入名称不冲突的关卡</div>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            className="flex-1 btn-ghost text-sm px-4 py-2 flex items-center justify-center gap-2"
            onClick={cancelCampaignImport}
          >
            <X size={14} />
            取消
          </button>
          <button
            className="flex-1 btn-primary text-sm px-4 py-2 flex items-center justify-center gap-2"
            onClick={handleConfirm}
          >
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}
