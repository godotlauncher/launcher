import type React from 'react';
import { useTranslation } from 'react-i18next';
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

    return (
        <GitHubConnectionFlow
            onConnected={onConnected}
            onCancel={onCancel}
            connectionId={connectionId}
            renderLayout={(content, footer) => (
                <Dialog
                    title={t('connections.flow.title')}
                    returnFocusRef={returnFocusRef}
                    onRequestClose={onCancel}
                    bodyClassName="flex flex-col overflow-hidden"
                    footer={footer}
                >
                    {content}
                </Dialog>
            )}
        />
    );
};
