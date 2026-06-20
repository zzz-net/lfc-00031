import { useState, useEffect } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { X, Save, Star, Target, Footprints, Lock, Unlock, FileText } from 'lucide-react';
import { UnlockConditionType } from '@/types';
import type { CampaignLevelMeta, UnlockCondition } from '@/types';

export default function LevelMetaEditor() {
  const {
    levelMetaEditorOpen,
    setLevelMetaEditorOpen,
    editingLevelId,
    getActiveCampaign,
    updateLevelMeta,
    activeCampaignId,
  } = useCampaignStore();

  const campaign = getActiveCampaign();
  const level = editingLevelId
    ? campaign?.levels.find((l) => l.id === editingLevelId)
    : null;

  const [formData, setFormData] = useState<CampaignLevelMeta | null>(null);

  useEffect(() => {
    if (level) {
      setFormData({ ...level.meta });
    } else {
      setFormData(null);
    }
  }, [level]);

  const handleClose = () => {
    setLevelMetaEditorOpen(false);
  };

  const handleSave = () => {
    if (!activeCampaignId || !editingLevelId || !formData) return;
    updateLevelMeta(activeCampaignId, editingLevelId, formData);
    setLevelMetaEditorOpen(false);
  };

  const handleUnlockTypeChange = (type: UnlockConditionType) => {
    if (!formData) return;
    const newCondition: UnlockCondition = { type };
    if (type === UnlockConditionType.PREVIOUS_LEVEL_STARS) {
      newCondition.requiredStars = 2;
    }
    if (type === UnlockConditionType.CUSTOM_CONDITION) {
      newCondition.customDescription = '';
    }
    setFormData({ ...formData, unlockCondition: newCondition });
  };

  if (!levelMetaEditorOpen || !level || !formData) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative glass-panel-strong w-[480px] rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-abyss-50 flex items-center gap-2">
            <FileText size={18} className="text-emeraldx-400" />
            关卡元数据
          </h3>
          <button
            onClick={handleClose}
            className="text-abyss-300 hover:text-amberx-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <Target size={14} className="text-amberx-400" />
              关卡名称
            </label>
            <input
              className="input-field text-sm w-full"
              value={level.name}
              disabled
            />
            <p className="text-[10px] text-abyss-500 mt-1">关卡名称在列表中修改</p>
          </div>

          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <Target size={14} className="text-amberx-400" />
              通关目标描述
            </label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              value={formData.goalDescription}
              onChange={(e) => setFormData({ ...formData, goalDescription: e.target.value })}
              placeholder="描述本关的通关目标..."
            />
          </div>

          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <Footprints size={14} className="text-emeraldx-400" />
              推荐步数上限
            </label>
            <input
              type="number"
              min={1}
              className="input-field text-sm w-full"
              value={formData.recommendedSteps}
              onChange={(e) => setFormData({ ...formData, recommendedSteps: parseInt(e.target.value) || 1 })}
            />
            <p className="text-[10px] text-abyss-500 mt-1">达到该步数以内可获得三星评价</p>
          </div>

          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <Star size={14} className="text-amberx-400" />
              星级门槛（步数）
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1 text-xs text-abyss-400 mb-1">
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <span>1星</span>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input-field text-sm w-full"
                  value={formData.starsThreshold[0]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    const newThreshold: [number, number, number] = [
                      val,
                      Math.max(val, formData.starsThreshold[1]),
                      Math.max(val, formData.starsThreshold[2]),
                    ];
                    setFormData({ ...formData, starsThreshold: newThreshold });
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 text-xs text-abyss-400 mb-1">
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <span>2星</span>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input-field text-sm w-full"
                  value={formData.starsThreshold[1]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    const newThreshold: [number, number, number] = [
                      Math.min(val, formData.starsThreshold[0]),
                      val,
                      Math.max(val, formData.starsThreshold[2]),
                    ];
                    setFormData({ ...formData, starsThreshold: newThreshold });
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 text-xs text-abyss-400 mb-1">
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <Star size={12} className="text-amberx-400 fill-amberx-400" />
                  <span>3星</span>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input-field text-sm w-full"
                  value={formData.starsThreshold[2]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    const newThreshold: [number, number, number] = [
                      Math.min(val, formData.starsThreshold[0]),
                      Math.min(val, formData.starsThreshold[1]),
                      val,
                    ];
                    setFormData({ ...formData, starsThreshold: newThreshold });
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <Unlock size={14} className="text-emeraldx-400" />
              解锁条件
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-abyss-300 cursor-pointer hover:text-abyss-100">
                <input
                  type="radio"
                  checked={formData.unlockCondition.type === UnlockConditionType.ALWAYS_UNLOCKED}
                  onChange={() => handleUnlockTypeChange(UnlockConditionType.ALWAYS_UNLOCKED)}
                  className="text-emeraldx-500"
                />
                <span>始终解锁</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-abyss-300 cursor-pointer hover:text-abyss-100">
                <input
                  type="radio"
                  checked={formData.unlockCondition.type === UnlockConditionType.PREVIOUS_LEVEL_CLEARED}
                  onChange={() => handleUnlockTypeChange(UnlockConditionType.PREVIOUS_LEVEL_CLEARED)}
                  className="text-emeraldx-500"
                />
                <span>通关上一关后解锁</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-abyss-300 cursor-pointer hover:text-abyss-100">
                <input
                  type="radio"
                  checked={formData.unlockCondition.type === UnlockConditionType.PREVIOUS_LEVEL_STARS}
                  onChange={() => handleUnlockTypeChange(UnlockConditionType.PREVIOUS_LEVEL_STARS)}
                  className="text-emeraldx-500"
                />
                <span>上一关达到指定星数</span>
                {formData.unlockCondition.type === UnlockConditionType.PREVIOUS_LEVEL_STARS && (
                  <input
                    type="number"
                    min={1}
                    max={3}
                    className="input-field text-xs w-16 h-6"
                    value={formData.unlockCondition.requiredStars || 2}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(3, parseInt(e.target.value) || 1));
                      setFormData({
                        ...formData,
                        unlockCondition: { ...formData.unlockCondition, requiredStars: val },
                      });
                    }}
                  />
                )}
              </label>
              <label className="flex items-center gap-2 text-sm text-abyss-300 cursor-pointer hover:text-abyss-100">
                <input
                  type="radio"
                  checked={formData.unlockCondition.type === UnlockConditionType.CUSTOM_CONDITION}
                  onChange={() => handleUnlockTypeChange(UnlockConditionType.CUSTOM_CONDITION)}
                  className="text-emeraldx-500"
                />
                <span>自定义条件</span>
              </label>
              {formData.unlockCondition.type === UnlockConditionType.CUSTOM_CONDITION && (
                <input
                  className="input-field text-xs w-full"
                  placeholder="自定义解锁条件描述..."
                  value={formData.unlockCondition.customDescription || ''}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      unlockCondition: { ...formData.unlockCondition, customDescription: e.target.value },
                    });
                  }}
                />
              )}
            </div>
          </div>

          <div>
            <label className="text-sm text-abyss-200 font-medium mb-1.5 flex items-center gap-1.5">
              <FileText size={14} className="text-abyss-400" />
              备注
            </label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="设计笔记、提示信息等..."
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="btn-ghost text-sm px-4 py-2"
            onClick={handleClose}
          >
            取消
          </button>
          <button
            className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
            onClick={handleSave}
          >
            <Save size={14} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
