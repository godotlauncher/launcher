import rocketBlack from '../assets/icons/godot-launcher-black.svg';
import rocketWhite from '../assets/icons/godot-launcher-white.svg';
import { useTheme } from '../hooks/theme.hook';

/** Renders the themed, decorative loading rocket used across the app. */
export function LoadingRocket() {
    const { theme, systemTheme } = useTheme();
    const resolved = (theme ?? 'auto') === 'auto' ? systemTheme : theme;
    return (
        <img
            src={resolved === 'dark' ? rocketWhite : rocketBlack}
            alt=""
            aria-hidden="true"
            className="size-10 motion-safe:animate-bounce"
        />
    );
}
