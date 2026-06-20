import { useState, useCallback } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { TileType, TOOL_TO_TILE } from '@/types';
import type { ToolId } from '@/types';

const CELL_BASE = 40;

const TILE_EMOJI: Record<number, string> = {
  [TileType.EMPTY]: '',
  [TileType.WALL]: '🧱',
  [TileType.START]: '🚶',
  [TileType.TARGET]: '🎯',
  [TileType.BOX]: '📦',
  [TileType.SWITCH]: '🔘',
  [TileType.DOOR]: '🚪',
  [TileType.FLOOR]: '',
};

const TILE_BG: Record<number, string> = {
  [TileType.EMPTY]: 'bg-abyss-900',
  [TileType.WALL]: 'bg-abyss-700',
  [TileType.START]: 'bg-emeraldx-900/40',
  [TileType.TARGET]: 'bg-amberx-900/40',
  [TileType.BOX]: 'bg-amberx-900/20',
  [TileType.SWITCH]: 'bg-purple-900/30',
  [TileType.DOOR]: 'bg-coral-900/30',
  [TileType.FLOOR]: 'bg-abyss-800',
};

function isDoorOpen(doorX: number, doorY: number, pressedSwitchIds: string[], switches: { pos: { x: number; y: number }; id: string }[], rules: { switchDoors: { switchId: string; doorPositions: { x: number; y: number }[]; inverted: boolean }[] }): boolean {
  for (const rule of rules.switchDoors) {
    const doorPos = rule.doorPositions.find(p => p.x === doorX && p.y === doorY);
    if (!doorPos) continue;
    const isPressed = pressedSwitchIds.includes(rule.switchId);
    return rule.inverted ? !isPressed : isPressed;
  }
  return false;
}

export default function GridEditor() {
  const present = useEditorStore(s => s.present);
  const selectedTool = useEditorStore(s => s.selectedTool);
  const setTileAt = useEditorStore(s => s.setTileAt);
  const simulationState = useEditorStore(s => s.simulationState);
  const isRecording = useEditorStore(s => s.isRecording);
  const gridZoom = useEditorStore(s => s.gridZoom);
  const setGridZoom = useEditorStore(s => s.setGridZoom);

  const [isPainting, setIsPainting] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const cellSize = CELL_BASE * gridZoom;

  const handlePaint = useCallback((x: number, y: number) => {
    if (isRecording) return;
    const tile = TOOL_TO_TILE[selectedTool as ToolId];
    if (tile !== undefined) setTileAt(x, y, tile);
  }, [isRecording, selectedTool, setTileAt]);

  const handleMouseDown = useCallback((x: number, y: number) => {
    setIsPainting(true);
    handlePaint(x, y);
  }, [handlePaint]);

  const handleMouseMove = useCallback((x: number, y: number) => {
    setHoveredCell({ x, y });
    if (isPainting) handlePaint(x, y);
  }, [isPainting, handlePaint]);

  const handleMouseUp = useCallback(() => {
    setIsPainting(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setIsPainting(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setGridZoom(gridZoom + delta);
  }, [gridZoom, setGridZoom]);

  const { tiles, width, height } = present;

  const playerPos = simulationState?.playerPos;
  const simBoxes = simulationState?.boxes ?? [];
  const pressedIds = simulationState?.pressedSwitchIds ?? [];

  const boxSet = new Set(simBoxes.map(b => `${b.x},${b.y}`));

  return (
    <div
      className="glass-panel flex-1 overflow-auto p-4"
      onWheel={handleWheel}
      onMouseUp={handleMouseUp}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
          gap: '1px',
          width: 'fit-content',
        }}
        onMouseLeave={handleMouseLeave}
      >
        {tiles.map((row, y) =>
          row.map((tile, x) => {
            const isPlayer = playerPos && playerPos.x === x && playerPos.y === y;
            const isBox = boxSet.has(`${x},${y}`);
            const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
            const doorOpen = tile === TileType.DOOR && simulationState
              ? isDoorOpen(x, y, pressedIds, present.switches, present.rules)
              : false;

            let emoji = '';
            let bgClass = TILE_BG[tile] ?? 'bg-abyss-900';
            let overlay = '';

            if (isRecording && simulationState) {
              if (isPlayer) {
                emoji = '🚶';
                overlay = 'bg-emeraldx-500/20';
              } else if (isBox) {
                emoji = '📹';
                overlay = 'bg-amberx-500/20';
              } else {
                emoji = TILE_EMOJI[tile] ?? '';
              }
              if (doorOpen) {
                overlay = 'opacity-40';
              }
            } else {
              emoji = TILE_EMOJI[tile] ?? '';
            }

            return (
              <div
                key={`${x}-${y}`}
                className={`${bgClass} ${overlay} ${isHovered && !isRecording ? 'ring-2 ring-amberx-400/60' : ''} border border-white/10 flex items-center justify-center select-none cursor-crosshair transition-colors duration-75`}
                style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.55 }}
                onMouseDown={() => handleMouseDown(x, y)}
                onMouseMove={() => handleMouseMove(x, y)}
              >
                {emoji}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
