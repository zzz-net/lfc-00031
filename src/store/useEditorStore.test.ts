/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { createSampleLevels, exportToJSON, exportSnapshotPackage, parseSnapshotPackage, importSnapshotPackageWithMerge, mergeSnapshots } from '@/utils/serializer';
import { Direction, WinCondition, TileType, STORAGE_KEY, HistoryEntry, SNAPSHOT_STORAGE_KEY, OPERATION_LOG_KEY, ACTIVE_SNAPSHOT_KEY, DraftSnapshot, ValidationResult, HistoryState } from '@/types';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); },
  key: (index: number) => Object.keys(mockLocalStorage)[index] ?? null,
  length: 0,
});

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
  localStorage.clear();
  vi.clearAllTimers();
  vi.useFakeTimers();
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('问题1：录制步骤应该进入撤销/重做历史', () => {
  it('录制一步成功移动后，undo 应能撤销该步骤，moveLog 回到空', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().startRecording();
    expect(s().present.moveLog.length).toBe(0);
    expect(s().past.length).toBe(1);

    const err = s().recordStep(Direction.RIGHT);
    expect(err).toBeNull();
    expect(s().present.moveLog.length).toBe(1);
    expect(s().past.length).toBe(2);

    s().undo();
    expect(s().present.moveLog.length).toBe(0);
    expect(s().past.length).toBe(1);
    expect(s().future.length).toBe(1);

    s().redo();
    expect(s().present.moveLog.length).toBe(1);
    expect(s().past.length).toBe(2);
    expect(s().future.length).toBe(0);
  });

  it('非法移动（撞墙/出界）不推入历史栈，past.length 不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().startRecording();
    const pastLenBefore = s().past.length;

    const origPos = s().present.playerStart;
    const dir = origPos.x === 0 ? Direction.LEFT : Direction.UP;
    const err = s().recordStep(dir);

    expect(err).toBeTypeOf('string');
    expect(err).toMatch(/无法移动|撞墙|边界/);
    expect(s().present.moveLog.length).toBe(0);
    expect(s().past.length).toBe(pastLenBefore);
  });

  it('startRecording 清空 moveLog 也应进入历史栈，可撤销恢复旧步骤', () => {
    const samples = createSampleLevels();
    const level = { ...samples[0], moveLog: [{ direction: Direction.RIGHT, timestamp: 1, playerFrom: { x: 1, y: 1 }, playerTo: { x: 2, y: 1 } }] };
    useEditorStore.setState({ present: level, past: [], future: [] });

    expect(s().present.moveLog.length).toBe(1);
    const pastLenBefore = s().past.length;

    const oldValidate = s().validate;
    s().validate = () => ({ valid: true, errors: [], warnings: [] });
    s().startRecording();

    expect(s().present.moveLog.length).toBe(0);
    expect(s().past.length).toBe(pastLenBefore + 1);

    s().undo();
    expect(s().present.moveLog.length).toBe(1);
    s().validate = oldValidate;
  });
});

describe('问题2：单独校验后的刷新恢复', () => {
  it('单独调用 validate() 后，lastValidation 应被持久化到 localStorage', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], lastValidation: null });

    const result = s().validate();
    expect(result.valid).toBe(true);
    expect(s().lastValidation).not.toBeNull();

    vi.advanceTimersByTime(800);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.lastValidation).not.toBeNull();
    expect(stored.lastValidation.valid).toBe(true);
  });

  it('restoreFromStorage 应正确恢复 lastValidation', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const mockValidation = { valid: false, errors: [{ code: 'E001', message: '测试错误' }], warnings: [] };
    const storedData = {
      past: [{ level, validation: mockValidation }],
      present: level,
      future: [],
      lastValidation: mockValidation,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));

    s().restoreFromStorage();
    expect(s().lastValidation).not.toBeNull();
    expect(s().lastValidation?.valid).toBe(false);
    expect(s().lastValidation?.errors[0].code).toBe('E001');
  });

  it('规则变更后，历史快照中的校验结果不被破坏，撤销后恢复', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().validate();
    const validationAfterValidate = s().lastValidation;
    expect(validationAfterValidate).not.toBeNull();
    expect(validationAfterValidate?.valid).toBe(true);

    s().updateRules({ winCondition: WinCondition.REACH_TARGET });
    expect(s().lastValidation).toBeNull();
    expect(s().past.length).toBe(1);
    expect(s().past[0].validation).not.toBeNull();
    expect(s().past[0].validation?.valid).toBe(true);

    s().undo();
    expect(s().present.rules.winCondition).toBe(WinCondition.ALL_BOXES_ON_TARGETS);
    expect(s().lastValidation).not.toBeNull();
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(validationAfterValidate));
  });
});

describe('undo/redo 时 lastValidation 的一致性', () => {
  it('undo 到历史状态时，lastValidation 恢复为该历史快照的校验结果', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().validate();
    const v1 = s().lastValidation;
    expect(v1).not.toBeNull();
    expect(v1?.valid).toBe(true);

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().lastValidation).toBeNull();

    s().validate();
    const v2 = s().lastValidation;
    expect(v2).not.toBeNull();

    s().undo();
    expect(s().lastValidation).not.toBeNull();
    expect(s().lastValidation?.valid).toBe(true);
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(v1));
  });

  it('redo 到未来状态时，lastValidation 恢复为对应校验结果', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().validate();
    const v1 = s().lastValidation;

    s().setTileAt(0, 0, TileType.FLOOR);
    s().validate();
    const v2 = s().lastValidation;

    s().undo();
    expect(s().lastValidation).toEqual(v1);

    s().redo();
    expect(s().lastValidation).toEqual(v2);
  });

  it('导出 JSON 与当前 present 状态严格一致，与 lastValidation 无关', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().validate();
    const v1 = s().lastValidation;
    expect(v1).not.toBeNull();

    const json1 = JSON.stringify(s().present);
    s().setTileAt(0, 0, TileType.FLOOR);
    const json2 = JSON.stringify(s().present);
    expect(json1).not.toBe(json2);

    s().undo();
    const json3 = JSON.stringify(s().present);
    expect(json3).toBe(json1);
  });
});

describe('非法移动不污染历史', () => {
  it('录制期间撞墙或出界，moveLog 和 past 都不变化', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().startRecording();
    const pastLen = s().past.length;
    const logLen = s().present.moveLog.length;

    for (let i = 0; i < 10; i++) {
      s().recordStep(Direction.LEFT);
    }

    expect(s().present.moveLog.length).toBe(logLen);
    expect(s().past.length).toBe(pastLen);
  });
});

describe('持久化格式向前兼容', () => {
  it('恢复旧格式（past/future 只存 LevelData）时应自动转换为 HistoryEntry', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const oldFormatData = {
      past: [level],
      present: level,
      future: [level],
      lastValidation: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldFormatData));

    s().restoreFromStorage();
    expect(s().past.length).toBe(1);
    expect(s().past[0].level).not.toBeUndefined();
    expect(s().past[0].validation).toBeNull();
    expect(s().future.length).toBe(1);
    expect(s().future[0].level).not.toBeUndefined();
  });
});

describe('文档与实现漂移回归：关键行为约束', () => {
  it('HistoryEntry 类型必须同时包含 level 和 validation 字段', () => {
    const entry: HistoryEntry = { level: createSampleLevels()[0], validation: null };
    expect(entry.level).not.toBeUndefined();
    expect('validation' in entry).toBe(true);
  });

  it('持久化格式中 past/future 每条记录都携带 validation 快照', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], lastValidation: null });

    s().validate();
    s().setTileAt(0, 0, TileType.FLOOR);

    vi.advanceTimersByTime(800);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    for (const entry of stored.past) {
      expect('level' in entry).toBe(true);
      expect('validation' in entry).toBe(true);
    }
    for (const entry of stored.future || []) {
      expect('level' in entry).toBe(true);
      expect('validation' in entry).toBe(true);
    }
  });

  it('undo/redo 后 lastValidation 与对应历史快照一致，不是硬编码 null', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().validate();
    const v = s().lastValidation;
    expect(v).not.toBeNull();

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().lastValidation).toBeNull();

    s().undo();
    expect(s().lastValidation).not.toBeNull();
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(v));
  });

  it('单独校验后持久化触发，刷新恢复校验结果完整', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], lastValidation: null });

    s().validate();
    expect(s().lastValidation).not.toBeNull();

    vi.advanceTimersByTime(800);

    useEditorStore.setState({ past: [], future: [], lastValidation: null });
    expect(s().lastValidation).toBeNull();

    s().restoreFromStorage();
    expect(s().lastValidation).not.toBeNull();
    expect(s().lastValidation?.valid).toBe(true);
  });

  it('录制步骤后 undo 能回退该步骤（录制步骤进入撤销历史）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [] });

    s().startRecording();
    s().recordStep(Direction.RIGHT);
    expect(s().present.moveLog.length).toBe(1);

    s().undo();
    expect(s().present.moveLog.length).toBe(0);

    s().redo();
    expect(s().present.moveLog.length).toBe(1);
  });
});

