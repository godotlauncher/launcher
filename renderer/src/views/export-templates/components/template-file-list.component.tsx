import { useTranslation } from 'react-i18next';

type Props = { files: string[]; fillHeight?: boolean };

/** Displays imported filenames consistently in the library and project settings.
 * @param props - Package filenames and whether to fill the available parent height.
 */
export function TemplateFileList({ files, fillHeight = false }: Props) {
    const { t } = useTranslation('exportTemplates');
    return (
        <ul
            aria-label={t('picker.files')}
            className={`${fillHeight ? 'min-h-0 flex-1' : 'max-h-48'} overflow-auto rounded-md bg-base-200 p-3 text-sm`}
        >
            {files.map((file) => (
                <li className="break-all" key={file}>
                    {file}
                </li>
            ))}
        </ul>
    );
}
