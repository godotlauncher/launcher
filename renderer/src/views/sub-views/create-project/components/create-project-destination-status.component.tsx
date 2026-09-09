import { CheckCircle2, CircleAlert } from 'lucide-react';

/**
 * Displays destination availability below the editable path.
 *
 * @param props - Validation status and localised messages.
 * @returns A live status with a compact reserved line, including while idle.
 */
export function CreateProjectDestinationStatus(props: {
    status: string;
    error?: string;
    checkingLabel: string;
    availableLabel: string;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="createProjectDestinationStatus"
            className={`flex min-h-5 items-start gap-1.5 text-sm ${props.status === 'blocked' ? 'text-error' : props.status === 'available' ? 'text-success-content dark:text-success' : 'text-base-content/60'}`}
        >
            {props.status !== 'idle' && (
                <>
                    {props.status === 'checking' ? (
                        <span className="loading loading-spinner loading-xs" />
                    ) : props.status === 'available' ? (
                        <CheckCircle2 size={14} className="shrink-0" />
                    ) : (
                        <CircleAlert size={14} className="shrink-0" />
                    )}
                    <span>
                        {props.status === 'checking'
                            ? props.checkingLabel
                            : props.status === 'available'
                              ? props.availableLabel
                              : props.error}
                    </span>
                </>
            )}
        </div>
    );
}