describe('草稿快照：保存、重命名、删除', () => {
  it('saveSnapshot 应创建带名称和时间的快照，并设为 activeSnapshotId', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('v1');
    expect(snap.name).toBe('v1');
    expect(snap.createdAt).toBeTypeOf('number');
    expect(s().snapshots.length).toBe(1);
    expect(s().activeSnapshotId).toBe(snap.id);
  });

  it('renameSnapshot 修改快照名称但不改变当前关卡', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('old');
    const presentBefore = JSON.stringify(s().present);
    s().renameSnapshot(snap.id, 'new');
    expect(s().snapshots[0].name).toBe('new');
    expect(JSON.stringify(s().present)).toBe(presentBefore);
  });

  it('deleteSnapshot 应删除快照，若为当前活跃快照则 activeSnapshotId 置空', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('to-delete');
    expect(s().activeSnapshotId).toBe(snap.id);
    s().deleteSnapshot(snap.id);
    expect(s().snapshots.length).toBe(0);
    expect(s().activeSnapshotId).toBeNull();
  });

  it('删除非活跃快照不影响 activeSnapshotId', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap1 = s().saveSnapshot('active');
    const snap2 = s().saveSnapshot('inactive');
    s().setActiveSnapshotId(snap1.id);
    s().deleteSnapshot(snap2.id);
    expect(s().activeSnapshotId).toBe(snap1.id);
  });

  it('删除快照不改变当前关卡内容', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().saveSnapshot('v1');
    const presentBefore = JSON.stringify(s().present);
    s().deleteSnapshot(s().snapshots[0].id);
    expect(JSON.stringify(s().present)).toBe(presentBefore);
  });
});

describe('草稿快照：回滚对齐', () => {
  it('rollbackToSnapshot 后 present/lastValidation/moveLog/simulationState 应与快照一致', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().validate();
    const validResult = s().lastValidation;
    expect(validResult).not.toBeNull();

    const snap = s().saveSnapshot('validated');

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().lastValidation).toBeNull();
    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);

    s().rollbackToSnapshot(snap.id);
    expect(s().present.tiles[0][0]).toBe(level.tiles[0][0]);
    expect(s().lastValidation).not.toBeNull();
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(validResult));
    expect(s().simulationState).toBeNull();
    expect(s().isRecording).toBe(false);
    expect(s().currentStepIndex).toBe(-1);
  });

  it('回滚后 activeSnapshotId 应设为该快照 id', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('v1');
    s().setActiveSnapshotId(null);
    expect(s().activeSnapshotId).toBeNull();

    s().rollbackToSnapshot(snap.id);
    expect(s().activeSnapshotId).toBe(snap.id);
  });

  it('回滚后 past 应与快照保存时完全一致（不能撤销回到修改态）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('base');
    s().setTileAt(0, 0, TileType.FLOOR);
    const modifiedPastLen = s().past.length;

    s().rollbackToSnapshot(snap.id);

    expect(s().past.length).toBe(snap.past.length);
    for (let i = 0; i < snap.past.length; i++) {
      expect(JSON.stringify(s().past[i])).toBe(JSON.stringify(snap.past[i]));
    }

    expect(s().past.length).toBe(modifiedPastLen - 1);
    expect(s().canUndo()).toBe(snap.past.length > 0);
  });

  it('回滚后 future 应与快照保存时完全一致（不能被清空）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 0, TileType.FLOOR);
    s().undo();
    s().undo();
    expect(s().future.length).toBe(2);

    const snap = s().saveSnapshot('base-future');
    expect(snap.future.length).toBe(2);

    s().redo();
    s().redo();
    s().setTileAt(2, 0, TileType.FLOOR);

    s().rollbackToSnapshot(snap.id);

    expect(s().future.length).toBe(2);
    for (let i = 0; i < snap.future.length; i++) {
      expect(JSON.stringify(s().future[i])).toBe(JSON.stringify(snap.future[i]));
    }
  });

  it('【回归】几乎无历史时存快照→改图→回滚：undo 不应再回到修改态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const originalTiles = JSON.stringify(level.tiles);
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    expect(s().past.length).toBe(0);

    const snap = s().saveSnapshot('clean-slate');
    expect(snap.past.length).toBe(0);
    expect(snap.future.length).toBe(0);

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(JSON.stringify(s().present.tiles)).not.toBe(originalTiles);
    expect(s().past.length).toBe(1);

    s().rollbackToSnapshot(snap.id);

    expect(JSON.stringify(s().present.tiles)).toBe(originalTiles);
    expect(s().past.length).toBe(0);
    expect(s().canUndo()).toBe(false);

    expect(s().future.length).toBe(0);
    expect(s().canRedo()).toBe(false);
  });

  it('回滚后再次导出 JSON 应与快照数据一致（除 updatedAt）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().saveSnapshot('v1');
    const snapLevel = JSON.parse(JSON.stringify(s().snapshots[0].level));

    s().setTileAt(0, 0, TileType.FLOOR);
    s().rollbackToSnapshot(s().snapshots[0].id);

    const presentCopy = JSON.parse(JSON.stringify(s().present));
    delete (presentCopy as Record<string, unknown>).updatedAt;
    delete (snapLevel as Record<string, unknown>).updatedAt;

    expect(JSON.stringify(presentCopy)).toBe(JSON.stringify(snapLevel));
  });
});

describe('草稿快照：跨重启恢复', () => {
  it('persistSnapshots 后 restoreSnapshotsFromStorage 能完整恢复快照列表和 activeSnapshotId', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap1 = s().saveSnapshot('first');
    const snap2 = s().saveSnapshot('second');
    s().setActiveSnapshotId(snap1.id);
    s().persistSnapshots();

    const savedSnapshots = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) || '[]');
    expect(savedSnapshots.length).toBe(2);
    expect(localStorage.getItem(ACTIVE_SNAPSHOT_KEY)).toBe(snap1.id);

    useEditorStore.setState({ snapshots: [], activeSnapshotId: null });
    expect(s().snapshots.length).toBe(0);

    s().restoreSnapshotsFromStorage();
    expect(s().snapshots.length).toBe(2);
    expect(s().activeSnapshotId).toBe(snap1.id);
  });

  it('跨重启恢复后操作记录也被恢复', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    s().saveSnapshot('v1');
    s().persistSnapshots();

    const savedLog = JSON.parse(localStorage.getItem(OPERATION_LOG_KEY) || '[]');
    expect(savedLog.length).toBeGreaterThan(0);

    useEditorStore.setState({ operationLog: [] });
    s().restoreSnapshotsFromStorage();
    expect(s().operationLog.length).toBeGreaterThan(0);
  });

  it('恢复后的快照可以正确回滚', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('persist-test');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().persistSnapshots();

    useEditorStore.setState({ snapshots: [], activeSnapshotId: null });
    s().restoreSnapshotsFromStorage();

    expect(s().snapshots.length).toBe(1);
    s().rollbackToSnapshot(s().snapshots[0].id);
    expect(s().present.tiles[0][0]).toBe(level.tiles[0][0]);
  });
});

describe('导入冲突：三种结果', () => {
  it('无已有工作时直接导入，不弹出冲突对话框', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const json = exportToJSON(level);
    s().requestImportWithConflict(json);
    expect(s().importConflictOpen).toBe(false);
    expect(s().pendingImportLevel).toBeNull();
  });

  it('有已有工作时弹出冲突对话框', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().setTileAt(0, 0, TileType.FLOOR);
    const json = exportToJSON(level);
    s().requestImportWithConflict(json);
    expect(s().importConflictOpen).toBe(true);
    expect(s().pendingImportLevel).not.toBeNull();

    s().resolveImportConflict('cancel');
  });

  it('resolveImportConflict("cancel") 不改变当前关卡', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().setTileAt(0, 0, TileType.FLOOR);
    const presentBefore = JSON.stringify(s().present);

    const json = exportToJSON(level);
    s().requestImportWithConflict(json);
    s().resolveImportConflict('cancel');

    expect(JSON.stringify(s().present)).toBe(presentBefore);
    expect(s().importConflictOpen).toBe(false);
    expect(s().pendingImportLevel).toBeNull();
  });

  it('resolveImportConflict("overwrite") 用导入关卡替换当前', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().setTileAt(0, 0, TileType.FLOOR);
    const json = exportToJSON(level);
    s().requestImportWithConflict(json);
    s().resolveImportConflict('overwrite');

    expect(s().present.tiles[0][0]).toBe(level.tiles[0][0]);
    expect(s().importConflictOpen).toBe(false);
    expect(s().pendingImportLevel).toBeNull();
  });

  it('resolveImportConflict("save_as_new") 保存当前状态为快照后导入', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    s().setTileAt(0, 0, TileType.FLOOR);
    const floorTile = s().present.tiles[0][0];

    const json = exportToJSON(level);
    s().requestImportWithConflict(json);
    s().resolveImportConflict('save_as_new');

    expect(s().snapshots.length).toBe(1);
    expect(s().snapshots[0].level.tiles[0][0]).toBe(floorTile);
    expect(s().present.tiles[0][0]).toBe(level.tiles[0][0]);
    expect(s().importConflictOpen).toBe(false);
    expect(s().pendingImportLevel).toBeNull();
  });
});

