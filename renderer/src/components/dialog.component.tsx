import type { ReactNode } from 'react';

type DialogProps = {
    icon?: ReactNode;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
};

export const Dialog: React.FC<DialogProps> = ({
    icon,
    title,
    children,
    footer,
}) => {
    return (
        <div className="absolute z-50 inset-0 bg-black/80 flex items-center justify-center p-4">
            <section
                className="bg-base-100 border border-base-300 rounded-lg shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <header className="flex items-center gap-3 px-5 py-4 border-b border-base-300 bg-base-200/60">
                    {icon && (
                        <div className="w-6 h-6 flex items-center justify-center">
                            {icon}
                        </div>
                    )}
                    <h1 className="text-base-content font-bold text-lg leading-tight pt-1">
                        {title}
                    </h1>
                </header>
                <div className="px-5 py-4 overflow-auto leading-6 text-base-content/80">
                    {children}
                </div>
                {footer && (
                    <footer className="px-5 py-4 border-t border-base-300 bg-base-200/40 flex justify-end gap-2">
                        {footer}
                    </footer>
                )}
            </section>
        </div>
    );
};
