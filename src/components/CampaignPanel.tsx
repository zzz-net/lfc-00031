import { useState, useCallback, useRef } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { useEditorStore } from '@/store/useEditorStore';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Upload,
  Settings,
  Star,
  Lock,
  Unlock,
  History,
  Save,
} from 'lucide-react';
import type { CampaignLevel, OperationLogEntry } from '@/types';

const CAMPAIGN_ACTION_LABELS: Record<string, string> = {
  campaign_create: '📚 创建战役',
  campaign_rename: '✏️ 重命名战役',
  campaign_delete: '🗑️ 删除战役',
  campaign_add_level: '➕ 添加关卡',
  campaign_remove_level: '➖ 删除关卡',
  campaign_reorder_levels: '↕️ 调整顺序',
  campaign_duplicate_level: '📋 复制关卡',
  campaign_rename_level: '✏️ 重命名关卡',
  campaign_update_level_meta: '⚙️ 更新元数据',
  campaign_export: '📦 导出战役包',
  campaign_import: '📦 导入战役包',
  campaign_import_conflict_replace_campaign: '🔄 替换同名战役',
  campaign_import_conflict_rename_campaign: '✏️ 重命名战役',
  campaign_import_conflict_skip_campaign: '⏭️ 跳过同名战役',
  campaign_import_conflict_replace_level: '🔄 替换同名关卡',
  campaign_import_conflict_rename_level: '✏️ 重命名关卡',
  campaign_import_conflict_skip_level: '⏭️ 跳过同名关卡',
  campaign_import_failed: '❌ 导入失败',
  campaign_progress_update: '⭐ 进度更新',
  campaign_persist_restore: '🔄 恢复战役',
};

