import type { CommandLineAlias, InstalledRelease } from '@shared/contracts';
import clsx from 'clsx';
import {
    Check,
    CircleAlert,
    LoaderCircle,
    Pencil,
    Terminal,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SettingsPanel } from '../../../components/settings/settings-panel.component';
import { EditableTextField } from '../../../components/ui/editable-text-field.component';
import { Switch } from '../../../components/ui/switch.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { editorInstallsBridge } from '../../../renderer.bridge';

/**
 * Suggests a stable numeric command without silently resolving collisions.
 * @param version - Registered version, which may be a custom identifier.
 */
export function suggestAlias(version: string): string {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
    return match
        ? `godot${match[1]}${match[2]}${match[3] && Number(match[3]) !== 0 ? match[3] : ''}`
        : 'godot-custom';
}

/**
 * Stages one optional command; availability checks never mutate registration.
 * @param props - Applied binding, draft, busy state and explicit Apply action.
 */
export function CommandLineAliasPanel({
    release,
    saved,
    enabled,
    editing,
    onEdit,
    onCancelEdit,
    name,
    disabled,
    pending,
    covered,
    errorId,
    onEnabledChange,
    onNameChange,
    onApply,
}: {
    release: InstalledRelease;
    saved?: CommandLineAlias;
    enabled: boolean;
    editing: boolean;
    onEdit: () => void;
    onCancelEdit: () => void;
    name: string;
    disabled: boolean;
    pending: boolean;
    covered: boolean;
    errorId?: string;
    onEnabledChange: (enabled: boolean) => void;
    onNameChange: (name: string) => void;
    onApply: () => Promise<boolean>;
}) {
    const { t } = useTranslation(['installs', 'common']);
    const id = useId();
    const [check, setCheck] = useState<{
        name: string;
        state: 'checking' | 'available' | 'taken' | 'error';
        reason?: string;
    }>({ name: '', state: 'checking' });
    const switchRef = useRef<HTMLDivElement>(null);
    const [focusAfterApply, setFocusAfterApply] = useState<
        'switch' | 'field' | 'edit' | null
    >(null);
    useEffect(() => {
        if (!focusAfterApply || pending || covered || disabled) return;
        if (
            focusAfterApply === 'edit' &&
            (editing || !saved?.name || saved.state !== 'active')
        )
            return;
        if (focusAfterApply === 'field' && !errorId) {
            setFocusAfterApply(null);
            return;
        }
        const target = switchRef.current?.querySelector<HTMLElement>(
            focusAfterApply === 'switch'
                ? 'input[type="checkbox"]'
                : focusAfterApply === 'edit'
                  ? '[data-alias-edit]'
                  : 'input:not([type="checkbox"])',
        );
        if (!target || target.matches(':disabled')) return;
        target.focus();
        setFocusAfterApply(null);
    }, [
        focusAfterApply,
        pending,
        covered,
        errorId,
        editing,
        saved?.name,
        saved?.state,
        disabled,
    ]);
    const lastOperation = useRef({ pending, savedName: saved?.name });
    useEffect(() => {
        const previous = lastOperation.current;
        if (previous.pending && !pending && editing) {
            if (previous.savedName !== saved?.name) setFocusAfterApply('edit');
            else if (errorId) setFocusAfterApply('field');
        }
        lastOperation.current = { pending, savedName: saved?.name };
    }, [pending, editing, saved?.name, errorId]);
    /** Runs Apply and restores a surviving control or the rejected draft field. */
    const apply = async () => {
        setFocusAfterApply(
            (await onApply()) ? (editing ? 'edit' : 'switch') : 'field',
        );
    };
    /** Restores the saved command without changing its registration. */
    const cancelEdit = () => {
        onCancelEdit();
        setFocusAfterApply('edit');
    };
    const [retry, setRetry] = useState(0);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry repeats the same draft check.
    useEffect(() => {
        if (
            !enabled ||
            (saved && (!editing || saved.state !== 'active')) ||
            pending
        )
            return;
        let current = true;
        setCheck({ name, state: 'checking' });
        const timer = window.setTimeout(async () => {
            try {
                const result = await editorInstallsBridge.checkCommandLineAlias(
                    { version: release.version, mono: release.mono },
                    name,
                );
                if (current)
                    setCheck({
                        name,
                        state: result.available ? 'available' : 'taken',
                        reason: result.reason,
                    });
            } catch {
                if (current) setCheck({ name, state: 'error' });
            }
        }, 300);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [
        enabled,
        saved,
        editing,
        pending,
        name,
        release.version,
        release.mono,
        retry,
    ]);
    const dirty = enabled && (!saved || editing);
    const status = check.name === name ? check.state : 'checking';
    const canApply =
        dirty &&
        status === 'available' &&
        (!saved || (saved.state === 'active' && name !== saved.name));
    const unavailable = status === 'taken' || status === 'error';
    const reason =
        status === 'taken'
            ? check.reason || t('aliases.error')
            : t('aliases.error');
    return (
        <div ref={switchRef}>
            <SettingsPanel
                icon={Terminal}
                title={t('aliases.title')}
                titleId={`${id}-title`}
                description={t('aliases.description')}
                descriptionId={`${id}-help`}
                action={
                    <Switch
                        aria-labelledby={`${id}-title`}
                        aria-describedby={`${id}-help`}
                        checked={enabled}
                        disabled={
                            disabled || pending || saved?.state === 'unresolved'
                        }
                        onChange={() => onEnabledChange(!enabled)}
                    />
                }
            >
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    {saved && !editing && (
                        <div className="flex min-w-0 items-center gap-1">
                            <code className="break-all rounded bg-base-300 px-1 font-mono">
                                {saved.name}
                            </code>
                            <button
                                type="button"
                                data-alias-edit
                                aria-label={t('aliases.rename')}
                                className="btn btn-sm btn-ghost btn-square shrink-0"
                                disabled={
                                    disabled ||
                                    pending ||
                                    saved.state !== 'active'
                                }
                                onClick={onEdit}
                            >
                                <Pencil size={16} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    {saved && editing && (
                        <p className="w-full text-sm text-base-content/60">
                            <Trans
                                t={t}
                                i18nKey="aliases.current"
                                values={{ command: saved.name }}
                                components={{
                                    code: (
                                        <code className="break-all rounded bg-base-300 px-1 font-mono" />
                                    ),
                                }}
                            />
                        </p>
                    )}
                    {saved?.state === 'unresolved' && (
                        <p
                            role="alert"
                            className="w-full break-words text-error-content dark:text-error"
                        >
                            {saved.problem ?? t('aliases.errors.recovery')}
                        </p>
                    )}
                    {enabled && (!saved || editing) && (
                        <>
                            <EditableTextField
                                value={name}
                                draft={name}
                                editing
                                showActions={false}
                                ariaLabel={t('aliases.name')}
                                ariaDescribedBy={[
                                    `${id}-status`,
                                    unavailable ? `${id}-reason` : undefined,
                                    errorId,
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                invalid={status === 'taken' || !!errorId}
                                editLabel=""
                                saveLabel={t('aliases.apply')}
                                cancelLabel={t('common:buttons.cancel')}
                                maxLength={48}
                                disabled={
                                    disabled ||
                                    pending ||
                                    saved?.state === 'unresolved'
                                }
                                onEdit={() => {}}
                                onDraftChange={onNameChange}
                                onSave={() => {
                                    if (canApply && !disabled && !pending)
                                        void apply();
                                }}
                                onCancel={() =>
                                    saved
                                        ? cancelEdit()
                                        : onEnabledChange(false)
                                }
                                leadingIcon={Terminal}
                                inputClassName="font-mono"
                                className="w-56 max-w-full shrink-0"
                            />
                            <p
                                id={`${id}-status`}
                                role="status"
                                aria-live="polite"
                                className={clsx(
                                    'inline-flex min-w-0 max-w-full items-start gap-1.5 rounded-md px-2 py-1 text-sm',
                                    status === 'available' &&
                                        'bg-success/10 text-success-content dark:text-success',
                                    (status === 'taken' ||
                                        status === 'error') &&
                                        'bg-error/10 text-error-content dark:text-error',
                                    status === 'checking' &&
                                        'text-base-content/60',
                                )}
                            >
                                {unavailable ? (
                                    <Tooltip
                                        tip={reason}
                                        placement="top"
                                        tone="error"
                                    >
                                        <button
                                            type="button"
                                            aria-describedby={`${id}-reason`}
                                            className="inline-flex items-center gap-1.5"
                                        >
                                            <CircleAlert
                                                size={16}
                                                className="shrink-0"
                                                aria-hidden="true"
                                            />
                                            {t('aliases.unavailable')}
                                        </button>
                                    </Tooltip>
                                ) : (
                                    <>
                                        {status === 'available' ? (
                                            <Check
                                                size={16}
                                                className="mt-0.5 shrink-0"
                                                aria-hidden="true"
                                            />
                                        ) : (
                                            <LoaderCircle
                                                size={16}
                                                className="mt-0.5 shrink-0 animate-spin motion-reduce:animate-none"
                                                aria-hidden="true"
                                            />
                                        )}
                                        <span className="min-w-0 break-words">
                                            {t(`aliases.${status}`)}
                                        </span>
                                    </>
                                )}
                            </p>
                            {unavailable && (
                                <span id={`${id}-reason`} className="sr-only">
                                    {reason}
                                </span>
                            )}
                            {status === 'error' && (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    disabled={disabled || pending}
                                    onClick={() =>
                                        setRetry((value) => value + 1)
                                    }
                                >
                                    {t('common:buttons.retry')}
                                </button>
                            )}
                        </>
                    )}
                    {saved && editing && (
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost ml-auto"
                            disabled={pending}
                            onClick={cancelEdit}
                        >
                            {t('common:buttons.cancel')}
                        </button>
                    )}
                    {dirty && (
                        <button
                            type="button"
                            className={clsx(
                                'btn btn-sm btn-primary shrink-0',
                                !editing && 'ml-auto',
                            )}
                            disabled={disabled || pending || !canApply}
                            aria-busy={pending}
                            onClick={() => void apply()}
                        >
                            {pending
                                ? t('aliases.pending')
                                : t('aliases.apply')}
                        </button>
                    )}
                </div>
            </SettingsPanel>
        </div>
    );
}
