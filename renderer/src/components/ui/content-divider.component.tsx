/**
 * Renders a content separator with inset edges and no outer margins.
 * @returns The themed content divider.
 */
export function ContentDivider() {
    // biome-ignore lint/a11y/useSemanticElements: The themed divider uses a div to avoid native hr borders.
    return <div className="divider mx-0 my-0  px-0 " role="separator" />;
}