describe('操作记录', () => {
  it('saveSnapshot 产生 save_snapshot 操作记录', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    s().saveSnapshot('test-snap');
    expect(s().operationLog.length).toBe(1);
    expect(s().operationLog[0].action).toBe('save_snapshot');
    expect(s().operationLog[0].snapshotName).toBe('test-snap');
  });

  it('rollbackToSnapshot 产生 rollback 操作记录', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    const snap = s().saveSnapshot('v1');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().rollbackToSnapshot(snap.id);

    const rollbackEntries = s().operationLog.filter((e) => e.action === 'rollback');
    expect(rollbackEntries.length).toBe(1);
    expect(rollbackEntries[0].snapshotName).toBe('v1');
  });

  it('deleteSnapshot 产生 delete_snapshot 操作记录', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    const snap = s().saveSnapshot('to-delete');
    s().deleteSnapshot(snap.id);

    const deleteEntries = s().operationLog.filter((e) => e.action === 'delete_snapshot');
    expect(deleteEntries.length).toBe(1);
  });

  it('renameSnapshot 产生 rename_snapshot 操作记录', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    const snap = s().saveSnapshot('old-name');
    s().renameSnapshot(snap.id, 'new-name');

    const renameEntries = s().operationLog.filter((e) => e.action === 'rename_snapshot');
    expect(renameEntries.length).toBe(1);
    expect(renameEntries[0].snapshotName).toBe('new-name');
  });
});

describe('回滚后再次导出一致性', () => {
  it('回滚到快照后导出的 JSON 内容与快照 level 数据一致（除 updatedAt）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('export-test');
    const snapLevelCopy = JSON.parse(JSON.stringify(snap.level));

    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 1, TileType.WALL);

    s().rollbackToSnapshot(snap.id);

    const currentCopy = JSON.parse(JSON.stringify(s().present));
    delete (currentCopy as Record<string, unknown>).updatedAt;
    delete (snapLevelCopy as Record<string, unknown>).updatedAt;

    expect(JSON.stringify(currentCopy)).toBe(JSON.stringify(snapLevelCopy));
  });
});

describe('删除确认', () => {
  it('deleteSnapshot 后 deleteConfirmSnapshotId 被清空', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [] });

    const snap = s().saveSnapshot('confirm-test');
    s().setDeleteConfirmSnapshotId(snap.id);
    expect(s().deleteConfirmSnapshotId).toBe(snap.id);

    s().deleteSnapshot(snap.id);
    expect(s().deleteConfirmSnapshotId).toBeNull();
  });
});

const mockBlobUrls: string[] = [];
const mockCreateObjectURL = vi.fn((blob: Blob) => {
  const url = `blob:mock-${mockBlobUrls.length}`;
  mockBlobUrls.push(url);
  return url;
});
const mockRevokeObjectURL = vi.fn((url: string) => {
  const idx = mockBlobUrls.indexOf(url);
  if (idx >= 0) mockBlobUrls.splice(idx, 1);
});
vi.stubGlobal('URL', {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
});
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();
vi.stubGlobal('document', {
  createElement: vi.fn(() => ({
    href: '',
    download: '',
    click: mockClick,
    appendChild: mockAppendChild,
    removeChild: mockRemoveChild,
  })),
  body: {
    appendChild: mockAppendChild,
    removeChild: mockRemoveChild,
  },
});

describe('快照包：导出功能', () => {
  it('exportSnapshotPackage 序列化函数应生成合法 JSON 并包含完整数据', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });

    s().validate();
    const snap1 = s().saveSnapshot('v1');
    s().setTileAt(0, 0, TileType.FLOOR);
    const snap2 = s().saveSnapshot('v2');

    expect(s().snapshots.length).toBe(2);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };

    const jsonStr = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    expect(jsonStr).toBeTypeOf('string');
    expect(jsonStr.length).toBeGreaterThan(100);

    const parsed = JSON.parse(jsonStr);
    expect(parsed._type).toBe('puzzle-editor-snapshot-package');
    expect(parsed.data).not.toBeNull();
    expect(parsed.data.packageVersion).toBe('1.1.0');
    expect(parsed.data.snapshots.length).toBe(2);
    expect(parsed.data.snapshots[0].name).toBe('v1');
    expect(parsed.data.snapshots[1].name).toBe('v2');
    expect(parsed.data.currentLevel).not.toBeNull();
    expect(parsed.data.currentHistory).not.toBeNull();
    expect(parsed.data.currentHistory.present).not.toBeNull();
    expect(Array.isArray(parsed.data.operationLog)).toBe(true);

    const parseResult = parseSnapshotPackage(jsonStr);
    expect(parseResult.pkg).not.toBeNull();
    expect(parseResult.errors).toEqual([]);
    expect(Array.isArray(parseResult.warnings)).toBe(true);
    expect(parseResult.pkg!.snapshots.length).toBe(2);
    expect(parseResult.pkg!.activeSnapshotId).toBe(snap2.id);
  });

  it('store.exportSnapshotPackage 应触发导出操作记录', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, past: [], future: [], snapshots: [], operationLog: [] });
    s().saveSnapshot('v1');

    const beforeLogCount = s().operationLog.length;
    s().exportSnapshotPackage();

    expect(s().operationLog.length).toBe(beforeLogCount + 1);
    expect(s().operationLog[s().operationLog.length - 1].action).toBe('export_package');
  });
});

describe('快照包：同名冲突处理', () => {
  function buildPackageWithSnapshots(snapNames: string[], baseLevel: any): string {
    const snapshots = snapNames.map((name, idx) => ({
      id: `snap_pkg_${idx}`,
      name,
      createdAt: Date.now() + idx * 1000,
      level: JSON.parse(JSON.stringify(baseLevel)),
      moveLog: [],
      moveLogInvalidated: false,
      past: [],
      future: [],
      lastValidation: null,
    }));
    const pkg = {
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(baseLevel)),
        currentHistory: {
          past: [],
          present: JSON.parse(JSON.stringify(baseLevel)),
          future: [],
          lastValidation: null,
        },
        lastValidation: null,
        snapshots,
        activeSnapshotId: snapshots[0]?.id || null,
        operationLog: [],
        editorMeta: { levelName: baseLevel.name },
      },
    };
    return JSON.stringify(pkg);
  }

  it('策略 rename：导入同名快照时自动改名，不覆盖现有', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('alpha');
    s().saveSnapshot('beta');
    const existingSnapBefore = JSON.stringify(s().snapshots.map(s => s.name));
    expect(s().snapshots.length).toBe(2);

    const pkgJson = buildPackageWithSnapshots(['alpha', 'gamma'], level);
    s().requestPackageImport(pkgJson);
    expect(s().packageImportConflictOpen).toBe(true);
    expect(s().detectedConflictingSnapshotNames).toEqual(['alpha']);

    const result = s().resolvePackageImport('rename');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(4);

    const names = s().snapshots.map(s => s.name).sort();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
    expect(names.some(n => n.startsWith('alpha (导入 '))).toBe(true);

    const renameLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_rename');
    expect(renameLogs.length).toBe(1);
    expect(renameLogs[0].detail).toMatch(/重命名.*alpha/);

    const importLogs = s().operationLog.filter(e => e.action === 'import_package');
    expect(importLogs.length).toBeGreaterThanOrEqual(1);

    const originalAlpha = s().snapshots.find(s => s.name === 'alpha');
    expect(originalAlpha).not.toBeUndefined();
  });

  it('策略 replace：导入同名快照时替换现有', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modifiedLevel = JSON.parse(JSON.stringify(level));
    modifiedLevel.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    const originalSnap = s().saveSnapshot('alpha');
    const originalSnapId = originalSnap.id;
    expect(s().snapshots[0].level.tiles[0][0]).toBe(level.tiles[0][0]);

    const pkgJson = buildPackageWithSnapshots(['alpha'], modifiedLevel);
    s().requestPackageImport(pkgJson);
    expect(s().packageImportConflictOpen).toBe(true);

    const result = s().resolvePackageImport('replace');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(1);

    const replaced = s().snapshots.find(s => s.name === 'alpha');
    expect(replaced).not.toBeUndefined();
    expect(replaced!.level.tiles[0][0]).toBe(TileType.FLOOR);
    expect(replaced!.id).not.toBe(originalSnapId);

    const replaceLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_replace');
    expect(replaceLogs.length).toBe(1);
  });

  it('策略 skip：导入同名快照时跳过，保留现有不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modifiedLevel = JSON.parse(JSON.stringify(level));
    modifiedLevel.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    const originalSnap = s().saveSnapshot('alpha');
    s().saveSnapshot('beta');
    expect(s().snapshots.length).toBe(2);

    const pkgJson = buildPackageWithSnapshots(['alpha', 'gamma'], modifiedLevel);
    s().requestPackageImport(pkgJson);

    const result = s().resolvePackageImport('skip');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(3);

    const alphaSnap = s().snapshots.find(s => s.name === 'alpha');
    expect(alphaSnap).not.toBeUndefined();
    expect(alphaSnap!.id).toBe(originalSnap.id);
    expect(alphaSnap!.level.tiles[0][0]).toBe(level.tiles[0][0]);

    const names = s().snapshots.map(s => s.name);
    expect(names).toContain('beta');
    expect(names).toContain('gamma');

    const skipLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_skip');
    expect(skipLogs.length).toBe(1);
  });

  it('cancelPackageImport 不改变任何现有状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('alpha');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      snapshotNames: s().snapshots.map(s => s.name),
      presentTiles: JSON.stringify(s().present.tiles),
      opLogCount: s().operationLog.length,
    };

    const pkgJson = buildPackageWithSnapshots(['alpha'], level);
    s().requestPackageImport(pkgJson);
    expect(s().packageImportConflictOpen).toBe(true);

    s().cancelPackageImport();

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().snapshots.map(s => s.name)).toEqual(stateBefore.snapshotNames);
    expect(JSON.stringify(s().present.tiles)).toBe(stateBefore.presentTiles);
    expect(s().packageImportConflictOpen).toBe(false);
    expect(s().pendingPackageImport).toBeNull();
  });
});

