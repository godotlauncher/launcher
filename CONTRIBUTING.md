# Contributors Guidelines

This document is a summary of the key points for anyone interested in contributing to Godot Launcher via bug reports or pull requests.

The Godot Launcher website has a dedicated [contributing section](https://godotlauncher.org/contributing) with more details and is a recommended read!

## TOC

- [Reporting Bugs](#reporting-bugs)
- [Proposing Features](#proposing-features)
- [Contributing Pull Requests](#contributing-pull-requests)

## Reporting Bugs

> [!IMPORTANT]  
> Before creating a new bug report, please check the [open issues](https://github.com/godotlauncher/launcher/issues) and [closed issues](https://github.com/godotlauncher/launcher/issues?q=is%3Aissue%20state%3Aclosed) to see if it has already been reported.

Submit bug reports [here](https://github.com/godotlauncher/launcher/issues/new?template=bug_report.md).  
Please follow the template instructions.

- Submit a **separate bug report for each issue** you encounter.  
- Verify that the bug can be reproduced on the latest release. You can find all releases in the [GitHub Releases](https://github.com/godotlauncher/launcher/releases).  
- If this is a **regression** (a bug that did not exist in previous versions), specify the versions where the bug was present and where it was not.

---

## Proposing Features

> [!IMPORTANT]  
> Before creating a new feature request, please check the [open issues](https://github.com/godotlauncher/launcher/issues) and [closed issues](https://github.com/godotlauncher/launcher/issues?q=is%3Aissue%20state%3Aclosed) to see if it has already been reported.

Submit feature requests [here](https://github.com/godotlauncher/launcher/issues/new?template=feature_request.md).  
Please follow the template instructions.

- **Create one proposal per feature** to keep discussions focused.  
- If a feature feels too large or complex, discuss it first on [Discord](http://discord.gg/Ju9jkFJGvz).  

---

## Contributing Pull Requests

Thank you for your interest in contributing! Here are a few things to keep in mind before submitting a pull request (PR):

- **Ensure the change is valuable** – If you’re introducing a new feature, consider whether it solves a common need for users.  
- **Discuss before coding** – For larger changes, open an issue first using the **Feature Request** template so the community can provide input.  
- **Your PR is still useful even if not merged** – Even if a PR isn't accepted, it may help guide future improvements.

For bug fixes, if you're unsure about the best solution, discuss it first on [Discord](https://discord.gg/Ju9jkFJGvz).

---

## Pull Request Guidelines

### Keep PRs Simple and Focused

- Each PR should address **one issue or feature at a time** to make reviews easier.  
- Avoid bundling multiple fixes or features in a single PR.  
- Link your PR to the relevant issue when applicable (e.g., `Fixes #123`).  

### Code Formatting and Structure

- Follow the existing project structure and conventions.  
- Keep commit history clean—use **squash** and **rebase** to tidy up before submitting.  
- Use meaningful commit messages (see below).  
- Add user-facing text to **all locale files** (`src/locales/<lang>`) so translations stay in sync.  

### Writing Good Commit Messages

A well-structured commit message helps with code history and future debugging. Follow these guidelines:

- Keep the first line **concise and descriptive** (under 72 characters if possible).  
- Use **imperative form** (e.g., `Fix bug in project settings`, `Add auto-update feature`).  
- If needed, provide more details in a second paragraph.  

**Examples of good commit messages:**
```
Fix issue with incorrect version detection on startup

Previously, the launcher failed to detect custom Godot versions correctly
due to missing path validation. This update adds proper validation and 
fallbacks.
```

```
Add quick project access from system tray

Users can now right-click the tray icon to instantly open recent projects.
This improves usability and saves time navigating the project list.
```

### Keeping Your Branch Updated

- Before submitting a PR, update your branch with the latest changes:
  ```bash
  git pull --rebase upstream main
  ```
- This avoids unnecessary merge commits and keeps the history clean.  

---

## Documentation and Comments

- If your PR changes **user-facing functionality**, update the **official documentation** at [Godot Launcher Docs](https://github.com/godotlauncher/launcher-docs).  
- If your PR modifies complex internal logic, add **inline comments** to explain key parts of the code.  

---

## Testing Your Changes

- **Test your modifications** thoroughly to ensure they work as expected before submitting a PR.  
- If applicable, describe how your changes were tested in the **PR description**.  
- **Unit Tests**: If your change affects logic or functionality, include unit tests to verify behavior.  
- **End-to-End (E2E) Tests**: If your change affects user interactions or workflows, consider adding E2E tests to confirm everything works as intended.  
- **Increase Your Chances of a Merge**: PRs that include relevant tests are more likely to be accepted, as they provide confidence that changes won't introduce regressions.  

---

## Need Help?

If you're unsure about anything, feel free to ask in the [Discord community](https://discord.gg/Ju9jkFJGvz) or open a discussion on GitHub.

---

### Thank You!

Every contribution, big or small, helps improve **Godot Launcher**. We appreciate your support and effort in making it better for everyone!
