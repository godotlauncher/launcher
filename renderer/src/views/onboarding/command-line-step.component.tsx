import { useTranslation } from 'react-i18next';
import { AutomaticAliasesChoice } from '../../components/settings/automatic-aliases-control.component';
import { LauncherCliPreview } from '../../components/settings/launcher-cli-preview.component';
import { OverlayTitle } from '../../components/ui/overlay-title.component';

/**
 * Presents terminal command setup as its own onboarding step.
 * @param props - Draft automatic-alias choice and onboarding pending state.
 */
export function CommandLineStep({
    automaticAliases,
    pending,
    onAutomaticAliasesChange,
}: {
    automaticAliases: boolean;
    pending: boolean;
    onAutomaticAliasesChange: (enabled: boolean) => void;
}) {
    const { t } = useTranslation('installs');
    return (
        <div className="flex max-w-3xl flex-col gap-5">
            <OverlayTitle
                as="h1"
                data-testid="onboarding-step-heading"
                className="text-[20px] font-semibold"
            >
                {t('settings.commandLine')}
            </OverlayTitle>
            <AutomaticAliasesChoice
                checked={automaticAliases}
                disabled={pending}
                onChange={onAutomaticAliasesChange}
            />
            <LauncherCliPreview />
        </div>
    );
}
