import type { Position, LevelData, TileType } from '@/types';
import { TileType as TT } from '@/types';

export function createEmptyTiles(width: number, height: number): TileType[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => TT.EMPTY as TileType)
  );
}

export function cloneTiles(tiles: TileType[][]): TileType[][] {
  return tiles.map((row) => [...row]);
}

export function setTile(
  tiles: TileType[][],
  x: number,
  y: number,
  tile: TileType
): TileType[][] {
  const newTiles = cloneTiles(tiles);
  if (y >= 0 && y < newTiles.length && x >= 0 && x < newTiles[0].length) {
    newTiles[y][x] = tile;
  }
  return newTiles;
}

export function findPositions(
  tiles: TileType[][],
  tileType: TileType
): Position[] {
  const result: Position[] = [];
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === tileType) result.push({ x, y });
    }
  }
  return result;
}

export function rebuildDerivedFromTiles(level: LevelData): LevelData {
  const tiles = level.tiles;
  const starts = findPositions(tiles, TT.START);
  const targets = findPositions(tiles, TT.TARGET);
  const boxes = findPositions(tiles, TT.BOX);
  const doors = findPositions(tiles, TT.DOOR);
  const switchPositions = findPositions(tiles, TT.SWITCH);

  const existingSwitchIds = new Map<string, { pos: Position; id: string }>();
  for (const s of level.switches) {
    existingSwitchIds.set(`${s.pos.x},${s.pos.y}`, s);
  }
  const switches = switchPositions.map((pos) => {
    const key = `${pos.x},${pos.y}`;
    if (existingSwitchIds.has(key)) return existingSwitchIds.get(key)!;
    return { pos, id: `sw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  });

  return {
    ...level,
    playerStart: starts[0] ?? level.playerStart ?? { x: 0, y: 0 },
    targets,
    boxes,
    doors,
    switches,
  };
}

export function posEquals(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function posInList(pos: Position, list: Position[]): boolean {
  return list.some((p) => posEquals(p, pos));
}

export function resizeLevel(
  level: LevelData,
  newWidth: number,
  newHeight: number
): LevelData {
  const newTiles: TileType[][] = [];
  for (let y = 0; y < newHeight; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < newWidth; x++) {
      row.push(
        y < level.tiles.length && x < level.tiles[y].length
          ? level.tiles[y][x]
          : (TT.EMPTY as TileType)
      );
    }
    newTiles.push(row);
  }
  const rebuilt = rebuildDerivedFromTiles({ ...level, tiles: newTiles, width: newWidth, height: newHeight });
  return { ...rebuilt, width: newWidth, height: newHeight };
}
