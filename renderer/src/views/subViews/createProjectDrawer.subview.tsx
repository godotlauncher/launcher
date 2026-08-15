import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
    GitIdentityScope,
    RendererType,
    ToolIntegrationSummary,
} from '@shared/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge } from '../../bridge.ts';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { WaitingForDialogOverlay } from '../../components/waitingForDialogOverlay.component';
import { useCodeEditorIntegrations } from '../../hooks/useCodeEditorIntegrations';
import { useFileSystem } from '../../hooks/useFileSystem';
import { usePreferences } from '../../hooks/usePreferences';
import { useProjects } from '../../hooks/useProjects';
import { useRelease } from '../../hooks/useRelease';
import { useToolIntegrations } from '../../hooks/useToolIntegrations';
import {
    CreateProjectGitIdentityDialog,
    type GitIdentityDialogPage,
} from './createProject/components/create-project-git-identity-dialog.component';
import { CreateProjectActions } from './createProject/components/createProjectActions.component';
import { CreateProjectProjectSection } from './createProject/components/createProjectProjectSection.component';
import { CreateProjectRendererSection } from './createProject/components/createProjectRendererSection.component';
import { CreateProjectToolOptionsSection } from './createProject/components/createProjectToolOptionsSection.component';
import {
    buildCreateProjectReleaseRows,
    getCreateProjectDirectorySegment,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    isGitIdentityComplete,
    isToolIntegrationAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    OVERWRITE_PATH_CHECK_DEBOUNCE_MS,
    resolveCreateProjectCodeEditorId,
} from './createProject/createProject.model';

type SubViewProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Renders the Create Project workflow.
 *
 * @param props - Drawer visibility and change callback.
 * @returns The Create Project drawer.
 */
