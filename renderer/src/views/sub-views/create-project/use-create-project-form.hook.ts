import type { RendererType } from '@shared/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileSystem } from '../../../hooks/file-system.hook.tsx';
import { usePreferences } from '../../../hooks/preferences.hook.tsx';
import { useProjects } from '../../../hooks/projects.hook.tsx';
import { useRelease } from '../../../hooks/release.hook.tsx';
import { appBridge } from '../../../renderer.bridge.ts';
import {
    buildCreateProjectReleaseRows,
    type CreateProjectEditorSelection,
    getCreateProjectCatalogueVariants,
    getCreateProjectDirectorySegment,
    getCreateProjectReleaseKey,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    isCreateProjectNameAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    OVERWRITE_PATH_CHECK_DEBOUNCE_MS,
    PROJECT_NAME_CHECK_DEBOUNCE_MS,
} from './create-project.model.ts';
import { useCreateProjectDestination } from './use-create-project-destination.hook.ts';

/**
 * Owns the Create Project form values, local validation, and folder selection.
 *
 * @param open - Whether the containing Create Project drawer is open.
 * @returns Form state, derived values, and actions for the Create Project drawer.
 */
export function useCreateProjectForm(open: boolean) {
    const { t } = useTranslation('createProject');
    const releaseApi = useRelease();
    const { projects } = useProjects();
    const { pathExists } = useFileSystem();
    const { preferences, platform } = usePreferences();
    const projectNameCheckRequestRef = useRef(0);
    const overwritePathCheckRequestRef = useRef(0);
    const overwriteBasePathInitializedRef = useRef(false);
    const defaultOverwriteBasePathRef = useRef('');
    const [renderer, setRenderer] = useState<RendererType[5]>('FORWARD_PLUS');
    const [editorSelection, setEditorSelection] =
        useState<CreateProjectEditorSelection | null>(null);
    const [projectName, setProjectName] = useState('');
    const [projectNameAvailability, setProjectNameAvailability] = useState<
        'idle' | 'checking' | 'available' | 'unavailable'
    >('idle');
    const [overwriteBasePath, setOverwriteBasePath] = useState('');
    const [overwriteBasePathMissing, setOverwriteBasePathMissing] =
        useState(false);
    const [checkingOverwriteBasePath, setCheckingOverwriteBasePath] =
        useState(false);
    const [editNow, setEditNow] = useState(true);
    const [selectingFolder, setSelectingFolder] = useState(false);
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const defaultOverwriteBasePath = preferences?.projects_location ?? '';
    const projectDirectorySegment = useMemo(
        () => getCreateProjectDirectorySegment(projectName),
        [projectName],
    );
    const selectedEditorInstalled =
        editorSelection?.source === 'installed' ||
        Boolean(
            editorSelection?.source === 'catalogue' &&
                editorSelection.installedRelease,
        );
    const selectedEditorInstallProgress =
        editorSelection?.source === 'catalogue'
            ? releaseApi.releaseInstallProgress.find(
                  (progress) =>
                      progress.version === editorSelection.release.version &&
                      progress.mono === editorSelection.mono,
              )
            : undefined;

    useEffect(() => {
        projectNameCheckRequestRef.current += 1;
        const requestId = projectNameCheckRequestRef.current;
        if (!open || projectName.trim().length === 0) {
            setProjectNameAvailability('idle');
            return;
        }

        setProjectNameAvailability('checking');
        const timeoutId = window.setTimeout(() => {
            if (projectNameCheckRequestRef.current !== requestId) {
                return;
            }
            setProjectNameAvailability(
                isCreateProjectNameAvailable(projects, projectName)
                    ? 'available'
                    : 'unavailable',
            );
        }, PROJECT_NAME_CHECK_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [open, projectName, projects]);

    useEffect(() => {
        if (!open || editorSelection) {
            return;
        }

        const installedRelease = buildCreateProjectReleaseRows(
            releaseApi.installedReleases,
            [],
        ).find(
            (release) =>
                release.valid !== false && Boolean(release.editor_path),
        );
        if (installedRelease) {
            setEditorSelection({
                source: 'installed',
                key: getCreateProjectReleaseKey(installedRelease),
                release: installedRelease,
            });
            return;
        }

        const catalogueVariant =
            getCreateProjectCatalogueVariants(
                releaseApi.availableReleases,
                '',
            )[0] ??
            getCreateProjectCatalogueVariants(
                releaseApi.availablePrereleases,
                '',
            )[0];
        if (catalogueVariant) {
            setEditorSelection({
                source: 'catalogue',
                key: catalogueVariant.key,
                release: catalogueVariant.release,
                mono: catalogueVariant.mono,
            });
        }
    }, [
        editorSelection,
        open,
        releaseApi.availablePrereleases,
        releaseApi.availableReleases,
        releaseApi.installedReleases,
    ]);

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
        [overwriteBasePath, pathSeparator, projectSegmentDisplay],
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
        [overwriteBasePath, pathSeparator, projectSegmentDisplay],
    );
    const showFolderCreateIcon =
        !checkingOverwriteBasePath && overwriteBasePathMissing;
    const isOverwritePathEmpty = overwriteBasePath.trim().length === 0;
    const destinationCheck = useCreateProjectDestination(
        open && !isOverwritePathEmpty,
        projectName,
        overwriteSubmitPath,
        t('destination.checkFailed'),
    );
    const isOverwritePathChangedFromDefault =
        normalizeBasePathForJoin(overwriteBasePath, pathSeparator) !==
        normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator);
    const showUseDefaultPathAction =
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

        return () => window.clearTimeout(timeoutId);
    }, [open, overwriteBasePath, pathExists]);

    useEffect(() => {
        if (!open) {
            setEditorSelection(null);
        }
    }, [open]);

    /**
     * Selects an exact installed or catalogue editor and updates its renderer default.
     *
     * @param selection - Stable editor selection from the inline picker.
     */
    const changeEditorSelection = (selection: CreateProjectEditorSelection) => {
        setEditorSelection(selection);
        const defaultRenderer = getDefaultRendererForReleaseVersion(
            selection.release.version,
        );
        if (defaultRenderer) {
            setRenderer(defaultRenderer);
        }
    };

    /** Opens the native directory picker for the Create Project base path. */
    const handleSelectProjectFolder = async (): Promise<void> => {
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

    /** Restores the form values that were reset when the drawer opened. */
    const reset = (): void => {
        setRenderer('FORWARD_PLUS');
        setProjectName('');
        setProjectNameAvailability('idle');
        setOverwriteBasePath(defaultOverwriteBasePathRef.current);
        setOverwriteBasePathMissing(false);
        setCheckingOverwriteBasePath(false);
        setEditNow(true);
        setSelectingFolder(false);
        overwritePathCheckRequestRef.current += 1;
        overwriteBasePathInitializedRef.current = Boolean(
            defaultOverwriteBasePathRef.current,
        );
    };

    return {
        releaseApi,
        renderer,
        setRenderer,
        editorSelection,
        setEditorSelection,
        changeEditorSelection,
        selectedEditorInstalled,
        selectedEditorInstallProgress,
        projectName,
        setProjectName,
        projectNameAvailability,
        overwriteBasePath,
        setOverwriteBasePath,
        defaultOverwriteBasePath,
        overwriteDisplayPath,
        overwriteSubmitPath,
        overwritePathSuffixDisplay,
        showFolderCreateIcon,
        isOverwritePathEmpty,
        showUseDefaultPathAction,
        destinationCheck,
        editNow,
        setEditNow,
        selectingFolder,
        handleSelectProjectFolder,
        reset,
    };
}
