import clsx from 'clsx';
import { Promotion, PromotionCountdownMeta } from './promotion.types';
import { PromotionCountdownBadge } from './PromotionCountdownBadge';

type PromotionCTAProps = {
    promotion: Promotion;
    countdown: PromotionCountdownMeta | null;
    onClick: () => void;
    disabled?: boolean;
};

export function PromotionCTA({ promotion, countdown, onClick, disabled = false }: PromotionCTAProps) {
    const label = promotion.ctaLabel ?? promotion.title;

    return (
        <li>
            <button
                type="button"
                data-testid="btnPromotion"
                className={clsx(
                    'relative flex w-full flex-col items-start gap-2 rounded-lg p-3 text-left transition',
                    'border border-base-200',
                    disabled
                        ? 'cursor-default opacity-60'
                        : 'hover:bg-base-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                )}
                onClick={disabled ? undefined : onClick}
                disabled={disabled}
            >
                <span className="text-sm font-medium text-base-content">{label}</span>
                {promotion.description && (
                    <span className="text-xs text-base-content/70">
                        {promotion.description}
                    </span>
                )}
                {countdown && (
                    <PromotionCountdownBadge
                        countdown={countdown}
                        singularLabel={promotion.countdownSingularLabel}
                        pluralLabel={promotion.countdownPluralLabel}
                        hourLabel={promotion.countdownHourLabel}
                        minuteLabel={promotion.countdownMinuteLabel}
                    />
                )}
            </button>
        </li>
    );
}
