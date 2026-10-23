import type {
    AddProjectOptions,
    AddProjectToListResult,
    FolderProjectScanProgress,
    FolderProjectScanResult,
    ProjectTagSelection,
} from '@shared/contracts';
import { FolderSearch } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { usePreferences } from '../../../hooks/preferences.hook';
import { useProjectEntryTags } from '../../../hooks/project-entry-tags.hook';
import {
    type ProjectEditorRepairRequest,
    useProjects,
} from '../../../hooks/projects.hook';
import { useRelease } from '../../../hooks/release.hook';
import { projectsBridge, subscribeAppEvent } from '../../../renderer.bridge';
import {
    type LocalImportRow,
    prepareLocalImportRow,
} from '../local-import-editor.model';
import { getImportConflicts } from '../project-import-conflict.model';
import {
    getRemoteCodeEditorOptions,
    type RemoteProjectCodeEditorChoice,
} from '../remote-project-import.model';
import type { RemoteProjectRegistrationOutcome } from '../remote-project-import.types';
import { registerResolvedRemoteProjectBatch } from '../remote-project-registration.service';
import { RemoteProjectRegistrationResult } from './remote-project-import-result.component';
import { RemoteProjectReview } from './remote-project-review.component';

type Props = {
    folder: string;
    onClose: () => void;
    onChooseFolder: () => void;
    handleAddProjectResult: (
        projectPath: string,
        result: AddProjectToListResult,
        options?: AddProjectOptions,
    ) => Promise<boolean>;
    queueProjectEditorRepairs: (requests: ProjectEditorRepairRequest[]) => void;
};

/** Scans one local folder and reuses the shared project import workflow.
 * @param props - Selected folder and existing project-registration callbacks.
 */