function LevelItem({
  level,
  isSelected,
  campaignId,
}: {
  level: CampaignLevel;
  isSelected: boolean;
  campaignId: string;
}) {
  const {
    removeLevelFromCampaign,
    renameLevel,
    duplicateLevel,
    reorderLevels,
    setSelectedLevelId,
    setLevelMetaEditorOpen,
    setEditingLevelId,
    getActiveCampaign,
  } = useCampaignStore();
  const { addToast, loadLevelData } = useEditorStore();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(level.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const campaign = getActiveCampaign();
  const sortedLevels = campaign ? [...campaign.levels].sort((a, b) => a.order - b.order) : [];
  const currentIndex = sortedLevels.findIndex((l) => l.id === level.id);

  const handleRenameConfirm = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== level.name) {
      renameLevel(campaignId, level.id, renameValue.trim());
    }
    setIsRenaming(false);
  }, [campaignId, level.id, level.name, renameValue, renameLevel]);

  const handleRenameCancel = useCallback(() => {
    setRenameValue(level.name);
    setIsRenaming(false);
  }, [level.name]);

  const handleMoveUp = useCallback(() => {
    if (currentIndex > 0) {
      reorderLevels(campaignId, currentIndex, currentIndex - 1);
    }
  }, [campaignId, currentIndex, reorderLevels]);

  const handleMoveDown = useCallback(() => {
    if (currentIndex < sortedLevels.length - 1) {
      reorderLevels(campaignId, currentIndex, currentIndex + 1);
    }
  }, [campaignId, currentIndex, sortedLevels.length, reorderLevels]);

  const handleDuplicate = useCallback(() => {
    duplicateLevel(campaignId, level.id);
  }, [campaignId, level.id, duplicateLevel]);

  const handleDelete = useCallback(() => {
    removeLevelFromCampaign(campaignId, level.id);
    setShowDeleteConfirm(false);
  }, [campaignId, level.id, removeLevelFromCampaign]);

  const handleEditMeta = useCallback(() => {
    setEditingLevelId(level.id);
    setLevelMetaEditorOpen(true);
  }, [level.id, setEditingLevelId, setLevelMetaEditorOpen]);

  const handleLoadToEditor = useCallback(() => {
    setSelectedLevelId(level.id);
    loadLevelData(level.levelData, true);
    addToast('info', `已加载关卡「${level.name}」`);
  }, [level.id, level.name, level.levelData, setSelectedLevelId, loadLevelData, addToast]);

  const handleAddCurrentLevel = useCallback(() => {
    // This would be handled by the parent
  }, []);

  const stars = level.playResult?.bestStars ?? 0;
  const timeStr = new Date(level.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`group rounded-lg border p-2.5 transition-all ${
        isSelected
          ? 'border-emeraldx-500/50 bg-emeraldx-500/10'
          : 'border-white/10 bg-abyss-800/60 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button
            className="text-abyss-300 hover:text-amberx-400 p-0.5 disabled:opacity-30 transition-colors"
            onClick={handleMoveUp}
            disabled={currentIndex <= 0}
            title="上移"
          >
            <ChevronUp size={12} />
          </button>
          <button
            className="text-abyss-300 hover:text-amberx-400 p-0.5 disabled:opacity-30 transition-colors"
            onClick={handleMoveDown}
            disabled={currentIndex >= sortedLevels.length - 1}
            title="下移"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        <div className="text-amberx-400 text-sm font-bold w-5 text-center">
          {level.order + 1}
        </div>

        {level.unlocked ? (
          <Unlock size={14} className="text-emeraldx-400 shrink-0" />
        ) : (
          <Lock size={14} className="text-abyss-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
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
            <>
              <div
                className="text-sm font-medium text-abyss-50 truncate cursor-pointer hover:text-amberx-400 transition-colors"
                onClick={handleLoadToEditor}
                title="点击加载到编辑器"
              >
                {level.name}
              </div>
              <div className="text-[10px] text-abyss-400 font-mono">{timeStr}</div>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map((i) => (
            <Star
              key={i}
              size={12}
              className={i <= stars ? 'text-amberx-400 fill-amberx-400' : 'text-abyss-600'}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="text-abyss-300 hover:text-amberx-400 p-1 transition-colors"
            onClick={handleEditMeta}
            title="编辑元数据"
          >
            <Settings size={14} />
          </button>
          <button
            className="text-abyss-300 hover:text-emeraldx-400 p-1 transition-colors"
            onClick={handleDuplicate}
            title="复制"
          >
            <Copy size={14} />
          </button>
          <button
            className="text-abyss-300 hover:text-amberx-400 p-1 transition-colors"
            onClick={() => { setRenameValue(level.name); setIsRenaming(true); }}
            title="重命名"
          >
            <Edit3 size={14} />
          </button>
          <button
            className="text-abyss-300 hover:text-coral-400 p-1 transition-colors"
            onClick={() => setShowDeleteConfirm(true)}
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {isSelected && (
          <span className="text-[10px] text-emeraldx-400 bg-emeraldx-500/20 px-1.5 py-0.5 rounded shrink-0">
            当前
          </span>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-coral-400">确认删除？</span>
          <button className="btn-danger text-xs px-2 py-0.5" onClick={handleDelete}>
            删除
          </button>
          <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => setShowDeleteConfirm(false)}>
            取消
          </button>
        </div>
      )}

      <div className="mt-1 flex items-center gap-3 text-[10px] text-abyss-400">
        <span>{level.levelData.width}×{level.levelData.height}</span>
        <span>推荐: {level.meta.recommendedSteps}步</span>
      </div>
    </div>
  );
}

export default function CampaignPanel() {
  const {
    campaigns,
    activeCampaignId,
    selectedLevelId,
    campaignPanelOpen,
    setCampaignPanelOpen,
    createCampaign,
    renameCampaign,
    deleteCampaign,
    setActiveCampaignId,
    addLevelToCampaign,
    exportCampaign,
    requestCampaignImport,
    operationLog,
    canUndo,
    canRedo,
    undo,
    redo,
    updateLevelData,
    getSelectedLevel,
  } = useCampaignStore();

  const { present, addToast } = useEditorStore();

  const [newCampaignName, setNewCampaignName] = useState('');
  const [isRenamingCampaign, setIsRenamingCampaign] = useState(false);
  const [renameCampaignValue, setRenameCampaignValue] = useState('');
  const [showDeleteCampaignConfirm, setShowDeleteCampaignConfirm] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) || null;
  const sortedLevels = activeCampaign
    ? [...activeCampaign.levels].sort((a, b) => a.order - b.order)
    : [];

  const handleCreateCampaign = useCallback(() => {
    const name = newCampaignName.trim() || `战役 ${campaigns.length + 1}`;
    createCampaign(name);
    setNewCampaignName('');
  }, [newCampaignName, campaigns.length, createCampaign]);

  const handleRenameCampaignConfirm = useCallback(() => {
    if (activeCampaign && renameCampaignValue.trim()) {
      renameCampaign(activeCampaign.id, renameCampaignValue.trim());
    }
    setIsRenamingCampaign(false);
  }, [activeCampaign, renameCampaignValue, renameCampaign]);

  const handleRenameCampaignCancel = useCallback(() => {
    if (activeCampaign) {
      setRenameCampaignValue(activeCampaign.name);
    }
    setIsRenamingCampaign(false);
  }, [activeCampaign]);

  const handleDeleteCampaign = useCallback(() => {
    if (activeCampaign) {
      deleteCampaign(activeCampaign.id);
      setShowDeleteCampaignConfirm(false);
    }
  }, [activeCampaign, deleteCampaign]);

  const handleAddCurrentLevel = useCallback(() => {
    if (activeCampaignId) {
      const newLevel = addLevelToCampaign(activeCampaignId, present, present.name || '未命名关卡');
      addToast('success', `已添加关卡「${newLevel.name}」到战役`);
    } else {
      addToast('warning', '请先创建或选择一个战役');
    }
  }, [activeCampaignId, present, addLevelToCampaign, addToast]);

  const handleSaveCurrentToLevel = useCallback(() => {
    if (activeCampaignId && selectedLevelId) {
      updateLevelData(activeCampaignId, selectedLevelId, present);
      const selectedLevel = getSelectedLevel();
      addToast('success', `已保存到战役关卡「${selectedLevel?.name || '未命名'}」`);
    } else {
      addToast('warning', '请先选择一个战役关卡');
    }
  }, [activeCampaignId, selectedLevelId, present, updateLevelData, getSelectedLevel, addToast]);

  const handleExport = useCallback(() => {
    if (activeCampaignId) {
      exportCampaign(activeCampaignId);
    }
  }, [activeCampaignId, exportCampaign]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      requestCampaignImport(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast('error', `读取文件失败：${msg}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [requestCampaignImport, addToast]);

  const recentLog = [...operationLog].reverse().slice(0, 20);

  return (
    <div
      className={`fixed right-2 top-14 z-40 transition-all duration-300 ease-in-out
                  ${campaignPanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}
    >
      <div className="glass-panel-strong w-80 flex flex-col rounded-xl overflow-hidden shadow-xl border border-white/10">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <h2 className="text-sm font-bold text-abyss-50 flex items-center gap-2">
            <BookOpen size={16} className="text-emeraldx-400" />
            战役关卡
            <span className="text-[10px] font-normal text-abyss-400">({campaigns.length})</span>
          </h2>
          <button
            onClick={() => setCampaignPanelOpen(false)}
            className="text-abyss-300 hover:text-amberx-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <select
              className="input-field text-sm flex-1 h-8"
              value={activeCampaignId || ''}
              onChange={(e) => {
                const id = e.target.value;
                setActiveCampaignId(id || null);
              }}
            >
              <option value="">-- 选择战役 --</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              className="input-field text-sm flex-1 h-8"
              placeholder="新战役名称"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCampaign(); }}
            />
            <button
              className="btn-primary text-xs px-3 py-1.5 h-8 shrink-0 flex items-center gap-1"
              onClick={handleCreateCampaign}
            >
              <Plus size={14} />
              <span>新建</span>
            </button>
          </div>

          {activeCampaign && (
            <div className="flex items-center gap-2">
              {isRenamingCampaign ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    className="input-field text-sm flex-1 h-7"
                    value={renameCampaignValue}
                    onChange={(e) => setRenameCampaignValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameCampaignConfirm();
                      if (e.key === 'Escape') handleRenameCampaignCancel();
                    }}
                    autoFocus
                  />
                  <button className="text-emeraldx-400 hover:text-emeraldx-300 p-0.5" onClick={handleRenameCampaignConfirm}>
                    <Check size={14} />
                  </button>
                  <button className="text-abyss-300 hover:text-abyss-100 p-0.5" onClick={handleRenameCampaignCancel}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
                    onClick={() => {
                      setRenameCampaignValue(activeCampaign.name);
                      setIsRenamingCampaign(true);
                    }}
                  >
                    <Edit3 size={12} />
                    <span>重命名</span>
                  </button>
                  <button
                    className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1 text-coral-400 hover:text-coral-300"
                    onClick={() => setShowDeleteCampaignConfirm(true)}
                  >
                    <Trash2 size={12} />
                    <span>删除</span>
                  </button>
                </>
              )}
            </div>
          )}

          {showDeleteCampaignConfirm && (
            <div className="mt-2 p-2 bg-coral-500/10 border border-coral-500/30 rounded-lg text-xs">
              <div className="text-coral-400 mb-2">确认删除战役「{activeCampaign?.name}」？</div>
              <div className="text-abyss-400 mb-2">所有关卡和进度都将被删除</div>
              <div className="flex gap-2">
                <button className="btn-danger text-xs px-2 py-1 flex-1" onClick={handleDeleteCampaign}>
                  确认删除
                </button>
                <button className="btn-ghost text-xs px-2 py-1 flex-1" onClick={() => setShowDeleteCampaignConfirm(false)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={handleAddCurrentLevel}
              title="将当前编辑器中的关卡添加到战役"
            >
              <Plus size={14} />
              <span>添加当前关卡</span>
            </button>
          </div>
          {selectedLevelId && (
            <div className="flex items-center gap-2 mt-2">
              <button
                className="btn-primary text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
                onClick={handleSaveCurrentToLevel}
                title="将编辑器中的修改保存到选中的战役关卡"
              >
                <Save size={14} />
                <span>保存到战役</span>
              </button>
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={handleExport}
              disabled={!activeCampaignId}
              title="导出战役包为 JSON"
            >
              <Download size={14} />
              <span>导出</span>
            </button>
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1"
              onClick={handleImportClick}
              title="从 JSON 文件导入战役包"
            >
              <Upload size={14} />
              <span>导入</span>
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

        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
              onClick={undo}
              disabled={!canUndo()}
            >
              <ChevronLeft size={14} />
              <span>撤销</span>
            </button>
            <button
              className="btn-ghost text-xs px-2 py-1.5 h-7 flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
              onClick={redo}
              disabled={!canRedo()}
            >
              <span>重做</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-64">
          {!activeCampaign && (
            <div className="text-center text-abyss-400 text-sm py-6">
              请先选择或创建战役<br />
              <span className="text-xs">点击「新建」创建第一个战役</span>
            </div>
          )}
          {activeCampaign && sortedLevels.length === 0 && (
            <div className="text-center text-abyss-400 text-sm py-6">
              暂无关卡<br />
              <span className="text-xs">点击「添加当前关卡」添加</span>
            </div>
          )}
          {sortedLevels.map((level) => (
            <LevelItem
              key={level.id}
              level={level}
              isSelected={level.id === selectedLevelId}
              campaignId={activeCampaignId!}
            />
          ))}
        </div>

        {activeCampaign && (
          <div className="border-t border-white/10 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-abyss-400">进度</span>
              <span className="text-abyss-200">
                {activeCampaign.levels.filter((l) => l.playResult?.completed).length} / {activeCampaign.levels.length} 通关
              </span>
            </div>
            <div className="mt-1 h-1.5 bg-abyss-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emeraldx-500 transition-all duration-300"
                style={{
                  width: activeCampaign.levels.length > 0
                    ? `${(activeCampaign.levels.filter((l) => l.playResult?.completed).length / activeCampaign.levels.length) * 100}%`
                    : '0%',
                }}
              />
            </div>
          </div>
        )}

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
                      {CAMPAIGN_ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    {entry.campaignName && (
                      <span className="text-abyss-200 truncate">「{entry.campaignName}」</span>
                    )}
                    {entry.levelName && (
                      <span className="text-abyss-300 truncate">· {entry.levelName}</span>
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
