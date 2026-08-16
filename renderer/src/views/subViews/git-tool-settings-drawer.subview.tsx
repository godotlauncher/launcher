import type {
    GitIdentitySettings,
    ProjectGitIdentityPreset,
    ToolIntegrationSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { RotateCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyBadge } from '../../components/ui/copyBadge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { TextField } from '../../components/ui/textField.component';
import { useGit } from '../../hooks/git.hook';
import {
    createGitIdentitySettingsForm,
    type GitIdentityForm,
    type GitIdentitySettingsForm,
    normalizeGitIdentityForm,
    normalizeProjectGitIdentityPresetForm,
    type ProjectGitIdentityPresetForm,
} from './git-identity-settings/git-identity-settings.model';

type GitToolSettingsDrawerProps = {
    tool: ToolIntegrationSummary | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRescan: (toolId: string) => Promise<boolean>;
};

type SaveTarget = 'global' | 'preset' | null;

/** Focused Git installation and identity settings drawer. */
export const GitToolSettingsDrawer: React.FC<GitToolSettingsDrawerProps> = ({
    tool,
    open,
    onOpenChange,
    onRescan,
}) => {
    const { t } = useTranslation(['settings', 'common']);
    const {
        getIdentitySettings,
        saveGlobalIdentity,
        saveProjectIdentityPreset,
    } = useGit();
    const [settings, setSettings] = useState<GitIdentitySettings | null>(null);
    const [form, setForm] = useState<GitIdentitySettingsForm | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [saveTarget, setSaveTarget] = useState<SaveTarget>(null);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [presetError, setPresetError] = useState<string | null>(null);
    const [rescanning, setRescanning] = useState(false);
    const [rescanError, setRescanError] = useState(false);

    useEffect(() => {
        if (!open || tool?.id !== 'git') {
            setSettings(null);
            setForm(null);
            setLoadError(false);
            return;
        }

        let disposed = false;
        const load = async () => {
            setLoading(true);
            setLoadError(false);
            setGlobalError(null);
            setPresetError(null);
            try {
                const loaded = await getIdentitySettings();
                if (!disposed) {
                    setSettings(loaded);
                    setForm(createGitIdentitySettingsForm(loaded));
                }
            } catch {
                logger.error('Failed to load Git identity settings');
                if (!disposed) {
                    setLoadError(true);
                }
            } finally {
                if (!disposed) {
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            disposed = true;
        };
    }, [getIdentitySettings, open, tool?.id]);

    const updateGlobalForm = (update: Partial<GitIdentityForm>) => {
        setForm((current) =>
            current
                ? {
                      ...current,
                      globalIdentity: {
                          ...current.globalIdentity,
                          ...update,
                      },
                  }
                : current,
        );
        setGlobalError(null);
    };

    const updatePresetForm = (
        update: Partial<ProjectGitIdentityPresetForm>,
    ) => {
        setForm((current) =>
            current
                ? {
                      ...current,
                      projectPreset: {
                          ...current.projectPreset,
                          ...update,
                      },
                  }
                : current,
        );
        setPresetError(null);
    };

    const handleSaveGlobal = async () => {
        if (!form || saveTarget) {
            return;
        }
        const identity = normalizeGitIdentityForm(form.globalIdentity);
        if (!identity) {
            setGlobalError(t('tools.git.identity.errors.required'));
            return;
        }

        setSaveTarget('global');
        setGlobalError(null);
        try {
            const result = await saveGlobalIdentity(identity);
            setSettings((current) =>
                current
                    ? { ...current, globalIdentity: result.identity }
                    : current,
            );
            updateGlobalForm(result.identity);
            if (!result.success) {
                setGlobalError(t('tools.git.identity.errors.saveGlobal'));
            }
        } catch {
            logger.error('Failed to save global Git identity');
            setGlobalError(t('tools.git.identity.errors.saveGlobal'));
        } finally {
            setSaveTarget(null);
        }
    };

    const applyStoredPreset = (preset: ProjectGitIdentityPreset | null) => {
        setSettings((current) =>
            current ? { ...current, projectPreset: preset } : current,
        );
        setForm((current) =>
            current
                ? {
                      ...current,
                      projectPreset: preset
                          ? { ...preset }
                          : {
                                name: '',
                                email: '',
                                useForNewRepositories: false,
                            },
                  }
                : current,
        );
    };

    const savePreset = async (preset: ProjectGitIdentityPreset | null) => {
        setSaveTarget('preset');
        setPresetError(null);
        try {
            const result = await saveProjectIdentityPreset(preset);
            applyStoredPreset(result.preset);
            if (!result.success) {
                setPresetError(t('tools.git.identity.errors.savePreset'));
            }
        } catch {
            logger.error('Failed to save Git project identity preset');
            setPresetError(t('tools.git.identity.errors.savePreset'));
        } finally {
            setSaveTarget(null);
        }
    };

    const handleSavePreset = async () => {
        if (!form || saveTarget) {
            return;
        }
        const preset = normalizeProjectGitIdentityPresetForm(
            form.projectPreset,
        );
        if (!preset) {
            setPresetError(t('tools.git.identity.errors.required'));
            return;
        }
        await savePreset(preset);
    };

    const handleRescan = async () => {
        if (!tool || rescanning) {
            return;
        }
        setRescanning(true);
        setRescanError(false);
        try {
            setRescanError(!(await onRescan(tool.id)));
        } catch {
            logger.error('Failed to rescan Git integration');
            setRescanError(true);
        } finally {
            setRescanning(false);
        }
    };

    const available = tool?.status === 'available';
    const disabled = loading || Boolean(saveTarget);
    const statusKey = tool
        ? `tools.status.${tool.status === 'unchecked' ? 'unknown' : tool.status}`
        : 'tools.status.unknown';

    return (
        <Drawer
            open={open && tool?.id === 'git'}
            onOpenChange={onOpenChange}
            closeOnBackdrop={!saveTarget}
            closeOnEscape={!saveTarget}
            side="right"
            ariaLabel={t('tools.git.drawer.title')}
            width={560}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header>
                <Drawer.Title>{t('tools.git.drawer.title')}</Drawer.Title>
                <Drawer.CloseButton disabled={Boolean(saveTarget)} />
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-5">
                <section className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-bold">
                                {t('tools.git.installation.title')}
                            </h3>
                            <p className="text-sm text-base-content/70">
                                {t('tools.git.installation.description')}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => void handleRescan()}
                            disabled={rescanning || Boolean(saveTarget)}
                        >
                            {rescanning ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <RotateCw size={15} aria-hidden="true" />
                            )}
                            {rescanning
                                ? t('tools.actions.scanning')
                                : t('tools.actions.rescan')}
                        </button>
                    </div>
                    <div className="rounded-box bg-base-200/60 p-4 text-sm">
                        {rescanError && (
                            <p className="mb-3 text-error" role="alert">
                                {t('tools.errors.rescan')}
                            </p>
                        )}
                        <div className="flex items-center justify-between gap-3">
                            <span>{t('tools.git.installation.status')}</span>
                            <span
                                className={`badge badge-sm ${available ? 'badge-success' : 'badge-error'}`}
                            >
                                {t(statusKey)}
                            </span>
                        </div>
                        <div className="divider my-2" />
                        <div className="flex flex-col gap-2">
                            <span>{t('tools.git.installation.path')}</span>
                            {tool?.executablePath ? (
                                <CopyBadge
                                    value={tool.executablePath}
                                    label={t('common:buttons.copyPath')}
                                    copiedLabel={t('common:success')}
                                    className="self-start"
                                />
                            ) : (
                                <span className="text-base-content/60">
                                    {t('tools.status.unknown')}
                                </span>
                            )}
                            <span className="mt-1">
                                {t('tools.git.installation.version')}
                            </span>
                            <span className="text-base-content/70">
                                {tool?.version || t('tools.status.unknown')}
                            </span>
                        </div>
                    </div>
                </section>

                <div className="divider my-0" />

                {loading && (
                    <div className="flex items-center gap-2" role="status">
                        <span className="loading loading-spinner loading-sm" />
                        {t('tools.git.identity.loading')}
                    </div>
                )}
                {!loading && loadError && (
                    <p className="text-error" role="alert">
                        {t('tools.git.identity.errors.load')}
                    </p>
                )}

                {!loading && !loadError && form && settings && (
                    <>
                        <section className="flex flex-col gap-4">
                            <div>
                                <h3 className="font-bold">
                                    {t('tools.git.identity.global.title')}
                                </h3>
                                <p className="text-sm text-base-content/70">
                                    {t('tools.git.identity.global.description')}
                                </p>
                            </div>
                            {!available && (
                                <p className="text-sm text-warning">
                                    {t('tools.git.identity.global.unavailable')}
                                </p>
                            )}
                            {globalError && (
                                <p className="text-sm text-error" role="alert">
                                    {globalError}
                                </p>
                            )}
                            <TextField
                                id="globalGitIdentityName"
                                label={t('tools.git.identity.name')}
                                help={t('tools.git.identity.global.nameHelp')}
                                value={form.globalIdentity.name}
                                onChange={(name) => updateGlobalForm({ name })}
                                disabled={disabled || !available}
                            />
                            <TextField
                                id="globalGitIdentityEmail"
                                label={t('tools.git.identity.email')}
                                help={t('tools.git.identity.global.emailHelp')}
                                value={form.globalIdentity.email}
                                onChange={(email) =>
                                    updateGlobalForm({ email })
                                }
                                disabled={disabled || !available}
                            />
                            <button
                                type="button"
                                className="btn btn-primary self-end"
                                disabled={disabled || !available}
                                onClick={() => void handleSaveGlobal()}
                            >
                                {saveTarget === 'global' && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {saveTarget === 'global'
                                    ? t('tools.git.identity.actions.saving')
                                    : t(
                                          'tools.git.identity.actions.saveGlobal',
                                      )}
                            </button>
                        </section>

                        <div className="divider my-0" />

                        <section className="flex flex-col gap-4">
                            <div>
                                <h3 className="font-bold">
                                    {t('tools.git.identity.preset.title')}
                                </h3>
                                <p className="text-sm text-base-content/70">
                                    {t('tools.git.identity.preset.description')}
                                </p>
                            </div>
                            {presetError && (
                                <p className="text-sm text-error" role="alert">
                                    {presetError}
                                </p>
                            )}
                            <TextField
                                id="projectGitIdentityName"
                                label={t('tools.git.identity.name')}
                                help={t('tools.git.identity.preset.nameHelp')}
                                value={form.projectPreset.name}
                                onChange={(name) => updatePresetForm({ name })}
                                disabled={disabled}
                            />
                            <TextField
                                id="projectGitIdentityEmail"
                                label={t('tools.git.identity.email')}
                                help={t('tools.git.identity.preset.emailHelp')}
                                value={form.projectPreset.email}
                                onChange={(email) =>
                                    updatePresetForm({ email })
                                }
                                disabled={disabled}
                            />
                            <label className="flex items-start justify-between gap-4 rounded-box bg-base-200/60 p-4">
                                <span>
                                    <span className="block font-semibold">
                                        {t(
                                            'tools.git.identity.preset.automaticTitle',
                                        )}
                                    </span>
                                    <span className="block text-sm text-base-content/70">
                                        {t(
                                            'tools.git.identity.preset.automaticDescription',
                                        )}
                                    </span>
                                </span>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-primary shrink-0"
                                    checked={
                                        form.projectPreset.useForNewRepositories
                                    }
                                    onChange={(event) =>
                                        updatePresetForm({
                                            useForNewRepositories:
                                                event.currentTarget.checked,
                                        })
                                    }
                                    disabled={disabled}
                                />
                            </label>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    disabled={
                                        disabled || !settings.projectPreset
                                    }
                                    onClick={() => void savePreset(null)}
                                >
                                    {t(
                                        'tools.git.identity.actions.clearPreset',
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={disabled}
                                    onClick={() => void handleSavePreset()}
                                >
                                    {saveTarget === 'preset' && (
                                        <span className="loading loading-spinner loading-xs" />
                                    )}
                                    {saveTarget === 'preset'
                                        ? t('tools.git.identity.actions.saving')
                                        : t(
                                              'tools.git.identity.actions.savePreset',
                                          )}
                                </button>
                            </div>
                        </section>
                    </>
                )}
            </Drawer.Body>
            <Drawer.Footer>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onOpenChange(false)}
                    disabled={Boolean(saveTarget)}
                >
                    {t('common:buttons.cancel')}
                </button>
            </Drawer.Footer>
        </Drawer>
    );
};
