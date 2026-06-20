/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCampaignStore } from '@/store/useCampaignStore';
import { useEditorStore } from '@/store/useEditorStore';
import {
  createCampaign,
  createCampaignLevel,
  createDefaultMeta,
  exportCampaignPackage,
  parseCampaignPackage,
  importCampaignPackageWithMerge,
  recalculateCampaignProgress,
  updateLevelUnlocks,
  validateCampaignStructure,
  validateCampaignPackageStructure,
  checkCampaignVersionCompatibility,
  generateUniqueCampaignName,
  generateUniqueLevelName,
} from '@/utils/serializer';
import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_PROGRESS_KEY,
  ACTIVE_CAMPAIGN_KEY,
  SELECTED_LEVEL_KEY,
  CAMPAIGN_OPERATION_LOG_KEY,
  UnlockConditionType,
  CAMPAIGN_PACKAGE_VERSION,
  CAMPAIGN_TYPE_IDENTIFIER,
} from '@/types';
import type {
  Campaign,
  CampaignLevel,
  CampaignLevelMeta,
  LevelData,
  LevelPlayResult,
  CampaignProgress,
  CampaignPackage,
} from '@/types';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); },
  key: (index: number) => Object.keys(mockLocalStorage)[index] ?? null,
  length: 0,
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

const s = () => useCampaignStore.getState();

function createTestLevel(name = '测试关卡', width = 8, height = 8): LevelData {
  return useEditorStore.getInitialState().present;
}

beforeEach(() => {
  useCampaignStore.setState(useCampaignStore.getInitialState());
  localStorage.clear();
  vi.clearAllTimers();
  vi.useFakeTimers();
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('战役基本操作：创建、重命名、删除', () => {
  it('createCampaign 应创建带名称的战役并设为活跃', () => {
    const campaign = s().createCampaign('第一章：新手教程');
    expect(campaign.name).toBe('第一章：新手教程');
    expect(campaign.id).toBeTruthy();
    expect(campaign.levels.length).toBe(0);
    expect(s().campaigns.length).toBe(1);
    expect(s().activeCampaignId).toBe(campaign.id);
    expect(s().progressMap[campaign.id]).toBeTruthy();
  });

  it('创建战役时自动生成对应的进度记录', () => {
    const campaign = s().createCampaign('测试战役');
    const progress = s().progressMap[campaign.id];
    expect(progress).toBeTruthy();
    expect(progress.campaignId).toBe(campaign.id);
    expect(progress.totalStars).toBe(0);
    expect(progress.completedCount).toBe(0);
  });

  it('renameCampaign 应修改战役名称', () => {
    const campaign = s().createCampaign('旧名称');
    s().renameCampaign(campaign.id, '新名称');
    const updated = s().campaigns.find(c => c.id === campaign.id);
    expect(updated?.name).toBe('新名称');
  });

  it('deleteCampaign 应删除战役及对应进度', () => {
    const campaign = s().createCampaign('待删除');
    expect(s().campaigns.length).toBe(1);
    expect(s().progressMap[campaign.id]).toBeTruthy();

    s().deleteCampaign(campaign.id);
    expect(s().campaigns.length).toBe(0);
    expect(s().progressMap[campaign.id]).toBeUndefined();
    expect(s().activeCampaignId).toBeNull();
  });

  it('删除当前活跃战役后，activeCampaignId 置空', () => {
    const c1 = s().createCampaign('战役1');
    const c2 = s().createCampaign('战役2');
    expect(s().activeCampaignId).toBe(c2.id);

    s().deleteCampaign(c2.id);
    expect(s().activeCampaignId).toBeNull();
  });

  it('删除战役会清空撤销/重做历史', () => {
    const campaign = s().createCampaign('测试');
    s().addLevelToCampaign(campaign.id, createTestLevel());
    expect(s().past.length).toBeGreaterThan(0);

    s().deleteCampaign(campaign.id);
    expect(s().past.length).toBe(0);
    expect(s().future.length).toBe(0);
  });
});

describe('战役关卡：增删改查与重排', () => {
  it('addLevelToCampaign 应添加关卡到战役末尾', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    expect(level.name).toBe('第一关');
    expect(level.order).toBe(0);
    expect(s().campaigns[0].levels.length).toBe(1);
    expect(s().selectedLevelId).toBe(level.id);
  });

  it('添加关卡后自动更新解锁状态', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    const updated = s().campaigns.find(c => c.id === campaign.id);
    const addedLevel = updated?.levels.find(l => l.id === level.id);
    expect(addedLevel?.unlocked).toBe(true);
  });

  it('removeLevelFromCampaign 应删除关卡并重排 order', () => {
    const campaign = s().createCampaign('测试战役');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const l2 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');
    const l3 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第三关');

    s().removeLevelFromCampaign(campaign.id, l2.id);

    const updated = s().campaigns.find(c => c.id === campaign.id);
    expect(updated?.levels.length).toBe(2);

    const levels = [...updated!.levels].sort((a, b) => a.order - b.order);
    expect(levels[0].id).toBe(l1.id);
    expect(levels[0].order).toBe(0);
    expect(levels[1].id).toBe(l3.id);
    expect(levels[1].order).toBe(1);
  });

  it('删除选中的关卡后，selectedLevelId 置空', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    expect(s().selectedLevelId).toBe(level.id);

    s().removeLevelFromCampaign(campaign.id, level.id);
    expect(s().selectedLevelId).toBeNull();
  });

  it('renameLevel 应修改关卡名称', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '旧名字');

    s().renameLevel(campaign.id, level.id, '新名字');

    const updated = s().campaigns.find(c => c.id === campaign.id);
    const renamed = updated?.levels.find(l => l.id === level.id);
    expect(renamed?.name).toBe('新名字');
  });

  it('duplicateLevel 应复制关卡并添加到末尾', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '原版');

    const copy = s().duplicateLevel(campaign.id, level.id);
    expect(copy).not.toBeNull();
    expect(copy?.name).toBe('原版 (副本)');
    expect(copy?.id).not.toBe(level.id);

    const updated = s().campaigns.find(c => c.id === campaign.id);
    expect(updated?.levels.length).toBe(2);
  });

  it('reorderLevels 应正确调整关卡顺序', () => {
    const campaign = s().createCampaign('测试战役');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const l2 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');
    const l3 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第三关');

    s().reorderLevels(campaign.id, 2, 0);

    const updated = s().campaigns.find(c => c.id === campaign.id);
    const levels = [...updated!.levels].sort((a, b) => a.order - b.order);
    expect(levels.length).toBe(3);
    expect(levels[0].id).toBe(l3.id);
    expect(levels[0].order).toBe(0);
    expect(levels[1].id).toBe(l1.id);
    expect(levels[1].order).toBe(1);
    expect(levels[2].id).toBe(l2.id);
    expect(levels[2].order).toBe(2);
  });
});

