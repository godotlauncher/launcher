# Contributing Translations

Thank you for helping make Godot Launcher accessible to more people! This guide will help you add translations for a new language.

## 📋 Quick Start

### 1. Create Language Folder

Create a new folder in `src/locales/` with your language code:

```bash
# Examples:
src/locales/es/       # Spanish
src/locales/fr/       # French
src/locales/de/       # German
src/locales/pt-BR/    # Brazilian Portuguese
src/locales/ja/       # Japanese
src/locales/zh-CN/    # Simplified Chinese
src/locales/zh-TW/    # Traditional Chinese
```

Use [ISO 639-1 language codes](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).

**Special Note for Regional Variants:**
- Most languages use base codes only (e.g., `es`, `fr`, `de`)
- **Chinese requires regional codes**: `zh-CN` (Simplified) and `zh-TW` (Traditional) use completely different writing systems
- **Portuguese supports regional codes**: `pt-BR` (Brazilian) and `pt-PT` (European) have significant differences
- Other language variants (like `en-GB`, `es-MX`) are NOT used - one translation per language is sufficient

### 2. Copy English Template Files

Copy all 11 namespace files from English to your language folder:

```bash
# Windows PowerShell
Copy-Item src/locales/en/*.json src/locales/YOUR_LANGUAGE/

# macOS/Linux
cp src/locales/en/*.json src/locales/YOUR_LANGUAGE/
```

The 11 namespace files you need to translate:
- `translation.json`
- `dialogs.json`
- `menus.json`
- `common.json`
- `projects.json`
- `installs.json`
- `settings.json`
- `help.json`
- `createProject.json`
- `installEditor.json`
- `welcome.json`

### 3. Translate JSON Files

Translate **only the values**, keep the keys unchanged:

```json
// ✅ CORRECT
{
  "title": "Proyectos",  // Translate this
  "description": "Gestiona tus proyectos de Godot"
}

// ❌ WRONG - Don't translate keys!
{
  "titulo": "Proyectos",  // Keys must stay in English
  "descripcion": "Gestiona tus proyectos de Godot"
}
```

## 📁 Files to Translate (11 files)

### 1. `translation.json` - Backend General
Backend error messages, notifications, and general system strings used by the Electron process.

### 2. `dialogs.json` - Backend Dialogs
Confirmation prompts and file dialogs shown by the backend.

### 3. `menus.json` - Backend Menus
Application menu entries, context menus, and the system tray menu.

### 4. `common.json` - Shared UI
Buttons, states, reusable UI strings, app navigation, and update notifications.

**Important sections**:
- `buttons`: Common button labels (ok, cancel, save, etc.)
- `app.loadingMessage`: Application loading screen
- `app.navigation`: Main navigation menu items
- `app.update`: Update notification messages with version interpolation
- `selectRelease`: Release selection dialog

### 5. `projects.json` - Projects View
Projects tab labels, table headers, badges, and project management messages.

### 6. `installs.json` - Installs View
Installs tab interface, release lists, installer states, and status messages.

### 7. `settings.json` - Settings View
All settings tabs (Appearance, Behavior, Tools, Updates) including tool descriptions and symlink settings.

### 8. `help.json` - Help View
Help page content, resource links, and contribution guidance.

### 9. `createProject.json` - Create Project Modal
New project dialog fields, renderer options, validation, and helper text.

### 10. `installEditor.json` - Install Editor Modal
Editor installation dialog, release tables, tooltips, and download states.

### 11. `welcome.json` - Welcome Wizard
First-run welcome wizard with platform-specific steps (Windows, macOS, Linux).

**Important sections**:
- `steps`: Step titles
- `navigation`: Navigation button labels
- `welcomeStep`: Initial welcome content
- `startStep`: Final "You're all set!" content
- `customizeBehavior`: Behavior customization options
- `currentSettings`: Settings summary display
- `macosStep`, `windowsStep`, `linuxStep`: Platform-specific instructions

**Total**: ~500+ translation keys across all 11 namespaces

## 🎯 Translation Tips

