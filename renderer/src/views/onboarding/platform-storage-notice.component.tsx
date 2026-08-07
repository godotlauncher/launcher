import { Info } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

type PlatformStorageNoticeProps = {
    platform: string;
};

export const PlatformStorageNotice: React.FC<PlatformStorageNoticeProps> = ({
    platform,
}) => {
    const { t } = useTranslation('welcome');
    const platformKey =
        platform === 'darwin'
            ? 'macos'
            : platform === 'linux'
              ? 'linux'
              : 'windows';

    return (
        <div className="flex items-start gap-2 rounded-box bg-info/10 px-3 py-2 text-sm text-base-content/75">
            <Info
                size={17}
                className="mt-0.5 shrink-0 text-info"
                aria-hidden="true"
            />
            <span>{t(`onboarding.setup.platformNotice.${platformKey}`)}</span>
        </div>
    );
};
