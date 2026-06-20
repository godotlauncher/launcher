# Custom Editor Manifest Drawer Follow-Ups

This feature is implemented, but a few follow-up items remain for later.

## Translations

- [ ] Replace the English fallback strings added to every `locales/*/installs.json` file with real translations.
- [ ] Prioritize these new keys:
  - `buttons.selectCustomEditorManifest`
  - `buttons.createCustomEditorManifest`
  - `customEditor.creator.*`
- [ ] Re-check translated tooltip text for length, especially in the drawer labels where long strings can crowd the form.

## Manual QA

- [ ] Test the full drawer flow in the Electron app on Windows, macOS, and Linux.
- [ ] Confirm `Create and register` writes `godotlauncher-editor-manifest.json` in the selected output folder.
- [ ] Confirm registration succeeds when the generated manifest points at a valid editor path.
- [ ] Confirm duplicate custom editor replacement still works from the generated manifest flow.
- [ ] Confirm validation messages stay visible and the drawer remains open when paths are missing or invalid.

## Possible Future Polish

- [ ] Add a clearer preview of the generated manifest JSON before submission if users ask for it.
- [ ] Add multi-platform manifest entry support only if there is real demand.
- [ ] Consider remembering the last output folder/editor path to reduce repeated entry.
- [ ] Consider localized docs/help text explaining what each manifest field maps to.

## Intentional Non-Goals For V1

- No generic renderer file-writing API.
- No dynamic multi-platform row editor.
- No form framework.
- No automatic discovery of Godot executable paths.
