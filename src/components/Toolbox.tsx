import { useEffect } from 'react';
import { TILE_LABELS } from '@/types';
import { useEditorStore } from '@/store/useEditorStore';

export default function Toolbox() {
  const selectedTool = useEditorStore((s) => s.selectedTool);
  const setSelectedTool = useEditorStore((s) => s.setSelectedTool);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= TILE_LABELS.length) {
        setSelectedTool(TILE_LABELS[num - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedTool]);

  return (
    <div className="glass-panel w-20 flex flex-col gap-1 p-2">
      <div className="section-title text-center text-xs mb-1">工具箱</div>
      {TILE_LABELS.map((tool) => (
        <button
          key={tool.id}
          className={`tool-btn ${selectedTool === tool.id ? 'tool-btn-active' : ''}`}
          onClick={() => setSelectedTool(tool.id)}
        >
          <span>{tool.emoji}</span>
          <span className="text-[10px] leading-tight">{tool.label}</span>
          <span className="text-[9px] opacity-50">{tool.hotkey}</span>
        </button>
      ))}
    </div>
  );
}