### Keep Interpolation Variables

Some strings contain variables in `{{brackets}}`. Keep them unchanged:

```json
// ✅ CORRECT
{
  "welcome": "Bienvenido, {{username}}!",
  "version": "Versión {{version}}"
}

// ❌ WRONG - Don't translate variable names
{
  "welcome": "Bienvenido, {{nombreusuario}}!",
  "version": "Versión {{versión}}"
}
```

### Respect Formatting

Keep HTML tags, line breaks, and special characters:

```json
// ✅ CORRECT
{
  "message": "Esta es la primera línea\nEsta es la segunda línea",
  "bold": "Este texto está en <strong>negrita</strong>"
}
```

### Match Tone and Context

- **Buttons**: Short and action-oriented ("Save", "Cancel")
- **Descriptions**: Clear and friendly
- **Errors**: Informative but not scary
- **Menu items**: Concise with keyboard shortcuts in English

### Test Special Characters

Make sure your language's special characters display correctly:
- Spanish: ñ, á, é, í, ó, ú, ü
- French: é, è, ê, ë, à, ù, ç
- German: ä, ö, ü, ß
- Portuguese: ã, õ, ç

## 🧪 Testing Your Translation

### 1. Add Language to Selector

Edit `src/ui/components/settings/LanguageSelector.tsx`:

```typescript
const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'system', name: 'System (Auto-detect)' },
    { code: 'en', name: 'English' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'YOUR_CODE', name: 'YOUR_LANGUAGE_NAME' },  // ADD THIS LINE
    // Add more languages here as they become available
];
```

### 2. Build and Test

```bash
# Transpile backend
npm run transpile:electron

# Run in development
npm run dev
```

### 3. Switch Language

1. Open the app
2. Go to Settings → Appearance
3. Select your language from the dropdown
4. Verify all strings display correctly

### 4. Check All Areas

Test these areas thoroughly:
- [ ] **Application loading screen** - "Getting things ready..."
- [ ] **Main navigation menu** - Projects, Installs, Help, Settings, Join Community
- [ ] **All 4 main tabs** - Projects, Installs, Settings, Help
- [ ] **Settings sub-tabs** - Appearance, Behavior, Tools, Updates
- [ ] **Create New Project modal** - All fields and options
- [ ] **Install Editor modal** - Release table, download buttons
- [ ] **Context menus** - Right-click on projects/releases
- [ ] **Application menu** - File, Edit, View, Developer, etc.
- [ ] **System tray menu** - Recent projects, Show/Quit
- [ ] **Alert and confirm dialogs** - Ok/Cancel buttons
- [ ] **Update notifications** - Version messages
- [ ] **Welcome wizard** - All 8 steps (delete `%appdata%/godot-launcher/` to trigger first-run)
  - Welcome step
  - Platform-specific step (Windows/macOS/Linux)
  - Current settings review
  - Set locations
  - Customize behavior
  - Windows symlink info (Windows only)
  - Ready to start

## 📤 Submitting Your Translation

### Option 1: Pull Request (Recommended)

1. Fork the repository
2. Create a branch: `git checkout -b add-spanish-translation`
3. Add your translation files
4. Update LanguageSelector.tsx
5. Test thoroughly
6. Commit: `git commit -m "Add Spanish translation"`
7. Push and create a Pull Request

### Option 2: Issue

1. Create a new issue titled "Translation: [Language Name]"
2. Attach all 11 translated JSON files
3. Mention any special considerations

## ✅ Translation Checklist

Before submitting, verify:

- [ ] **All 11 JSON files translated**
  - translation.json
  - dialogs.json
  - menus.json
  - common.json (including app.navigation and app.update sections)
  - projects.json
  - installs.json
  - settings.json
  - help.json
  - createProject.json
  - installEditor.json
  - welcome.json (including all platform-specific steps)
