import { useState } from 'react';

export type AppIntegrationDisconnectConfirmCopy = {
    checkbox: string;
    checkedDetail: string;
    checkedAction: string;
    uncheckedDetail: string;
    uncheckedAction: string;
    failureDetail: string;
    cancel: string;
};

type AppIntegrationDisconnectConfirmProps = {
    close: () => void;
    copy: AppIntegrationDisconnectConfirmCopy;
    onConfirm: (revokeAuthorisation: boolean) => Promise<boolean>;
};

/**
 * Selects the warning and action label for one revocation choice.
 *
 * @param revokeAuthorisation - Whether the remote GitHub grant will be revoked.
 * @param copy - Localised confirmation copy.
 * @returns The matching detail and destructive action label.
 */
export function selectAppIntegrationDisconnectCopy(
    revokeAuthorisation: boolean,
    copy: AppIntegrationDisconnectConfirmCopy,
): { action: string; detail: string } {
    return revokeAuthorisation
        ? { action: copy.checkedAction, detail: copy.checkedDetail }
        : { action: copy.uncheckedAction, detail: copy.uncheckedDetail };
}

/**
 * Presents the checked-by-default final GitHub Disconnect choice.
 *
 * @param props - Localised copy, close action, and Disconnect callback.
 */
export const AppIntegrationDisconnectConfirm: React.FC<
    AppIntegrationDisconnectConfirmProps
> = (props) => {
    const { close, copy, onConfirm } = props;
    const [revokeAuthorisation, setRevokeAuthorisation] = useState(true);
    const [failed, setFailed] = useState(false);
    const [pending, setPending] = useState(false);
    const selected = selectAppIntegrationDisconnectCopy(
        revokeAuthorisation,
        copy,
    );

    return (
        <div className="flex w-full flex-col gap-3">
            <label className="flex items-start gap-2 text-left">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-error mt-1"
                    checked={revokeAuthorisation}
                    disabled={pending}
                    onChange={(event) => {
                        setFailed(false);
                        setRevokeAuthorisation(event.currentTarget.checked);
                    }}
                />
                <span>{copy.checkbox}</span>
            </label>
            <p
                className={
                    revokeAuthorisation
                        ? 'text-sm text-base-content/70'
                        : 'text-sm text-warning'
                }
            >
                {selected.detail}
            </p>
            {failed && (
                <p className="text-sm text-error" role="alert">
                    {copy.failureDetail}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={close}
                >
                    {copy.cancel}
                </button>
                <button
                    type="button"
                    className="btn btn-error"
                    disabled={pending}
                    onClick={() => {
                        setFailed(false);
                        setPending(true);
                        void onConfirm(revokeAuthorisation).then(
                            (shouldClose) => {
                                if (shouldClose) {
                                    close();
                                    return;
                                }
                                setFailed(true);
                                setPending(false);
                            },
                            () => {
                                setFailed(true);
                                setPending(false);
                            },
                        );
                    }}
                >
                    {selected.action}
                </button>
            </div>
        </div>
    );
};