describe('快照包：导出再导入一致性（跨重启恢复模拟）', () => {
  it('导出后再导入，快照数据与导出前严格一致（除 ID 可能变化）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    const val1 = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('baseline');

    s().setTileAt(0, 0, TileType.FLOOR);
    s().validate();
    const val2 = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('modified');

    const activeSnapId = s().snapshots[1].id;
    s().setActiveSnapshotId(activeSnapId);

    const snapshotsBefore = JSON.parse(JSON.stringify(s().snapshots));

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    expect(s().snapshots.length).toBe(0);
    expect(s().past.length).toBe(0);

    s().saveSnapshot('baseline');
    expect(s().snapshots.length).toBe(1);

    s().requestPackageImport(pkgJson);
    expect(s().packageImportConflictOpen).toBe(true);
    const importResult = s().resolvePackageImport('rename');
    expect(importResult).toBe(true);

    expect(s().snapshots.length).toBe(3);
    const names = s().snapshots.map(s => s.name);
    expect(names).toContain('baseline');
    expect(names.some(n => n.startsWith('baseline (导入 '))).toBe(true);
    expect(names).toContain('modified');

    for (let i = 0; i < snapshotsBefore.length; i++) {
      const beforeSnap = snapshotsBefore[i];
      let afterSnap: any;
      if (beforeSnap.name === 'baseline') {
        afterSnap = s().snapshots.find((ss) => ss.name.startsWith('baseline (导入 '));
      } else {
        afterSnap = s().snapshots.find((ss) => ss.name === beforeSnap.name);
      }
      expect(afterSnap).not.toBeUndefined();

      const beforeLevel = JSON.parse(JSON.stringify(beforeSnap.level));
      const afterLevel = JSON.parse(JSON.stringify(afterSnap!.level));
      delete beforeLevel.updatedAt;
      delete afterLevel.updatedAt;
      expect(JSON.stringify(afterLevel)).toBe(JSON.stringify(beforeLevel));

      expect(afterSnap!.moveLog.length).toBe(beforeSnap.moveLog.length);
      expect(afterSnap!.past.length).toBe(beforeSnap.past.length);
      expect(afterSnap!.future.length).toBe(beforeSnap.future.length);
    }

    expect(s().activeSnapshotId).not.toBeNull();
    const storeActiveId = s().activeSnapshotId;
    const activeSnap = s().snapshots.find((ss) => ss.id === storeActiveId);
    expect(activeSnap).not.toBeUndefined();
    expect(activeSnap!.name).toBe('modified');

    const afterTiles = JSON.parse(JSON.stringify(s().present.tiles));
    const beforeTiles = JSON.parse(JSON.stringify(snapshotsBefore[1].level.tiles));
    expect(JSON.stringify(afterTiles)).toBe(JSON.stringify(beforeTiles));
  });

  it('导入后 moveLog、lastValidation、undo/redo 与选中版本对齐', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('validated');

    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 0, TileType.FLOOR);
    expect(s().past.length).toBe(2);
    s().undo();
    expect(s().past.length).toBe(1);
    expect(s().future.length).toBe(1);
    s().saveSnapshot('with-history');
    const expectedPastLen = s().past.length;
    const expectedFutureLen = s().future.length;

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).not.toBeNull();
    const activeSnap = s().snapshots.find((ss) => ss.id === s().activeSnapshotId);
    expect(activeSnap).not.toBeUndefined();
    expect(activeSnap!.name).toBe('with-history');
    expect(s().lastValidation).toBeNull();
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(true);
    expect(s().simulationState).toBeNull();
    expect(s().isRecording).toBe(false);
    expect(s().currentStepIndex).toBe(-1);
    expect(s().past.length).toBe(expectedPastLen);
    expect(s().future.length).toBe(expectedFutureLen);

    const withHistorySnap = s().snapshots.find(ss => ss.name === 'with-history');
    expect(withHistorySnap).not.toBeUndefined();
    expect(s().past.length).toBe(withHistorySnap!.past.length);
    expect(s().future.length).toBe(withHistorySnap!.future.length);

    const validatedSnap = s().snapshots.find(ss => ss.name === 'validated');
    expect(validatedSnap).not.toBeUndefined();
    expect(validatedSnap!.lastValidation).not.toBeNull();
    expect(validatedSnap!.lastValidation?.valid).toBe(true);
  });
});

describe('快照包：非法包回退', () => {
  it('非 JSON 格式导入失败，不污染现有状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      pastLen: s().past.length,
      presentJson: JSON.stringify(s().present),
      opLogLen: s().operationLog.length,
    };

    s().requestPackageImport('this is not valid json at all');

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().past.length).toBe(stateBefore.pastLen);
    expect(JSON.stringify(s().present)).toBe(stateBefore.presentJson);
    expect(s().packageImportConflictOpen).toBe(false);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBe(1);
  });

  it('缺少必填字段的包导入失败，现有状态保持不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      snapshotNames: s().snapshots.map(s => s.name),
      opLogLen: s().operationLog.length,
    };

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
      },
    });

    s().requestPackageImport(badPkg);

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().snapshots.map(s => s.name)).toEqual(stateBefore.snapshotNames);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBe(1);
    expect(failLogs[0].detail).toMatch(/缺少|错误/);
  });

  it('类型标识错误的包被正确拒绝', () => {
    const wrongTypePkg = JSON.stringify({
      _type: 'wrong-type-identifier',
      data: { anything: 'here' },
    });
    const samples = createSampleLevels();
    useEditorStore.setState({ present: samples[0], snapshots: [], operationLog: [] });
    s().saveSnapshot('existing');
    const countBefore = s().snapshots.length;

    s().requestPackageImport(wrongTypePkg);

    expect(s().snapshots.length).toBe(countBefore);
    expect(s().operationLog.filter(e => e.action === 'import_package_failed').length).toBe(1);
  });

  it('解析成功但导入过程异常时，完整回滚到导入前状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing-1');
    s().saveSnapshot('existing-2');
    const stateBefore = {
      snapshots: JSON.parse(JSON.stringify(s().snapshots)),
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: JSON.parse(JSON.stringify(s().lastValidation)),
      activeSnapshotId: s().activeSnapshotId,
      opLogLen: s().operationLog.length,
    };

    const goodPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [],
          present: JSON.parse(JSON.stringify(level)),
          future: [],
          lastValidation: null,
        },
        lastValidation: null,
        snapshots: [{
          id: 'snap_test_1',
          name: 'new-snap',
          createdAt: Date.now(),
          level: JSON.parse(JSON.stringify(level)),
          moveLog: [],
          moveLogInvalidated: false,
          past: 'this-should-cause-error' as any,
          future: [],
          lastValidation: null,
        }],
        activeSnapshotId: 'snap_test_1',
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    s().requestPackageImport(goodPkg);

    expect(s().snapshots.length).toBe(stateBefore.snapshots.length);
    for (let i = 0; i < stateBefore.snapshots.length; i++) {
      expect(s().snapshots[i].name).toBe(stateBefore.snapshots[i].name);
      expect(s().snapshots[i].id).toBe(stateBefore.snapshots[i].id);
    }
    expect(JSON.stringify(s().past)).toBe(JSON.stringify(stateBefore.past));
    expect(JSON.stringify(s().present)).toBe(JSON.stringify(stateBefore.present));
    expect(s().pendingPackageImport).toBeNull();
    expect(s().packageImportConflictOpen).toBe(false);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('快照包：无冲突直接导入', () => {
  it('无同名快照时，不弹出冲突对话框直接完成导入', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('local-only');

    const pkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        lastValidation: null,
        snapshots: [{
          id: 'snap_remote_1',
          name: 'remote-snap',
          createdAt: Date.now(),
          level: JSON.parse(JSON.stringify(level)),
          moveLog: [],
          moveLogInvalidated: false,
          past: [],
          future: [],
          lastValidation: null,
        }],
        activeSnapshotId: null,
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    s().requestPackageImport(pkg);

    expect(s().packageImportConflictOpen).toBe(false);
    expect(s().snapshots.length).toBe(2);
    expect(s().snapshots.map(s => s.name)).toContain('local-only');
    expect(s().snapshots.map(s => s.name)).toContain('remote-snap');
  });
});

