import type { ReactNode } from 'react';
import { Dialog } from './dialog.component';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    content: ReactNode;
    buttons?: ConfirmButton[];
    shouldClose: () => void;
}

export interface ConfirmButton {
    isCancel?: boolean;
    typeClass: string;
    text: string;
    onClick?: () => boolean | Promise<boolean | undefined>;
}

const onClickShouldClose = (
    callback?: () => boolean | Promise<boolean | undefined>,
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
                <button
                    type="button"
                    key={`btnAlert_${button.text}`}
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
            ))}
        >
            {content}
        </Dialog>
    );
};
