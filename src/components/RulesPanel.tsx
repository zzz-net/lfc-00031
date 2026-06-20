import { useEditorStore } from '@/store/useEditorStore';
import { WinCondition, SwitchDoorRule } from '@/types';
import { Settings, X, Plus, Trash2 } from 'lucide-react';

const WIN_CONDITION_OPTIONS: { value: WinCondition; label: string }[] = [
  { value: WinCondition.ALL_BOXES_ON_TARGETS, label: '所有箱子到目标' },
  { value: WinCondition.REACH_TARGET, label: '到达目标位置' },
  { value: WinCondition.ALL_SWITCHES_PRESSED, label: '所有机关已触发' },
];

export default function RulesPanel() {
  const rulesPanelOpen = useEditorStore((s) => s.rulesPanelOpen);
  const setRulesPanelOpen = useEditorStore((s) => s.setRulesPanelOpen);
  const rules = useEditorStore((s) => s.present.rules);
  const switches = useEditorStore((s) => s.present.switches);
  const updateRules = useEditorStore((s) => s.updateRules);
  const addSwitchDoorRule = useEditorStore((s) => s.addSwitchDoorRule);
  const removeSwitchDoorRule = useEditorStore((s) => s.removeSwitchDoorRule);

  const handleAddRule = () => {
    const usedIds = new Set(rules.switchDoors.map((r) => r.switchId));
    const available = switches.find((s) => !usedIds.has(s.id));
    const rule: SwitchDoorRule = {
      switchId: available?.id ?? '',
      doorPositions: [],
      inverted: false,
    };
    addSwitchDoorRule(rule);
  };

  return (
    <>
      {!rulesPanelOpen && (
        <button
          onClick={() => setRulesPanelOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40
                     bg-abyss-700/80 backdrop-blur-md border border-white/10
                     rounded-l-xl p-3 text-abyss-100 hover:text-amberx-400
                     hover:bg-abyss-600/80 transition-all"
        >
          <Settings size={20} />
        </button>
      )}

      <div
        className={`fixed right-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out
                    ${rulesPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="glass-panel-strong w-72 h-full flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-abyss-50">规则配置</h2>
            <button
              onClick={() => setRulesPanelOpen(false)}
              className="text-abyss-100 hover:text-amberx-400 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="section-title">胜利条件</div>
          <select
            value={rules.winCondition}
            onChange={(e) => updateRules({ winCondition: e.target.value as WinCondition })}
            className="input-field mb-4"
          >
            {WIN_CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="section-title">箱子规则</div>
          <label className="flex items-center gap-2 mb-2 text-sm text-abyss-100 cursor-pointer">
            <input
              type="checkbox"
              checked={rules.allowPushBoxOnSwitch}
              onChange={(e) => updateRules({ allowPushBoxOnSwitch: e.target.checked })}
              className="accent-amberx-500"
            />
            允许将箱子推到机关上
          </label>
          <label className="flex items-center gap-2 mb-4 text-sm text-abyss-100 cursor-pointer">
            <input
              type="checkbox"
              checked={rules.playerCanWalkOnSwitches}
              onChange={(e) => updateRules({ playerCanWalkOnSwitches: e.target.checked })}
              className="accent-amberx-500"
            />
            玩家可走在机关上
          </label>

          <div className="section-title">机关-门关联</div>
          <div className="flex-1 space-y-2 mb-3">
            {rules.switchDoors.length === 0 && (
              <p className="text-xs text-abyss-300 italic">暂无关联规则</p>
            )}
            {rules.switchDoors.map((rule, i) => (
              <div
                key={i}
                className="bg-abyss-800/60 border border-white/10 rounded-lg p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-abyss-200 font-medium">
                    机关: <span className="text-amberx-400">{rule.switchId || '—'}</span>
                  </span>
                  <button
                    onClick={() => removeSwitchDoorRule(i)}
                    className="text-abyss-300 hover:text-coral-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="text-xs text-abyss-200">
                  门位置: {rule.doorPositions.length > 0
                    ? rule.doorPositions.map((p) => `(${p.x},${p.y})`).join(', ')
                    : '—'}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-abyss-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.inverted}
                    onChange={(e) => {
                      const updated = [...rules.switchDoors];
                      updated[i] = { ...updated[i], inverted: e.target.checked };
                      updateRules({ switchDoors: updated });
                    }}
                    className="accent-amberx-500"
                  />
                  反转逻辑
                </label>
              </div>
            ))}
          </div>
          <button onClick={handleAddRule} className="btn-primary text-sm flex items-center justify-center gap-1.5">
            <Plus size={14} />
            添加关联
          </button>
        </div>
      </div>

      {rulesPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setRulesPanelOpen(false)}
        />
      )}
    </>
  );
}
