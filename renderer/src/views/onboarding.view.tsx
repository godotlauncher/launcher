import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    TemplateStorageSettings,
    UserPreferences,
} from '@shared/contracts';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCodeEditorIntegrations } from '../hooks/code-editor-integrations.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useTheme } from '../hooks/theme.hook';
import { useTrayAvailability } from '../hooks/tray-availability.hook';
import { appBridge, exportTemplatesBridge } from '../renderer.bridge';
import { formatTemplateBytes } from './export-templates/template-format.util';
import { AppearanceStep } from './onboarding/appearance-step.component';
import {
    applyOnboardingRecommendedLocations,
    areOnboardingPathsEqual,
    getNextOnboardingStep,
    getOnboardingDestinationPath,
    getPreviousOnboardingStep,
    isAbsoluteOnboardingPath,
    ONBOARDING_STEP_STORAGE_KEY,
    type OnboardingStepId,
    parseOnboardingStepId,
} from './onboarding/onboarding.model';
import { OnboardingProgress } from './onboarding/onboarding-progress.component';
import { PreferencesStep } from './onboarding/preferences-step.component';
import { SetupStep } from './onboarding/setup-step.component';
import { WelcomeStep } from './onboarding/welcome-step.component';

type PathErrors = {
    projectsLocation?: string;
    editorLocation?: string;
    importedTemplatesLocation?: string;
};

function storageErrorKey(failure: unknown): string | null {
    return (
        String(failure).match(
            /exportTemplates:(storage\.errors\.[\w.]+)/,
        )?.[1] ?? null
    );
}

function readStoredStep(): OnboardingStepId {
    if (typeof localStorage === 'undefined') {
        return 'welcome';
    }
    return parseOnboardingStepId(
        localStorage.getItem(ONBOARDING_STEP_STORAGE_KEY),
    );
}

/**
 * Renders the first-run onboarding flow and its completion navigation.
 *
 * @returns The active onboarding step.
 */
