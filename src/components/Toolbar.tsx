import { useRef, useCallback, useState } from 'react';
import {
  Undo2,
  Redo2,
  FilePlus,
  Upload,
  Download,
  Save,
  CheckCircle,
  ChevronDown,
  Camera,
  BookOpen,
} from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';

const SAMPLE_LABELS = ['新手教程', '经典推箱', '机关迷宫'];

export default function Toolbar() {
  const present = useEditorStore((s) => s.present);
  const lastValidation = useEditorStore((s) => s.lastValidation);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const snapshots = useEditorStore((s) => s.snapshots);
  const snapshotPanelOpen = useEditorStore((s) => s.snapshotPanelOpen);
  const setSnapshotPanelOpen = useEditorStore((s) => s.setSnapshotPanelOpen);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const campaignPanelOpen = useCampaignStore((s) => s.campaignPanelOpen);
  const setCampaignPanelOpen = useCampaignStore((s) => s.setCampaignPanelOpen);

  const newLevel = useEditorStore((s) => s.newLevel);
  const loadSample = useEditorStore((s) => s.loadSample);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const validate = useEditorStore((s) => s.validate);
  const exportLevel = useEditorStore((s) => s.exportLevel);
  const requestImportWithConflict = useEditorStore((s) => s.requestImportWithConflict);
  const saveDraft = useEditorStore((s) => s.saveDraft);
  const setLevelName = useEditorStore((s) => s.setLevelName);
  const resizeLevelTo = useEditorStore((s) => s.resizeLevelTo);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resizeW, setResizeW] = useState(present.width);
  const [resizeH, setResizeH] = useState(present.height);
  const [sampleOpen, setSampleOpen] = useState(false);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        requestImportWithConflict(text);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [requestImportWithConflict],
  );

  const handleApplyResize = useCallback(() => {
    const w = Math.max(3, Math.min(50, resizeW));
    const h = Math.max(3, Math.min(50, resizeH));
    resizeLevelTo(w, h);
  }, [resizeW, resizeH, resizeLevelTo]);

  const validIconClass = lastValidation?.valid
    ? 'text-emerald-400'
    : lastValidation && !lastValidation.valid
      ? 'text-coral-400'
      : '';

  return (
    <div className="glass-panel flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-2 pr-3 border-r border-white/10">
        <input
          className={cn('input-field w-40 text-sm')}
          value={present.name}
          onChange={(e) => setLevelName(e.target.value)}
          placeholder="关卡名称"
        />
        <span className="text-xs text-abyss-300 font-mono tabular-nums">
          {present.width}×{present.height}
        </span>
        <input
          type="number"
          className={cn('input-field w-14 text-sm text-center')}
          min={3}
          max={50}
          value={resizeW}
          onChange={(e) => setResizeW(Number(e.target.value))}
        />
        <span className="text-abyss-400 text-xs">×</span>
        <input
          type="number"
          className={cn('input-field w-14 text-sm text-center')}
          min={3}
          max={50}
          value={resizeH}
          onChange={(e) => setResizeH(Number(e.target.value))}
        />
        <button className="btn-ghost text-xs px-2 py-1" onClick={handleApplyResize}>
          应用
        </button>
      </div>

      <div className="flex items-center gap-1 pr-3 border-r border-white/10">
        <button
          className="btn-ghost px-2 py-1"
          disabled={!canUndo()}
          onClick={undo}
          title="撤销 Ctrl+Z"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="btn-ghost px-2 py-1"
          disabled={!canRedo()}
          onClick={redo}
          title="重做 Ctrl+Y"
        >
          <Redo2 size={16} />
        </button>
        <span className="text-[10px] text-abyss-400 ml-1 select-none">
          Ctrl+Z / Ctrl+Y
        </span>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button className="btn-ghost px-2 py-1" onClick={() => newLevel()} title="新建关卡">
          <FilePlus size={16} />
        </button>

        <div className="relative">
          <button
            className="btn-ghost px-2 py-1 flex items-center gap-1"
            onClick={() => setSampleOpen((v) => !v)}
          >
            <ChevronDown size={14} />
            <span className="text-xs">样例</span>
          </button>
          {sampleOpen && (
            <div className="absolute top-full left-0 mt-1 glass-panel-strong p-1 z-50 min-w-[120px]">
              {SAMPLE_LABELS.map((label, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-white/10 transition-colors"
                  onClick={() => {
                    loadSample(i);
                    setSampleOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn-ghost px-2 py-1" onClick={handleImportClick} title="导入关卡">
          <Upload size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />

        <button className="btn-ghost px-2 py-1" onClick={exportLevel} title="导出关卡">
          <Download size={16} />
        </button>

        <button className="btn-ghost px-2 py-1" onClick={saveDraft} title="保存草稿">
          <Save size={16} />
        </button>

        <button
          className={cn('btn-ghost px-2 py-1 relative', snapshotPanelOpen && 'bg-white/10')}
          onClick={() => setSnapshotPanelOpen(!snapshotPanelOpen)}
          title="草稿快照"
        >
          <Camera size={16} />
          {snapshots.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-amberx-500 text-abyss-900 rounded-full flex items-center justify-center">
              {snapshots.length}
            </span>
          )}
        </button>

        <button
          className={cn('btn-ghost px-2 py-1 relative', campaignPanelOpen && 'bg-white/10')}
          onClick={() => setCampaignPanelOpen(!campaignPanelOpen)}
          title="战役关卡"
        >
          <BookOpen size={16} />
          {campaigns.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-emeraldx-500 text-abyss-900 rounded-full flex items-center justify-center">
              {campaigns.length}
            </span>
          )}
        </button>

        <button
          className={cn('btn-primary px-3 py-1 flex items-center gap-1', validIconClass && '!bg-transparent !from-transparent !to-transparent border border-white/10')}
          onClick={validate}
          title="校验关卡"
        >
          <CheckCircle size={16} className={validIconClass} />
          <span className="text-xs">校验</span>
        </button>
      </div>
    </div>
  );
}
