import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { appBridge, projectsBridge } from '../../../renderer.bridge';
import { FolderProjectImportModal } from './folder-project-import.modal';

type Props = Omit<
    Parameters<typeof FolderProjectImportModal>[0],
    'folder' | 'onChooseFolder' | 'projectManager'
>;

/** Chooses one discovered or manually selected Godot project list.
 * @param props - Shared registration callbacks and modal dismissal.
 */
export function GodotProjectManagerImportModal(props: Props) {
    const { t } = useTranslation(['projects', 'common']);
    const [sources, setSources] = useState<string[]>([]);
    const [source, setSource] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [picking, setPicking] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        let live = true;
        void projectsBridge
            .discoverGodotProjectLists()
            .then((found) => {
                if (!live) return;
                setSources(found);
                if (found.length === 1) setSource(found[0]);
            })
            .catch(() => {
                if (live) setError(true);
            })
            .finally(() => {
                if (live) setLoading(false);
            });
        return () => {
            live = false;
        };
    }, []);

    /** Opens a native picker without replacing the current list on cancellation. */
    const choose = async () => {
        if (picking) return;
        setPicking(true);
        setError(false);
        try {
            const result = await appBridge.openFileDialog(
                '',
                t('addProject.manager.choose'),
                [{ name: 'Godot', extensions: ['cfg'] }],
                ['openFile', 'showHiddenFiles'],
            );
            if (!result.canceled && result.filePaths.length === 1)
                setSource(result.filePaths[0]);
        } catch {
            setError(true);
        } finally {
            setPicking(false);
        }
    };
    if (source)
        return (
            <FolderProjectImportModal
                {...props}
                key={source}
                folder={source}
                projectManager
                onChooseFolder={() => setSource(null)}
            />
        );
    return (
        <Dialog
            title={t('addProject.manager.title')}
            testId="godotProjectManagerSourceDialog"
            icon={<FolderOpen size={24} />}
            onRequestClose={picking ? undefined : props.onClose}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={picking}
                        onClick={props.onClose}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={loading || picking}
                        onClick={() => void choose()}
                    >
                        {t('addProject.manager.choose')}
                    </button>
                </>
            }
        >
            {loading ? (
                <p role="status">{t('addProject.manager.scanning')}</p>
            ) : (
                <div className="flex flex-col gap-3">
                    <p>
                        {t(
                            sources.length
                                ? 'addProject.manager.selectSource'
                                : 'addProject.manager.noSources',
                        )}
                    </p>
                    {sources.map((file) => (
                        <button
                            key={file}
                            type="button"
                            className="btn h-auto justify-start py-3 text-left"
                            disabled={picking}
                            onClick={() => setSource(file)}
                        >
                            <span className="break-all font-mono text-sm">
                                {file}
                            </span>
                        </button>
                    ))}
                    <p className="text-sm text-base-content/65">
                        {t('addProject.manager.support')}
                    </p>
                </div>
            )}
            {error && (
                <p role="alert" className="text-sm text-error">
                    {t('addProject.manager.pickerFailed')}
                </p>
            )}
        </Dialog>
    );
}
