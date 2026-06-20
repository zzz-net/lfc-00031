import { useEffect } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { useCampaignStore } from '@/store/useCampaignStore';
import { useCampaignArchiveStore } from '@/store/useCampaignArchiveStore';
import Toolbar from '@/components/Toolbar';
import Toolbox from '@/components/Toolbox';
import GridEditor from '@/components/GridEditor';
import RulesPanel from '@/components/RulesPanel';
import ControlBar from '@/components/ControlBar';
import Toast from '@/components/Toast';
import SnapshotPanel from '@/components/SnapshotPanel';
import CampaignPanel from '@/components/CampaignPanel';
import LevelMetaEditor from '@/components/LevelMetaEditor';
import CampaignImportConflictDialog from '@/components/CampaignImportConflictDialog';
import ImportConflictDialog from '@/components/ImportConflictDialog';
import PackageImportConflictDialog from '@/components/PackageImportConflictDialog';
import CampaignArchivePanel from '@/components/CampaignArchivePanel';
import ArchiveImportConflictDialog from '@/components/ArchiveImportConflictDialog';

export default function Home() {
  const restoreFromStorage = useEditorStore((s) => s.restoreFromStorage);
  const restoreSnapshotsFromStorage = useEditorStore((s) => s.restoreSnapshotsFromStorage);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const restoreCampaignsFromStorage = useCampaignStore((s) => s.restoreFromStorage);
  const restoreArchivesFromStorage = useCampaignArchiveStore((s) => s.restoreFromStorage);

  useEffect(() => {
    restoreFromStorage();
    restoreSnapshotsFromStorage();
    restoreCampaignsFromStorage();
    restoreArchivesFromStorage();
  }, [restoreFromStorage, restoreSnapshotsFromStorage, restoreCampaignsFromStorage, restoreArchivesFromStorage]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <div className="relative z-30"><Toolbar /></div>
      <div className="flex-1 flex gap-2 p-2 min-h-0">
        <SnapshotPanel />
        <div className="relative z-10"><Toolbox /></div>
        <GridEditor />
      </div>
      <div className="relative z-20"><ControlBar /></div>
      <RulesPanel />
      <CampaignPanel />
      <LevelMetaEditor />
      <ImportConflictDialog />
      <PackageImportConflictDialog />
      <CampaignImportConflictDialog />
      <CampaignArchivePanel />
      <ArchiveImportConflictDialog />
      <Toast />
    </div>
  );
}
