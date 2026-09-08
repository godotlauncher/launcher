import type { RemoteRepositorySummary } from '@shared/contracts';
import type { TFunction } from 'i18next';
import { Check, TriangleAlert } from 'lucide-react';
import type { RefObject } from 'react';
import { SearchField } from '../../../components/ui/searchField.component';
import { TextField } from '../../../components/ui/textField.component';
import {
    getRemoteProjectPublicSourceFailureKey,
    getRemoteProjectRepositoryFailureKey,
} from '../remote-project-import.messages';
import { getRemoteRepositoryRowClassName } from '../remote-project-import.model';
import type {
    RemoteProjectPublicSourceFailure,
    RemoteProjectRepositoryFailure,
} from '../remote-project-import.types';

type RemoteProjectPublicSourceProps = {
    url: string;
    error: RemoteProjectPublicSourceFailure | null;
    inspecting: boolean;
    inputRef: RefObject<HTMLInputElement | null>;
    t: TFunction;
    onUrlChange: (value: string) => void;
    onContinue: () => void;
};

/** Renders anonymous public Git URL entry. */
export function RemoteProjectPublicSource({
    url,
    error,
    inspecting,
    inputRef,
    t,
    onUrlChange,
    onContinue,
}: RemoteProjectPublicSourceProps) {
    return (
        <div className="flex flex-col gap-4">
            <p>{t('addProject.remote.public.description')}</p>
            <TextField
                inputRef={inputRef}
                id="inputPublicGitRepositoryUrl"
                testId="inputPublicGitRepositoryUrl"
                type="url"
                label={t('addProject.remote.public.urlLabel')}
                value={url}
                placeholder={t('addProject.remote.public.urlPlaceholder')}
                onChange={onUrlChange}
                onKeyDown={(event) => {
                    if (
                        event.key !== 'Enter' ||
                        event.repeat ||
                        event.nativeEvent.isComposing
                    )
                        return;
                    event.preventDefault();
                    if (!url.trim() || inspecting) return;
                    onContinue();
                }}
            />
            {error && (
                <div className="alert alert-error alert-soft" role="alert">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>
                        {t(
                            `addProject.remote.public.errors.${getRemoteProjectPublicSourceFailureKey(error)}`,
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

type RemoteProjectRepositorySourceProps = {
    loading: boolean;
    loadingMore: boolean;
    error: RemoteProjectRepositoryFailure | null;
    repositories: RemoteRepositorySummary[];
    selectedRepository: RemoteRepositorySummary | null;
    search: string;
    cursor: string | null;
    showConnectionsAction: boolean;
    t: TFunction;
    onSearchChange: (value: string) => void;
    onSelect: (repository: RemoteRepositorySummary) => void;
    onContinue: (repository: RemoteRepositorySummary) => void;
    onRetry: () => void;
    onLoadMore: (cursor: string) => void;
    onOpenConnections: () => void;
};

/** Renders connected GitHub repository selection. */
export function RemoteProjectRepositorySource({
    loading,
    loadingMore,
    error,
    repositories,
    selectedRepository,
    search,
    cursor,
    showConnectionsAction,
    t,
    onSearchChange,
    onSelect,
    onContinue,
    onRetry,
    onLoadMore,
    onOpenConnections,
}: RemoteProjectRepositorySourceProps) {
    const connectionRequired = error === 'no-usable-connection';

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <p>{t('addProject.remote.github.description')}</p>
            {loading ? (
                <div className="flex items-center gap-2" role="status">
                    <span className="loading loading-spinner loading-sm" />
                    {t('addProject.remote.github.loading')}
                </div>
            ) : connectionRequired ? (
                <div className="flex flex-col gap-3">
                    <p>
                        {t(
                            'addProject.remote.github.errors.connectionRequired',
                        )}
                    </p>
                    <div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={onOpenConnections}
                        >
                            {t('addProject.remote.github.openConnections')}
                        </button>
                    </div>
                </div>
            ) : error ? (
                <div className="flex flex-col gap-3">
                    <div className="alert alert-error alert-soft" role="alert">
                        <TriangleAlert aria-hidden="true" size={18} />
                        <span>
                            {t(
                                `addProject.remote.github.errors.${getRemoteProjectRepositoryFailureKey(error)}`,
                            )}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {showConnectionsAction && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onOpenConnections}
                            >
                                {t('addProject.remote.github.openConnections')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-neutral"
                            onClick={onRetry}
                        >
                            {t('common:buttons.retry')}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <SearchField
                        placeholder={t(
                            'addProject.remote.github.searchPlaceholder',
                        )}
                        value={search}
                        onChange={onSearchChange}
                        compact
                        focusOnMount
                        data-testid="inputGitHubRepositorySearch"
                    />
                    {cursor && (
                        <p className="text-xs text-base-content/60">
                            {t('addProject.remote.github.loadedSearchOnly')}
                        </p>
                    )}
                    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 overflow-auto">
                        {repositories.length === 0 ? (
                            <p>
                                {t(
                                    search.trim()
                                        ? 'addProject.remote.github.empty'
                                        : 'addProject.remote.github.noRepositories',
                                )}
                            </p>
                        ) : (
                            repositories.map((repository) => (
                                <button
                                    type="button"
                                    key={repository.repositoryRef}
                                    disabled={repository.alreadyImported}
                                    title={
                                        repository.alreadyImported
                                            ? t(
                                                  'addProject.remote.github.alreadyAdded',
                                              )
                                            : undefined
                                    }
                                    aria-pressed={
                                        selectedRepository?.repositoryRef ===
                                        repository.repositoryRef
                                    }
                                    className={getRemoteRepositoryRowClassName(
                                        selectedRepository?.repositoryRef ===
                                            repository.repositoryRef,
                                    )}
                                    onClick={() => onSelect(repository)}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter') return;
                                        event.preventDefault();
                                        onContinue(repository);
                                    }}
                                >
                                    <span className="min-w-0 flex-1 truncate font-medium">
                                        {repository.owner}/{repository.name}
                                    </span>
                                    {selectedRepository?.repositoryRef ===
                                        repository.repositoryRef && (
                                        <Check
                                            aria-hidden="true"
                                            className="h-5 w-5 shrink-0 stroke-primary"
                                        />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                    {cursor && (
                        <button
                            type="button"
                            className="btn btn-neutral self-start"
                            disabled={loadingMore}
                            onClick={() => onLoadMore(cursor)}
                        >
                            {loadingMore && (
                                <span className="loading loading-spinner loading-xs" />
                            )}
                            {t('addProject.remote.github.loadMore')}
                        </button>
                    )}
                </>
            )}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-base-300 pt-3 text-sm">
                <span>{t('addProject.remote.github.missingRepository')}</span>
                <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={loading || loadingMore}
                    onClick={onOpenConnections}
                >
                    {t('addProject.remote.github.manageConnections')}
                </button>
            </div>
        </div>
    );
}