export function FolderProjectImportModal({
    folder,
    onClose,
    onChooseFolder,
    handleAddProjectResult,
    queueProjectEditorRepairs,
}: Props) {
    const { t } = useTranslation([
        'projects',
        'common',
        'settings',
        'installEditor',
        'createProject',
    ]);
    const { platform } = usePreferences();
    const { projects, addProject, codeEditorSettings } = useProjects();
    const { availableReleases, availablePrereleases } = useRelease();
    const { apply: applyEntryTags } = useProjectEntryTags();
    const [tagSelections, setTagSelections] = useState<
        Record<string, ProjectTagSelection[]>
    >({});
    const catalogue = useRef({ availableReleases, availablePrereleases });
    catalogue.current = { availableReleases, availablePrereleases };
    const [scanId] = useState(() => crypto.randomUUID());
    const started = useRef<Promise<FolderProjectScanResult> | null>(null);
    const [step, setStep] = useState<
        'scanning' | 'review' | 'adding' | 'complete'
    >('scanning');
    const [progress, setProgress] = useState<FolderProjectScanProgress | null>(
        null,
    );
    const [result, setResult] = useState<FolderProjectScanResult | null>(null);
    const [error, setError] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [rows, setRows] = useState<LocalImportRow[]>([]);
    const [selected, setSelected] = useState(new Set<string>());
    const [names, setNames] = useState<Record<string, string>>({});
    const [editors, setEditors] = useState<Record<string, string>>({});
    const [codeEditors, setCodeEditors] = useState<
        Record<string, RemoteProjectCodeEditorChoice>
    >({});
    const [editing, setEditing] = useState(false);
    const [outcomes, setOutcomes] = useState<
        RemoteProjectRegistrationOutcome[]
    >([]);
    const [downloadsQueued, setDownloadsQueued] = useState(false);
    const [registration, setRegistration] = useState({ current: 0, total: 0 });
    const selectAllRef = useRef<HTMLInputElement>(null);
    const codeEditorOptions = useMemo(
        () => getRemoteCodeEditorOptions(t, codeEditorSettings),
        [t, codeEditorSettings],
    );

    useEffect(() => {
        let live = true;
        const unsubscribe = subscribeAppEvent(
            'folder-project-scan-progress',
            (snapshot) => {
                if (snapshot.scanId === scanId && live) setProgress(snapshot);
            },
        );
        started.current ??= projectsBridge.scanProjectFolder(folder, scanId);
        void started.current
            .then(async (scan) => {
                if (!live) return;
                setResult(scan);
                const inspected = await projectsBridge.inspectProjectImports(
                    scan.projects.map((project) => project.projectFilePath),
                );
                if (!live) return;
                const nextRows = inspected.map((row) =>
                    prepareLocalImportRow(
                        row,
                        catalogue.current.availableReleases,
                        catalogue.current.availablePrereleases,
                    ),
                );
                setRows(nextRows);
                setNames(
                    Object.fromEntries(
                        nextRows.map((row) => [row.projectFilePath, row.name]),
                    ),
                );
                setEditors(
                    Object.fromEntries(
                        nextRows.map((row) => [
                            row.projectFilePath,
                            row.editorActionId,
                        ]),
                    ),
                );
                setSelected(
                    new Set(
                        nextRows
                            .filter((row) => !row.registered && !row.error)
                            .map((row) => row.projectFilePath),
                    ),
                );
                setStep('review');
            })
            .catch(() => {
                if (live) {
                    setError(true);
                    setStep('review');
                }
            });
        return () => {
            live = false;
            unsubscribe();
        };
        // Catalogue updates must not start another scan or replace reviewed choices.
    }, [folder, scanId]);

    const eligible = rows.filter((row) => !row.registered && !row.error);
    const selectedRows = rows
        .filter(
            (row) =>
                selected.has(row.projectFilePath) &&
                !row.registered &&
                !row.error,
        )
        .map((row) => ({
            ...row,
            name: names[row.projectFilePath] ?? row.name,
            editorActionId: editors[row.projectFilePath] ?? row.editorActionId,
        }));
    const conflicts = getImportConflicts(selectedRows, projects, platform);
    const conflictsByPath = Object.fromEntries(
        selectedRows.map((row, index) => [
            row.projectFilePath,
            conflicts[index],
        ]),
    );
    const downloadCount = new Set(
        selectedRows.flatMap((row) => {
            const action = row.editorActions.find(
                (action) => action.id === row.editorActionId,
            );
            return action?.download
                ? [`${action.download.version}:${row.editorRequest?.flavor}`]
                : [];
        }),
    ).size;
    const allSelected =
        eligible.length > 0 &&
        eligible.every((row) => selected.has(row.projectFilePath));
    useEffect(() => {
        if (selectAllRef.current)
            selectAllRef.current.indeterminate =
                selectedRows.length > 0 && !allSelected;
    }, [selectedRows.length, allSelected]);

    /** Stops the matching scan and lets its terminal response retain partial results. */
    const stop = async () => {
        setStopping(true);
        try {
            await projectsBridge.cancelProjectFolderScan(scanId);
        } catch {
            setStopping(false);
        }
    };

    /** Registers reviewed rows, preserving outcomes outside the current retry. */
    const register = async () => {
        if (!result || !selectedRows.length || conflicts.some(Boolean)) return;
        setStep('adding');
        setRegistration({ current: 0, total: selectedRows.length });
        const retryPaths = new Set(
            selectedRows.map((row) => row.projectFilePath),
        );
        const prior = outcomes.filter(
            (outcome) => !retryPaths.has(outcome.project.projectFilePath),
        );
        const registered = await registerResolvedRemoteProjectBatch({
            rows: selectedRows,
            projects: result.projects,
            codeEditorChoices: codeEditors,
            addProject,
            handleAddProjectResult,
            onRegistered: (project, row) =>
                applyEntryTags(project, tagSelections[row.projectFilePath]),
            t,
            onProgress: (current, total) => setRegistration({ current, total }),
            onOutcomesChange: (next) => setOutcomes([...prior, ...next]),
        });
        setOutcomes([...prior, ...registered.outcomes]);
        const added = new Set(
            registered.outcomes
                .filter((outcome) => outcome.status === 'added')
                .map((outcome) => outcome.project.projectFilePath),
        );
        setRows((current) =>
            current.map((row) =>
                added.has(row.projectFilePath)
                    ? { ...row, registered: true }
                    : row,
            ),
        );
        queueProjectEditorRepairs(registered.repairRequests);
        setDownloadsQueued(
            (current) => current || registered.repairRequests.length > 0,
        );
        if (registered.staleResults.size) {
            try {
                const inspected = await projectsBridge.inspectProjectImports([
                    ...registered.staleResults.keys(),
                ]);
                const refreshed = inspected.map((row) => {
                    const stale = registered.staleResults.get(
                        row.projectFilePath,
                    );
                    return prepareLocalImportRow(
                        {
                            ...row,
                            ...(stale?.editorResolution
                                ? {
                                      editorResolution: stale.editorResolution,
                                      editorRequest:
                                          stale.editorResolution.requested,
                                  }
                                : {}),
                        },
                        catalogue.current.availableReleases,
                        catalogue.current.availablePrereleases,
                    );
                });
                setRows((current) =>
                    current.map(
                        (row) =>
                            refreshed.find(
                                (next) =>
                                    next.projectFilePath ===
                                    row.projectFilePath,
                            ) ?? row,
                    ),
                );
                setEditors((current) => ({
                    ...current,
                    ...Object.fromEntries(
                        refreshed.map((row) => [
                            row.projectFilePath,
                            row.editorActionId,
                        ]),
                    ),
                }));
                const retryable = refreshed.filter(
                    (row) => !row.error && !row.registered,
                );
                const unavailable: RemoteProjectRegistrationOutcome[] =
                    refreshed
                        .filter((row) => row.error || row.registered)
                        .flatMap((row) => {
                            const project = result.projects.find(
                                (candidate) =>
                                    candidate.projectFilePath ===
                                    row.projectFilePath,
                            );
                            return project
                                ? [
                                      {
                                          project,
                                          originalName:
                                              row.godotName ?? project.name,
                                          launcherName:
                                              names[row.projectFilePath] ??
                                              project.name,
                                          status: row.registered
                                              ? ('skipped' as const)
                                              : ('failed' as const),
                                          error: row.registered
                                              ? t(
                                                    'addProject.conflicts.badges.folder',
                                                )
                                              : (row.error ??
                                                t(
                                                    'addProject.remote.errors.registration-failed',
                                                )),
                                      },
                                  ]
                                : [];
                        });
                setOutcomes([...prior, ...registered.outcomes, ...unavailable]);
                setSelected(
                    new Set(retryable.map((row) => row.projectFilePath)),
                );
                if (retryable.length) {
                    setStep('review');
                    return;
                }
            } catch {
                const failed: RemoteProjectRegistrationOutcome[] =
                    result.projects
                        .filter((project) =>
                            registered.staleResults.has(
                                project.projectFilePath,
                            ),
                        )
                        .map((project) => ({
                            project,
                            originalName:
                                rows.find(
                                    (row) =>
                                        row.projectFilePath ===
                                        project.projectFilePath,
                                )?.godotName ?? project.name,
                            launcherName:
                                names[project.projectFilePath] ?? project.name,
                            status: 'failed',
                            error: t(
                                'addProject.remote.errors.registration-failed',
                            ),
                        }));
                setOutcomes([...prior, ...registered.outcomes, ...failed]);
            }
        }
        setStep('complete');
    };

    const scanProblems =
        result && (result.issues.length > 0 || result.omittedIssueCount > 0) ? (
            <details className="shrink-0 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-content dark:text-warning">
                <summary className="cursor-pointer font-semibold">
                    {t('addProject.folder.problems', {
                        count: result.issues.length + result.omittedIssueCount,
                    })}
                </summary>
                <ul
                    aria-label={t('addProject.folder.problemList')}
                    className="project-import-scroll mt-2 max-h-28 space-y-2 pr-3"
                >
                    {result.issues.map((issue) => (
                        <li key={`${issue.relativePath}-${issue.reason}`}>
                            <p className="font-semibold">
                                {t(`addProject.folder.issues.${issue.reason}`)}
                            </p>
                            <p className="break-all font-mono">
                                {issue.relativePath}
                            </p>
                        </li>
                    ))}
                    {result.omittedIssueCount > 0 && (
                        <li>
                            {t('addProject.folder.moreProblems', {
                                count: result.omittedIssueCount,
                            })}
                        </li>
                    )}
                </ul>
            </details>
        ) : null;
    const notices = (
        <>
            {result?.status === 'cancelled' && (
                <p
                    role="status"
                    className="shrink-0 text-sm text-base-content/75"
                >
                    {t('addProject.folder.stopped')}
                </p>
            )}
            {result?.status === 'limited' && (
                <p
                    role="status"
                    className="shrink-0 text-sm text-warning-content dark:text-warning"
                >
                    {t('addProject.folder.limited')}
                </p>
            )}
            {(error || result?.status === 'failed') && (
                <p
                    role="alert"
                    className="shrink-0 text-sm text-error-content dark:text-error"
                >
                    {t('addProject.folder.failed')}
                </p>
            )}
            {scanProblems}
        </>
    );
    const busy = step === 'scanning' || step === 'adding';
    const footer =
        step === 'scanning' ? (
            <button
                type="button"
                className="btn btn-ghost"
                disabled={stopping}
                onClick={() => void stop()}
            >
                {t(
                    stopping
                        ? 'addProject.folder.stopping'
                        : 'addProject.folder.stop',
                )}
            </button>
        ) : step === 'adding' ? null : (
            <>
                {step === 'review' && (
                    <span className="mr-auto self-center text-sm text-base-content/60">
                        {t('addProject.editorReview.summary', {
                            count: selectedRows.length,
                            downloads: downloadCount,
                        })}
                    </span>
                )}
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onChooseFolder}
                >
                    {t('addProject.folder.another')}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onClose}
                >
                    {t(
                        step === 'complete'
                            ? 'addProject.remote.actions.done'
                            : 'common:buttons.cancel',
                    )}
                </button>
                {step === 'review' && rows.length > 0 && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                            !selectedRows.length ||
                            conflicts.some(Boolean) ||
                            editing
                        }
                        onClick={() => void register()}
                    >
                        {t('addProject.remote.actions.addProjects', {
                            count: selectedRows.length,
                        })}
                    </button>
                )}
            </>
        );
    return (
        <Dialog
            title={t('addProject.folder.title')}
            icon={<FolderSearch size={24} />}
            testId="folderProjectImportDialog"
            panelClassName="h-[85vh] max-w-5xl"
            bodyClassName="flex flex-col overflow-hidden"
            footer={footer}
            onRequestClose={
                step === 'scanning'
                    ? () => void stop()
                    : busy
                      ? undefined
                      : onClose
            }
        >
            {step === 'scanning' ? (
                <div role="status" className="flex min-h-0 flex-col gap-4">
                    <h2 className="font-semibold">
                        {t('addProject.folder.scanning')}
                    </h2>
                    <p className="break-all font-mono text-sm text-base-content/75">
                        {folder}
                    </p>
                    <p>
                        {t('addProject.folder.progress', {
                            folders: progress?.visitedDirectories ?? 0,
                            projects: progress?.projectCount ?? 0,
                        })}
                    </p>
                    <p className="text-sm text-base-content/75">
                        {t('addProject.folder.stopHint')}
                    </p>
                </div>
            ) : step === 'adding' ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
                    <div className="flex w-full max-w-lg flex-col gap-5">
                        <div className="flex items-center gap-3">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <FolderSearch size={24} aria-hidden="true" />
                            </span>
                            <div
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                            >
                                <h2 className="text-lg font-semibold">
                                    {t(
                                        'addProject.remote.registration.adding',
                                        registration,
                                    )}
                                </h2>
                            </div>
                        </div>
                        <progress
                            className="progress progress-primary h-3 w-full motion-reduce:transition-none"
                            aria-label={t(
                                'addProject.remote.registration.adding',
                                registration,
                            )}
                            max={registration.total || 1}
                            value={registration.current}
                        />
                        <p
                            className="truncate text-sm text-base-content/60"
                            title={folder}
                        >
                            {folder}
                        </p>
                    </div>
                </div>
            ) : step === 'complete' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                    {error && notices}
                    <RemoteProjectRegistrationResult
                        outcomes={outcomes}
                        editorDownloadsQueued={downloadsQueued}
                        cloneRecoveryError={null}
                        description={t('addProject.folder.preserved')}
                        t={t}
                    />
                </div>
            ) : (
                <RemoteProjectReview
                    tagSelections={tagSelections}
                    onTagsChange={(updates) =>
                        setTagSelections((current) => ({
                            ...current,
                            ...updates,
                        }))
                    }
                    repositoryPath={folder}
                    projects={result?.projects ?? []}
                    rows={rows}
                    selectedPaths={selected}
                    allSelected={allSelected}
                    codeEditorChoices={codeEditors}
                    codeEditorOptions={codeEditorOptions}
                    editorActionIds={editors}
                    selectAllRef={selectAllRef}
                    t={t}
                    importNames={names}
                    conflicts={conflictsByPath}
                    headerContent={notices}
                    emptyMessage={t('addProject.folder.empty')}
                    lockUnavailable
                    onToggleAll={(checked) =>
                        setSelected(
                            new Set(
                                checked
                                    ? eligible.map((row) => row.projectFilePath)
                                    : [],
                            ),
                        )
                    }
                    onToggleProject={(file, checked) =>
                        setSelected((current) => {
                            const next = new Set(current);
                            if (checked) next.add(file);
                            else next.delete(file);
                            return next;
                        })
                    }
                    onCodeEditorChange={(file, choice) =>
                        setCodeEditors((current) => ({
                            ...current,
                            [file]: choice,
                        }))
                    }
                    onGodotEditorChange={(file, choice) =>
                        setEditors((current) => ({
                            ...current,
                            [file]: choice,
                        }))
                    }
                    onNameChange={(file, name) =>
                        setNames((current) => ({ ...current, [file]: name }))
                    }
                    onEditingChange={setEditing}
                />
            )}
        </Dialog>
    );
}
