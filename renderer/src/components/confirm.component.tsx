import { Fragment, type ReactNode } from 'react';
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

const onClickShouldClose = (
    callback?: ConfirmButtonClick,
    shouldClose?: () => void,
) => {
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

export const Confirm: React.FC<AlertProps> = ({
    content,
    buttons,
    title,
    icon,
    shouldClose,
}) => {
    return (
        <Dialog
            icon={icon}
            title={title}
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
                            type="button"
                            data-testid={`btnAlert${index}`}
                            onClick={() => {
                                if (button.isCancel) {
                                    shouldClose();
                                    void button.onClick?.();
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
