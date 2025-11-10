export const DEFAULT_COUNTDOWN_THRESHOLD_DAYS = 10;

export type PromotionLocalizedFields = {
    title?: string;
    description?: string;
    ctaLabel?: string;
    countdownSingularLabel?: string;
    countdownPluralLabel?: string;
    countdownHourLabel?: string;
    countdownMinuteLabel?: string;
};

export type PromotionLocalizedCopy = Record<string, PromotionLocalizedFields>;

export type PromotionManifestEntry = {
    id: string;
    title: string;
    description?: string;
    ctaLabel?: string;
    expiresAt: string;
    enabled?: boolean;
    countdownThresholdDays?: number;
    externalLink?: string | null;
    countdownSingularLabel?: string;
    countdownPluralLabel?: string;
    countdownHourLabel?: string;
    countdownMinuteLabel?: string;
    localizedCopy?: PromotionLocalizedCopy;
};

export type PromotionManifest = {
    promotions: PromotionManifestEntry[];
    generatedAt?: string;
};

export type Promotion = {
    id: string;
    title: string;
    description?: string;
    ctaLabel?: string;
    expiresAt: Date;
    countdownThresholdDays: number;
    externalLink: string | null;
    countdownSingularLabel?: string;
    countdownPluralLabel?: string;
    countdownHourLabel?: string;
    countdownMinuteLabel?: string;
};

export type PromotionCountdownMeta =
    | {
          mode: 'days';
          daysRemaining: number;
          percentageRemaining: number;
      }
    | {
          mode: 'hours';
          hoursRemaining: number;
          percentageRemaining: number;
      }
    | {
          mode: 'minutes';
          minutesRemaining: number;
          secondsRemaining: number;
          percentageRemaining: number;
      };

export type PromotionClickPayload = {
    id: string;
    externalLink?: string | null;
    expiresAt: string;
};
