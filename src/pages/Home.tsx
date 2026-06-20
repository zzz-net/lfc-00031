import { useEffect } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import Toolbar from '@/components/Toolbar';
import Toolbox from '@/components/Toolbox';
import GridEditor from '@/components/GridEditor';
import RulesPanel from '@/components/RulesPanel';
import ControlBar from '@/components/ControlBar';
import Toast from '@/components/Toast';
import SnapshotPanel from '@/components/SnapshotPanel';
import ImportConflictDialog from '@/components/ImportConflictDialog';
import PackageImportConflictDialog from '@/components/PackageImportConflictDialog';

export default function Home() {
  const restoreFromStorage = useEditorStore((s) => s.restoreFromStorage);
  const restoreSnapshotsFromStorage = useEditorStore((s) => s.restoreSnapshotsFromStorage);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  useEffect(() => {
    restoreFromStorage();
    restoreSnapshotsFromStorage();
  }, [restoreFromStorage, restoreSnapshotsFromStorage]);

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
      <ImportConflictDialog />
      <PackageImportConflictDialog />
      <Toast />
    </div>
  );
}