describe('【回归】版本兼容检查', () => {
  it('主版本号不兼容的包应该被拒绝', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, snapshots: [], operationLog: [] });

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '2.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        lastValidation: null,
        snapshots: [],
        activeSnapshotId: null,
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    const parseResult = parseSnapshotPackage(badPkg);
    expect(parseResult.pkg).toBeNull();
    expect(parseResult.errors.some(e => e.includes('主版本号不兼容'))).toBe(true);
  });

  it('旧版本包应该给出警告但能成功导入', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, snapshots: [], operationLog: [] });

    const oldPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        lastValidation: null,
        snapshots: [{
          id: 'snap_old_1',
          name: 'old-version-snap',
          createdAt: Date.now(),
          level: JSON.parse(JSON.stringify(level)),
          moveLog: [],
          moveLogInvalidated: false,
        }],
        activeSnapshotId: null,
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    const parseResult = parseSnapshotPackage(oldPkg);
    expect(parseResult.errors).toEqual([]);
    expect(parseResult.pkg).not.toBeNull();
    expect(parseResult.warnings.some(w => w.includes('低于当前版本'))).toBe(true);
  });

  it('新版本包应该给出警告但尝试兼容导入', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({ present: level, snapshots: [], operationLog: [] });

    const newPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.99.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        lastValidation: null,
        snapshots: [{
          id: 'snap_new_1',
          name: 'new-version-snap',
          createdAt: Date.now(),
          level: JSON.parse(JSON.stringify(level)),
          moveLog: [],
          moveLogInvalidated: false,
          past: [],
          future: [],
          lastValidation: null,
        }],
        activeSnapshotId: null,
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    const parseResult = parseSnapshotPackage(newPkg);
    expect(parseResult.pkg).not.toBeNull();
    expect(parseResult.warnings.some(w => w.includes('高于当前版本'))).toBe(true);
    expect(parseResult.errors).toEqual([]);
  });

  it('缺少 packageVersion 的包应该报错', () => {
    const samples = createSampleLevels();
    const level = samples[0];

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        snapshots: [],
        activeSnapshotId: null,
        operationLog: [],
      },
    });

    const parseResult = parseSnapshotPackage(badPkg);
    expect(parseResult.pkg).toBeNull();
    expect(parseResult.errors.some(e => e.includes('packageVersion'))).toBe(true);
  });
});

describe('【回归】导入后继续编辑：撤销/重做链路完整性', () => {
  it('导入后继续编辑，undo 能正确回退到导入后的状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    const val1 = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('original');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('modified');

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());

    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().snapshots.length).toBe(2);
    const pastLenAfterImport = s().past.length;
    expect(pastLenAfterImport).toBeGreaterThan(0);

    const tilesAfterImport = JSON.stringify(s().present.tiles);
    s().setTileAt(1, 1, TileType.FLOOR);
    expect(JSON.stringify(s().present.tiles)).not.toBe(tilesAfterImport);
    expect(s().past.length).toBe(pastLenAfterImport + 1);

    s().undo();
    expect(JSON.stringify(s().present.tiles)).toBe(tilesAfterImport);
    expect(s().past.length).toBe(pastLenAfterImport);
    expect(s().future.length).toBe(1);
  });

  it('导入后修改多次，redo 能正确重做所有步骤', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('base');
    s().setTileAt(0, 0, TileType.FLOOR);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const tilesAfterImport = JSON.stringify(s().present.tiles);
    s().setTileAt(1, 1, TileType.FLOOR);
    const tilesAfterEdit1 = JSON.stringify(s().present.tiles);
    s().setTileAt(2, 2, TileType.FLOOR);
    const tilesAfterEdit2 = JSON.stringify(s().present.tiles);

    s().undo();
    expect(JSON.stringify(s().present.tiles)).toBe(tilesAfterEdit1);
    s().undo();
    expect(JSON.stringify(s().present.tiles)).toBe(tilesAfterImport);

    s().redo();
    expect(JSON.stringify(s().present.tiles)).toBe(tilesAfterEdit1);
    s().redo();
    expect(JSON.stringify(s().present.tiles)).toBe(tilesAfterEdit2);
  });

  it('导入后 rollback 到某个快照，undo/redo 链路与该快照一致', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('clean');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 0, TileType.FLOOR);
    s().saveSnapshot('edited');

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().snapshots.length).toBe(2);
    const cleanSnap = s().snapshots.find(s => s.name === 'clean');
    expect(cleanSnap).not.toBeUndefined();

    s().rollbackToSnapshot(cleanSnap!.id);
    expect(s().past.length).toBe(cleanSnap!.past.length);
    expect(s().future.length).toBe(cleanSnap!.future.length);
    expect(s().canUndo()).toBe(cleanSnap!.past.length > 0);
    expect(s().canRedo()).toBe(cleanSnap!.future.length > 0);
    expect(s().lastValidation).not.toBeNull();
  });
});

describe('【回归】跨重启恢复（导出→清空→导入）', () => {
  it('完整模拟浏览器重启：导出持久化数据→清空→导入，所有状态完整恢复', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    const v1 = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('v1');

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().past.length).toBe(1);

    s().setTileAt(1, 0, TileType.FLOOR);
    expect(s().past.length).toBe(2);

    s().validate();
    const v2 = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('v2');
    s().setActiveSnapshotId(s().snapshots[1].id);

    expect(s().past.length).toBe(2);
    expect(s().future.length).toBe(0);

    const snapshotsBefore = JSON.parse(JSON.stringify(s().snapshots));
    const pastBefore = JSON.parse(JSON.stringify(s().past));
    const futureBefore = JSON.parse(JSON.stringify(s().future));
    const presentBefore = JSON.parse(JSON.stringify(s().present));
    const activeIdBefore = s().activeSnapshotId;
    const lastValBefore = JSON.parse(JSON.stringify(s().lastValidation));

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    localStorage.clear();
    expect(s().snapshots.length).toBe(0);
    expect(s().past.length).toBe(0);
    expect(s().future.length).toBe(0);

    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().snapshots.length).toBe(2);
    expect(s().activeSnapshotId).not.toBeNull();

    const activeSnap = s().snapshots.find(ss => ss.id === s().activeSnapshotId);
    expect(activeSnap).not.toBeUndefined();
    expect(activeSnap!.name).toBe('v2');

    expect(JSON.stringify(s().past)).toBe(JSON.stringify(pastBefore));
    expect(JSON.stringify(s().future)).toBe(JSON.stringify(futureBefore));

    const presentTiles = JSON.parse(JSON.stringify(s().present.tiles));
    const beforeTiles = JSON.parse(JSON.stringify(presentBefore.tiles));
    expect(JSON.stringify(presentTiles)).toBe(JSON.stringify(beforeTiles));

    expect(s().lastValidation).not.toBeNull();
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(lastValBefore));

    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);
  });

  it('跨重启后操作记录完整保留，界面可查看', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('snap1');
    s().saveSnapshot('snap2');
    s().renameSnapshot(s().snapshots[0].id, 'renamed');
    const logCountBefore = s().operationLog.length;
    expect(logCountBefore).toBe(3);
    const originalLogIds = s().operationLog.map(e => e.id);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const importLogs = s().operationLog.filter(e => e.action.startsWith('import_package'));
    expect(importLogs.length).toBeGreaterThan(0);

    const totalLogsAfter = s().operationLog.length;
    expect(totalLogsAfter).toBeGreaterThan(logCountBefore);
    expect(s().operationLog.length).toBeGreaterThanOrEqual(3);
  });
});

describe('【回归】导出再导入一致性', () => {
  it('导出的包再次导入后，每个快照的核心数据与导出前一致', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('validated');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().startRecording();
    s().recordStep(Direction.RIGHT);
    s().stopRecording();
    s().saveSnapshot('with-moves');
    s().undo();
    s().saveSnapshot('after-undo');

    const snapshotsBefore = JSON.parse(JSON.stringify(s().snapshots));

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().snapshots.length).toBe(snapshotsBefore.length);

    for (let i = 0; i < snapshotsBefore.length; i++) {
      const before = snapshotsBefore[i];
      const after = s().snapshots.find(s => s.name === before.name);
      expect(after).not.toBeUndefined();

      const beforeLevel = JSON.parse(JSON.stringify(before.level));
      const afterLevel = JSON.parse(JSON.stringify(after!.level));
      delete beforeLevel.updatedAt;
      delete afterLevel.updatedAt;
      expect(JSON.stringify(afterLevel)).toBe(JSON.stringify(beforeLevel));

      expect(after!.moveLog.length).toBe(before.moveLog.length);
      expect(after!.past.length).toBe(before.past.length);
      expect(after!.future.length).toBe(before.future.length);
      expect(after!.moveLogInvalidated).toBe(before.moveLogInvalidated);

      if (before.lastValidation) {
        expect(after!.lastValidation).not.toBeNull();
        expect(after!.lastValidation?.valid).toBe(before.lastValidation.valid);
      }
    }
  });

  it('导出再导入后，activeSnapshotId 指向的快照与当前地图一致', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('first');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('second');
    s().setActiveSnapshotId(s().snapshots[1].id);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).not.toBeNull();
    const activeSnap = s().snapshots.find(ss => ss.id === s().activeSnapshotId);
    expect(activeSnap).not.toBeUndefined();
    expect(activeSnap!.name).toBe('second');

    const presentTiles = JSON.stringify(s().present.tiles);
    const snapTiles = JSON.stringify(activeSnap!.level.tiles);
    expect(presentTiles).toBe(snapTiles);
  });
});

