import type React from 'react';
import { useTranslation } from 'react-i18next';
import githubInvertocatBlack from '../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../assets/icons/github-invertocat-white.svg';
import { useTheme } from '../../hooks/useTheme';
import { Dialog } from '../dialog.component';
import {
    GitHubConnectionFlow,
    type GitHubConnectionFlowProps,
} from './github-connection-flow.component';

export type GitHubConnectionDialogProps = GitHubConnectionFlowProps & {
    returnFocusRef?: React.RefObject<HTMLElement | null>;
};

/**
 * Presents the shared GitHub connection flow in the application's native dialog.
 *
 * @param props - Flow callbacks, optional reconnect target, and focus return target.
 * @returns The GitHub connection dialog.
 */
export const GitHubConnectionDialog: React.FC<GitHubConnectionDialogProps> = ({
    onConnected,
    onCancel,
    connectionId,
    returnFocusRef,
}) => {
    const { t } = useTranslation(['settings', 'common']);
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;

    return (
        <GitHubConnectionFlow
            onConnected={onConnected}
            onCancel={onCancel}
            connectionId={connectionId}
            renderLayout={(content, footer) => (
                <Dialog
                    icon={
                        <img
                            src={
                                effectiveTheme === 'dark'
                                    ? githubInvertocatWhite
                                    : githubInvertocatBlack
                            }
                            className="size-6"
                            alt=""
                            aria-hidden="true"
                        />
                    }
                    title={t('connections.flow.title')}
                    returnFocusRef={returnFocusRef}
                    onRequestClose={onCancel}
                    panelClassName="max-w-2xl"
                    bodyClassName="flex flex-col overflow-hidden"
                    footer={footer}
                >
                    {content}
                </Dialog>
            )}
        />
    );
};
