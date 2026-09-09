import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './tooltip.component';

/**
 * Copies a value without adding a styled text container.
 * @param props - The value to copy.
 */
export const CopyButton = ({ value }: { value: string }) => {
    const { t } = useTranslation('common');
    const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

    // biome-ignore lint/correctness/useExhaustiveDependencies: A new value invalidates feedback from the previous copy.
    useEffect(() => {
        setStatus('idle');
    }, [value]);

    useEffect(() => {
        if (status === 'idle') return;
        const timer = window.setTimeout(() => setStatus('idle'), 1600);
        return () => window.clearTimeout(timer);
    }, [status]);

    /** Copies the value and reports clipboard success or failure. */
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setStatus('copied');
        } catch {
            setStatus('error');
        }
    };

    const label = t(
        status === 'copied'
            ? 'success'
            : status === 'error'
              ? 'error'
              : 'buttons.copy',
    );
    const Icon = status === 'copied' ? Check : Copy;

    return (
        <Tooltip tip={label} placement="top">
            <button
                type="button"
                className="btn btn-sm btn-square btn-ghost"
                aria-label={label}
                onClick={(event) => {
                    event.stopPropagation();
                    void handleCopy();
                }}
            >
                <Icon
                    size={16}
                    aria-hidden="true"
                    className={
                        status === 'copied'
                            ? 'text-success'
                            : status === 'error'
                              ? 'text-error'
                              : 'text-base-content/60'
                    }
                />
            </button>
        </Tooltip>
    );
};
