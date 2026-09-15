import androidIcon from '../../../assets/icons/template-android.svg';
import iosIcon from '../../../assets/icons/template-ios.svg';
import linuxbsdIcon from '../../../assets/icons/template-linuxbsd.svg';
import macosIcon from '../../../assets/icons/template-macos.svg';
import webIcon from '../../../assets/icons/template-web.svg';
import windowsIcon from '../../../assets/icons/template-windows.svg';

const icons: Record<string, string> = {
    Android: androidIcon,
    iOS: iosIcon,
    Linux: linuxbsdIcon,
    macOS: macosIcon,
    Web: webIcon,
    Windows: windowsIcon,
};

const names: Record<string, string> = {
    windows: 'Windows',
    linux: 'Linux',
    macos: 'macOS',
    osx: 'macOS',
    android: 'Android',
    ios: 'iOS',
    visionos: 'visionOS',
    web: 'Web',
};
/** Identifies installed platforms with readable badges.
 * @param props - Platforms detected from local template files.
 */
export function TemplatePlatformBadges({ platforms }: { platforms: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {[
                ...new Set(
                    platforms.map((platform) => names[platform] ?? platform),
                ),
            ].map((platform) => (
                <span
                    key={platform}
                    className="badge badge-sm badge-soft gap-1.5"
                >
                    {icons[platform] && (
                        <img src={icons[platform]} alt="" className="size-4" />
                    )}
                    {platform}
                </span>
            ))}
        </div>
    );
}