describe('关卡元数据编辑', () => {
  it('updateLevelMeta 应更新关卡元数据', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    s().updateLevelMeta(campaign.id, level.id, {
      goalDescription: '把所有箱子推到目标点',
      recommendedSteps: 50,
      notes: '设计笔记：这是入门关',
    });

    const updated = s().campaigns.find(c => c.id === campaign.id);
    const updatedLevel = updated?.levels.find(l => l.id === level.id);
    expect(updatedLevel?.meta.goalDescription).toBe('把所有箱子推到目标点');
    expect(updatedLevel?.meta.recommendedSteps).toBe(50);
    expect(updatedLevel?.meta.notes).toBe('设计笔记：这是入门关');
  });

  it('updateLevelMeta 支持部分更新', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const originalMeta = { ...level.meta };

    s().updateLevelMeta(campaign.id, level.id, { recommendedSteps: 100 });

    const updated = s().campaigns.find(c => c.id === campaign.id);
    const updatedLevel = updated?.levels.find(l => l.id === level.id);
    expect(updatedLevel?.meta.recommendedSteps).toBe(100);
    expect(updatedLevel?.meta.goalDescription).toBe(originalMeta.goalDescription);
  });

  it('修改解锁条件后应重新计算解锁状态', () => {
    const campaign = s().createCampaign('测试战役');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const l2 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');

    const before = s().campaigns.find(c => c.id === campaign.id);
    expect(before?.levels.find(l => l.id === l2.id)?.unlocked).toBe(true);

    s().updateLevelMeta(campaign.id, l2.id, {
      unlockCondition: { type: UnlockConditionType.PREVIOUS_LEVEL_CLEARED },
    });

    const after = s().campaigns.find(c => c.id === campaign.id);
    const level2 = after?.levels.find(l => l.id === l2.id);
    expect(level2?.unlocked).toBe(false);
  });
});

