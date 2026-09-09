import { useState } from 'react';
import type { ConfirmLayout } from '../../../components/confirm.component';

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
    description: string;
    renderLayout: ConfirmLayout;
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
 * Presents the final GitHub Disconnect choice with revocation opt-in.
 *
 * @param props - Localised copy, close action, and Disconnect callback.
 */
export const AppIntegrationDisconnectConfirm: React.FC<
    AppIntegrationDisconnectConfirmProps
> = (props) => {
    const { close, copy, onConfirm, description, renderLayout } = props;
    const [revokeAuthorisation, setRevokeAuthorisation] = useState(false);
    const [failed, setFailed] = useState(false);
    const [pending, setPending] = useState(false);
    const selected = selectAppIntegrationDisconnectCopy(
        revokeAuthorisation,
        copy,
    );

    return renderLayout(
        <div className="flex w-full flex-col gap-[12px] text-base">
            <p>{description}</p>
            <div className="alert alert-error alert-soft text-error-content dark:text-error">
                <div className="flex flex-col gap-[8px]">
                    <label className="flex items-start gap-2 text-left">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-error mt-1"
                            checked={revokeAuthorisation}
                            disabled={pending}
                            onChange={(event) => {
                                setFailed(false);
                                setRevokeAuthorisation(
                                    event.currentTarget.checked,
                                );
                            }}
                        />
                        <span className="font-semibold">{copy.checkbox}</span>
                    </label>
                    <p>{selected.detail}</p>
                </div>
            </div>
            {failed && (
                <p className="text-error" role="alert">
                    {copy.failureDetail}
                </p>
            )}
        </div>,
        <div className="flex flex-wrap justify-end gap-2">
            <button
                type="button"
                className="btn btn-ghost text-base"
                disabled={pending}
                onClick={close}
            >
                {copy.cancel}
            </button>
            <button
                type="button"
                className="btn btn-error text-base"
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
        </div>,
    );
};
