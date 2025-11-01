import { PromotionCountdownMeta } from './promotion.types';

type PromotionCountdownBadgeProps = {
    countdown: PromotionCountdownMeta;
    singularLabel?: string;
    pluralLabel?: string;
    hourLabel?: string;
    minuteLabel?: string;
};

function formatTemplate(
    template: string | undefined,
    replacements: Record<string, string>,
    fallback: string
): string {
    if (!template) {
        return fallback;
    }

    return Object.keys(replacements).reduce((acc, key) => {
        const pattern = new RegExp(`\\{${key}\\}`, 'g');
        return acc.replace(pattern, replacements[key]);
    }, template);
}

export function PromotionCountdownBadge({
    countdown,
    singularLabel,
    pluralLabel,
    hourLabel,
    minuteLabel,
}: PromotionCountdownBadgeProps) {
    const progress = Math.max(
        0,
        Math.min(100, Math.round(countdown.percentageRemaining * 100))
    );

    let label: string;

    switch (countdown.mode) {
        case 'minutes': {
            const minutes = Math.max(countdown.minutesRemaining, 0);
            const seconds = Math.max(countdown.secondsRemaining, 0);
            const paddedSeconds = seconds.toString().padStart(2, '0');
            label = formatTemplate(
                minuteLabel,
                {
                    minutes: minutes.toString(),
                    seconds: paddedSeconds,
                },
                `${minutes}m ${paddedSeconds}s left`
            );
            break;
        }
        case 'hours': {
            const hours = Math.max(countdown.hoursRemaining, 0);
            const base =
                hours === 1 ? '1 hour left' : `${hours} hours left`;
            label = formatTemplate(
                hourLabel,
                { count: hours.toString() },
                base
            );
            break;
        }
        case 'days':
        default: {
            const days = Math.max(countdown.daysRemaining, 0);
            const singular = formatTemplate(
                singularLabel,
                { count: '1' },
                '1 day left'
            );
            const plural = formatTemplate(
                pluralLabel,
                { count: days.toString() },
                `${days} days left`
            );
            label = days === 1 ? singular : plural;
            break;
        }
    }

    return (
        <div className="flex w-full flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-base-content/70">
                {label}
            </span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-300">
                <div
                    className="h-full rounded-full bg-warning transition-[width] duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                    role="presentation"
                />
            </div>
        </div>
    );
}