export const OnboardingView: React.FC = () => {
    const { t, i18n } = useTranslation([
        'welcome',
        'common',
        'exportTemplates',
    ]);
    const navigate = useNavigate();
    const {
        preferences,
        platform,
        savePreferences,
        loadPreferences,
        setAutoStart,
    } = usePreferences();
    const { theme, setTheme } = useTheme();
    const trayAvailability = useTrayAvailability(platform === 'linux');
    const { listIntegrationSettings, setDefaultIntegration } =
        useCodeEditorIntegrations();
    const [step, setStep] = useState<OnboardingStepId>(readStoredStep);
    const [draft, setDraft] = useState<UserPreferences | null>(null);
    const [recommendedLocations, setRecommendedLocations] = useState<{
        projectsLocation: string;
        editorLocation: string;
    } | null>(null);
    const [storageSettings, setStorageSettings] =
        useState<TemplateStorageSettings | null>(null);
    const [storageLoadAttempt, setStorageLoadAttempt] = useState(0);
    const [importedTemplatesLocation, setImportedTemplatesLocation] =
        useState('');
    const [pathErrors, setPathErrors] = useState<PathErrors>({});
    const [integrations, setIntegrations] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [integrationsLoading, setIntegrationsLoading] = useState(true);
    const [integrationsLoadFailed, setIntegrationsLoadFailed] = useState(false);
    const [selectedCodeEditorId, setSelectedCodeEditorId] =
        useState<CodeEditorId | null>(null);
    const storedCodeEditorId = useRef<CodeEditorId | null>(null);
    const [pending, setPending] = useState(false);
    const [operationError, setOperationError] = useState<string>();
    const [storageMoveActive, setStorageMoveActive] = useState(false);
    const [storageRecovering, setStorageRecovering] = useState(false);
    const storageMoveActiveRef = useRef(false);
    const importedLocation = storageSettings?.locations.find(
        (location) => location.kind === 'imported',
    );
    const importedTemplateStorage = importedLocation
        ? {
              currentPath: importedLocation.storagePath,
              recommendedPath: importedLocation.defaultPath,
          }
        : null;
    const storageRecoveryRequired = storageSettings?.recoveryRequired ?? false;
    const storageMoveJob =
        storageSettings?.job?.kind === 'imported' ? storageSettings.job : null;

    useEffect(() => {
        if (!preferences || !platform || draft) {
            return;
        }

        let active = true;
        appBridge
            .getOnboardingRecommendedLocations()
            .then((recommended) => {
                if (!active) {
                    return;
                }
                setRecommendedLocations(recommended);
                setDraft(
                    applyOnboardingRecommendedLocations(
                        preferences,
                        platform,
                        recommended,
                    ),
                );
            })
            .catch(() => {
                if (active) {
                    setDraft(preferences);
                }
            });

        return () => {
            active = false;
        };
    }, [draft, platform, preferences]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly refetches storage status.
    useEffect(() => {
        let active = true;
        exportTemplatesBridge
            .getStorageSettings()
            .then((settings) => {
                const imported = settings.locations.find(
                    (location) => location.kind === 'imported',
                );
                if (!imported) throw new Error('Imported storage is missing');
                if (!active) return;
                setStorageSettings(settings);
                setImportedTemplatesLocation(
                    (current) => current || imported.storagePath,
                );
            })
            .catch(() => {
                if (active) {
                    setStorageSettings(null);
                    setOperationError(
                        t('welcome:onboarding.errors.importedTemplatesMove'),
                    );
                }
            });
        return () => {
            active = false;
        };
    }, [t, storageLoadAttempt]);

    useEffect(() => {
        if (!storageMoveActive) return;
        const welcomeHash = window.location.hash;
        /** Prevents closing or reloading the renderer while templates move. */
        const preventClose = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        /** Restores onboarding when a hash change tries to leave an active move. */
        const preventNavigation = () => {
            if (
                !storageMoveActiveRef.current ||
                window.location.hash === welcomeHash
            )
                return;
            window.history.replaceState(
                null,
                '',
                `${window.location.pathname}${window.location.search}${welcomeHash}`,
            );
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        };
        window.addEventListener('beforeunload', preventClose);
        window.addEventListener('hashchange', preventNavigation, true);
        window.addEventListener('popstate', preventNavigation, true);
        return () => {
            window.removeEventListener('beforeunload', preventClose);
            window.removeEventListener('hashchange', preventNavigation, true);
            window.removeEventListener('popstate', preventNavigation, true);
        };
    }, [storageMoveActive]);

    useEffect(() => {
        localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, step);

        const animationFrame = requestAnimationFrame(() => {
            const heading = document.querySelector<HTMLElement>(
                '[data-testid="onboarding-step-heading"]',
            );
            heading?.focus();
        });
        return () => cancelAnimationFrame(animationFrame);
    }, [step]);

    useEffect(() => {
        let active = true;
        setIntegrationsLoading(true);
        setIntegrationsLoadFailed(false);

        listIntegrationSettings()
            .then((settings) => {
                if (!active) {
                    return;
                }
                setIntegrations(settings);
                const currentDefault =
                    settings.find(
                        (integration) =>
                            integration.isDefault &&
                            integration.enabled &&
                            Boolean(integration.installation),
                    )?.integration.id ?? null;
                storedCodeEditorId.current = currentDefault;
                setSelectedCodeEditorId(currentDefault);
            })
            .catch(() => {
                if (active) {
                    setIntegrationsLoadFailed(true);
                    storedCodeEditorId.current = null;
                    setSelectedCodeEditorId(null);
                }
            })
            .finally(() => {
                if (active) {
                    setIntegrationsLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [listIntegrationSettings]);

    if (!draft) {
        return null;
    }

    const destinationPath = getOnboardingDestinationPath();
    const labels = {
        welcome: t('welcome:onboarding.steps.welcome'),
        appearance: t('welcome:onboarding.steps.appearance'),
        setup: t('welcome:onboarding.steps.setup'),
        preferences: t('welcome:onboarding.steps.preferences'),
    };

    const setDraftPreferences = (updates: Partial<UserPreferences>) => {
        setDraft((current) => (current ? { ...current, ...updates } : current));
        setOperationError(undefined);
    };

    const selectDirectory = async (
        currentPath: string,
        title: string,
        preferenceKey: 'projects_location' | 'install_location',
    ) => {
        setPending(true);
        setOperationError(undefined);
        try {
            const result = await appBridge.openDirectoryDialog(
                currentPath,
                title,
            );
            if (!result.canceled && result.filePaths[0]) {
                setDraftPreferences({
                    [preferenceKey]: result.filePaths[0],
                });
            }
        } catch {
            setOperationError(t('welcome:onboarding.errors.directoryPicker'));
        } finally {
            setPending(false);
        }
    };

    const selectImportedTemplatesDirectory = async () => {
        setPending(true);
        setOperationError(undefined);
        try {
            const result = await appBridge.openDirectoryDialog(
                importedTemplatesLocation,
                t('welcome:onboarding.setup.selectImportedTemplatesLocation'),
            );
            if (!result.canceled && result.filePaths[0])
                setImportedTemplatesLocation(result.filePaths[0]);
        } catch {
            setOperationError(t('welcome:onboarding.errors.directoryPicker'));
        } finally {
            setPending(false);
        }
    };

    const validateSetup = (): boolean => {
        const nextErrors: PathErrors = {};
        if (!isAbsoluteOnboardingPath(draft.projects_location, platform)) {
            nextErrors.projectsLocation = t(
                'welcome:onboarding.errors.absolutePath',
            );
        }
        if (!isAbsoluteOnboardingPath(draft.install_location, platform)) {
            nextErrors.editorLocation = t(
                'welcome:onboarding.errors.absolutePath',
            );
        }
        if (!isAbsoluteOnboardingPath(importedTemplatesLocation, platform)) {
            nextErrors.importedTemplatesLocation = t(
                'welcome:onboarding.errors.absolutePath',
            );
        }
        setPathErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const moveImportedTemplates = async (): Promise<void> => {
        const currentSettings =
            await exportTemplatesBridge.getStorageSettings();
        setStorageSettings(currentSettings);
        if (currentSettings.recoveryRequired)
            throw new Error('exportTemplates:storage.errors.recovery');
        const imported = currentSettings.locations.find(
            (location) => location.kind === 'imported',
        );
        if (!imported) {
            throw new Error('Imported storage is unavailable');
        }
        const destination = importedTemplatesLocation.trim();
        if (
            areOnboardingPathsEqual(destination, imported.storagePath, platform)
        )
            return;
        const review = await exportTemplatesBridge.prepareStorageMove(
            'imported',
            destination,
        );
        if (review.spaceSufficient === false)
            throw new Error('exportTemplates:storage.errors.destination');
        setStorageSettings({ ...currentSettings, job: null });
        storageMoveActiveRef.current = true;
        setStorageMoveActive(true);
        try {
            await exportTemplatesBridge.startStorageMove(review.token);
            for (;;) {
                const settings =
                    await exportTemplatesBridge.getStorageSettings();
                setStorageSettings(settings);
                const nextJob = settings.job;
                if (nextJob?.kind === 'imported') {
                    if (
                        nextJob.stage === 'error' ||
                        nextJob.stage === 'cancelled'
                    )
                        throw new Error(
                            nextJob.error ??
                                'exportTemplates:storage.errors.failed',
                        );
                }
                if (settings.recoveryRequired)
                    throw new Error('exportTemplates:storage.errors.recovery');
                if (
                    nextJob?.kind === 'imported' &&
                    nextJob.stage === 'complete'
                )
                    return;
                const currentImported = settings.locations.find(
                    (location) => location.kind === 'imported',
                );
                if (
                    !settings.busy &&
                    currentImported &&
                    areOnboardingPathsEqual(
                        currentImported.storagePath,
                        destination,
                        platform,
                    )
                )
                    return;
                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 500);
                });
            }
        } finally {
            storageMoveActiveRef.current = false;
            setStorageMoveActive(false);
        }
    };

    /** Reconciles an interrupted move before onboarding can finish or retry. */
    const recoverImportedTemplates = async (): Promise<void> => {
        if (!storageRecoveryRequired || storageRecovering || pending) return;
        const attemptedDestination = storageMoveJob?.destination;
        setStorageRecovering(true);
        setOperationError(undefined);
        storageMoveActiveRef.current = true;
        setStorageMoveActive(true);
        try {
            await exportTemplatesBridge.recoverStorageMove();
            const next = await exportTemplatesBridge.getStorageSettings();
            setStorageSettings(next);
            if (next.recoveryRequired) {
                setOperationError(
                    t('exportTemplates:storage.errors.attention'),
                );
            } else {
                const imported = next.locations.find(
                    (location) => location.kind === 'imported',
                );
                if (imported) {
                    const completed =
                        !!attemptedDestination &&
                        areOnboardingPathsEqual(
                            imported.storagePath,
                            attemptedDestination,
                            platform,
                        );
                    setImportedTemplatesLocation(
                        completed
                            ? imported.storagePath
                            : (attemptedDestination ?? imported.storagePath),
                    );
                    if (!completed) setStep('setup');
                }
            }
        } catch (failure) {
            setOperationError(
                t(
                    `exportTemplates:${storageErrorKey(failure) ?? 'storage.errors.failed'}`,
                ),
            );
            try {
                const next = await exportTemplatesBridge.getStorageSettings();
                setStorageSettings(next);
                if (!next.recoveryRequired) {
                    setOperationError(undefined);
                    const imported = next.locations.find(
                        (location) => location.kind === 'imported',
                    );
                    if (imported)
                        setImportedTemplatesLocation(imported.storagePath);
                    setStep('setup');
                }
            } catch {
                // Keep the recovery action visible until storage can be checked.
            }
        } finally {
            storageMoveActiveRef.current = false;
            setStorageMoveActive(false);
            setStorageRecovering(false);
        }
    };

    const continueFromSetup = async () => {
        if (!validateSetup()) {
            return;
        }

        setPending(true);
        setOperationError(undefined);
        try {
            let persistedDraft = await savePreferences({
                ...draft,
                first_run: true,
            });
            if (selectedCodeEditorId !== storedCodeEditorId.current) {
                await setDefaultIntegration(selectedCodeEditorId);
                storedCodeEditorId.current = selectedCodeEditorId;
                persistedDraft = await loadPreferences();
            }
            setDraft(persistedDraft);
            setStep('preferences');
        } catch {
            setOperationError(t('welcome:onboarding.errors.saveSetup'));
        } finally {
            setPending(false);
        }
    };

    /**
     * Persists the completed setup and opens the appropriate first workflow.
     *
     * @returns A promise that ends after preferences and navigation update.
     */
    const finishOnboarding = async (): Promise<void> => {
        if (storageRecoveryRequired || storageRecovering || !storageSettings)
            return;
        setPending(true);
        setOperationError(undefined);
        let movingTemplates = false;
        try {
            await savePreferences({ ...draft, first_run: true });
            if (platform !== 'linux') {
                const autoStartResult = await setAutoStart(
                    draft.auto_start,
                    draft.start_in_tray,
                );
                if (!autoStartResult.success) {
                    throw new Error('Unable to update startup behavior');
                }
            }
            movingTemplates = true;
            await moveImportedTemplates();
            await savePreferences({
                ...draft,
                first_run: false,
            });
            localStorage.removeItem(ONBOARDING_STEP_STORAGE_KEY);
            navigate(destinationPath, { replace: true });
        } catch (failure) {
            let recoveryRequired = false;
            if (movingTemplates) {
                try {
                    const next =
                        await exportTemplatesBridge.getStorageSettings();
                    setStorageSettings(next);
                    recoveryRequired = next.recoveryRequired;
                } catch {
                    // Keep the original error when status cannot be refreshed.
                }
            }
            const key = storageErrorKey(failure);
            setOperationError(
                recoveryRequired
                    ? undefined
                    : key
                      ? t(`exportTemplates:${key}`)
                      : movingTemplates
                        ? t('welcome:onboarding.errors.importedTemplatesMove')
                        : t('welcome:onboarding.errors.finish'),
            );
        } finally {
            setPending(false);
        }
    };

    const continueStep = () => {
        if (step === 'welcome') {
            setStep(getNextOnboardingStep(step));
            return;
        }
        if (step === 'appearance') {
            setStep(getNextOnboardingStep(step));
            return;
        }
        if (step === 'setup') {
            void continueFromSetup();
            return;
        }
        void finishOnboarding();
    };

    const actionLabel =
        step === 'welcome' || step === 'appearance'
            ? t('common:buttons.continue')
            : step === 'setup'
              ? t('common:buttons.continue')
              : t('welcome:onboarding.navigation.finishProjects');

    return (
        <div className="flex h-full min-h-0 w-full bg-base-100 text-base">
            <OnboardingProgress
                currentStep={step}
                labels={labels}
                progressLabel={t('welcome:onboarding.progressLabel')}
                reassurance={t('welcome:onboarding.reassurance')}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <main className="min-h-0 flex-1 overflow-y-auto px-10 py-9">
                    {step === 'welcome' && <WelcomeStep />}
                    {step === 'appearance' && (
                        <AppearanceStep
                            theme={theme}
                            onThemeChange={setTheme}
                        />
                    )}
                    {step === 'setup' && (
                        <SetupStep
                            platform={platform}
                            projectsLocation={draft.projects_location}
                            editorLocation={draft.install_location}
                            importedTemplatesLocation={
                                importedTemplatesLocation
                            }
                            recommendedProjectsLocation={
                                recommendedLocations?.projectsLocation
                            }
                            recommendedEditorLocation={
                                recommendedLocations?.editorLocation
                            }
                            recommendedImportedTemplatesLocation={
                                importedTemplateStorage?.recommendedPath
                            }
                            projectsLocationError={pathErrors.projectsLocation}
                            editorLocationError={pathErrors.editorLocation}
                            importedTemplatesLocationError={
                                pathErrors.importedTemplatesLocation
                            }
                            integrations={integrations}
                            integrationsLoading={integrationsLoading}
                            integrationsLoadFailed={integrationsLoadFailed}
                            selectedCodeEditorId={selectedCodeEditorId}
                            windowsSymlinksEnabled={
                                draft.windows_enable_symlinks
                            }
                            pending={pending || storageRecovering}
                            onProjectsLocationChange={(value) => {
                                setPathErrors((errors) => ({
                                    ...errors,
                                    projectsLocation: undefined,
                                }));
                                setDraftPreferences({
                                    projects_location: value,
                                });
                            }}
                            onEditorLocationChange={(value) => {
                                setPathErrors((errors) => ({
                                    ...errors,
                                    editorLocation: undefined,
                                }));
                                setDraftPreferences({
                                    install_location: value,
                                });
                            }}
                            onImportedTemplatesLocationChange={(value) => {
                                setPathErrors((errors) => ({
                                    ...errors,
                                    importedTemplatesLocation: undefined,
                                }));
                                setImportedTemplatesLocation(value);
                                setOperationError(undefined);
                            }}
                            onProjectsLocationSelect={() =>
                                void selectDirectory(
                                    draft.projects_location,
                                    t(
                                        'welcome:onboarding.setup.selectProjectsLocation',
                                    ),
                                    'projects_location',
                                )
                            }
                            onEditorLocationSelect={() =>
                                void selectDirectory(
                                    draft.install_location,
                                    t(
                                        'welcome:onboarding.setup.selectEditorLocation',
                                    ),
                                    'install_location',
                                )
                            }
                            onImportedTemplatesLocationSelect={() =>
                                void selectImportedTemplatesDirectory()
                            }
                            onCodeEditorChange={setSelectedCodeEditorId}
                            onWindowsSymlinksChange={(enabled) =>
                                setDraftPreferences({
                                    windows_enable_symlinks: enabled,
                                })
                            }
                        />
                    )}
                    {step === 'preferences' && (
                        <PreferencesStep
                            platform={platform}
                            postLaunchAction={draft.post_launch_action}
                            autoStart={draft.auto_start}
                            startInTray={draft.start_in_tray}
                            trayAvailability={
                                platform !== 'linux'
                                    ? 'available'
                                    : trayAvailability === null
                                      ? 'unknown'
                                      : trayAvailability
                                        ? 'available'
                                        : 'unavailable'
                            }
                            pending={pending || storageRecovering}
                            onPostLaunchActionChange={(postLaunchAction) =>
                                setDraftPreferences({
                                    post_launch_action: postLaunchAction,
                                })
                            }
                            onAutoStartChange={(autoStart) =>
                                setDraftPreferences({ auto_start: autoStart })
                            }
                            onStartInTrayChange={(startInTray) =>
                                setDraftPreferences({
                                    start_in_tray: startInTray,
                                })
                            }
                        />
                    )}
                </main>

                {(operationError || storageRecoveryRequired) && (
                    <div className="px-10 pb-3">
                        <div
                            className={`alert alert-soft text-base py-3 ${storageRecoveryRequired ? 'alert-warning' : 'alert-error text-error-content dark:text-error'}`}
                            role="alert"
                        >
                            {!storageRecoveryRequired && (
                                <CircleX
                                    className="size-5"
                                    aria-hidden="true"
                                />
                            )}
                            <div className="min-w-0 flex-1">
                                {storageRecoveryRequired && (
                                    <p>
                                        {t(
                                            'exportTemplates:storage.errors.recovery',
                                        )}
                                    </p>
                                )}
                                {operationError && <p>{operationError}</p>}
                            </div>
                            {storageRecoveryRequired ? (
                                <button
                                    type="button"
                                    className="btn btn-warning shrink-0 whitespace-nowrap text-base"
                                    onClick={() =>
                                        void recoverImportedTemplates()
                                    }
                                    disabled={pending || storageRecovering}
                                >
                                    {storageRecovering && (
                                        <span
                                            className="loading loading-spinner loading-sm"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t('exportTemplates:storage.recover')}
                                </button>
                            ) : (
                                !storageSettings && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost text-base"
                                        onClick={() => {
                                            setOperationError(undefined);
                                            setStorageLoadAttempt(
                                                (attempt) => attempt + 1,
                                            );
                                        }}
                                    >
                                        {t('exportTemplates:storage.retry')}
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                )}
                {storageMoveActive && !storageRecovering && storageMoveJob && (
                    <div className="px-10 pb-3" role="status">
                        <p>
                            {t(
                                'welcome:onboarding.setup.movingImportedTemplates',
                                {
                                    stage: t(
                                        `exportTemplates:storage.stages.${storageMoveJob.stage}`,
                                    ),
                                },
                            )}
                            {` - ${formatTemplateBytes(
                                storageMoveJob.completedBytes,
                                i18n.language,
                            )} of ${formatTemplateBytes(
                                storageMoveJob.totalBytes,
                                i18n.language,
                            )}`}
                        </p>
                    </div>
                )}

                <footer className="flex min-h-20 items-center justify-between px-10 py-4">
                    {step === 'welcome' ? (
                        <span aria-hidden="true" />
                    ) : (
                        <button
                            type="button"
                            className="btn btn-ghost text-base min-w-24"
                            onClick={() =>
                                setStep(getPreviousOnboardingStep(step))
                            }
                            disabled={pending || storageRecovering}
                        >
                            {t('common:buttons.back')}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary text-base min-w-28"
                        onClick={continueStep}
                        disabled={
                            pending ||
                            storageRecovering ||
                            ((step === 'setup' || step === 'preferences') &&
                                !importedTemplateStorage) ||
                            (step === 'preferences' && storageRecoveryRequired)
                        }
                    >
                        {pending && (
                            <span
                                className="loading loading-spinner loading-sm"
                                aria-hidden="true"
                            />
                        )}
                        {actionLabel}
                    </button>
                </footer>
            </div>
        </div>
    );
};
