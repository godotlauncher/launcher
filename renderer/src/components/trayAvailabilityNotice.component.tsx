import { TriangleAlert } from 'lucide-react';

type TrayAvailabilityNoticeProps = {
    available: boolean | null;
    message: string;
    details: string[];
};

export const TrayAvailabilityNotice: React.FC<TrayAvailabilityNoticeProps> = ({
    available,
    message,
    details,
}) => {
    if (available !== false) {
        return null;
    }

    return (
        <div
            className="alert alert-warning flex flex-row items-start gap-2"
            role="status"
            aria-live="polite"
            data-testid="trayAvailabilityNotice"
        >
            <TriangleAlert className="w-6 shrink-0" />
            <div className="flex flex-col gap-1">
                <span>{message}</span>
                {details.map((detail) => (
                    <span key={detail}>{detail}</span>
                ))}
            </div>
        </div>
    );
};
