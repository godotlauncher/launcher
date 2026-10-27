/**
 * Renders a menu separator with inset edges and no outer margins.
 * @returns The themed menu divider.
 */
export function MenuDivider() {
    // biome-ignore lint/a11y/useSemanticElements: The themed divider uses a div to avoid native hr borders.
    return <div className="divider m-0 px-2 opacity-50" role="separator" />;
}
