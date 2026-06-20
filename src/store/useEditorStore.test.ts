import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { createSampleLevels } from '@/utils/serializer';
import { Direction, WinCondition, TileType, STORAGE_KEY, HistoryEntry } from '@/types';

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
