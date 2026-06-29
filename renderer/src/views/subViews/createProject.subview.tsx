import type { CachedTool, RendererType } from '@shared';
import { CircleHelp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WaitingForDialogOverlay } from '../../components/waitingForDialogOverlay.component';
import { useAlerts } from '../../hooks/useAlerts';
import { useFileSystem } from '../../hooks/useFileSystem';
import { usePreferences } from '../../hooks/usePreferences';
import { useProjects } from '../../hooks/useProjects';
import { useRelease } from '../../hooks/useRelease';
import { CreateProjectActions } from './createProject/components/createProjectActions.component';
import { CreateProjectProjectSection } from './createProject/components/createProjectProjectSection.component';
import { CreateProjectRendererSection } from './createProject/components/createProjectRendererSection.component';
import { CreateProjectToolOptionsSection } from './createProject/components/createProjectToolOptionsSection.component';
import {
    buildCreateProjectReleaseRows,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    isVerifiedToolAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    OVERWRITE_PATH_CHECK_DEBOUNCE_MS,
} from './createProject/createProject.model';

type SubViewProps = {
    onClose: () => void;
};

export const CreateProjectSubView: React.FC<SubViewProps> = ({ onClose }) => {
    const { t } = useTranslation(['createProject', 'projects']);
    const [renderer, setRenderer] = useState<RendererType[5]>('FORWARD_PLUS');
    const [releaseIndex, setReleaseIndex] = useState<number>(0);
    const [projectName, setProjectName] = useState<string>('');
    const [overwriteBasePath, setOverwriteBasePath] = useState<string>('');
    const [overwriteBasePathMissing, setOverwriteBasePathMissing] =
        useState<boolean>(false);
    const [checkingOverwriteBasePath, setCheckingOverwriteBasePath] =
        useState<boolean>(false);
    const [editNow, setEditNow] = useState<boolean>(true);
    const [error, setError] = useState<string | undefined>();
    const [creating, setCreating] = useState<boolean>(false);
    const [selectingFolder, setSelectingFolder] = useState<boolean>(false);
    const [tools, setTools] = useState<CachedTool[]>([]);
    const [overwriteProjectPath, setOverwriteProjectPath] =
        useState<boolean>(false);
    const [withGit, setWithGit] = useState<boolean>(true);
    const [withVSCode, setWithVSCode] = useState<boolean>(true);
    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const inputNameRef = useRef<HTMLInputElement>(null);
    const overwritePathCheckRequestRef = useRef<number>(0);
    const overwriteBasePathInitializedRef = useRef<boolean>(false);

    const { addAlert } = useAlerts();
    const { installedReleases, downloadingReleases } = useRelease();
    const { createProject, launchProject } = useProjects();
    const { pathExists } = useFileSystem();
    const { preferences, platform } = usePreferences();
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const defaultOverwriteBasePath = preferences?.projects_location ?? '';

    const allReleases = useMemo(
        () =>
            buildCreateProjectReleaseRows(
                installedReleases,
                downloadingReleases,
            ),
        [installedReleases, downloadingReleases],
    );

    const derivedProjectPath = useMemo(() => {
        const basePath = preferences?.projects_location || '';
        if (platform === 'win32') {
            return `${basePath}\\${projectName}`;
        }
        return `${basePath}/${projectName}`;
    }, [projectName, preferences, platform]);

    const projectSegmentDisplay = useMemo(
        () => projectName || '<project-name>',
        [projectName],
    );

    const overwriteDisplayPath = useMemo(
        () =>
            joinBasePathWithProjectSegment(
                overwriteBasePath,
                projectSegmentDisplay,
                pathSeparator,
            ),
        [overwriteBasePath, projectSegmentDisplay, pathSeparator],
    );

    const overwriteSubmitPath = useMemo(
        () =>
            joinBasePathWithProjectSegment(
                overwriteBasePath,
                projectName,
                pathSeparator,
            ),
        [overwriteBasePath, pathSeparator, projectName],
    );

    const overwritePathSuffixDisplay = useMemo(
        () =>
            getProjectPathSuffixDisplay(
                overwriteBasePath,
                projectSegmentDisplay,
                pathSeparator,
            ),
        [overwriteBasePath, projectSegmentDisplay, pathSeparator],
    );

    const showFolderCreateIcon =
        overwriteProjectPath &&
        !checkingOverwriteBasePath &&
        overwriteBasePathMissing;
    const isOverwritePathEmpty =
        overwriteProjectPath && overwriteBasePath.trim().length === 0;
    const isOverwritePathChangedFromDefault =
        overwriteProjectPath &&
        normalizeBasePathForJoin(overwriteBasePath, pathSeparator) !==
            normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator);
    const showUseDefaultPathAction =
        overwriteProjectPath &&
        normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator)
            .length > 0 &&
        (isOverwritePathEmpty || isOverwritePathChangedFromDefault);

    useEffect(() => {
        if (
            !overwriteBasePathInitializedRef.current &&
            preferences?.projects_location
        ) {
            setOverwriteBasePath(preferences.projects_location);
            overwriteBasePathInitializedRef.current = true;
        }
    }, [preferences?.projects_location]);

    useEffect(() => {
        if (!overwriteProjectPath) {
            overwritePathCheckRequestRef.current += 1;
            setCheckingOverwriteBasePath(false);
            setOverwriteBasePathMissing(false);
            return;
        }

        const pathToCheck = overwriteBasePath.trim();
        if (pathToCheck.length === 0) {
            overwritePathCheckRequestRef.current += 1;
            setCheckingOverwriteBasePath(false);
            setOverwriteBasePathMissing(true);
            return;
        }

        const requestId = overwritePathCheckRequestRef.current + 1;
        overwritePathCheckRequestRef.current = requestId;
        setCheckingOverwriteBasePath(true);

        const timeoutId = window.setTimeout(() => {
            pathExists(pathToCheck)
                .then((exists) => {
                    if (overwritePathCheckRequestRef.current !== requestId) {
                        return;
                    }

                    setOverwriteBasePathMissing(!exists);
                })
                .catch(() => {
                    if (overwritePathCheckRequestRef.current !== requestId) {
                        return;
                    }

                    setOverwriteBasePathMissing(true);
                })
                .finally(() => {
                    if (overwritePathCheckRequestRef.current === requestId) {
                        setCheckingOverwriteBasePath(false);
                    }
                });
        }, OVERWRITE_PATH_CHECK_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [overwriteBasePath, overwriteProjectPath, pathExists]);

    const onCreateProject = async () => {
        setError(undefined);

        if (projectName === '') {
            setError(t('project.nameRequired'));
            return;
        }

        setCreating(true);
        const result = await createProject(
            projectName,
            allReleases[releaseIndex],
            renderer,
            withVSCode,
            withGit,
            overwriteProjectPath ? overwriteSubmitPath : undefined,
        );

        setCreating(false);

        if (result.success && result.projectDetails) {
            onClose();
            if (editNow) {
                launchProject(result.projectDetails);
            }
        } else {
            setError(result.error);
        }
    };

    const changeRelease = (index: number) => {
        setReleaseIndex(index);
        const release = allReleases[index];

        if (!release) {
            return;
        }

        const defaultRenderer = getDefaultRendererForReleaseVersion(
            release.version,
        );

        if (defaultRenderer) {
            setRenderer(defaultRenderer);
        }
    };

    const hasTool = useCallback(
        (name: string): boolean => isVerifiedToolAvailable(tools, name),
        [tools],
    );

    useEffect(() => {
        if (inputNameRef.current) {
            inputNameRef.current.focus();
        }
        window.electron
            .getCachedTools({ refreshIfStale: false })
            .then(setTools)
            .catch(() => {
                setTools([]);
            })
            .finally(() => {
                setLoadingTools(false);
            });
    }, []);

    useEffect(() => {
        if (tools.length === 0) return;
        const hasGit = hasTool('Git');
        const hasVSCode = hasTool('VSCode');
        setWithGit(hasGit);
        setWithVSCode(hasVSCode);
    }, [hasTool, tools]);

    const showVSCodeHelp = () => {
        addAlert(
            t('otherSettings.vscodeHelp.title'),
            <p>{t('otherSettings.vscodeHelp.message')}</p>,
            <CircleHelp />,
        );
    };

    const handleSelectProjectFolder = async () => {
        setSelectingFolder(true);
        try {
            const browsePath =
                overwriteBasePath || preferences?.projects_location || '';
            const selectFolderResult =
                await window.electron.openDirectoryDialog(
                    browsePath,
                    t('project.selectFolderDialogTitle'),
                    [],
                );

            if (
                selectFolderResult &&
                !selectFolderResult.canceled &&
                selectFolderResult.filePaths.length > 0
            ) {
                setOverwriteBasePath(selectFolderResult.filePaths[0]);
            }
        } finally {
            setSelectingFolder(false);
        }
    };

    const gitAvailable = hasTool('Git');
    const vsCodeAvailable = hasTool('VSCode');

    return (
        <div className="absolute inset-0 z-20 w-full h-full p-4 bg-base-300 flex flex-col items-center">
            {selectingFolder && (
                <WaitingForDialogOverlay
                    className="z-30"
                    message={t('projects:messages.waitingForDialog')}
                />
            )}
            <div className="flex flex-col w-[900px] h-full  overflow-hidden">
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between">
                        <h1 data-testid="settingsTitle" className="text-2xl">
                            {t('title')}
                        </h1>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                data-testid="btnCloseCreateProject"
                            >
                                <X />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="divider my-2 "></div>
                <div className="flex flex-col gap-4 p-1">
                    <CreateProjectProjectSection
                        t={t}
                        releases={allReleases}
                        releaseIndex={releaseIndex}
                        inputNameRef={inputNameRef}
                        installedReleaseCount={installedReleases.length}
                        derivedProjectPath={derivedProjectPath}
                        overwriteProjectPath={overwriteProjectPath}
                        overwriteBasePath={overwriteBasePath}
                        overwriteDisplayPath={overwriteDisplayPath}
                        overwritePathSuffixDisplay={overwritePathSuffixDisplay}
                        showUseDefaultPathAction={showUseDefaultPathAction}
                        showFolderCreateIcon={showFolderCreateIcon}
                        overwriteBasePathMissing={overwriteBasePathMissing}
                        isOverwritePathEmpty={isOverwritePathEmpty}
                        onProjectNameChange={setProjectName}
                        onReleaseChange={changeRelease}
                        onOverwriteBasePathChange={setOverwriteBasePath}
                        onUseDefaultPath={() =>
                            setOverwriteBasePath(defaultOverwriteBasePath)
                        }
                        onSelectProjectFolder={() =>
                            void handleSelectProjectFolder()
                        }
                        onOverwriteProjectPathChange={setOverwriteProjectPath}
                    />
                    <div className="flex flex-row justify-between">
                        <CreateProjectRendererSection
                            t={t}
                            renderer={renderer}
                            versionNumber={
                                allReleases[releaseIndex]?.version_number || 0
                            }
                            onRendererChange={setRenderer}
                        />
                        <CreateProjectToolOptionsSection
                            t={t}
                            loadingTools={loadingTools}
                            gitAvailable={gitAvailable}
                            vsCodeAvailable={vsCodeAvailable}
                            withGit={withGit}
                            withVSCode={withVSCode}
                            onWithGitChange={setWithGit}
                            onWithVSCodeChange={setWithVSCode}
                            onVSCodeHelp={showVSCodeHelp}
                        />
                    </div>
                    <CreateProjectActions
                        error={error}
                        editNow={editNow}
                        creating={creating}
                        createDisabled={
                            installedReleases.length < 1 || isOverwritePathEmpty
                        }
                        editNowLabel={t('buttons.editNow')}
                        createLabel={t('buttons.create')}
                        onEditNowChange={setEditNow}
                        onCreateProject={() => void onCreateProject()}
                    />
                </div>
            </div>
        </div>
    );
};