export const CreateProjectDrawer: React.FC<SubViewProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation(['createProject', 'projects', 'common']);
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
    const [checkingGitIdentity, setCheckingGitIdentity] =
        useState<boolean>(false);
    const [gitIdentityDialogPage, setGitIdentityDialogPage] =
        useState<GitIdentityDialogPage | null>(null);
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [gitIdentityScope, setGitIdentityScope] =
        useState<GitIdentityScope>('repository');
    const [showGitIdentityValidation, setShowGitIdentityValidation] =
        useState(false);
    const [selectingFolder, setSelectingFolder] = useState<boolean>(false);
    const [tools, setTools] = useState<ToolIntegrationSummary[]>([]);
    const [overwriteProjectPath, setOverwriteProjectPath] =
        useState<boolean>(false);
    const [withGit, setWithGit] = useState<boolean>(true);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState<boolean>(true);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);
    const inputNameRef = useRef<HTMLInputElement>(null);
    const overwritePathCheckRequestRef = useRef<number>(0);
    const overwriteBasePathInitializedRef = useRef<boolean>(false);
    const defaultOverwriteBasePathRef = useRef('');

    const { installedReleases, downloadingReleases } = useRelease();
    const { createProject, launchProject } = useProjects();
    const { pathExists } = useFileSystem();
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const { listIntegrations } = useToolIntegrations();
    const { preferences, platform } = usePreferences();
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const defaultOverwriteBasePath = preferences?.projects_location ?? '';
    const projectDirectorySegment = useMemo(
        () => getCreateProjectDirectorySegment(projectName),
        [projectName],
    );

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
        const segment = projectName
            ? projectDirectorySegment
            : '<project-name>';
        if (platform === 'win32') {
            return `${basePath}\\${segment}`;
        }
        return `${basePath}/${segment}`;
    }, [preferences, platform, projectDirectorySegment, projectName]);

    const projectSegmentDisplay = useMemo(
        () => (projectName ? projectDirectorySegment : '<project-name>'),
        [projectDirectorySegment, projectName],
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
                projectDirectorySegment,
                pathSeparator,
            ),
        [overwriteBasePath, pathSeparator, projectDirectorySegment],
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
        defaultOverwriteBasePathRef.current =
            preferences?.projects_location ?? '';

        if (!open) {
            return;
        }

        if (
            !overwriteBasePathInitializedRef.current &&
            preferences?.projects_location
        ) {
            setOverwriteBasePath(preferences.projects_location);
            overwriteBasePathInitializedRef.current = true;
        }
    }, [open, preferences?.projects_location]);

    useEffect(() => {
        if (!open) {
            return;
        }

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
    }, [open, overwriteBasePath, overwriteProjectPath, pathExists]);

    /**
     * Creates the selected project with an optional Git setup choice.
     *
     * @param gitOptions - Optional initial commit and identity setup choice.
     * @returns A promise that resolves after creation handling completes.
     */
    const createSelectedProject = async (
        gitOptions?: CreateProjectGitOptions,
    ) => {
        setCreating(true);
        const result = await createProject(
            projectName,
            allReleases[releaseIndex],
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath ? overwriteSubmitPath : undefined,
            gitOptions,
        );

        setCreating(false);

        if (result.success && result.projectDetails) {
            onOpenChange(false);
            if (editNow) {
                launchProject(result.projectDetails);
            }
        } else {
            setError(result.error);
        }
    };

    /**
     * Validates the form and checks Git identity before project creation.
     *
     * @returns A promise that resolves after preflight or creation completes.
     */
    const onCreateProject = async () => {
        setError(undefined);

        if (projectName === '') {
            setError(t('project.nameRequired'));
            return;
        }

        if (!withGit || !gitAvailable) {
            await createSelectedProject();
            return;
        }

        setCheckingGitIdentity(true);
        let identity = { name: '', email: '' };
        try {
            identity = await appBridge.getGlobalGitIdentity();
        } catch {
            identity = { name: '', email: '' };
        } finally {
            setCheckingGitIdentity(false);
        }

        if (isGitIdentityComplete(identity)) {
            await createSelectedProject();
            return;
        }

        setGitIdentityName(identity.name);
        setGitIdentityEmail(identity.email);
        setGitIdentityScope('repository');
        setShowGitIdentityValidation(false);
        setGitIdentityDialogPage('warning');
    };

    /** Initializes the project repository without staging or committing. */
    const handleSkipInitialCommit = () => {
        setGitIdentityDialogPage(null);
        void createSelectedProject({ initialCommit: 'skip' });
    };

    /** Validates and submits the entered Git identity. */
    const handleSaveGitIdentity = () => {
        const identity = {
            name: gitIdentityName.trim(),
            email: gitIdentityEmail.trim(),
        };
        if (!isGitIdentityComplete(identity)) {
            setShowGitIdentityValidation(true);
            return;
        }

        setGitIdentityDialogPage(null);
        void createSelectedProject({
            initialCommit: 'create',
            identity: { ...identity, scope: gitIdentityScope },
        });
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

    const gitAvailable = isToolIntegrationAvailable(tools, 'git');

    useEffect(() => {
        if (!open) {
            return;
        }

        let active = true;
        const animationFrameId = window.requestAnimationFrame(() => {
            inputNameRef.current?.focus();
        });

        listIntegrations()
            .then((integrations) => {
                if (active) {
                    setTools(integrations);
                }
            })
            .catch(() => {
                if (active) {
                    setTools([]);
                }
            })
            .finally(() => {
                if (active) {
                    setLoadingTools(false);
                }
            });

        return () => {
            active = false;
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [listIntegrations, open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let active = true;

        listIntegrationSettings()
            .then((settings) => {
                if (active) {
                    setCodeEditorSettings(settings);
                }
            })
            .catch(() => {
                if (active) {
                    setCodeEditorSettings([]);
                    setCodeEditorId(null);
                    setCodeEditorLoadFailed(true);
                }
            })
            .finally(() => {
                if (active) {
                    setLoadingCodeEditors(false);
                }
            });

        return () => {
            active = false;
        };
    }, [listIntegrationSettings, open]);

    useEffect(() => {
        if (loadingTools || loadingCodeEditors) return;

        setWithGit(gitAvailable);
        setCodeEditorId(resolveCreateProjectCodeEditorId(codeEditorSettings));
    }, [codeEditorSettings, gitAvailable, loadingCodeEditors, loadingTools]);

    const handleSelectProjectFolder = async () => {
        setSelectingFolder(true);
        try {
            const browsePath =
                overwriteBasePath || preferences?.projects_location || '';
            const selectFolderResult = await appBridge.openDirectoryDialog(
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

    useEffect(() => {
        if (!open) {
            return;
        }

        setRenderer('FORWARD_PLUS');
        setReleaseIndex(0);
        setProjectName('');
        setOverwriteBasePath(defaultOverwriteBasePathRef.current);
        setOverwriteBasePathMissing(false);
        setCheckingOverwriteBasePath(false);
        setEditNow(true);
        setError(undefined);
        setCreating(false);
        setCheckingGitIdentity(false);
        setGitIdentityDialogPage(null);
        setGitIdentityName('');
        setGitIdentityEmail('');
        setGitIdentityScope('repository');
        setShowGitIdentityValidation(false);
        setSelectingFolder(false);
        setTools([]);
        setOverwriteProjectPath(false);
        setWithGit(true);
        setCodeEditorId(null);
        setLoadingTools(true);
        setCodeEditorSettings([]);
        setLoadingCodeEditors(true);
        setCodeEditorLoadFailed(false);
        overwritePathCheckRequestRef.current += 1;
        overwriteBasePathInitializedRef.current = Boolean(
            defaultOverwriteBasePathRef.current,
        );
    }, [open]);

    const closeDisabled =
        creating ||
        checkingGitIdentity ||
        selectingFolder ||
        gitIdentityDialogPage !== null;

    return (
        <>
            <Drawer
                open={open}
                onOpenChange={onOpenChange}
                side="right"
                closeOnBackdrop={!closeDisabled}
                closeOnEscape={!closeDisabled}
                trapFocus={gitIdentityDialogPage === null}
                width="min(900px, 100vw)"
                panelClassName={
                    gitIdentityDialogPage
                        ? 'max-w-[100vw] border-l-0'
                        : 'max-w-[100vw]'
                }
            >
                {selectingFolder && (
                    <WaitingForDialogOverlay
                        className="z-60"
                        message={t('projects:messages.waitingForDialog')}
                    />
                )}
                <Drawer.Header>
                    <Drawer.Title>{t('title')}</Drawer.Title>
                    <Drawer.CloseButton
                        data-testid="btnCloseCreateProject"
                        disabled={closeDisabled}
                    />
                </Drawer.Header>
                <form className="flex min-h-0 flex-1 flex-col">
                    <Drawer.Body className="flex flex-col gap-5">
                        {error && (
                            <div
                                className="alert alert-error alert-soft"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}
                        <CreateProjectProjectSection
                            t={t}
                            releases={allReleases}
                            releaseIndex={releaseIndex}
                            inputNameRef={inputNameRef}
                            installedReleaseCount={installedReleases.length}
                            projectName={projectName}
                            derivedProjectPath={derivedProjectPath}
                            overwriteProjectPath={overwriteProjectPath}
                            overwriteBasePath={overwriteBasePath}
                            overwriteDisplayPath={overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                overwritePathSuffixDisplay
                            }
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
                            onOverwriteProjectPathChange={
                                setOverwriteProjectPath
                            }
                        />
                        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                            <CreateProjectRendererSection
                                t={t}
                                renderer={renderer}
                                versionNumber={
                                    allReleases[releaseIndex]?.version_number ||
                                    0
                                }
                                onRendererChange={setRenderer}
                            />
                            <CreateProjectToolOptionsSection
                                t={t}
                                loadingTools={loadingTools}
                                gitAvailable={gitAvailable}
                                withGit={withGit}
                                loadingCodeEditors={loadingCodeEditors}
                                codeEditorLoadFailed={codeEditorLoadFailed}
                                onWithGitChange={setWithGit}
                                codeEditorSettings={codeEditorSettings}
                                codeEditorId={codeEditorId}
                                onCodeEditorIdChange={setCodeEditorId}
                            />
                        </div>
                    </Drawer.Body>
                    <Drawer.Footer className="justify-between">
                        <CreateProjectActions
                            editNow={editNow}
                            creating={creating || checkingGitIdentity}
                            createDisabled={
                                loadingTools ||
                                installedReleases.length < 1 ||
                                isOverwritePathEmpty
                            }
                            editNowLabel={t('buttons.editNow')}
                            cancelLabel={t('common:buttons.cancel')}
                            createLabel={t('buttons.create')}
                            onEditNowChange={setEditNow}
                            onCancel={() => onOpenChange(false)}
                            onCreateProject={() => void onCreateProject()}
                        />
                    </Drawer.Footer>
                </form>
            </Drawer>
            {gitIdentityDialogPage && (
                <CreateProjectGitIdentityDialog
                    page={gitIdentityDialogPage}
                    name={gitIdentityName}
                    email={gitIdentityEmail}
                    scope={gitIdentityScope}
                    showValidation={showGitIdentityValidation}
                    t={t}
                    onNameChange={setGitIdentityName}
                    onEmailChange={setGitIdentityEmail}
                    onScopeChange={setGitIdentityScope}
                    onSkip={handleSkipInitialCommit}
                    onAddIdentity={() => setGitIdentityDialogPage('identity')}
                    onBack={() => {
                        setShowGitIdentityValidation(false);
                        setGitIdentityDialogPage('warning');
                    }}
                    onSave={handleSaveGitIdentity}
                />
            )}
        </>
    );
};
