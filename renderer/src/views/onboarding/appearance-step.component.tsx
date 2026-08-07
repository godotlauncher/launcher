import type React from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeSelector } from '../../components/settings/theme-selector.component';
import type { ThemeMode } from '../../hooks/useTheme';

type AppearanceStepProps = {
    theme: ThemeMode | null;
    onThemeChange: (theme: ThemeMode) => void;
};

export const AppearanceStep: React.FC<AppearanceStepProps> = ({
    theme,
    onThemeChange,
}) => {
    const { t } = useTranslation('welcome');

    return (
        <div className="flex max-w-3xl flex-col gap-7">
            <div className="flex flex-col gap-2">
                <h1
                    data-testid="onboarding-step-heading"
                    tabIndex={-1}
                    className="text-3xl font-bold tracking-tight outline-none"
                >
                    {t('onboarding.appearance.title')}
                </h1>
                <p className="text-base-content/65">
                    {t('onboarding.appearance.description')}
                </p>
            </div>

            <ThemeSelector theme={theme} onThemeChange={onThemeChange} />

            <p className="text-sm text-base-content/60">
                {t('onboarding.appearance.preview')}
            </p>
        </div>
    );
};
