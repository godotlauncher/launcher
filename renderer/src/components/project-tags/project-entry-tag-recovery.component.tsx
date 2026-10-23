import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfirmLayout } from '../confirm.component';

type Props = {
    projectName: string;
    renderLayout: ConfirmLayout;
    onRetry: () => Promise<void>;
    onDone: () => void;
};

/** Keeps one failed tag assignment open until it is retried or explicitly skipped.
 * @param props - Registered project, confirmation layout and tag-only retry.
 */
export function ProjectEntryTagRecovery({
    projectName,
    renderLayout,
    onRetry,
    onDone,
}: Props) {
    const { t } = useTranslation('projects');
    const busy = useRef(false);
    const [saving, setSaving] = useState(false);
    /** Serialises persistence and keeps a pending save inside its own confirmation. */
    const retry = async () => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            await onRetry();
            onDone();
        } catch {
            busy.current = false;
            setSaving(false);
        }
    };
    /** Continues with the registered project only when no save remains in flight. */
    const cancel = () => {
        if (!busy.current) onDone();
    };
    return renderLayout(
        <p aria-busy={saving}>
            {projectName}: {t('tags.saveFailed')}
        </p>,
        <>
            <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void retry()}
            >
                {t('tags.retry')}
            </button>
            <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={cancel}
            >
                {t('common:buttons.cancel')}
            </button>
        </>,
        { onRequestClose: saving ? undefined : cancel },
    );
}