- [ ] **All interpolation variables** ({{var}}) kept unchanged
- [ ] **All keys kept in English**, only values translated
- [ ] **JSON syntax valid** (no missing commas, brackets, quotes)
- [ ] **Language added to LanguageSelector.tsx**
- [ ] **Tested in development mode** (`npm run dev`)
- [ ] **All main areas checked**:
  - Main navigation and loading screen
  - All 4 tabs (Projects, Installs, Settings, Help)
  - Both modals (Create Project, Install Editor)
  - All menus (app menu, context menus, tray menu)
  - Alert/confirm dialogs
  - Welcome wizard (all steps)
  - Update notifications
- [ ] **Special characters display correctly**
- [ ] **Consistent terminology** throughout all files
- [ ] **No translation keys visible** in UI (all showing translated text)

## 🌍 Current Languages

- ✅ **English (en)** - Complete (33 components, 11 namespaces, 500+ keys)
- ✅ **Italiano (it)** - Complete
- ✅ **Português (pt)** - Complete (European Portuguese)
- ✅ **Português (Brasil) (pt-BR)** - Complete (Brazilian Portuguese)
- ⏳ **Your language here!**

Want to add your language? Follow this guide and submit a Pull Request!

## 💡 Translation Guidelines

### Regional Variants: When to Use Them

**Most languages should use base codes only** (e.g., `es`, `fr`, `de`, `it`). Regional variants add significant maintenance overhead and are only worth it when there are substantial differences:

#### ✅ **Use Regional Variants For:**

**Chinese** - **REQUIRED**
- `zh-CN` - 简体中文 (Simplified Chinese) - Mainland China, Singapore
- `zh-TW` - 繁體中文 (Traditional Chinese) - Taiwan, Hong Kong, Macau
- **Why**: Completely different writing systems. Not interchangeable.

**Portuguese** - **OPTIONAL BUT RECOMMENDED**
- `pt` - Português - European Portuguese (base)
- `pt-BR` - Português (Brasil) - Brazilian Portuguese
- **Why**: Significant vocabulary, grammar, and spelling differences that can confuse users.
- **Note**: `pt` serves as the base and fallback for Portuguese speakers

#### ❌ **Don't Create Variants For:**

**English variants** (`en-US`, `en-GB`, `en-AU`)
- Differences are minor (color/colour, realize/realise)
- Users understand both variants perfectly well
- Not worth the maintenance overhead

**Spanish variants** (`es-ES`, `es-MX`, `es-AR`)
- Minor vocabulary differences (ordenador/computadora)
- All variants are mutually intelligible
- One Spanish translation works for all regions

**French variants** (`fr-FR`, `fr-CA`)
- Some vocabulary differences but comprehensible
- One French translation is sufficient

**Other languages**
- German, Italian, Japanese, Korean, etc. - Use base codes only

### Terminology Consistency

Use the same terms throughout:

| English | Keep Consistent |
|---------|----------------|
| Project | Always use the same word |
| Editor | Don't mix with "IDE" |
| Install | Don't mix with "Download" |
| Release | Be consistent with "Version" |

### Cultural Adaptation

Feel free to adapt phrases to sound natural in your language, but keep the meaning:

```json
// English (informal)
"enjoy": "Enjoy and happy coding!"

// Spanish (adapt to local style)
"enjoy": "¡Disfruta y feliz desarrollo!"

// German (adapt to local style)
"enjoy": "Viel Spaß beim Programmieren!"
```

### Length Considerations

Some UI elements have limited space. If your translation is much longer, consider abbreviations:

```json
// English
"autoStart": "Start when computer starts"

// German (might be long)
"autoStart": "Beim Computerstart starten"  // OK if it fits

// Alternative if too long
"autoStart": "Autostart aktivieren"
```

## 🤝 Get Help

- **Questions**: Open an issue on [GitHub](https://github.com/godotlauncher/launcher)
- **Discord**: Join our community [Discord server](https://discord.gg/Ju9jkFJGvz)
- **Website**: Visit [godotlauncher.com](https://godotlauncher.com)

## 📝 License

By contributing translations, you agree to license them under the same license as Godot Launcher.

---

**Thank you for your contribution!** 🎉

Every translation makes Godot Launcher accessible to more developers around the world.
