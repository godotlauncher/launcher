# Copilot Commit Message Instructions

Follow the Conventional Commits specification for all commit messages:

## Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `ci`: CI/CD configuration changes
- `build`: Build system or external dependency changes

## Examples
- `feat(launcher): add game detection feature`
- `fix(ui): resolve window sizing issue`
- `docs: update installation instructions`
- `chore: update dependencies to latest versions`

## Guidelines
- Use lowercase for type and description
- Keep description under 50 characters
- Use imperative mood ("add" not "added")
- Include scope when relevant to the project area
