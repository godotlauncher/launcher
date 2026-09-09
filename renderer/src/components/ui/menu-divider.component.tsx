/**
 * Renders a menu separator with inset edges and no outer margins.
 * @returns The themed menu divider.
 */
export function MenuDivider() {
    // biome-ignore lint/a11y/useFocusableInteractive: This separator is static, not an adjustable splitter.
    // biome-ignore lint/a11y/useSemanticElements: The themed divider uses a div to avoid native hr borders.
    // biome-ignore lint/a11y/useAriaPropsForRole: Static separators do not expose an adjustable value.
    return <div className="divider m-0 px-2 opacity-50" role="separator" />;
}
