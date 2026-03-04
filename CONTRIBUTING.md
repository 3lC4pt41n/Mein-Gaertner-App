# Contributing to Digitaler Gärtner

We love contributions! Whether you're fixing bugs, adding features, or improving documentation, your help makes this project better.

## Code of Conduct

Be respectful and inclusive. We're building a welcoming community for all gardeners.

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/Mein-Gaertner-App.git
cd Mein-Gaertner-App
npm install
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Development

```bash
# Start the dev server
npx expo start

# Run tests
npm test

# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Reporting Bugs

Found a bug? Please create an issue with:

- **Title**: Brief description
- **Environment**: OS, device/simulator, app version
- **Steps to reproduce**: Clear steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Screenshots/videos**: If applicable

Use the bug report template when creating an issue.

## Suggesting Features

Have an idea? Open a feature request with:

- **Title**: Clear feature name
- **Motivation**: Why this feature matters
- **Proposed solution**: How it could work
- **Alternative approaches**: Other options considered

Use the feature request template.

## Code Style

We follow strict linting rules to keep code consistent:

### ESLint & Prettier

All code must pass linting:

```bash
npm run lint       # Check for issues
npm run lint:fix   # Auto-fix issues
npm run format     # Format with Prettier
```

Before committing, run these checks locally.

### JavaScript/JSX Style Guide

- Use ES6+ features (arrow functions, destructuring, etc.)
- Use camelCase for variables and functions
- Use PascalCase for React components and classes
- Add JSDoc comments for complex functions
- Prefer functional components with hooks
- Keep functions small and focused

Example:

```javascript
/**
 * Calculate health score for a plant based on image analysis.
 * @param {string} plantId - The plant identifier
 * @param {number} score - The health score (0-100)
 * @returns {Promise<void>}
 */
async function updateHealthScore(plantId, score) {
  // Implementation
}
```

### Internationalization (i18n)

All user-facing strings must be translatable:

```javascript
// ❌ Bad
<Text>Plant found!</Text>;

// ✅ Good
import i18n from '../i18n';
<Text>{i18n.t('plant_found')}</Text>;
```

Add keys to all language files in `i18n/locales/`:

- `i18n/locales/de.json`
- `i18n/locales/en.json`
- `i18n/locales/fr.json`
- `i18n/locales/it.json`
- `i18n/locales/es.json`
- `i18n/locales/ru.json`

### Design System

Use design system components for consistency:

```javascript
// ✅ Use DS components
import { DSButton, DSCard, DSBadge, DSInput } from '../theme';

<DSButton onPress={handlePress}>Scan Plant</DSButton>;
```

Available components in `theme/`:

- `DSButton` — Consistent buttons
- `DSCard` — Card containers
- `DSBadge` — Status badges
- `DSChips` — Chip selectors
- `DSInput` — Text inputs

## Commit Messages

Use clear, descriptive commit messages:

```
feat: Add plant scanner with GPT-4o integration
fix: Resolve task rescheduling for daily tasks
docs: Update API documentation
refactor: Simplify credit deduction logic
test: Add tests for leaderboard ranking
chore: Update dependencies
```

Format: `type: description`

Types:

- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `refactor` — Code refactoring
- `test` — Tests
- `chore` — Build, dependencies, etc.
- `style` — Formatting (use Prettier instead)
- `perf` — Performance improvements

Keep descriptions under 72 characters.

## Pull Request Process

1. **Create a PR** from your feature branch to `main`
2. **Describe changes** using the PR template
3. **Link related issues** (closes #123)
4. **Pass CI checks**:
   - All tests pass (`npm test`)
   - Linting passes (`npm run lint`)
   - No console errors in dev
5. **Request review** from maintainers
6. **Address feedback** with new commits
7. **Squash if needed** before merge

### PR Checklist

- [ ] I've tested this locally
- [ ] All tests pass
- [ ] Linting passes
- [ ] New strings are in i18n files (all 6 languages)
- [ ] No hardcoded values
- [ ] No sensitive data (keys, tokens, etc.)
- [ ] Comments explain complex logic
- [ ] No unnecessary dependencies added

## Testing

Tests are required for:

- Bug fixes (prevent regression)
- New features (verify functionality)
- Complex logic (scoring, tasks, etc.)

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

Test locations:

- `__tests__/` — Main test suites
- `__tests__/services/` — Service tests
- `__tests__/components/` — Component tests
- `__tests__/contexts/` — Context tests

Example test:

```javascript
describe('creditService', () => {
  it('should deduct credits correctly', async () => {
    const balance = await deductCredits(userId, 12);
    expect(balance).toBe(88); // 100 - 12
  });
});
```

## Documentation

- Update README.md for major changes
- Add JSDoc comments to functions
- Document API changes in comments
- Include examples for complex features
- Keep docs in sync with code

## Areas to Contribute

### High Priority

- Performance optimizations
- Test coverage (we aim for >80%)
- i18n translations (especially Russian and Italian)
- Bug fixes
- Accessibility improvements

### Nice to Have

- Feature improvements
- UI polish
- Documentation enhancements
- Developer experience tools

## Questions?

- Check existing issues/PRs
- Read code comments and docs
- Ask in issues (we'll help!)
- Discuss in pull requests

## Recognition

Contributors are recognized in:

- Commit history
- Project README (for significant contributions)
- Release notes

Thank you for helping make Digitaler Gärtner better!
