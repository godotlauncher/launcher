import { Terminal } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/preferences.hook';
import { Switch } from '../ui/switch.component';
import { SettingsPanel } from './settings-panel.component';

/**
 * Shares the automatic-command choice between Settings and onboarding.
 * @param props - Confirmed or draft choice, disabled state and change callback.
 */
export function AutomaticAliasesChoice({
    checked,
    disabled,
    onChange,
}: {
    checked: boolean;
    disabled: boolean;
    onChange: (enabled: boolean) => void;
}) {
    const { t } = useTranslation('installs');
    const id = useId();
    return (
        <SettingsPanel
            icon={Terminal}
            title={t('aliases.automatic.title')}
            titleId={`${id}-title`}
            descriptionId={`${id}-help`}
            description={
                <Trans
                    ns="installs"
                    i18nKey="aliases.automatic.description"
                    components={{
                        code: (
                            <code className="rounded bg-base-300 px-1 font-mono" />
                        ),
                    }}
                />
            }
            action={
                <Switch
                    checked={checked}
                    disabled={disabled}
                    aria-labelledby={`${id}-title`}
                    aria-describedby={`${id}-help`}
                    onChange={(event) => onChange(event.currentTarget.checked)}
                />
            }
        />
    );
}

/** Persists the global choice while retaining the last confirmed value on failure. */
export function AutomaticAliasesControl() {
    const { preferences, updatePreferences } = usePreferences();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const writing = useRef(false);
    /**
     * Saves one explicit choice without changing existing commands.
     * @param enabled - Requested automatic-creation preference.
     */
    const change = async (enabled: boolean) => {
        if (writing.current) return;
        writing.current = true;
        setPending(true);
        setError(undefined);
        try {
            await updatePreferences({ auto_create_editor_aliases: enabled });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            writing.current = false;
            setPending(false);
        }
    };
    return (
        <div className="flex flex-col gap-2">
            <AutomaticAliasesChoice
                checked={preferences?.auto_create_editor_aliases === true}
                disabled={!preferences || pending}
                onChange={(enabled) => void change(enabled)}
            />
            {error && (
                <p role="alert" className="text-error">
                    {error}
                </p>
            )}
        </div>
    );
}
