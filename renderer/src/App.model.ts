export function shouldShowAppLoading({
    prefsLoading,
    releasesInitialized,
}: {
    prefsLoading: boolean;
    releasesInitialized: boolean;
}): boolean {
    return prefsLoading || !releasesInitialized;
}
