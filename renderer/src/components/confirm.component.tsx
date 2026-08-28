import { Fragment, type ReactNode, useRef } from 'react';
import { Dialog } from './dialog.component';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    content: ReactNode;
    buttons?: ConfirmButton[];
    shouldClose: () => void;
}

export type ConfirmButtonClick = () => boolean | Promise<boolean | undefined>;

export type ConfirmButton =
    | {
          key: string;
          render: (close: () => void) => ReactNode;
      }
    | {
          isCancel?: boolean;
          typeClass: string;
          text: string;
          onClick?: ConfirmButtonClick;
      };

/**
 * Runs a confirmation action and closes when it reports success.
 *
 * @param callback - Optional confirmation action.
 * @param shouldClose - Callback that removes the confirmation.
 */
const onClickShouldClose = (
    callback?: ConfirmButtonClick,
    shouldClose?: () => void,
): void => {
    const result = callback?.();

    if (result instanceof Promise) {
        void result.then((shouldCloseDialog) => {
            if (shouldCloseDialog) {
                shouldClose?.();
            }
        });
        return;
    }

    if (result) {
        shouldClose?.();
    }
};

/**
 * Closes a confirmation through its declared Cancel action.
 *
 * @param button - Cancel button whose callback should run.
 * @param shouldClose - Callback that removes the confirmation.
 */
function requestCancel(
    button: Exclude<ConfirmButton, { key: string }>,
    shouldClose: () => void,
): void {
    shouldClose();
    void button.onClick?.();
}

/**
 * Renders a controlled confirmation dialog.
 *
 * @param props - Confirmation content, actions, and close callback.
 * @returns The confirmation dialog.
 */
export const Confirm: React.FC<AlertProps> = ({
    content,
    buttons,
    title,
    icon,
    shouldClose,
}) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const cancelButton = buttons?.find(
        (button) => !('render' in button) && button.isCancel,
    );

    return (
        <Dialog
            icon={icon}
            title={title}
            initialFocusRef={cancelButton ? cancelButtonRef : undefined}
            onRequestClose={
                cancelButton && !('render' in cancelButton)
                    ? () => requestCancel(cancelButton, shouldClose)
                    : undefined
            }
            footer={buttons?.map((button, index) => (
                <Fragment
                    key={
                        'render' in button
                            ? button.key
                            : `${button.typeClass}_${button.text}`
                    }
                >
                    {'render' in button ? (
                        button.render(shouldClose)
                    ) : (
                        <button
                            ref={button.isCancel ? cancelButtonRef : undefined}
                            type="button"
                            data-testid={`btnAlert${index}`}
                            onClick={() => {
                                if (button.isCancel) {
                                    requestCancel(button, shouldClose);
                                } else {
                                    onClickShouldClose(button.onClick, () =>
                                        shouldClose(),
                                    );
                                }
                            }}
                            className={`btn ${button.typeClass}`}
                        >
                            {button.text}
                        </button>
                    )}
                </Fragment>
            ))}
        >
            {content}
        </Dialog>
    );
};
