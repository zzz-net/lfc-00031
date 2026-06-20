import { useEffect, useCallback } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { Direction } from '@/types';
import type { MoveStep } from '@/types';

const DIR_ARROW: Record<Direction, string> = {
  [Direction.UP]: '↑',
  [Direction.DOWN]: '↓',
  [Direction.LEFT]: '←',
  [Direction.RIGHT]: '→',
};

const DIR_LABEL: Record<Direction, string> = {
  [Direction.UP]: '上',
  [Direction.DOWN]: '下',
  [Direction.LEFT]: '左',
  [Direction.RIGHT]: '右',
};

const KEY_DIR_MAP: Record<string, Direction> = {
  ArrowUp: Direction.UP,
  ArrowDown: Direction.DOWN,
  ArrowLeft: Direction.LEFT,
  ArrowRight: Direction.RIGHT,
  w: Direction.UP,
  W: Direction.UP,
  s: Direction.DOWN,
  S: Direction.DOWN,
  a: Direction.LEFT,
  A: Direction.LEFT,
  d: Direction.RIGHT,
  D: Direction.RIGHT,
};

function DirButton({ dir, onClick, disabled }: { dir: Direction; onClick: (d: Direction) => void; disabled: boolean }) {
  return (
    <button
      className="btn-ghost w-10 h-10 flex items-center justify-center text-lg p-0"
      disabled={disabled}
      onClick={() => onClick(dir)}
      title={DIR_LABEL[dir]}
    >
      {DIR_ARROW[dir]}
    </button>
  );
}

export default function ControlBar() {
  const present = useEditorStore((s) => s.present);
  const isRecording = useEditorStore((s) => s.isRecording);
  const currentStepIndex = useEditorStore((s) => s.currentStepIndex);
  const startRecording = useEditorStore((s) => s.startRecording);
  const stopRecording = useEditorStore((s) => s.stopRecording);
  const recordStep = useEditorStore((s) => s.recordStep);
  const clearMoveLog = useEditorStore((s) => s.clearMoveLog);
  const jumpToStep = useEditorStore((s) => s.jumpToStep);
  const resetSimulation = useEditorStore((s) => s.resetSimulation);
  const addToast = useEditorStore((s) => s.addToast);

  const moveLog = present.moveLog;
  const invalidated = present.moveLogInvalidated;

  const handleMove = useCallback((dir: Direction) => {
    const err = recordStep(dir);
    if (err) addToast('error', err);
  }, [recordStep, addToast]);

  useEffect(() => {
    if (!isRecording) return;
    const handler = (e: KeyboardEvent) => {
      const dir = KEY_DIR_MAP[e.key];
      if (!dir) return;
      e.preventDefault();
      handleMove(dir);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isRecording, handleMove]);

  return (
    <div className="glass-panel flex items-center gap-4 px-4 py-3">
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <DirButton dir={Direction.UP} onClick={handleMove} disabled={!isRecording} />
        <div className="flex gap-0.5">
          <DirButton dir={Direction.LEFT} onClick={handleMove} disabled={!isRecording} />
          <DirButton dir={Direction.DOWN} onClick={handleMove} disabled={!isRecording} />
          <DirButton dir={Direction.RIGHT} onClick={handleMove} disabled={!isRecording} />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto flex items-center gap-1.5 min-w-0 py-1">
        {moveLog.length === 0 && (
          <span className="text-abyss-300 text-xs">暂无步骤</span>
        )}
        {moveLog.map((step: MoveStep, i: number) => {
          const isCurrent = i === currentStepIndex;
          const isInvalid = invalidated;
          return (
            <button
              key={i}
              onClick={() => jumpToStep(i)}
              className={[
                'chip shrink-0 cursor-pointer transition-all text-xs',
                isCurrent ? 'border-amberx-500 text-amberx-400 bg-amberx-500/10' : 'border-white/10 text-abyss-100 bg-white/5 hover:bg-white/10',
                isInvalid ? 'line-through opacity-50' : '',
              ].join(' ')}
            >
              {DIR_ARROW[step.direction]}{i + 1}
              {isInvalid && <span className="ml-1 text-coral-400 text-[10px]">失效</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          className={isRecording ? 'btn-danger animate-pulseRed' : 'btn-primary'}
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? '⏹ 停止' : '⏺ 录制'}
        </button>
        <button className="btn-ghost text-sm" onClick={clearMoveLog} disabled={moveLog.length === 0}>
          清除
        </button>
        <button className="btn-ghost text-sm" onClick={resetSimulation} disabled={!isRecording}>
          重置
        </button>
      </div>
    </div>
  );
}
