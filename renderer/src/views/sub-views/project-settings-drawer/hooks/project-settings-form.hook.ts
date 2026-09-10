import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCodeEditorIntegrations } from '../../../../hooks/code-editor-integrations.hook';
import type { ProjectSettingsSave } from '../../../../hooks/project-settings-save.types';
import { useRelease } from '../../../../hooks/release.hook';
import { sortReleases } from '../../../../release-sorting.util';
import {
    type CreateProjectEditorSelection,
    getCreateProjectReleaseKey,
} from '../../create-project/create-project.model';
import {
    canRenameGodotProject,
    hasProjectCodeEditorChanges,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from '../project-settings.model';

type ProjectSettingsFormOptions = {
    project: ProjectDetails | null;
    open: boolean;
    installedReleases: InstalledRelease[];
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
    settingsSave: ProjectSettingsSave | undefined;
    clearSettingsSave: (path: string) => void;
    t: TFunction;
};

/**
 * Owns staged Settings values and session-safe project initialisation.
 *
 * @param options - The project session, persisted draft and external lookups.
 * @returns Form values, derived state and domain actions for the drawer coordinator.
 */
export function useProjectSettingsForm({
    project,
    open,
    installedReleases,
    getProjectGodotName,
    settingsSave,
    clearSettingsSave,
    t,
}: ProjectSettingsFormOptions) {
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const {
        availableReleases,
        availablePrereleases,
        releaseInstallProgress,
        loading: releasesLoading,
        hasError: catalogueError,
        refreshAvailableReleases,
        cancelInstall,
    } = useRelease();
    const [initialName, setInitialName] = useState('');
    const [name, setName] = useState('');
    const [initialReleaseKey, setInitialReleaseKey] = useState('');
    const [releaseSelection, setReleaseSelection] =
        useState<CreateProjectEditorSelection | null>(null);
    const [initialWindowed, setInitialWindowed] = useState(false);
    const [windowed, setWindowed] = useState(false);
    const [godotProjectName, setGodotProjectName] = useState<string | null>(
        null,
    );
    const [loadingGodotName, setLoadingGodotName] = useState(false);
    const [renameGodotProject, setRenameGodotProject] = useState(false);
    const [nameError, setNameError] = useState<string>();
    const [godotError, setGodotError] = useState<string>();
    const [formError, setFormError] = useState<string>();
    const [initialCodeEditorId, setInitialCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [codeEditorTouched, setCodeEditorTouched] = useState(false);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState(false);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);
    const activeProjectPathRef = useRef<string | null>(null);
    const sessionRef = useRef(0);
    const restoredSaveRef = useRef<ProjectSettingsSave | undefined>(undefined);

    useEffect(
        () => () => {
            sessionRef.current += 1;
        },
        [],
    );
    useEffect(() => {
        if (!open || !project) {
            activeProjectPathRef.current = null;
            sessionRef.current += 1;
            return;
        }
        if (activeProjectPathRef.current === project.path) return;

        activeProjectPathRef.current = project.path;
        sessionRef.current += 1;
        const session = sessionRef.current;
        const releaseKey = getCreateProjectReleaseKey(project.release);
        const currentCodeEditorId = project.codeEditorId ?? null;
        setInitialName(project.name);
        setName(project.name);
        setInitialReleaseKey(releaseKey);
        setReleaseSelection({
            source: 'installed',
            key: releaseKey,
            release: project.release,
        });
        setInitialWindowed(Boolean(project.open_windowed));
        setWindowed(Boolean(project.open_windowed));
        setGodotProjectName(null);
        setRenameGodotProject(false);
        setNameError(undefined);
        setGodotError(undefined);
        setFormError(undefined);
        setInitialCodeEditorId(currentCodeEditorId);
        setCodeEditorId(currentCodeEditorId);
        setCodeEditorTouched(false);
        setCodeEditorSettings([]);
        setCodeEditorLoadFailed(false);
        setLoadingGodotName(true);
        setLoadingCodeEditors(true);

        getProjectGodotName(project)
            .then((value) => {
                if (session === sessionRef.current) setGodotProjectName(value);
            })
            .catch(() => {
                if (session === sessionRef.current) setGodotProjectName(null);
            })
            .finally(() => {
                if (session === sessionRef.current) setLoadingGodotName(false);
            });
        listIntegrationSettings()
            .then((settings) => {
                if (session === sessionRef.current)
                    setCodeEditorSettings(settings);
            })
            .catch(() => {
                if (session === sessionRef.current)
                    setCodeEditorLoadFailed(true);
            })
            .finally(() => {
                if (session === sessionRef.current)
                    setLoadingCodeEditors(false);
            });
    }, [getProjectGodotName, listIntegrationSettings, open, project]);

    useEffect(() => {
        if (!open || !project) {
            restoredSaveRef.current = undefined;
            return;
        }
        if (
            !settingsSave ||
            restoredSaveRef.current === settingsSave ||
            loadingCodeEditors ||
            loadingGodotName
        )
            return;
        restoredSaveRef.current = settingsSave;
        if (settingsSave.status === 'complete' && settingsSave.project) {
            const saved = settingsSave.project;
            const releaseKey = getCreateProjectReleaseKey(saved.release);
            setName(saved.name);
            setInitialName(saved.name);
            setReleaseSelection({
                source: 'installed',
                key: releaseKey,
                release: saved.release,
            });
            setInitialReleaseKey(releaseKey);
            setWindowed(Boolean(saved.open_windowed));
            setInitialWindowed(Boolean(saved.open_windowed));
            setCodeEditorId(saved.codeEditorId ?? null);
            setInitialCodeEditorId(saved.codeEditorId ?? null);
            setCodeEditorTouched(false);
            setRenameGodotProject(false);
            if (settingsSave.draft.renameGodotProject)
                setGodotProjectName(saved.name);
            setFormError(undefined);
            clearSettingsSave(project.path);
            return;
        }
        const draft = settingsSave.draft;
        setName(draft.name);
        setReleaseSelection(draft.releaseSelection);
        setWindowed(draft.windowed);
        setCodeEditorId(draft.codeEditorId);
        setCodeEditorTouched(draft.codeEditorTouched);
        setRenameGodotProject(draft.renameGodotProject);
        setFormError(settingsSave.error);
    }, [
        clearSettingsSave,
        loadingCodeEditors,
        loadingGodotName,
        open,
        project,
        settingsSave,
    ]);

    const selectableReleases = useMemo(() => {
        if (!project) return [];
        const major = Math.trunc(project.release.version_number);
        return installedReleases
            .filter(
                (release) =>
                    release.valid !== false &&
                    Boolean(release.editor_path) &&
                    Math.trunc(release.version_number) >= major,
            )
            .sort(sortReleases);
    }, [installedReleases, project]);
    const compatibleCatalogueReleases = useMemo(
        () =>
            project
                ? availableReleases.filter(
                      (release) =>
                          Math.trunc(release.version_number) >=
                          Math.trunc(project.release.version_number),
                  )
                : [],
        [availableReleases, project],
    );
    const compatibleCataloguePrereleases = useMemo(
        () =>
            project
                ? availablePrereleases.filter(
                      (release) =>
                          Math.trunc(release.version_number) >=
                          Math.trunc(project.release.version_number),
                  )
                : [],
        [availablePrereleases, project],
    );
    const hasRenameChanges = Boolean(
        project &&
            hasProjectRenameChanges(
                initialName,
                godotProjectName,
                name,
                renameGodotProject,
            ),
    );
    const hasCodeEditorChanges = Boolean(
        project &&
            hasProjectCodeEditorChanges(
                initialCodeEditorId,
                codeEditorId,
                codeEditorTouched,
            ),
    );
    const hasReleaseChanges = Boolean(
        project &&
            releaseSelection &&
            (initialReleaseKey !==
                getCreateProjectReleaseKey({
                    version: releaseSelection.release.version,
                    mono:
                        releaseSelection.source === 'installed'
                            ? releaseSelection.release.mono
                            : releaseSelection.mono,
                }) ||
                (releaseSelection.source === 'catalogue' &&
                    (project.release.valid === false ||
                        !project.release.editor_path))),
    );
    const hasWindowedChanges = Boolean(project && initialWindowed !== windowed);

    /** @param value - The edited Launcher project name. */
    const changeName = (value: string) => {
        setName(value);
        setNameError(undefined);
        setFormError(undefined);
        setGodotError(undefined);
        if (!canRenameGodotProject(value, godotProjectName))
            setRenameGodotProject(false);
    };
    /** @returns Whether the staged name is valid. */
    const validateName = () => {
        const error = validateProjectRenameName(name);
        const message = error
            ? t(`editProject.validation.${error}`)
            : undefined;
        setNameError(message);
        return !message;
    };
    /** @param value - Whether to rename project.godot with the Launcher name. */
    const changeRenameGodotProject = (value: boolean) => {
        setRenameGodotProject(value);
        setGodotError(undefined);
        setFormError(undefined);
    };
    /** @param value - The staged editor picker selection. */
    const changeReleaseSelection = (
        value: CreateProjectEditorSelection | null,
    ) => {
        setReleaseSelection(value);
        setFormError(undefined);
    };
    /** @param value - The staged code editor id. */
    const changeCodeEditor = (value: CodeEditorId | null) => {
        setCodeEditorId(value);
        setCodeEditorTouched(true);
        setFormError(undefined);
    };
    /** @param value - Whether launches should use a windowed game window. */
    const changeWindowed = (value: boolean) => {
        setWindowed(value);
        setFormError(undefined);
    };
    /** @param message - The form-level save error. */
    const setSaveError = (message: string | undefined) => setFormError(message);
    /** @param message - The Godot project name error. */
    const setGodotNameError = (message: string | undefined) =>
        setGodotError(message);
    /** @param message - The Launcher project name error. */
    const setProjectNameError = (message: string | undefined) =>
        setNameError(message);
    /** @param saved - The successful renamed project baseline. */
    const acceptRename = (saved: ProjectDetails) => {
        setInitialName(saved.name);
        setName(saved.name);
        if (renameGodotProject) setGodotProjectName(saved.name);
        setRenameGodotProject(false);
    };
    /** @param saved - The successful code editor baseline. */
    const acceptCodeEditor = (saved: ProjectDetails) => {
        setInitialCodeEditorId(saved.codeEditorId ?? null);
        setCodeEditorTouched(false);
    };
    /** @param key - The successful editor selection key. */
    const acceptRelease = (key: string) => setInitialReleaseKey(key);
    /** @param value - The successful launch preference baseline. */
    const acceptWindowed = (value: boolean) => setInitialWindowed(value);

    return {
        sessionRef,
        initialName,
        name,
        initialReleaseKey,
        releaseSelection,
        initialWindowed,
        windowed,
        godotProjectName,
        loadingGodotName,
        renameGodotProject,
        nameError,
        godotError,
        formError,
        initialCodeEditorId,
        codeEditorId,
        codeEditorTouched,
        codeEditorSettings,
        loadingCodeEditors,
        codeEditorLoadFailed,
        selectableReleases,
        compatibleCatalogueReleases,
        compatibleCataloguePrereleases,
        releaseInstallProgress,
        releasesLoading,
        catalogueError,
        refreshAvailableReleases,
        cancelInstall,
        hasRenameChanges,
        hasCodeEditorChanges,
        hasReleaseChanges,
        hasWindowedChanges,
        changeName,
        validateName,
        changeRenameGodotProject,
        changeReleaseSelection,
        changeCodeEditor,
        changeWindowed,
        setSaveError,
        setGodotNameError,
        setProjectNameError,
        acceptRename,
        acceptCodeEditor,
        acceptRelease,
        acceptWindowed,
    };
}