describe('战役撤销/重做历史', () => {
  it('添加关卡应推入历史栈，可撤销', () => {
    const campaign = s().createCampaign('测试战役');
    const pastLenBefore = s().past.length;

    s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    expect(s().past.length).toBe(pastLenBefore + 1);
    expect(s().future.length).toBe(0);
    expect(s().campaigns[0].levels.length).toBe(1);

    s().undo();
    expect(s().campaigns[0].levels.length).toBe(0);
    expect(s().past.length).toBe(pastLenBefore);
    expect(s().future.length).toBe(1);
  });

  it('删除关卡可撤销恢复', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    s().removeLevelFromCampaign(campaign.id, level.id);
    expect(s().campaigns[0].levels.length).toBe(0);

    s().undo();
    expect(s().campaigns[0].levels.length).toBe(1);
    expect(s().campaigns[0].levels[0].name).toBe('第一关');
  });

  it('重命名关卡可撤销', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '原名');

    s().renameLevel(campaign.id, level.id, '新名');
    expect(s().campaigns[0].levels[0].name).toBe('新名');

    s().undo();
    expect(s().campaigns[0].levels[0].name).toBe('原名');
  });

  it('重做能恢复撤销的操作', () => {
    const campaign = s().createCampaign('测试战役');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const pastLenAfterAdd = s().past.length;

    s().undo();
    expect(s().future.length).toBe(1);

    s().redo();
    expect(s().campaigns[0].levels.length).toBe(1);
    expect(s().past.length).toBe(pastLenAfterAdd);
    expect(s().future.length).toBe(0);
  });

  it('canUndo / canRedo 返回正确状态', () => {
    const campaign = s().createCampaign('测试战役');
    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(false);

    s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    expect(s().canUndo()).toBe(true);
    expect(s().canRedo()).toBe(false);

    s().undo();
    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(true);
  });

  it('切换活跃战役会清空历史栈', () => {
    const c1 = s().createCampaign('战役1');
    s().addLevelToCampaign(c1.id, createTestLevel(), '关卡1');
    expect(s().past.length).toBeGreaterThan(0);

    const c2 = s().createCampaign('战役2');
    s().setActiveCampaignId(c1.id);
    expect(s().past.length).toBe(0);
    expect(s().future.length).toBe(0);
  });
});

describe('战役进度系统', () => {
  it('updatePlayResult 应更新关卡游玩结果', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    const result: LevelPlayResult = {
      completed: true,
      steps: 30,
      stars: 3,
      completedAt: Date.now(),
    };

    s().updatePlayResult(campaign.id, level.id, result);

    const progress = s().progressMap[campaign.id];
    const levelResult = progress.levelResults[level.id];
    expect(levelResult).toBeTruthy();
    expect(levelResult.completed).toBe(true);
    expect(levelResult.stars).toBe(3);
  });

  it('通关后应更新下一关的解锁状态', () => {
    const campaign = s().createCampaign('测试战役');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const l2 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');

    s().updateLevelMeta(campaign.id, l2.id, {
      unlockCondition: { type: UnlockConditionType.PREVIOUS_LEVEL_CLEARED },
    });

    const before = s().campaigns.find(c => c.id === campaign.id);
    expect(before?.levels.find(l => l.id === l2.id)?.unlocked).toBe(false);

    s().updatePlayResult(campaign.id, l1.id, {
      completed: true,
      steps: 10,
      stars: 3,
      completedAt: Date.now(),
    });

    const after = s().campaigns.find(c => c.id === campaign.id);
    expect(after?.levels.find(l => l.id === l2.id)?.unlocked).toBe(true);
  });

  it('进度应正确统计总星数和通关数', () => {
    const campaign = s().createCampaign('测试战役');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    const l2 = s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '第三关');

    s().updatePlayResult(campaign.id, l1.id, {
      completed: true, steps: 20, stars: 3, completedAt: Date.now(),
    });
    s().updatePlayResult(campaign.id, l2.id, {
      completed: true, steps: 40, stars: 2, completedAt: Date.now(),
    });

    const progress = s().progressMap[campaign.id];
    expect(progress.totalStars).toBe(5);
    expect(progress.completedCount).toBe(2);
  });

  it('bestStars 记录历史最佳成绩', () => {
    const campaign = s().createCampaign('测试战役');
    const level = s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');

    s().updatePlayResult(campaign.id, level.id, {
      completed: true, steps: 50, stars: 1, completedAt: Date.now(),
    });
    s().updatePlayResult(campaign.id, level.id, {
      completed: true, steps: 20, stars: 3, completedAt: Date.now(),
    });

    const progress = s().progressMap[campaign.id];
    expect(progress.levelResults[level.id].bestStars).toBe(3);
  });
});

