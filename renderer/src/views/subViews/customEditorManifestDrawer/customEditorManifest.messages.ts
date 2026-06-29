import type { CustomEditorManifestValidationErrors } from './customEditorManifest.model';
import { validationMessageFieldOrder } from './customEditorManifest.model';

type Translate = (key: string) => string;

export function getFirstValidationMessage(
    errors: CustomEditorManifestValidationErrors,
    t: Translate,
): string | undefined {
    const field = validationMessageFieldOrder.find((candidate) =>
        Boolean(errors[candidate]),
    );

    return field ? getFieldError(field, errors, t) : undefined;
}

export function getFieldError(
    field: string,
    errors: CustomEditorManifestValidationErrors,
    t: Translate,
): string | undefined {
    const error = errors[field];

    if (!error) {
        return undefined;
    }

    if (field === 'platforms') {
        return t('customEditor.creator.validation.editorPath.required');
    }

    return t(
        `customEditor.creator.validation.${getValidationTranslationField(field)}.${error}`,
    );
}

export function getPathMissingMessage(field: string, t: Translate): string {
    return t(
        `customEditor.creator.validation.${getValidationTranslationField(field)}.pathMissing`,
    );
}

function getValidationTranslationField(field: string): string {
    if (field.includes('.consolePath')) {
        return 'consolePath';
    }

    if (field.includes('.editorPath')) {
        return 'editorPath';
    }

    return field;
}
