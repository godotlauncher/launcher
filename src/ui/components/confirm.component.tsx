import type { ReactNode } from 'react';

interface AlertProps {
    icon?: React.ReactNode;
    title: string;
    content: ReactNode;
    buttons?: ConfirmButtons[];
    shouldClose: (callback?: () => void) => void;
}

export interface ConfirmButtons {
    isCancel?: boolean;
    typeClass: string;
    text: string;
    onClick?: () => boolean | Promise<boolean | undefined>;
}

const onClickShouldClose = (
    callback?: () => boolean | Promise<boolean | undefined>,
    shouldClose?: () => void,
) => {
    if (callback?.()) {
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
        <div className="absolute z-50 inset-0 bg-black/80 flex flex-col items-center justify-center">
            <div className="bg-base-100 rounded-md p-4 flex flex-col gap-4 min-w-80 m-4 min-h-36 items-start ">
                <h1 className="text-base-content font-bold flex flex-row items-center gap-4">
                    {icon}
                    <p>{title}</p>
                </h1>
                <div>{content}</div>
                <div className="flex flex-row justify-end w-full gap-2">
                    {buttons?.map(
                        (button, index) => (
                            <button
                                type="button"
                                key={`btnAlert_${button.text}`}
                                data-testid={`btnAlert${index}`}
                                onClick={() => {
                                    if (button.isCancel) {
                                        shouldClose(button.onClick);
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
                        ),

                        // button.isCancel ? (
                        //     <button
                        //         type='button'
                        //         key={index}
                        //         data-testid={`btnAlert${index}`}
                        //         onClick={() => shouldClose(button.onClick)}
                        //         className={`btn ${button.typeClass}`}
                        //     >
                        //         {button.text}
                        //     </button>
                        // ) : (
                        //     <button
                        //         type='button'
                        //         key={index}
                        //         data-testid={`btnAlert${index}`}
                        //         onClick={() =>
                        //             onClickShouldClose(
                        //                 button.onClick,
                        //                 shouldClose,
                        //             )
                        //         }
                        //         className={`btn ${button.typeClass}`}
                        //     >
                        //         {button.text}
                        //     </button>
                        // ),
                        // <button data-testid="btnAlertOk" onClick={onCancel} className="btn btn-neutral">Cancel</button>
                        // <button data-testid="btnAlertOk" onClick={onOk} className="btn btn-primary">Ok</button>
                    )}
                </div>
            </div>
        </div>
    );
};