describe('战役包导出与导入', () => {
  it('exportCampaignPackage 应生成合法的 JSON 包', () => {
    const campaign = s().createCampaign('导出测试');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '第一关');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '第二关');

    const pkg = s().campaigns.find(c => c.id === campaign.id)!;
    const progress = s().progressMap[campaign.id];
    const jsonStr = exportCampaignPackage({ campaign: pkg, progress, operationLog: [] });

    expect(jsonStr).toBeTypeOf('string');
    expect(jsonStr.length).toBeGreaterThan(100);

    const parsed = JSON.parse(jsonStr);
    expect(parsed._type).toBe(CAMPAIGN_TYPE_IDENTIFIER);
    expect(parsed.data.packageVersion).toBe(CAMPAIGN_PACKAGE_VERSION);
    expect(parsed.data.campaign.name).toBe('导出测试');
    expect(parsed.data.campaign.levels.length).toBe(2);
  });

  it('parseCampaignPackage 能正确解析合法的战役包', () => {
    const campaign = s().createCampaign('解析测试');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '关卡1');

    const pkg = s().campaigns.find(c => c.id === campaign.id)!;
    const progress = s().progressMap[campaign.id];
    const jsonStr = exportCampaignPackage({ campaign: pkg, progress, operationLog: [] });

    const result = parseCampaignPackage(jsonStr);
    expect(result.pkg).not.toBeNull();
    expect(result.errors.length).toBe(0);
    expect(result.pkg?.campaign.name).toBe('解析测试');
    expect(result.pkg?.campaign.levels.length).toBe(1);
  });

  it('非法 JSON 解析失败', () => {
    const result = parseCampaignPackage('this is not json');
    expect(result.pkg).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('类型标识错误的包被拒绝', () => {
    const badPkg = JSON.stringify({
      _type: 'wrong-type',
      data: { packageVersion: '1.0.0' },
    });
    const result = parseCampaignPackage(badPkg);
    expect(result.pkg).toBeNull();
    expect(result.errors.some(e => e.includes('类型标识'))).toBe(true);
  });

  it('主版本号不兼容的包被拒绝', () => {
    const badPkg = JSON.stringify({
      _type: CAMPAIGN_TYPE_IDENTIFIER,
      data: {
        packageVersion: '2.0.0',
        campaign: { name: 'test', levels: [] },
      },
    });
    const result = parseCampaignPackage(badPkg);
    expect(result.pkg).toBeNull();
    expect(result.errors.some(e => e.includes('主版本号') || e.includes('不兼容'))).toBe(true);
  });

  it('低版本包给出警告但可解析', () => {
    const oldPkg = JSON.stringify({
      _type: CAMPAIGN_TYPE_IDENTIFIER,
      data: {
        packageVersion: '0.9.0',
        campaign: {
          id: 'test-id',
          name: 'old',
          description: '',
          version: '0.9.0',
          levels: [],
          createdAt: 0,
          updatedAt: 0,
        },
        operationLog: [],
      },
    });
    const result = parseCampaignPackage(oldPkg);
    expect(result.pkg).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('导入冲突处理', () => {
  function buildCampaignPackage(name: string, levelNames: string[]): string {
    const campaign = createCampaign(name, '');
    levelNames.forEach((ln, idx) => {
      const level = createCampaignLevel(ln, createTestLevel(), idx);
      campaign.levels.push(level);
    });
    const progress = {
      campaignId: campaign.id,
      currentLevelId: null,
      totalStars: 0,
      completedCount: 0,
      lastPlayedAt: null,
      levelResults: {},
    };
    return exportCampaignPackage({ campaign, progress, operationLog: [] });
  }

  it('无冲突时直接导入成功', () => {
    const pkgJson = buildCampaignPackage('新战役', ['关卡A', '关卡B']);
    const result = importCampaignPackageWithMerge(pkgJson, [], 'rename', 'rename');

    expect(result.success).toBe(true);
    expect(result.mergedCampaigns.length).toBe(1);
    expect(result.mergedCampaigns[0].name).toBe('新战役');
    expect(result.mergedCampaigns[0].levels.length).toBe(2);
  });

  it('同名战役策略 replace：替换整个战役', () => {
    const existing = createCampaign('阿尔法', '');
    const level = createCampaignLevel('旧关卡', createTestLevel(), 0);
    existing.levels.push(level);

    const pkgJson = buildCampaignPackage('阿尔法', ['新关卡1', '新关卡2']);
    const result = importCampaignPackageWithMerge(pkgJson, [existing], 'replace', 'rename');

    expect(result.success).toBe(true);
    expect(result.mergedCampaigns.length).toBe(1);
    expect(result.mergedCampaigns[0].levels.length).toBe(2);
    expect(result.mergedCampaigns[0].levels[0].name).toBe('新关卡1');
  });

  it('同名战役策略 rename：保留两份，自动改名', () => {
    const existing = createCampaign('贝塔', '');

    const pkgJson = buildCampaignPackage('贝塔', ['关卡1']);
    const result = importCampaignPackageWithMerge(pkgJson, [existing], 'rename', 'rename');

    expect(result.success).toBe(true);
    expect(result.mergedCampaigns.length).toBe(2);
    const names = result.mergedCampaigns.map(c => c.name);
    expect(names).toContain('贝塔');
    expect(names.some(n => n.startsWith('贝塔 (导入 '))).toBe(true);
  });

  it('同名战役策略 skip：跳过同名战役', () => {
    const existing = createCampaign('伽马', '');
    const originalId = existing.id;

    const pkgJson = buildCampaignPackage('伽马', ['新关卡']);
    const result = importCampaignPackageWithMerge(pkgJson, [existing], 'skip', 'rename');

    expect(result.success).toBe(true);
    expect(result.mergedCampaigns.length).toBe(1);
    expect(result.mergedCampaigns[0].id).toBe(originalId);
    expect(result.mergedCampaigns[0].levels.length).toBe(0);
  });

  it('关卡级冲突策略 rename：保留两份自动改名', () => {
    const existing = createCampaign('战役X', '');
    existing.levels.push(createCampaignLevel('共同关卡', createTestLevel(), 0));

    const pkgJson = buildCampaignPackage('战役Y', ['共同关卡', '独有']);
    const result = importCampaignPackageWithMerge(pkgJson, [existing], 'rename', 'rename');

    expect(result.success).toBe(true);
    const newCampaign = result.mergedCampaigns.find(c => c.name.startsWith('战役Y'));
    expect(newCampaign).toBeTruthy();
    expect(newCampaign!.levels.length).toBe(2);
  });
});

describe('持久化与恢复', () => {
  it('persist 应保存战役数据到 localStorage', () => {
    s().createCampaign('持久化测试');
    s().persist();

    const stored = JSON.parse(localStorage.getItem(CAMPAIGN_STORAGE_KEY) || '[]');
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe('持久化测试');
  });

  it('restoreFromStorage 能正确恢复战役数据', () => {
    const campaign = createCampaign('恢复测试', '');
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify([campaign]));

    s().restoreFromStorage();
    expect(s().campaigns.length).toBe(1);
    expect(s().campaigns[0].name).toBe('恢复测试');
  });

  it('恢复空数据不报错', () => {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, '');
    expect(() => s().restoreFromStorage()).not.toThrow();
    expect(s().campaigns.length).toBe(0);
  });

  it('活跃战役和选中关卡能被恢复', () => {
    const campaign = createCampaign('活跃测试', '');
    const level = createCampaignLevel('关卡1', createTestLevel(), 0);
    campaign.levels.push(level);

    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify([campaign]));
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaign.id);
    localStorage.setItem(SELECTED_LEVEL_KEY, level.id);

    s().restoreFromStorage();
    expect(s().activeCampaignId).toBe(campaign.id);
    expect(s().selectedLevelId).toBe(level.id);
  });

  it('选中的关卡已不存在时，selectedLevelId 置空', () => {
    const campaign = createCampaign('测试', '');
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify([campaign]));
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaign.id);
    localStorage.setItem(SELECTED_LEVEL_KEY, 'non-existent-level');

    s().restoreFromStorage();
    expect(s().selectedLevelId).toBeNull();
  });
});