describe('【回归】冲突分支选择：三种策略完整验证', () => {
  function buildTestPackage(level: any, snapNames: string[]): string {
    const snapshots = snapNames.map((name, idx) => ({
      id: `snap_test_${idx}`,
      name,
      createdAt: Date.now() + idx * 1000,
      level: JSON.parse(JSON.stringify(level)),
      moveLog: [],
      moveLogInvalidated: false,
      past: [{ level: JSON.parse(JSON.stringify(level)), validation: null }],
      future: [],
      lastValidation: null,
    }));
    return JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [], present: JSON.parse(JSON.stringify(level)), future: [], lastValidation: null,
        },
        lastValidation: null,
        snapshots,
        activeSnapshotId: snapshots[0].id,
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });
  }

  it('replace 策略：所有同名快照被替换，ID 刷新，数量不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modified = JSON.parse(JSON.stringify(level));
    modified.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    const originalSnap = s().saveSnapshot('alpha');
    const originalId = originalSnap.id;
    const originalTiles = JSON.stringify(originalSnap.level.tiles);

    const pkg = buildTestPackage(modified, ['alpha', 'beta']);
    s().requestPackageImport(pkg);
    expect(s().packageImportConflictOpen).toBe(true);
    expect(s().detectedConflictingSnapshotNames).toEqual(['alpha']);

    const result = s().resolvePackageImport('replace');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(2);

    const alphaAfter = s().snapshots.find(s => s.name === 'alpha');
    expect(alphaAfter).not.toBeUndefined();
    expect(alphaAfter!.id).not.toBe(originalId);
    expect(JSON.stringify(alphaAfter!.level.tiles)).not.toBe(originalTiles);
    expect(alphaAfter!.level.tiles[0][0]).toBe(TileType.FLOOR);

    const betaAfter = s().snapshots.find(s => s.name === 'beta');
    expect(betaAfter).not.toBeUndefined();

    const replaceLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_replace');
    expect(replaceLogs.length).toBe(1);
    expect(replaceLogs[0].detail).toMatch(/alpha/);
  });

  it('rename 策略：同名快照自动改名，新旧都保留，数量增加', () => {
    const samples = createSampleLevels();
    const level = samples[0];

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    const originalSnap = s().saveSnapshot('alpha');
    const originalId = originalSnap.id;

    const pkg = buildTestPackage(level, ['alpha', 'beta', 'gamma']);
    s().requestPackageImport(pkg);
    expect(s().packageImportConflictOpen).toBe(true);

    const result = s().resolvePackageImport('rename');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(4);

    const originalAlpha = s().snapshots.find(s => s.id === originalId);
    expect(originalAlpha).not.toBeUndefined();
    expect(originalAlpha!.name).toBe('alpha');

    const renamedAlpha = s().snapshots.find(s => s.name.startsWith('alpha (导入 '));
    expect(renamedAlpha).not.toBeUndefined();
    expect(renamedAlpha!.id).not.toBe(originalId);

    const names = s().snapshots.map(s => s.name);
    expect(names).toContain('beta');
    expect(names).toContain('gamma');

    const renameLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_rename');
    expect(renameLogs.length).toBe(1);
  });

  it('skip 策略：同名快照跳过，仅导入新快照', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modified = JSON.parse(JSON.stringify(level));
    modified.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    const originalSnap = s().saveSnapshot('alpha');
    const originalId = originalSnap.id;
    const originalTiles = JSON.stringify(originalSnap.level.tiles);

    const pkg = buildTestPackage(modified, ['alpha', 'beta']);
    s().requestPackageImport(pkg);
    expect(s().packageImportConflictOpen).toBe(true);

    const result = s().resolvePackageImport('skip');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(2);

    const alphaAfter = s().snapshots.find(s => s.name === 'alpha');
    expect(alphaAfter).not.toBeUndefined();
    expect(alphaAfter!.id).toBe(originalId);
    expect(JSON.stringify(alphaAfter!.level.tiles)).toBe(originalTiles);

    const betaAfter = s().snapshots.find(s => s.name === 'beta');
    expect(betaAfter).not.toBeUndefined();

    const skipLogs = s().operationLog.filter(e => e.action === 'import_package_conflict_skip');
    expect(skipLogs.length).toBe(1);
    expect(skipLogs[0].detail).toMatch(/alpha/);
  });

  it('cancel 策略：完全取消导入，不做任何修改', () => {
    const samples = createSampleLevels();
    const level = samples[0];

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('alpha');
    s().saveSnapshot('beta');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      snapshotIds: s().snapshots.map(s => s.id),
      pastLen: s().past.length,
      opLogLen: s().operationLog.length,
    };

    const pkg = buildTestPackage(level, ['alpha', 'gamma']);
    s().requestPackageImport(pkg);
    expect(s().packageImportConflictOpen).toBe(true);

    s().cancelPackageImport();

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().snapshots.map(s => s.id)).toEqual(stateBefore.snapshotIds);
    expect(s().past.length).toBe(stateBefore.pastLen);
    expect(s().operationLog.length).toBe(stateBefore.opLogLen);
    expect(s().packageImportConflictOpen).toBe(false);
    expect(s().pendingPackageImport).toBeNull();
  });
});

describe('【回归】非法包回退：各种异常场景', () => {
  it('完全损坏的 JSON 导入失败，状态完全不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      pastLen: s().past.length,
      presentJson: JSON.stringify(s().present),
      opLogLen: s().operationLog.length,
    };

    s().requestPackageImport('{ this is completely invalid json !!!');

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().past.length).toBe(stateBefore.pastLen);
    expect(JSON.stringify(s().present)).toBe(stateBefore.presentJson);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBe(1);
  });

  it('缺少 _type 标识的包被拒绝，状态不变', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing');
    const countBefore = s().snapshots.length;

    const badPkg = JSON.stringify({
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        snapshots: [],
      },
    });

    s().requestPackageImport(badPkg);
    expect(s().snapshots.length).toBe(countBefore);
    expect(s().operationLog.filter(e => e.action === 'import_package_failed').length).toBe(1);
  });

  it('缺少必要字段的包导入失败，回滚到导入前状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing-1');
    s().saveSnapshot('existing-2');
    const stateBefore = {
      snapshots: JSON.parse(JSON.stringify(s().snapshots)),
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      opLogLen: s().operationLog.length,
    };

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
      },
    });

    s().requestPackageImport(badPkg);

    expect(s().snapshots.length).toBe(stateBefore.snapshots.length);
    for (let i = 0; i < stateBefore.snapshots.length; i++) {
      expect(s().snapshots[i].id).toBe(stateBefore.snapshots[i].id);
      expect(s().snapshots[i].name).toBe(stateBefore.snapshots[i].name);
    }
    expect(JSON.stringify(s().past)).toBe(JSON.stringify(stateBefore.past));
    expect(JSON.stringify(s().present)).toBe(JSON.stringify(stateBefore.present));
    expect(s().operationLog.length).toBe(stateBefore.opLogLen + 1);
  });

  it('解析成功但导入过程中抛出异常，完整回滚', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing-1');
    s().saveSnapshot('existing-2');
    const stateBefore = {
      snapshots: JSON.parse(JSON.stringify(s().snapshots)),
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: JSON.parse(JSON.stringify(s().lastValidation)),
      activeSnapshotId: s().activeSnapshotId,
      opLogLen: s().operationLog.length,
    };

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [{ invalid: 'data' }],
          present: JSON.parse(JSON.stringify(level)),
          future: [],
          lastValidation: null,
        },
        lastValidation: null,
        snapshots: [{
          id: 'snap_bad_1',
          name: 'bad-snap',
          createdAt: Date.now(),
          level: JSON.parse(JSON.stringify(level)),
          moveLog: [],
          moveLogInvalidated: false,
          past: 'invalid-past-type',
          future: [],
          lastValidation: null,
        }],
        activeSnapshotId: 'snap_bad_1',
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    s().requestPackageImport(badPkg);

    expect(s().snapshots.length).toBe(stateBefore.snapshots.length);
    for (let i = 0; i < stateBefore.snapshots.length; i++) {
      expect(s().snapshots[i].id).toBe(stateBefore.snapshots[i].id);
      expect(s().snapshots[i].name).toBe(stateBefore.snapshots[i].name);
    }
    expect(JSON.stringify(s().past)).toBe(JSON.stringify(stateBefore.past));
    expect(JSON.stringify(s().present)).toBe(JSON.stringify(stateBefore.present));
    expect(JSON.stringify(s().future)).toBe(JSON.stringify(stateBefore.future));
    expect(JSON.stringify(s().lastValidation)).toBe(JSON.stringify(stateBefore.lastValidation));
    expect(s().activeSnapshotId).toBe(stateBefore.activeSnapshotId);
    expect(s().operationLog.length).toBe(stateBefore.opLogLen + 1);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBe(1);
  });

  it('导入包含损坏快照数据的包，触发回滚不污染现有状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null,
    });

    s().saveSnapshot('existing-1');
    s().saveSnapshot('existing-2');
    const stateBefore = {
      snapshotCount: s().snapshots.length,
      snapshotIds: s().snapshots.map(s => s.id),
      snapshotNames: s().snapshots.map(s => s.name),
      past: JSON.stringify(s().past),
      present: JSON.stringify(s().present),
      future: JSON.stringify(s().future),
      opLogLen: s().operationLog.length,
    };

    const corruptedSnap = {
      id: 'snap_corrupted',
      name: 'corrupted-snap',
      createdAt: Date.now(),
      level: JSON.parse(JSON.stringify(level)),
      moveLog: [],
      moveLogInvalidated: false,
      past: 'this-is-not-an-array',
      future: [],
      lastValidation: null,
    };

    const badPkg = JSON.stringify({
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(level)),
        currentHistory: {
          past: [],
          present: JSON.parse(JSON.stringify(level)),
          future: [],
          lastValidation: null,
        },
        lastValidation: null,
        snapshots: [
          {
            id: 'snap_good',
            name: 'good-snap',
            createdAt: Date.now(),
            level: JSON.parse(JSON.stringify(level)),
            moveLog: [],
            moveLogInvalidated: false,
            past: [],
            future: [],
            lastValidation: null,
          },
          corruptedSnap,
        ],
        activeSnapshotId: 'snap_corrupted',
        operationLog: [],
        editorMeta: { levelName: level.name },
      },
    });

    s().requestPackageImport(badPkg);

    expect(s().snapshots.length).toBe(stateBefore.snapshotCount);
    expect(s().snapshots.map(s => s.id)).toEqual(stateBefore.snapshotIds);
    expect(s().snapshots.map(s => s.name)).toEqual(stateBefore.snapshotNames);
    expect(JSON.stringify(s().past)).toBe(stateBefore.past);
    expect(JSON.stringify(s().present)).toBe(stateBefore.present);
    expect(JSON.stringify(s().future)).toBe(stateBefore.future);
    expect(s().operationLog.length).toBe(stateBefore.opLogLen + 1);

    const failLogs = s().operationLog.filter(e => e.action === 'import_package_failed');
    expect(failLogs.length).toBe(1);
  });
});

