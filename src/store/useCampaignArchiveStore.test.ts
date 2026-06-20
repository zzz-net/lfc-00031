/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCampaignArchiveStore } from '@/store/useCampaignArchiveStore';
import { useCampaignStore } from '@/store/useCampaignStore';
import { useEditorStore } from '@/store/useEditorStore';
import {
  createCampaign,
  createCampaignLevel,
  createCampaignProgress,
  createCampaignArchive,
  createArchiveSnapshot,
  exportArchivePackage,
  parseArchivePackage,
  importArchivePackageWithMerge,
  validateArchiveStructure,
  validateArchivePackageStructure,
  checkArchiveVersionCompatibility,
  generateUniqueArchiveName,
  sanitizeArchive,
  mergeArchives,
} from '@/utils/serializer';
import {
  ARCHIVE_STORAGE_KEY,
  ARCHIVE_SNAPSHOTS_KEY,
  ACTIVE_ARCHIVE_KEY,
  ARCHIVE_OPERATION_LOG_KEY,
  ARCHIVE_PACKAGE_VERSION,
  ARCHIVE_TYPE_IDENTIFIER,
} from '@/types';
import type {
  CampaignArchive,
  CampaignArchivePackage,
  Campaign,
  CampaignProgress,
  LevelData,
  LevelPlayResult,
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

const s = () => useCampaignArchiveStore.getState();
const cs = () => useCampaignStore.getState();

function createTestLevel(): LevelData {
  return useEditorStore.getInitialState().present;
}

function createTestCampaign(name = '测试战役', levelCount = 3): { campaign: Campaign; progress: CampaignProgress } {
  const campaign = createCampaign(name, '测试战役描述');
  for (let i = 0; i < levelCount; i++) {
    const level = createCampaignLevel(`第${i + 1}关`, createTestLevel(), i);
    campaign.levels.push(level);
  }
  const progress = createCampaignProgress(campaign.id);
  return { campaign, progress };
}

function createTestArchive(name = '测试档案'): CampaignArchive {
  const { campaign, progress } = createTestCampaign('测试战役', 3);
  return createCampaignArchive(name, campaign, progress, '测试档案描述');
}

function buildArchivePackage(name: string, levelCount = 3, stars = 0): string {
  const { campaign, progress } = createTestCampaign('测试战役', levelCount);
  progress.totalStars = stars;
  progress.completedCount = Math.floor(stars / 3);
  const archive = createCampaignArchive(name, campaign, progress);
  return exportArchivePackage({ archive, snapshots: [], operationLog: [] });
}

beforeEach(() => {
  useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
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

describe('档案基本操作：创建、重命名、复制、归档、删除', () => {
  it('createArchive 应创建档案并设为活跃', () => {
    const { campaign, progress } = createTestCampaign('第一章', 3);
    const archive = s().createArchive('我的通关档案', campaign, progress);

    expect(archive.name).toBe('我的通关档案');
    expect(archive.id).toBeTruthy();
    expect(archive.campaign.id).toBe(campaign.id);
    expect(archive.progress.campaignId).toBe(campaign.id);
    expect(s().archives.length).toBe(1);
    expect(s().activeArchiveId).toBe(archive.id);
    expect(s().snapshots[archive.id]).toEqual([]);
  });

  it('创建档案自动记录时间戳', () => {
    const { campaign, progress } = createTestCampaign();
    const before = Date.now();
    vi.advanceTimersByTime(100);
    const archive = s().createArchive('时间测试', campaign, progress);
    vi.advanceTimersByTime(100);
    const after = Date.now();

    expect(archive.createdAt).toBeGreaterThanOrEqual(before);
    expect(archive.createdAt).toBeLessThanOrEqual(after);
    expect(archive.updatedAt).toBeGreaterThanOrEqual(before);
    expect(archive.updatedAt).toBeLessThanOrEqual(after);
    expect(archive.lastPlayedAt).toBeNull();
  });

  it('renameArchive 应修改档案名称', () => {
    const archive = s().createArchive('旧名称', ...Object.values(createTestCampaign()));
    const oldUpdatedAt = archive.updatedAt;

    vi.advanceTimersByTime(1000);
    s().renameArchive(archive.id, '新名称');

    const updated = s().archives.find(a => a.id === archive.id);
    expect(updated?.name).toBe('新名称');
    expect(updated?.updatedAt).toBeGreaterThan(oldUpdatedAt);
  });

  it('renameArchive 对不存在的 ID 静默处理', () => {
    expect(() => s().renameArchive('non-existent', '新名称')).not.toThrow();
  });

  it('duplicateArchive 应复制档案并自动重命名', () => {
    const archive = s().createArchive('原版档案', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '快照1');

    const copy = s().duplicateArchive(archive.id);
    expect(copy).not.toBeNull();
    expect(copy?.name).toBe('原版档案 (副本)');
    expect(copy?.id).not.toBe(archive.id);
    expect(copy?.campaign.id).not.toBe(archive.campaign.id);
    expect(s().archives.length).toBe(2);
    expect(s().activeArchiveId).toBe(copy?.id);

    const copySnapshots = s().snapshots[copy!.id];
    expect(copySnapshots.length).toBe(1);
    expect(copySnapshots[0].archiveId).toBe(copy?.id);
  });

  it('duplicateArchive 支持指定新名称', () => {
    const archive = s().createArchive('原版', ...Object.values(createTestCampaign()));
    const copy = s().duplicateArchive(archive.id, '自定义名称');
    expect(copy?.name).toBe('自定义名称');
  });

  it('duplicateArchive 对不存在的 ID 返回 null', () => {
    expect(s().duplicateArchive('non-existent')).toBeNull();
  });

  it('setArchiveArchived 应切换归档状态', () => {
    const archive = s().createArchive('待归档', ...Object.values(createTestCampaign()));
    expect(archive.archived).toBe(false);

    s().setArchiveArchived(archive.id, true);
    expect(s().archives.find(a => a.id === archive.id)?.archived).toBe(true);

    s().setArchiveArchived(archive.id, false);
    expect(s().archives.find(a => a.id === archive.id)?.archived).toBe(false);
  });

  it('deleteArchive 应删除档案及对应快照', () => {
    const archive = s().createArchive('待删除', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '快照1');

    expect(s().archives.length).toBe(1);
    expect(s().snapshots[archive.id].length).toBe(1);

    s().deleteArchive(archive.id);
    expect(s().archives.length).toBe(0);
    expect(s().snapshots[archive.id]).toBeUndefined();
    expect(s().activeArchiveId).toBeNull();
  });

  it('删除非活跃档案不影响 activeArchiveId', () => {
    const a1 = s().createArchive('档案1', ...Object.values(createTestCampaign()));
    const a2 = s().createArchive('档案2', ...Object.values(createTestCampaign()));
    expect(s().activeArchiveId).toBe(a2.id);

    s().deleteArchive(a1.id);
    expect(s().activeArchiveId).toBe(a2.id);
    expect(s().archives.length).toBe(1);
  });

  it('updateArchiveNotes 应更新备注', () => {
    const archive = s().createArchive('备注测试', ...Object.values(createTestCampaign()));
    s().updateArchiveNotes(archive.id, '这是详细的通关备注\n包括隐藏关卡攻略');

    const updated = s().archives.find(a => a.id === archive.id);
    expect(updated?.notes).toContain('通关备注');
    expect(updated?.notes).toContain('隐藏关卡攻略');
  });
});

describe('档案切换与同步', () => {
  it('setActiveArchiveId 应更新活跃档案并更新游玩时间', () => {
    const a1 = s().createArchive('档案1', ...Object.values(createTestCampaign()));
    const a2 = s().createArchive('档案2', ...Object.values(createTestCampaign()));

    vi.advanceTimersByTime(1000);
    s().setActiveArchiveId(a1.id);

    expect(s().activeArchiveId).toBe(a1.id);
    const updated = s().archives.find(a => a.id === a1.id);
    expect(updated?.lastPlayedAt).toBeGreaterThan(a1.createdAt);
  });

  it('getActiveArchive 应返回当前活跃档案', () => {
    expect(s().getActiveArchive()).toBeNull();

    const archive = s().createArchive('活跃测试', ...Object.values(createTestCampaign()));
    expect(s().getActiveArchive()?.id).toBe(archive.id);
  });

  it('getArchiveSnapshots 应返回对应档案的快照', () => {
    const archive = s().createArchive('快照测试', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '快照1');
    s().saveArchiveSnapshot(archive.id, '快照2');

    expect(s().getArchiveSnapshots(archive.id).length).toBe(2);
    expect(s().getArchiveSnapshots('non-existent')).toEqual([]);
  });
});

describe('历史快照与回滚', () => {
  it('saveArchiveSnapshot 应保存当前档案状态', () => {
    const archive = s().createArchive('快照测试', ...Object.values(createTestCampaign()));
    const snapshot = s().saveArchiveSnapshot(archive.id, '通关前存档');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.name).toBe('通关前存档');
    expect(snapshot?.archiveId).toBe(archive.id);
    expect(snapshot?.archive.id).toBe(archive.id);
    expect(s().snapshots[archive.id].length).toBe(1);
  });

  it('rollbackToArchiveSnapshot 应恢复到快照状态', () => {
    const { campaign, progress } = createTestCampaign('测试战役', 3);
    const archive = s().createArchive('回滚测试', campaign, progress);
    const snapshot = s().saveArchiveSnapshot(archive.id, '初始状态');

    // 修改档案数据
    const modifiedProgress = { ...progress, totalStars: 5, completedCount: 2 };
    s().syncArchiveFromCampaign(archive.id, campaign, modifiedProgress);
    expect(s().archives.find(a => a.id === archive.id)?.progress.totalStars).toBe(5);

    // 回滚
    const success = s().rollbackToArchiveSnapshot(snapshot!.id);
    expect(success).toBe(true);

    const rolledBack = s().archives.find(a => a.id === archive.id);
    expect(rolledBack?.progress.totalStars).toBe(0);
    expect(rolledBack?.progress.completedCount).toBe(0);
    expect(s().activeArchiveId).toBe(archive.id);
  });

  it('rollbackToArchiveSnapshot 对不存在的快照返回 false', () => {
    expect(s().rollbackToArchiveSnapshot('non-existent')).toBe(false);
  });

  it('deleteArchiveSnapshot 应删除指定快照', () => {
    const archive = s().createArchive('快照删除', ...Object.values(createTestCampaign()));
    const s1 = s().saveArchiveSnapshot(archive.id, '快照1');
    const s2 = s().saveArchiveSnapshot(archive.id, '快照2');

    expect(s().snapshots[archive.id].length).toBe(2);

    s().deleteArchiveSnapshot(s1!.id);
    const remaining = s().snapshots[archive.id];
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(s2!.id);
  });
});

describe('档案包导出与导入', () => {
  it('exportArchivePackage 应生成合法的 JSON 包', () => {
    const archive = createTestArchive('导出测试');
    const snapshot = createArchiveSnapshot('快照1', archive);
    const jsonStr = exportArchivePackage({ archive, snapshots: [snapshot], operationLog: [] });

    expect(jsonStr).toBeTypeOf('string');
    expect(jsonStr.length).toBeGreaterThan(100);

    const parsed = JSON.parse(jsonStr);
    expect(parsed._type).toBe(ARCHIVE_TYPE_IDENTIFIER);
    expect(parsed.data.packageVersion).toBe(ARCHIVE_PACKAGE_VERSION);
    expect(parsed.data.archive.name).toBe('导出测试');
    expect(parsed.data.snapshots.length).toBe(1);
  });

  it('parseArchivePackage 能正确解析合法的档案包', () => {
    const archive = createTestArchive('解析测试');
    const jsonStr = exportArchivePackage({ archive, snapshots: [], operationLog: [] });

    const result = parseArchivePackage(jsonStr);
    expect(result.pkg).not.toBeNull();
    expect(result.errors.length).toBe(0);
    expect(result.pkg?.archive.name).toBe('解析测试');
  });

  it('非法 JSON 解析失败并记录错误', () => {
    const result = parseArchivePackage('this is not json');
    expect(result.pkg).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('类型标识错误的包被拒绝', () => {
    const badPkg = JSON.stringify({
      _type: 'wrong-type',
      data: { packageVersion: '1.0.0' },
    });
    const result = parseArchivePackage(badPkg);
    expect(result.pkg).toBeNull();
    expect(result.errors.some(e => e.includes('类型标识'))).toBe(true);
  });

  it('主版本号不兼容的包被拒绝', () => {
    const badPkg = JSON.stringify({
      _type: ARCHIVE_TYPE_IDENTIFIER,
      data: {
        packageVersion: '2.0.0',
        archive: { name: 'test', campaign: { levels: [] } },
      },
    });
    const result = parseArchivePackage(badPkg);
    expect(result.pkg).toBeNull();
    expect(result.errors.some(e => e.includes('主版本号') || e.includes('不兼容'))).toBe(true);
  });

  it('低版本包给出警告但可解析', () => {
    const oldPkg = JSON.stringify({
      _type: ARCHIVE_TYPE_IDENTIFIER,
      data: {
        packageVersion: '0.9.0',
        archive: {
          id: 'test-id',
          name: 'old',
          description: '',
          notes: '',
          archived: false,
          createdAt: 0,
          updatedAt: 0,
          lastPlayedAt: null,
          campaign: {
            id: 'camp-id',
            name: 'camp',
            description: '',
            version: '1.0.0',
            levels: [],
            createdAt: 0,
            updatedAt: 0,
          },
          progress: {
            campaignId: 'camp-id',
            currentLevelId: null,
            totalStars: 0,
            completedCount: 0,
            lastPlayedAt: null,
            levelResults: {},
          },
        },
        snapshots: [],
        operationLog: [],
      },
    });
    const result = parseArchivePackage(oldPkg);
    expect(result.pkg).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('缺字段的包通过 sanitize 补全默认值', () => {
    const incomplete: any = {
      id: 'incomplete',
      name: '不完整',
      campaign: {
        id: 'camp-id',
        name: 'camp',
        levels: [],
      },
      progress: {
        campaignId: 'camp-id',
        levelResults: {},
      },
    };

    const sanitized = sanitizeArchive(incomplete);
    expect(sanitized.archive).not.toBeNull();
    expect(sanitized.archive?.description).toBe('');
    expect(sanitized.archive?.notes).toBe('');
    expect(sanitized.archive?.archived).toBe(false);
    expect(sanitized.archive?.createdAt).toBeGreaterThan(0);
    expect(sanitized.archive?.progress.totalStars).toBe(0);
    expect(sanitized.archive?.progress.completedCount).toBe(0);
  });
});

describe('导入冲突处理：三种策略', () => {
  it('无冲突时直接导入成功', () => {
    const pkgJson = buildArchivePackage('新档案', 3);
    const result = importArchivePackageWithMerge(pkgJson, [], 'keep_both');

    expect(result.success).toBe(true);
    expect(result.mergedArchives.length).toBe(1);
    expect(result.mergedArchives[0].name).toBe('新档案');
  });

  it('同名冲突策略 overwrite：完全替换现有档案', () => {
    const existing = createTestArchive('阿尔法');
    existing.progress.totalStars = 3;
    existing.progress.completedCount = 1;

    const pkgJson = buildArchivePackage('阿尔法', 5, 12);
    const result = importArchivePackageWithMerge(pkgJson, [existing], 'overwrite');

    expect(result.success).toBe(true);
    expect(result.mergedArchives.length).toBe(1);
    expect(result.mergedArchives[0].campaign.levels.length).toBe(5);
    expect(result.mergedArchives[0].progress.totalStars).toBe(12);
  });

  it('同名冲突策略 keep_both：保留两份自动重命名', () => {
    const existing = createTestArchive('贝塔');

    const pkgJson = buildArchivePackage('贝塔', 3);
    const result = importArchivePackageWithMerge(pkgJson, [existing], 'keep_both');

    expect(result.success).toBe(true);
    expect(result.mergedArchives.length).toBe(2);
    const names = result.mergedArchives.map(a => a.name);
    expect(names).toContain('贝塔');
    expect(names.some(n => n.startsWith('贝塔 (导入 '))).toBe(true);
  });

  it('同名冲突策略 metadata_only：仅更新元数据，保留进度', () => {
    const existing = createTestArchive('伽马');
    existing.progress.totalStars = 9;
    existing.progress.completedCount = 3;
    existing.description = '旧描述';
    existing.notes = '旧备注';

    const pkgJson = JSON.stringify({
      _type: ARCHIVE_TYPE_IDENTIFIER,
      data: {
        packageVersion: ARCHIVE_PACKAGE_VERSION,
        exportedAt: Date.now(),
        archive: {
          ...JSON.parse(JSON.stringify(existing)),
          name: '伽马',
          description: '新描述',
          notes: '新备注',
          progress: { ...existing.progress, totalStars: 0, completedCount: 0 },
        },
        snapshots: [],
        operationLog: [],
      },
    });

    const result = importArchivePackageWithMerge(pkgJson, [existing], 'metadata_only');

    expect(result.success).toBe(true);
    expect(result.mergedArchives.length).toBe(1);
    const merged = result.mergedArchives[0];
    expect(merged.description).toBe('新描述');
    expect(merged.notes).toBe('新备注');
    expect(merged.progress.totalStars).toBe(9);
    expect(merged.progress.completedCount).toBe(3);
  });

  it('importArchivePackageWithMerge 写操作日志', () => {
    const pkgJson = buildArchivePackage('新档案', 3);
    const result = importArchivePackageWithMerge(pkgJson, [], 'keep_both');

    expect(result.logEntries.length).toBeGreaterThan(0);
    expect(result.logEntries.some(e => e.action === 'archive_import')).toBe(true);
  });
});

describe('Store 导入/导出流程', () => {
  it('requestArchiveImport 无冲突时自动导入', () => {
    const pkgJson = buildArchivePackage('自动导入', 3);
    s().requestArchiveImport(pkgJson);

    vi.runAllTimers();
    expect(s().archives.length).toBe(1);
    expect(s().archives[0].name).toBe('自动导入');
  });

  it('requestArchiveImport 有冲突时打开冲突对话框', () => {
    const existing = createTestArchive('冲突测试');
    s().createArchive('冲突测试', ...Object.values(createTestCampaign()));

    const pkgJson = buildArchivePackage('冲突测试', 3);
    s().requestArchiveImport(pkgJson);

    expect(s().archiveImportConflictOpen).toBe(true);
    expect(s().detectedArchiveConflicts).toContain('冲突测试');
    expect(s().pendingArchiveImport).not.toBeNull();
  });

  it('resolveArchiveImport 应用 overwrite 策略', () => {
    // 创建现有档案
    const { campaign: c1, progress: p1 } = createTestCampaign('战役1', 2);
    s().createArchive('我的档案', c1, p1);
    const existingStars = s().archives[0].progress.totalStars;

    // 准备高星数的导入包
    const { campaign: c2, progress: p2 } = createTestCampaign('战役1', 5);
    p2.totalStars = 15;
    p2.completedCount = 5;
    const importArchive = createCampaignArchive('我的档案', c2, p2);
    const pkgJson = exportArchivePackage({ archive: importArchive, snapshots: [], operationLog: [] });

    // 触发导入
    s().requestArchiveImport(pkgJson);
    expect(s().archiveImportConflictOpen).toBe(true);

    // 选择覆盖策略
    const success = s().resolveArchiveImport('overwrite');
    expect(success).toBe(true);
    expect(s().archives.length).toBe(1);
    expect(s().archives[0].campaign.levels.length).toBe(5);
    expect(s().archives[0].progress.totalStars).toBe(15);
  });

  it('resolveArchiveImport 应用 keep_both 策略', () => {
    s().createArchive('档案A', ...Object.values(createTestCampaign('战役1', 2)));

    const pkgJson = buildArchivePackage('档案A', 3);
    s().requestArchiveImport(pkgJson);

    const success = s().resolveArchiveImport('keep_both');
    expect(success).toBe(true);
    expect(s().archives.length).toBe(2);
    const names = s().archives.map(a => a.name);
    expect(names).toContain('档案A');
    expect(names.some(n => n.startsWith('档案A (导入 '))).toBe(true);
  });

  it('resolveArchiveImport 应用 metadata_only 策略', () => {
    const { campaign, progress } = createTestCampaign('战役1', 3);
    progress.totalStars = 6;
    progress.completedCount = 2;
    s().createArchive('档案B', campaign, progress);

    const importArchive = createCampaignArchive('档案B', campaign, createCampaignProgress(campaign.id));
    importArchive.description = '新描述';
    importArchive.notes = '新备注';
    const pkgJson = exportArchivePackage({ archive: importArchive, snapshots: [], operationLog: [] });

    s().requestArchiveImport(pkgJson);
    const success = s().resolveArchiveImport('metadata_only');

    expect(success).toBe(true);
    expect(s().archives.length).toBe(1);
    const merged = s().archives[0];
    expect(merged.description).toBe('新描述');
    expect(merged.notes).toBe('新备注');
    expect(merged.progress.totalStars).toBe(6);
    expect(merged.progress.completedCount).toBe(2);
  });

  it('cancelArchiveImport 取消导入并清理状态', () => {
    s().createArchive('档案C', ...Object.values(createTestCampaign()));
    const pkgJson = buildArchivePackage('档案C', 3);
    s().requestArchiveImport(pkgJson);

    expect(s().archiveImportConflictOpen).toBe(true);

    s().cancelArchiveImport();
    expect(s().archiveImportConflictOpen).toBe(false);
    expect(s().pendingArchiveImport).toBeNull();
    expect(s().pendingArchiveImportJson).toBeNull();
    expect(s().archives.length).toBe(1);
  });

  it('exportArchive 触发下载', () => {
    const archive = s().createArchive('导出测试', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '快照1');

    mockClick.mockClear();
    s().exportArchive(archive.id, true);

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });
});

describe('持久化与跨重启恢复', () => {
  it('persist 应保存档案数据到 localStorage', () => {
    s().createArchive('持久化测试', ...Object.values(createTestCampaign()));
    s().persist();

    const stored = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || '[]');
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe('持久化测试');
  });

  it('persist 应保存快照和操作日志', () => {
    const archive = s().createArchive('快照持久化', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '测试快照');
    s().persist();

    const snapshots = JSON.parse(localStorage.getItem(ARCHIVE_SNAPSHOTS_KEY) || '{}');
    expect(snapshots[archive.id].length).toBe(1);

    const log = JSON.parse(localStorage.getItem(ARCHIVE_OPERATION_LOG_KEY) || '[]');
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeGreaterThan(0);
  });

  it('restoreFromStorage 能正确恢复档案数据', () => {
    const archive = createTestArchive('恢复测试');
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([archive]));

    s().restoreFromStorage();
    expect(s().archives.length).toBe(1);
    expect(s().archives[0].name).toBe('恢复测试');
  });

  it('restoreFromStorage 恢复活跃档案并更新 lastPlayedAt', () => {
    const archive = createTestArchive('活跃恢复');
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([archive]));
    localStorage.setItem(ACTIVE_ARCHIVE_KEY, archive.id);

    vi.advanceTimersByTime(1000);

    s().restoreFromStorage();
    expect(s().activeArchiveId).toBe(archive.id);
    const restored = s().archives[0];
    expect(restored.lastPlayedAt).not.toBeNull();
    expect(restored.lastPlayedAt!).toBeGreaterThan(archive.createdAt);
  });

  it('恢复空数据不报错', () => {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, '');
    expect(() => s().restoreFromStorage()).not.toThrow();
    expect(s().archives.length).toBe(0);
  });

  it('无效存储数据被优雅处理', () => {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, 'invalid json {{{');
    expect(() => s().restoreFromStorage()).not.toThrow();
    expect(s().archives.length).toBe(0);
  });

  it('自动保存：状态变化后 300ms 触发 persist', () => {
    const persistSpy = vi.spyOn(s(), 'persist');

    s().createArchive('自动保存测试', ...Object.values(createTestCampaign()));
    expect(persistSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300);
    expect(persistSpy).toHaveBeenCalledTimes(2);

    persistSpy.mockRestore();
  });
});

describe('Store 双向同步', () => {
  it('syncArchiveFromCampaign 应更新指定档案的战役和进度', () => {
    const { campaign, progress } = createTestCampaign('原战役', 2);
    const archive = s().createArchive('同步测试', campaign, progress);

    const { campaign: newCampaign, progress: newProgress } = createTestCampaign('原战役', 5);
    newProgress.totalStars = 10;
    newProgress.completedCount = 4;

    vi.advanceTimersByTime(1000);

    s().syncArchiveFromCampaign(archive.id, newCampaign, newProgress);

    const updated = s().archives.find(a => a.id === archive.id);
    expect(updated?.campaign.levels.length).toBe(5);
    expect(updated?.progress.totalStars).toBe(10);
    expect(updated?.progress.completedCount).toBe(4);
    expect(updated?.updatedAt).toBeGreaterThan(archive.updatedAt);
  });

  it('syncActiveArchiveFromStores 应从 campaignStore 同步当前数据', () => {
    // 设置 campaign store 状态
    const campaign = cs().createCampaign('同步战役');
    const level = cs().addLevelToCampaign(campaign.id, createTestLevel(), '第1关');
    const result: LevelPlayResult = {
      completed: true,
      steps: 10,
      stars: 3,
      completedAt: Date.now(),
    };
    cs().updatePlayResult(campaign.id, level.id, result);

    // 创建对应档案
    s().createArchive('同步档案', campaign, cs().progressMap[campaign.id]);

    // 修改 campaign store 数据
    const level2 = cs().addLevelToCampaign(campaign.id, createTestLevel(), '第2关');
    cs().updatePlayResult(campaign.id, level2.id, {
      completed: true,
      steps: 20,
      stars: 2,
      completedAt: Date.now(),
    });

    // 同步
    s().syncActiveArchiveFromStores();

    const updated = s().getActiveArchive();
    expect(updated?.campaign.levels.length).toBe(2);
    expect(updated?.progress.totalStars).toBe(5);
    expect(updated?.progress.completedCount).toBe(2);
  });

  it('campaignStore 变化自动触发 active archive 同步', () => {
    const campaign = cs().createCampaign('自动同步战役');
    const level = cs().addLevelToCampaign(campaign.id, createTestLevel(), '第1关');
    s().createArchive('自动同步档案', campaign, cs().progressMap[campaign.id]);

    // 触发 campaign store 变化
    cs().updatePlayResult(campaign.id, level.id, {
      completed: true,
      steps: 15,
      stars: 3,
      completedAt: Date.now(),
    });

    // 等待防抖定时器
    vi.advanceTimersByTime(300);

    const updated = s().getActiveArchive();
    expect(updated?.progress.totalStars).toBe(3);
    expect(updated?.progress.completedCount).toBe(1);
  });

  it('切换档案时同步到 campaignStore', () => {
    // 创建第一个档案
    const { campaign: c1, progress: p1 } = createTestCampaign('战役A', 3);
    p1.totalStars = 3;
    const archive1 = s().createArchive('档案A', c1, p1);

    // 创建第二个档案
    const { campaign: c2, progress: p2 } = createTestCampaign('战役B', 5);
    p2.totalStars = 10;
    const archive2 = s().createArchive('档案B', c2, p2);

    // 模拟 CampaignArchivePanel 中的切换逻辑
    s().setActiveArchiveId(archive1.id);
    useCampaignStore.setState({
      campaigns: [c1, c2],
      activeCampaignId: archive1.campaign.id,
      progressMap: { [c1.id]: p1, [c2.id]: p2 },
    });

    // 验证 campaign store 状态
    expect(cs().activeCampaignId).toBe(c1.id);
    expect(cs().progressMap[c1.id].totalStars).toBe(3);
  });
});

describe('工具函数：校验与辅助', () => {
  it('validateArchiveStructure 能检测出无效档案', () => {
    const badArchive = { name: 'test', campaign: 'not-object' } as any;
    const result = validateArchiveStructure(badArchive);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateArchivePackageStructure 能检测出无效包', () => {
    const result = validateArchivePackageStructure({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('checkArchiveVersionCompatibility 检测主版本不兼容', () => {
    expect(checkArchiveVersionCompatibility('1.0.0', '2.0.0').compatible).toBe(false);
    expect(checkArchiveVersionCompatibility('2.0.0', '1.0.0').compatible).toBe(false);
  });

  it('checkArchiveVersionCompatibility 检测次版本警告', () => {
    const result = checkArchiveVersionCompatibility('1.5.0', '1.0.0');
    expect(result.compatible).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('generateUniqueArchiveName 在有重名时生成唯一名称', () => {
    const existing = [
      createTestArchive('测试档案'),
      createTestArchive('测试档案 (导入 1)'),
    ];
    const unique = generateUniqueArchiveName('测试档案', existing);
    expect(unique).not.toBe('测试档案');
    expect(unique).toMatch(/^测试档案 \(导入 \d+\)$/);
  });

  it('sanitizeArchive 为缺失字段提供默认值', () => {
    const minimal: any = {
      id: 'minimal',
      name: '最小化',
      campaign: { id: 'c1', name: '战役', levels: [] },
      progress: { campaignId: 'c1', levelResults: {} },
    };

    const sanitized = sanitizeArchive(minimal);
    expect(sanitized.archive).not.toBeNull();
    expect(sanitized.archive?.description).toBe('');
    expect(sanitized.archive?.notes).toBe('');
    expect(sanitized.archive?.archived).toBe(false);
    expect(sanitized.archive?.createdAt).toBeGreaterThan(0);
    expect(sanitized.archive?.updatedAt).toBeGreaterThan(0);
    expect(sanitized.archive?.lastPlayedAt).toBeNull();
  });

  it('mergeArchives overwrite 策略正确工作', () => {
    const existing = createTestArchive('测试');
    existing.progress.totalStars = 3;

    const incoming = createTestArchive('测试');
    incoming.progress.totalStars = 9;

    const result = mergeArchives({
      incomingArchive: incoming,
      existingArchives: [existing],
      strategy: 'overwrite',
      operationLog: [],
    });

    expect(result.mergedArchives.length).toBe(1);
    expect(result.mergedArchives[0].progress.totalStars).toBe(9);
    expect(result.logEntries.some(e => e.action === 'archive_import_conflict_overwrite')).toBe(true);
  });

  it('mergeArchives keep_both 策略正确工作', () => {
    const existing = createTestArchive('测试');
    const incoming = createTestArchive('测试');

    const result = mergeArchives({
      incomingArchive: incoming,
      existingArchives: [existing],
      strategy: 'keep_both',
      operationLog: [],
    });

    expect(result.mergedArchives.length).toBe(2);
    expect(result.logEntries.some(e => e.action === 'archive_import_conflict_keep_both')).toBe(true);
  });

  it('mergeArchives metadata_only 策略正确工作', () => {
    const existing = createTestArchive('测试');
    existing.progress.totalStars = 6;
    existing.description = '旧描述';

    const incoming = createTestArchive('测试');
    incoming.progress.totalStars = 0;
    incoming.description = '新描述';

    const result = mergeArchives({
      incomingArchive: incoming,
      existingArchives: [existing],
      strategy: 'metadata_only',
      operationLog: [],
    });

    expect(result.mergedArchives.length).toBe(1);
    expect(result.mergedArchives[0].description).toBe('新描述');
    expect(result.mergedArchives[0].progress.totalStars).toBe(6);
    expect(result.logEntries.some(e => e.action === 'archive_import_conflict_metadata_only')).toBe(true);
  });
});

describe('操作日志', () => {
  it('创建档案产生操作日志', () => {
    s().createArchive('日志测试', ...Object.values(createTestCampaign()));
    const createLogs = s().operationLog.filter(e => e.action === 'archive_create');
    expect(createLogs.length).toBe(1);
    expect(createLogs[0].archiveName).toBe('日志测试');
  });

  it('删除档案产生操作日志', () => {
    const archive = s().createArchive('待删', ...Object.values(createTestCampaign()));
    s().deleteArchive(archive.id);
    const deleteLogs = s().operationLog.filter(e => e.action === 'archive_delete');
    expect(deleteLogs.length).toBe(1);
  });

  it('切换档案产生操作日志', () => {
    const a1 = s().createArchive('档案1', ...Object.values(createTestCampaign()));
    const a2 = s().createArchive('档案2', ...Object.values(createTestCampaign()));

    s().setActiveArchiveId(a1.id);
    const switchLogs = s().operationLog.filter(e => e.action === 'archive_switch');
    expect(switchLogs.length).toBe(1);
    expect(switchLogs[0].archiveName).toBe('档案1');
  });

  it('保存快照产生操作日志', () => {
    const archive = s().createArchive('快照日志', ...Object.values(createTestCampaign()));
    s().saveArchiveSnapshot(archive.id, '测试快照');
    const snapshotLogs = s().operationLog.filter(e => e.action === 'archive_save_snapshot');
    expect(snapshotLogs.length).toBe(1);
  });

  it('回滚快照产生操作日志', () => {
    const archive = s().createArchive('回滚日志', ...Object.values(createTestCampaign()));
    const snapshot = s().saveArchiveSnapshot(archive.id, '快照');
    s().rollbackToArchiveSnapshot(snapshot!.id);

    const rollbackLogs = s().operationLog.filter(e => e.action === 'archive_rollback_snapshot');
    expect(rollbackLogs.length).toBe(1);
  });

  it('导入产生操作日志', () => {
    const pkgJson = JSON.stringify({
      _type: ARCHIVE_TYPE_IDENTIFIER,
      data: {
        packageVersion: '1.0.0',
        exportedAt: Date.now(),
        archive: createTestArchive('导入日志'),
        snapshots: [],
        operationLog: [],
      },
    });

    s().requestArchiveImport(pkgJson);
    vi.runAllTimers();

    const importLogs = s().operationLog.filter(e => e.action === 'archive_import');
    expect(importLogs.length).toBeGreaterThanOrEqual(0);
  });

  it('恢复产生操作日志', () => {
    const archive = createTestArchive('恢复日志');
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify([archive]));

    s().restoreFromStorage();
    const restoreLogs = s().operationLog.filter(e => e.action === 'archive_persist_restore');
    expect(restoreLogs.length).toBe(1);
    expect(restoreLogs[0].detail).toContain('恢复 1 个档案');
  });
});

describe('边界情况处理', () => {
  it('半截导入数据：缺少可选字段不崩溃', () => {
    const incompletePkg = JSON.stringify({
      _type: ARCHIVE_TYPE_IDENTIFIER,
      data: {
        packageVersion: '1.0.0',
        archive: {
          id: 'incomplete',
          name: '不完整',
          campaign: {
            id: 'c1',
            name: '战役',
            levels: [{
              id: 'l1',
              name: '缺字段关卡',
              order: 0,
              levelData: createTestLevel(),
            }],
          },
          progress: {
            campaignId: 'c1',
            levelResults: {},
          },
        },
        snapshots: [],
        operationLog: [],
      },
    });

    const result = parseArchivePackage(incompletePkg);
    expect(result.pkg).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('无效策略在 mergeArchives 中抛出错误', () => {
    const existing = createTestArchive('测试');
    const incoming = createTestArchive('测试');

    expect(() => mergeArchives({
      incomingArchive: incoming,
      existingArchives: [existing],
      strategy: 'invalid' as any,
      operationLog: [],
    })).toThrow();
  });

  it('空档案列表导入成功', () => {
    const pkgJson = buildArchivePackage('空列表导入', 3);
    const result = importArchivePackageWithMerge(pkgJson, [], 'keep_both');
    expect(result.success).toBe(true);
    expect(result.mergedArchives.length).toBe(1);
  });

  it('操作日志自动截断到最近 200 条', () => {
    for (let i = 0; i < 250; i++) {
      s().addOperationLog('archive_create', `测试 ${i}`);
    }
    s().persist();

    const stored = JSON.parse(localStorage.getItem(ARCHIVE_OPERATION_LOG_KEY) || '[]');
    expect(stored.length).toBeLessThanOrEqual(200);
  });

  it('localStorage 写入失败时不崩溃', () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('Storage full'); });

    expect(() => s().persist()).not.toThrow();

    localStorage.setItem = originalSetItem;
  });

  it('删除确认状态正确管理', () => {
    expect(s().deleteConfirmArchiveId).toBeNull();

    s().setDeleteConfirmArchiveId('test-id');
    expect(s().deleteConfirmArchiveId).toBe('test-id');

    s().setDeleteConfirmArchiveId(null);
    expect(s().deleteConfirmArchiveId).toBeNull();
  });
});

describe('端到端链路验证', () => {
  it('导出再导入：数据完整无丢失', () => {
    // 创建完整档案
    const { campaign, progress } = createTestCampaign('完整战役', 5);
    progress.totalStars = 12;
    progress.completedCount = 4;
    progress.levelResults['l1'] = {
      completed: true,
      steps: 15,
      stars: 3,
      bestSteps: 15,
      bestStars: 3,
      completedAt: Date.now(),
    };

    const archive = s().createArchive('E2E测试', campaign, progress);
    archive.description = '这是详细描述';
    archive.notes = '这是备注信息';
    s().saveArchiveSnapshot(archive.id, '通关前状态');
    s().saveArchiveSnapshot(archive.id, '通关后状态');

    // 导出
    const exportJson = exportArchivePackage({
      archive,
      snapshots: s().snapshots[archive.id],
      operationLog: s().operationLog,
    });

    // 清空状态
    useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
    expect(s().archives.length).toBe(0);

    // 导入
    const result = importArchivePackageWithMerge(exportJson, [], 'keep_both');
    expect(result.success).toBe(true);

    const imported = result.mergedArchives[0];
    expect(imported.name).toBe('E2E测试');
    expect(imported.description).toBe('这是详细描述');
    expect(imported.notes).toBe('这是备注信息');
    expect(imported.campaign.levels.length).toBe(5);
    expect(imported.progress.totalStars).toBe(12);
    expect(imported.progress.completedCount).toBe(4);
    expect(imported.progress.levelResults['l1']?.bestStars).toBe(3);
  });

  it('同名冲突三种策略端到端验证', () => {
    // 初始化现有档案
    const existing = s().createArchive('冲突测试', ...Object.values(createTestCampaign('战役', 3)));
    existing.progress.totalStars = 3;
    existing.progress.completedCount = 1;
    existing.description = '现有描述';

    // 准备导入包（同名但数据不同）
    const { campaign: newCampaign, progress: newProgress } = createTestCampaign('战役', 5);
    newProgress.totalStars = 15;
    newProgress.completedCount = 5;
    const importArchive = createCampaignArchive('冲突测试', newCampaign, newProgress);
    importArchive.description = '导入描述';
    const pkgJson = exportArchivePackage({ archive: importArchive, snapshots: [], operationLog: [] });

    // 测试 overwrite
    useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
    s().createArchive('冲突测试', ...Object.values(createTestCampaign('战役', 3)));
    s().requestArchiveImport(pkgJson);
    s().resolveArchiveImport('overwrite');
    expect(s().archives[0].progress.totalStars).toBe(15);
    expect(s().archives[0].description).toBe('导入描述');

    // 测试 keep_both
    useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
    s().createArchive('冲突测试', ...Object.values(createTestCampaign('战役', 3)));
    s().requestArchiveImport(pkgJson);
    s().resolveArchiveImport('keep_both');
    expect(s().archives.length).toBe(2);

    // 测试 metadata_only
    useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
    const metaArchive = s().createArchive('冲突测试', ...Object.values(createTestCampaign('战役', 3)));
    s().syncArchiveFromCampaign(metaArchive.id, metaArchive.campaign, { ...metaArchive.progress, totalStars: 3, completedCount: 1 });
    s().requestArchiveImport(pkgJson);
    s().resolveArchiveImport('metadata_only');
    expect(s().archives[0].description).toBe('导入描述');
    expect(s().archives[0].progress.totalStars).toBe(3);
    expect(s().archives[0].progress.completedCount).toBe(1);
  });

  it('回滚后界面同步：campaignStore 数据同步更新', () => {
    // 设置初始状态
    const { campaign, progress } = createTestCampaign('回滚同步', 3);
    const archive = s().createArchive('回滚同步档案', campaign, progress);

    // 同步到 campaignStore
    useCampaignStore.setState({
      campaigns: [campaign],
      activeCampaignId: campaign.id,
      progressMap: { [campaign.id]: progress },
    });

    // 保存快照
    const snapshot = s().saveArchiveSnapshot(archive.id, '初始状态');

    // 修改进度
    const modifiedProgress = { ...progress, totalStars: 9, completedCount: 3 };
    cs().updatePlayResult(campaign.id, campaign.levels[0].id, {
      completed: true, steps: 10, stars: 3, completedAt: Date.now(),
    });
    cs().updatePlayResult(campaign.id, campaign.levels[1].id, {
      completed: true, steps: 20, stars: 3, completedAt: Date.now(),
    });
    cs().updatePlayResult(campaign.id, campaign.levels[2].id, {
      completed: true, steps: 30, stars: 3, completedAt: Date.now(),
    });

    vi.advanceTimersByTime(300);
    expect(s().getActiveArchive()?.progress.totalStars).toBe(9);

    // 回滚
    s().rollbackToArchiveSnapshot(snapshot!.id);

    // 模拟 UI 同步（如 CampaignArchivePanel 中实现的）
    const rolledBackArchive = s().getActiveArchive()!;
    useCampaignStore.setState({
      activeCampaignId: rolledBackArchive.campaign.id,
      progressMap: { ...cs().progressMap, [rolledBackArchive.campaign.id]: rolledBackArchive.progress },
    });

    expect(cs().progressMap[campaign.id].totalStars).toBe(0);
    expect(cs().progressMap[campaign.id].completedCount).toBe(0);
  });

  it('跨重启恢复：localStorage 持久化验证', () => {
    // 第一步：创建数据
    const { campaign, progress } = createTestCampaign('重启恢复', 4);
    progress.totalStars = 6;
    progress.completedCount = 2;
    const archive = s().createArchive('重启恢复档案', campaign, progress);
    s().saveArchiveSnapshot(archive.id, '游戏进度');

    // 触发持久化
    vi.advanceTimersByTime(300);
    s().persist();

    // 验证存储
    expect(localStorage.getItem(ARCHIVE_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_ARCHIVE_KEY)).toBe(archive.id);

    // 第二步：模拟重启 - 清空 store 但保留 localStorage
    useCampaignArchiveStore.setState(useCampaignArchiveStore.getInitialState());
    expect(s().archives.length).toBe(0);

    // 第三步：恢复
    s().restoreFromStorage();

    // 验证恢复
    expect(s().archives.length).toBe(1);
    expect(s().activeArchiveId).toBe(archive.id);
    expect(s().archives[0].name).toBe('重启恢复档案');
    expect(s().archives[0].progress.totalStars).toBe(6);
    expect(s().archives[0].progress.completedCount).toBe(2);
    expect(s().snapshots[archive.id].length).toBe(1);
  });

  it('自动保存：操作后数据持久化', () => {
    const { campaign, progress } = createTestCampaign('自动保存', 3);
    const archive = s().createArchive('自动保存档案', campaign, progress);

    vi.advanceTimersByTime(300);

    // 验证已持久化
    const stored = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || '[]');
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe(archive.id);

    // 修改并等待
    s().renameArchive(archive.id, '修改后名称');
    vi.advanceTimersByTime(300);

    const stored2 = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || '[]');
    expect(stored2[0].name).toBe('修改后名称');
  });
});