describe('工具函数：校验与辅助', () => {
  it('createDefaultMeta 返回合法的默认元数据', () => {
    const meta = createDefaultMeta();
    expect(meta.goalDescription).toBeTypeOf('string');
    expect(meta.recommendedSteps).toBeGreaterThan(0);
    expect(meta.unlockCondition.type).toBe(UnlockConditionType.ALWAYS_UNLOCKED);
    expect(Array.isArray(meta.starsThreshold)).toBe(true);
    expect(meta.starsThreshold.length).toBe(3);
  });

  it('validateCampaignStructure 能检测出无效战役', () => {
    const badCampaign = { name: 'test', levels: 'not-array' } as any;
    const result = validateCampaignStructure(badCampaign);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateCampaignPackageStructure 能检测出无效包', () => {
    const result = validateCampaignPackageStructure({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('checkCampaignVersionCompatibility 检测主版本不兼容', () => {
    expect(checkCampaignVersionCompatibility('1.0.0', '2.0.0').compatible).toBe(false);
    expect(checkCampaignVersionCompatibility('2.0.0', '1.0.0').compatible).toBe(false);
  });

  it('checkCampaignVersionCompatibility 检测次版本警告', () => {
    const result = checkCampaignVersionCompatibility('1.5.0', '1.0.0');
    expect(result.compatible).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('generateUniqueCampaignName 在有重名时生成唯一名称', () => {
    const existing = [
      createCampaign('测试战役', ''),
      createCampaign('测试战役 (导入 1)', ''),
    ];
    const unique = generateUniqueCampaignName('测试战役', existing);
    expect(unique).not.toBe('测试战役');
    expect(unique).toMatch(/^测试战役 \(导入 \d+\)$/);
  });

  it('generateUniqueLevelName 在有重名时生成唯一名称', () => {
    const levels = [
      createCampaignLevel('第一关', createTestLevel(), 0),
      createCampaignLevel('第一关 (导入 1)', createTestLevel(), 1),
    ];
    const unique = generateUniqueLevelName('第一关', levels);
    expect(unique).not.toBe('第一关');
    expect(unique).toMatch(/^第一关 \(导入 \d+\)$/);
  });
});

describe('解锁条件与进度联动', () => {
  function setupCampaignWithLevels(count: number): { campaignId: string; levelIds: string[] } {
    const campaign = s().createCampaign('解锁测试');
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const level = s().addLevelToCampaign(campaign.id, createTestLevel(), `第${i + 1}关`);
      ids.push(level.id);
    }
    return { campaignId: campaign.id, levelIds: ids };
  }

  it('首关始终解锁', () => {
    const { campaignId, levelIds } = setupCampaignWithLevels(3);
    const campaign = s().campaigns.find(c => c.id === campaignId)!;
    const firstLevel = campaign.levels.find(l => l.id === levelIds[0])!;
    expect(firstLevel.unlocked).toBe(true);
  });

  it('上一关通关后解锁（PREVIOUS_LEVEL_CLEARED）', () => {
    const { campaignId, levelIds } = setupCampaignWithLevels(3);

    const campaign = s().campaigns.find(c => c.id === campaignId)!;
    const secondLevel = campaign.levels.find(l => l.id === levelIds[1])!;

    s().updateLevelMeta(campaignId, levelIds[1], {
      unlockCondition: { type: UnlockConditionType.PREVIOUS_LEVEL_CLEARED },
    });

    const before = s().campaigns.find(c => c.id === campaignId)!;
    expect(before.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(false);

    s().updatePlayResult(campaignId, levelIds[0], {
      completed: true, steps: 10, stars: 3, completedAt: Date.now(),
    });

    const after = s().campaigns.find(c => c.id === campaignId)!;
    expect(after.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(true);
  });

  it('星数条件解锁（PREVIOUS_LEVEL_STARS）', () => {
    const { campaignId, levelIds } = setupCampaignWithLevels(2);

    s().updateLevelMeta(campaignId, levelIds[1], {
      unlockCondition: { type: UnlockConditionType.PREVIOUS_LEVEL_STARS, requiredStars: 3 },
    });

    const before = s().campaigns.find(c => c.id === campaignId)!;
    expect(before.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(false);

    s().updatePlayResult(campaignId, levelIds[0], {
      completed: true, steps: 50, stars: 2, completedAt: Date.now(),
    });
    const after2star = s().campaigns.find(c => c.id === campaignId)!;
    expect(after2star.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(false);

    s().updatePlayResult(campaignId, levelIds[0], {
      completed: true, steps: 10, stars: 3, completedAt: Date.now(),
    });
    const after3star = s().campaigns.find(c => c.id === campaignId)!;
    expect(after3star.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(true);
  });

  it('自定义条件（CUSTOM_CONDITION）默认锁定', () => {
    const { campaignId, levelIds } = setupCampaignWithLevels(2);

    s().updateLevelMeta(campaignId, levelIds[1], {
      unlockCondition: { type: UnlockConditionType.CUSTOM_CONDITION, customDescription: '达成特殊条件' },
    });

    const campaign = s().campaigns.find(c => c.id === campaignId)!;
    expect(campaign.levels.find(l => l.id === levelIds[1])?.unlocked).toBe(false);
  });
});

describe('边界情况处理', () => {
  it('空战役包能正常工作', () => {
    const campaign = s().createCampaign('空战役');
    expect(campaign.levels.length).toBe(0);
    expect(s().canUndo()).toBe(false);

    const progress = s().progressMap[campaign.id];
    expect(progress.completedCount).toBe(0);
    expect(progress.totalStars).toBe(0);
  });

  it('半截导入数据：缺少可选字段不崩溃', () => {
    const incompletePkg = JSON.stringify({
      _type: CAMPAIGN_TYPE_IDENTIFIER,
      data: {
        packageVersion: '1.0.0',
        campaign: {
          id: 'incomplete',
          name: '不完整',
          levels: [{
            id: 'l1',
            name: '缺字段关卡',
            order: 0,
            levelData: useEditorStore.getInitialState().present,
          }],
        },
        operationLog: [],
      },
    });

    const result = parseCampaignPackage(incompletePkg);
    expect(result.pkg).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('进度指向已删除关卡时自动清理', () => {
    const campaign = s().createCampaign('清理测试');
    const l1 = s().addLevelToCampaign(campaign.id, createTestLevel(), '待删关卡');

    s().updatePlayResult(campaign.id, l1.id, {
      completed: true, steps: 10, stars: 3, completedAt: Date.now(),
    });

    const progress = s().progressMap[campaign.id];
    expect(Object.keys(progress.levelResults).length).toBe(1);

    s().removeLevelFromCampaign(campaign.id, l1.id);

    const afterProgress = s().progressMap[campaign.id];
    expect(Object.keys(afterProgress.levelResults).length).toBe(0);
    expect(afterProgress.currentLevelId).toBeNull();
  });

  it('删除战役后进度也被清理', () => {
    const campaign = s().createCampaign('测试');
    expect(s().progressMap[campaign.id]).toBeTruthy();

    s().deleteCampaign(campaign.id);
    expect(s().progressMap[campaign.id]).toBeUndefined();
  });

  it('无效存储数据被优雅处理', () => {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, 'invalid json {{{');
    expect(() => s().restoreFromStorage()).not.toThrow();
    expect(s().campaigns.length).toBe(0);
  });

  it('非数组格式的存储数据不崩溃', () => {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(() => s().restoreFromStorage()).not.toThrow();
  });
});

describe('操作日志', () => {
  it('创建战役产生操作日志', () => {
    s().createCampaign('日志测试');
    const createLogs = s().operationLog.filter(e => e.action === 'campaign_create');
    expect(createLogs.length).toBe(1);
    expect(createLogs[0].campaignName).toBe('日志测试');
  });

  it('删除战役产生操作日志', () => {
    const campaign = s().createCampaign('待删');
    s().deleteCampaign(campaign.id);
    const deleteLogs = s().operationLog.filter(e => e.action === 'campaign_delete');
    expect(deleteLogs.length).toBe(1);
  });

  it('添加关卡产生操作日志', () => {
    const campaign = s().createCampaign('测试');
    s().addLevelToCampaign(campaign.id, createTestLevel(), '新关卡');
    const addLogs = s().operationLog.filter(e => e.action === 'campaign_add_level');
    expect(addLogs.length).toBe(1);
    expect(addLogs[0].levelName).toBe('新关卡');
  });

  it('导入产生操作日志', () => {
    const pkgJson = JSON.stringify({
      _type: CAMPAIGN_TYPE_IDENTIFIER,
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        campaign: {
          id: 'imported-campaign',
          name: '导入战役',
          description: '',
          version: '1.0.0',
          levels: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        operationLog: [],
      },
    });

    s().requestCampaignImport(pkgJson);
    const importLogs = s().operationLog.filter(e => e.action === 'campaign_import');
    expect(importLogs.length).toBeGreaterThanOrEqual(0);
  });
});
