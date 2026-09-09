import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type InstallsSearchEmptyStateProps = {
    query: string;
    onClearSearch: () => void;
};

/**
 * Presents the installs search empty state with a clear-search action.
 * @param props - Current query and the action that resets the search.
 */
export function InstallsSearchEmptyState({
    query,
    onClearSearch,
}: InstallsSearchEmptyStateProps) {
    const { t } = useTranslation('installs');
    return (
        <div className="flex w-full max-w-sm flex-col items-center gap-[12px] px-4 py-6 text-center">
            <SearchX className="size-10 text-primary" aria-hidden="true" />
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-base-content">
                    {t('search.noResults')}
                </h2>
                <p className="wrap-break-words">
                    {t('search.noResultsHint', { query: query.trim() })}
                </p>
            </div>
            <button
                type="button"
                className="btn btn-ghost text-base"
                onClick={onClearSearch}
            >
                {t('search.clear')}
            </button>
        </div>
    );
}
