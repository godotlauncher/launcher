import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    UserPreferences,
} from '@shared/contracts';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appBridge } from '../bridge';
import { useCodeEditorIntegrations } from '../hooks/useCodeEditorIntegrations';
import { usePreferences } from '../hooks/usePreferences';
import { useRelease } from '../hooks/useRelease';
import { useTheme } from '../hooks/useTheme';
import { useTrayAvailability } from '../hooks/useTrayAvailability';
import { appRoutePaths } from '../routes.ts';
import { AppearanceStep } from './onboarding/appearance-step.component';
import {
    applyOnboardingRecommendedLocations,
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
};

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
    const { t } = useTranslation(['welcome', 'common']);
    const navigate = useNavigate();
    const {
        preferences,
        platform,
        savePreferences,
        loadPreferences,
        setAutoStart,
    } = usePreferences();
    const { installedReleases } = useRelease();
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

    const destinationPath = getOnboardingDestinationPath(installedReleases);
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
        setPathErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
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
        setPending(true);
        setOperationError(undefined);
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
            await savePreferences({
                ...draft,
                first_run: false,
            });
            localStorage.removeItem(ONBOARDING_STEP_STORAGE_KEY);
            navigate(destinationPath, { replace: true });
        } catch {
            setOperationError(t('welcome:onboarding.errors.finish'));
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
              : destinationPath === appRoutePaths.installEditor
                ? t('welcome:onboarding.navigation.finishInstall')
                : t('welcome:onboarding.navigation.finishProjects');

    return (
        <div className="flex h-full min-h-0 w-full bg-base-100 text-base-content">
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
                            recommendedProjectsLocation={
                                recommendedLocations?.projectsLocation
                            }
                            recommendedEditorLocation={
                                recommendedLocations?.editorLocation
                            }
                            projectsLocationError={pathErrors.projectsLocation}
                            editorLocationError={pathErrors.editorLocation}
                            integrations={integrations}
                            integrationsLoading={integrationsLoading}
                            integrationsLoadFailed={integrationsLoadFailed}
                            selectedCodeEditorId={selectedCodeEditorId}
                            windowsSymlinksEnabled={
                                draft.windows_enable_symlinks
                            }
                            pending={pending}
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
                            pending={pending}
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

                {operationError && (
                    <div className="px-10 pb-3">
                        <div
                            className="alert alert-error py-3 text-sm"
                            role="alert"
                        >
                            <CircleX className="size-5" aria-hidden="true" />
                            <span>{operationError}</span>
                        </div>
                    </div>
                )}

                <footer className="flex min-h-20 items-center justify-between border-t border-base-300 px-10 py-4">
                    {step === 'welcome' ? (
                        <span aria-hidden="true" />
                    ) : (
                        <button
                            type="button"
                            className="btn btn-outline min-w-24"
                            onClick={() =>
                                setStep(getPreviousOnboardingStep(step))
                            }
                            disabled={pending}
                        >
                            {t('common:buttons.back')}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary min-w-28"
                        onClick={continueStep}
                        disabled={pending}
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
