import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { createSampleLevels, exportToJSON } from '@/utils/serializer';
import { Direction, WinCondition, TileType, STORAGE_KEY, HistoryEntry, SNAPSHOT_STORAGE_KEY, OPERATION_LOG_KEY, ACTIVE_SNAPSHOT_KEY } from '@/types';

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