describe('【回归】状态一致性：activeSnapshotId、lastValidation、当前地图', () => {
  it('导入有 activeSnapshotId 的包后，三者严格对齐', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    const valResult = JSON.parse(JSON.stringify(s().lastValidation));
    s().saveSnapshot('validated');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('modified');
    s().setActiveSnapshotId(s().snapshots[1].id);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).not.toBeNull();
    const activeSnap = s().snapshots.find(ss => ss.id === s().activeSnapshotId);
    expect(activeSnap).not.toBeUndefined();

    const presentTiles = JSON.stringify(s().present.tiles);
    const snapTiles = JSON.stringify(activeSnap!.level.tiles);
    expect(presentTiles).toBe(snapTiles);

    expect(s().lastValidation).toBeNull();
  });

  it('导入无 activeSnapshotId 的包后，activeSnapshotId 为 null，不影响其他状态', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('snap1');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('snap2');

    expect(s().past.length).toBeGreaterThan(0);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkg = {
      _type: 'puzzle-editor-snapshot-package',
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        currentLevel: JSON.parse(JSON.stringify(s().present)),
        currentHistory,
        lastValidation: null,
        snapshots: JSON.parse(JSON.stringify(s().snapshots)),
        activeSnapshotId: null,
        operationLog: JSON.parse(JSON.stringify(s().operationLog)),
        editorMeta: { levelName: s().present.name },
      },
    };
    const pkgJson = JSON.stringify(pkg);

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).toBeNull();
    expect(s().snapshots.length).toBe(2);
    expect(s().past.length).toBeGreaterThan(0);
  });

  it('导入后修改地图，lastValidation 自动置空，activeSnapshotId 也被清空', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('v1');
    s().setActiveSnapshotId(s().snapshots[0].id);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const activeIdAfterImport = s().activeSnapshotId;
    expect(activeIdAfterImport).not.toBeNull();
    expect(s().lastValidation).not.toBeNull();

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().lastValidation).toBeNull();
    expect(s().activeSnapshotId).toBeNull();
  });
});

describe('【新能力】导入后持续编辑：全链路同步', () => {
  it('导入快照包后改图，activeSnapshotId 被清空，地图和历史正常更新', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('base');
    const baseSnapId = s().snapshots[0].id;

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).not.toBeNull();
    expect(s().snapshots.length).toBe(1);
    const importedSnapId = s().activeSnapshotId!;

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().activeSnapshotId).toBeNull();
    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().past.length).toBeGreaterThan(0);
    expect(s().lastValidation).toBeNull();

    s().undo();
    expect(s().present.tiles[0][0]).not.toBe(TileType.FLOOR);
    expect(s().activeSnapshotId).toBeNull();

    s().redo();
    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().activeSnapshotId).toBeNull();

    const baseSnapAfter = s().snapshots.find(s => s.id === importedSnapId);
    expect(baseSnapAfter).not.toBeUndefined();
    expect(baseSnapAfter!.level.tiles[0][0]).not.toBe(TileType.FLOOR);
  });

  it('导入后改图再存新快照，新快照成为 active，历史链路完整', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('v1');

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const v1Snap = s().snapshots.find(ss => ss.name.startsWith('v1') || ss.name === 'v1');
    expect(v1Snap).not.toBeUndefined();
    const v1PastLen = v1Snap!.past.length;

    s().setTileAt(0, 0, TileType.FLOOR);
    s().validate();
    const newSnap = s().saveSnapshot('v2-modified');

    expect(s().activeSnapshotId).toBe(newSnap.id);
    expect(newSnap.past.length).toBeGreaterThan(v1PastLen);
    expect(newSnap.level.tiles[0][0]).toBe(TileType.FLOOR);
    expect(newSnap.lastValidation).not.toBeNull();
    expect(s().snapshots.length).toBe(2);

    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().lastValidation).not.toBeNull();
  });

  it('导入后撤销重做都保持 activeSnapshotId 为空（不自动恢复旧快照标签）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('original');

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const activeIdAfterImport = s().activeSnapshotId;
    expect(activeIdAfterImport).not.toBeNull();

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().activeSnapshotId).toBeNull();

    s().undo();
    expect(s().activeSnapshotId).toBeNull();

    s().redo();
    expect(s().activeSnapshotId).toBeNull();
  });
});

describe('【新能力】跨重启恢复：刷新后状态完整', () => {
  it('导入快照包后持久化，再从存储恢复，快照列表、活跃ID、操作日志都完整', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    s().saveSnapshot('snap-a');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('snap-b');
    s().setActiveSnapshotId(s().snapshots[0].id);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    localStorage.clear();
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    vi.advanceTimersByTime(500);

    const snapCountBefore = s().snapshots.length;
    const activeIdBefore = s().activeSnapshotId;
    const opLogLenBefore = s().operationLog.length;

    useEditorStore.setState(useEditorStore.getInitialState());
    expect(s().snapshots.length).toBe(0);
    expect(s().activeSnapshotId).toBeNull();

    s().restoreSnapshotsFromStorage();

    expect(s().snapshots.length).toBe(snapCountBefore);
    expect(s().activeSnapshotId).toBe(activeIdBefore);
    expect(s().operationLog.length).toBeGreaterThanOrEqual(opLogLenBefore);

    const activeSnap = s().snapshots.find(ss => ss.id === s().activeSnapshotId);
    expect(activeSnap).not.toBeUndefined();
  });

  it('导入后编辑并持久化，刷新后 activeSnapshotId 保持为空（因为已修改）', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('base');

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    localStorage.clear();
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().activeSnapshotId).not.toBeNull();

    s().setTileAt(0, 0, TileType.FLOOR);
    expect(s().activeSnapshotId).toBeNull();

    vi.advanceTimersByTime(500);

    useEditorStore.setState(useEditorStore.getInitialState());
    s().restoreSnapshotsFromStorage();

    expect(s().activeSnapshotId).toBeNull();
    expect(s().snapshots.length).toBe(1);
  });

  it('恢复后快照可正常回滚，历史链路完整', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().validate();
    const origTile = level.tiles[0][0];
    s().saveSnapshot('v1');
    s().setTileAt(0, 0, TileType.FLOOR);
    s().saveSnapshot('v2');

    vi.advanceTimersByTime(500);

    useEditorStore.setState(useEditorStore.getInitialState());
    s().restoreSnapshotsFromStorage();
    s().restoreFromStorage();

    expect(s().snapshots.length).toBe(2);

    const v1Snap = s().snapshots.find(ss => ss.name === 'v1');
    expect(v1Snap).not.toBeUndefined();

    s().rollbackToSnapshot(v1Snap!.id);
    expect(s().present.tiles[0][0]).toBe(origTile);
    expect(s().activeSnapshotId).toBe(v1Snap!.id);
    expect(s().lastValidation).not.toBeNull();
  });
});

