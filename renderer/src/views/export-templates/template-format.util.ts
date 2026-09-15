/** Formats installed file bytes without claiming filesystem allocation or reclaimed space.
 * @param bytes - File-size total.
 * @param locale - Active display locale.
 */
export function formatTemplateBytes(bytes: number, locale = 'en'): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const index =
        bytes > 0
            ? Math.min(
                  Math.floor(Math.log(bytes) / Math.log(1024)),
                  units.length - 1,
              )
            : 0;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index ? 1 : 0 }).format(bytes / 1024 ** index)} ${units[index]}`;
}