describe('【新能力】冲突分支后再编辑', () => {
  it('replace 策略冲突导入后，继续编辑并保存新快照，历史完整', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modifiedLevel = JSON.parse(JSON.stringify(level));
    modifiedLevel.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('alpha');
    const localAlphaId = s().snapshots[0].id;

    const currentHistory: HistoryState = {
      past: [{ level: modifiedLevel, validation: null }],
      present: modifiedLevel,
      future: [],
      lastValidation: null,
    };
    const incomingSnapshots: DraftSnapshot[] = [{
      id: 'remote-alpha',
      name: 'alpha',
      createdAt: Date.now(),
      level: JSON.parse(JSON.stringify(modifiedLevel)),
      moveLog: [],
      moveLogInvalidated: false,
      past: [{ level: modifiedLevel, validation: null }],
      future: [],
      lastValidation: null,
    }];

    const pkgJson = exportSnapshotPackage({
      currentLevel: modifiedLevel,
      currentHistory,
      lastValidation: null,
      snapshots: incomingSnapshots,
      activeSnapshotId: 'remote-alpha',
      operationLog: [],
    });

    s().requestPackageImport(pkgJson);
    expect(s().packageImportConflictOpen).toBe(true);

    const result = s().resolvePackageImport('replace');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(1);

    const newAlpha = s().snapshots.find(ss => ss.name === 'alpha');
    expect(newAlpha).not.toBeUndefined();
    expect(newAlpha!.id).not.toBe(localAlphaId);
    expect(newAlpha!.level.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().activeSnapshotId).toBe(newAlpha!.id);

    s().setTileAt(1, 1, TileType.WALL);
    expect(s().activeSnapshotId).toBeNull();
    expect(s().present.tiles[1][1]).toBe(TileType.WALL);
    expect(s().past.length).toBeGreaterThan(0);

    const newSnap = s().saveSnapshot('alpha-fork');
    expect(s().activeSnapshotId).toBe(newSnap.id);
    expect(newSnap.level.tiles[1][1]).toBe(TileType.WALL);
    expect(newSnap.past.length).toBeGreaterThan(newAlpha!.past.length);
  });

  it('rename 策略冲突导入后，两个分支都可继续编辑、独立保存', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modifiedLevel = JSON.parse(JSON.stringify(level));
    modifiedLevel.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('alpha');
    const localAlphaId = s().snapshots[0].id;
    const localAlphaTiles = JSON.stringify(s().snapshots[0].level.tiles);

    const currentHistory: HistoryState = {
      past: [],
      present: modifiedLevel,
      future: [],
      lastValidation: null,
    };
    const incomingSnapshots: DraftSnapshot[] = [{
      id: 'remote-alpha',
      name: 'alpha',
      createdAt: Date.now(),
      level: JSON.parse(JSON.stringify(modifiedLevel)),
      moveLog: [],
      moveLogInvalidated: false,
      past: [],
      future: [],
      lastValidation: null,
    }];

    const pkgJson = exportSnapshotPackage({
      currentLevel: modifiedLevel,
      currentHistory,
      lastValidation: null,
      snapshots: incomingSnapshots,
      activeSnapshotId: 'remote-alpha',
      operationLog: [],
    });

    s().requestPackageImport(pkgJson);
    const result = s().resolvePackageImport('rename');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(2);

    const localAlpha = s().snapshots.find(ss => ss.id === localAlphaId);
    expect(localAlpha).not.toBeUndefined();
    expect(localAlpha!.name).toBe('alpha');
    expect(JSON.stringify(localAlpha!.level.tiles)).toBe(localAlphaTiles);

    const renamedAlpha = s().snapshots.find(ss => ss.name.startsWith('alpha (导入 '));
    expect(renamedAlpha).not.toBeUndefined();
    expect(renamedAlpha!.level.tiles[0][0]).toBe(TileType.FLOOR);

    s().rollbackToSnapshot(localAlphaId);
    expect(s().activeSnapshotId).toBe(localAlphaId);
    s().setTileAt(2, 2, TileType.WALL);
    s().saveSnapshot('alpha-local-v2');

    s().rollbackToSnapshot(renamedAlpha!.id);
    expect(s().activeSnapshotId).toBe(renamedAlpha!.id);
    s().setTileAt(3, 3, TileType.TARGET);
    s().saveSnapshot('alpha-remote-v2');

    expect(s().snapshots.length).toBe(4);
  });

  it('skip 策略冲突导入后，本地快照保留不变，可继续编辑', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    const modifiedLevel = JSON.parse(JSON.stringify(level));
    modifiedLevel.tiles[0][0] = TileType.FLOOR;

    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().saveSnapshot('alpha');
    const localAlphaId = s().snapshots[0].id;
    const localAlphaTiles = JSON.stringify(s().snapshots[0].level.tiles);

    const currentHistory: HistoryState = {
      past: [],
      present: modifiedLevel,
      future: [],
      lastValidation: null,
    };
    const incomingSnapshots: DraftSnapshot[] = [
      {
        id: 'remote-alpha',
        name: 'alpha',
        createdAt: Date.now(),
        level: JSON.parse(JSON.stringify(modifiedLevel)),
        moveLog: [],
        moveLogInvalidated: false,
        past: [],
        future: [],
        lastValidation: null,
      },
      {
        id: 'remote-beta',
        name: 'beta',
        createdAt: Date.now(),
        level: JSON.parse(JSON.stringify(level)),
        moveLog: [],
        moveLogInvalidated: false,
        past: [],
        future: [],
        lastValidation: null,
      },
    ];

    const pkgJson = exportSnapshotPackage({
      currentLevel: modifiedLevel,
      currentHistory,
      lastValidation: null,
      snapshots: incomingSnapshots,
      activeSnapshotId: 'remote-beta',
      operationLog: [],
    });

    s().requestPackageImport(pkgJson);
    const result = s().resolvePackageImport('skip');
    expect(result).toBe(true);
    expect(s().snapshots.length).toBe(2);

    const alphaAfter = s().snapshots.find(ss => ss.id === localAlphaId);
    expect(alphaAfter).not.toBeUndefined();
    expect(alphaAfter!.name).toBe('alpha');
    expect(JSON.stringify(alphaAfter!.level.tiles)).toBe(localAlphaTiles);

    const betaAfter = s().snapshots.find(ss => ss.name === 'beta');
    expect(betaAfter).not.toBeUndefined();

    expect(s().activeSnapshotId).toBe(betaAfter!.id);

    s().rollbackToSnapshot(localAlphaId);
    s().setTileAt(1, 1, TileType.WALL);
    s().saveSnapshot('alpha-local-v2');

    expect(s().snapshots.length).toBe(3);
  });
});

describe('【新能力】导出再导入后继续撤销/重做', () => {
  it('导出有历史的快照包，导入后 undo/redo 历史完整可用', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 0, TileType.FLOOR);
    s().setTileAt(2, 0, TileType.FLOOR);
    expect(s().past.length).toBe(3);
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);

    s().undo();
    s().undo();
    expect(s().past.length).toBe(1);
    expect(s().future.length).toBe(2);
    expect(s().canRedo()).toBe(true);

    s().saveSnapshot('with-history');
    const snapPastLen = s().snapshots[0].past.length;
    const snapFutureLen = s().snapshots[0].future.length;
    expect(snapPastLen).toBe(1);
    expect(snapFutureLen).toBe(2);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().past.length).toBe(snapPastLen);
    expect(s().future.length).toBe(snapFutureLen);
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(true);

    const tilesBeforeUndo = JSON.stringify(s().present.tiles);
    s().undo();
    expect(JSON.stringify(s().present.tiles)).not.toBe(tilesBeforeUndo);
    expect(s().future.length).toBe(snapFutureLen + 1);

    s().redo();
    s().redo();
    s().redo();
    expect(s().present.tiles[0][2]).toBe(TileType.FLOOR);
    expect(s().canRedo()).toBe(false);
  });

  it('导入后继续编辑新增历史，与导入的历史无缝衔接', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    s().setTileAt(0, 0, TileType.FLOOR);
    const pastLenBeforeExport = s().past.length;

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: null,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    expect(s().past.length).toBe(pastLenBeforeExport);

    s().setTileAt(1, 1, TileType.WALL);
    s().setTileAt(2, 2, TileType.TARGET);

    expect(s().past.length).toBe(pastLenBeforeExport + 2);
    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().present.tiles[1][1]).toBe(TileType.WALL);
    expect(s().present.tiles[2][2]).toBe(TileType.TARGET);

    s().undo();
    expect(s().present.tiles[2][2]).not.toBe(TileType.TARGET);
    s().undo();
    expect(s().present.tiles[1][1]).not.toBe(TileType.WALL);
    s().undo();
    expect(s().present.tiles[0][0]).not.toBe(TileType.FLOOR);

    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(true);
  });

  it('回滚到导入的快照后，该快照的历史栈完整，撤销重做正常', () => {
    const samples = createSampleLevels();
    const level = samples[0];
    useEditorStore.setState({
      present: level, past: [], future: [], snapshots: [],
      operationLog: [], lastValidation: null, activeSnapshotId: null,
    });

    const origTile00 = level.tiles[0][0];

    s().setTileAt(0, 0, TileType.FLOOR);
    s().setTileAt(1, 0, TileType.FLOOR);
    s().saveSnapshot('two-floors');
    const twoFloorsSnap = s().snapshots[0];
    expect(twoFloorsSnap.past.length).toBe(2);
    expect(twoFloorsSnap.future.length).toBe(0);

    s().setTileAt(2, 0, TileType.FLOOR);

    const currentHistory: HistoryState = {
      past: JSON.parse(JSON.stringify(s().past)),
      present: JSON.parse(JSON.stringify(s().present)),
      future: JSON.parse(JSON.stringify(s().future)),
      lastValidation: s().lastValidation ? JSON.parse(JSON.stringify(s().lastValidation)) : null,
    };
    const pkgJson = exportSnapshotPackage({
      currentLevel: s().present,
      currentHistory,
      lastValidation: s().lastValidation,
      snapshots: s().snapshots,
      activeSnapshotId: s().activeSnapshotId,
      operationLog: s().operationLog,
    });

    useEditorStore.setState(useEditorStore.getInitialState());
    s().requestPackageImport(pkgJson);
    s().resolvePackageImport('rename');

    const importedTwoFloors = s().snapshots.find(ss => ss.name === 'two-floors');
    expect(importedTwoFloors).not.toBeUndefined();

    s().rollbackToSnapshot(importedTwoFloors!.id);

    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);
    expect(s().present.tiles[0][1]).toBe(TileType.FLOOR);
    expect(s().present.tiles[0][2]).not.toBe(TileType.FLOOR);
    expect(s().past.length).toBe(2);
    expect(s().future.length).toBe(0);
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);

    s().undo();
    expect(s().present.tiles[0][1]).not.toBe(TileType.FLOOR);
    expect(s().present.tiles[0][0]).toBe(TileType.FLOOR);

    s().undo();
    expect(s().present.tiles[0][0]).toBe(origTile00);
    expect(s().canUndo()).toBe(false);

    s().redo();
    s().redo();
    expect(s().present.tiles[0][1]).toBe(TileType.FLOOR);
  });
});
