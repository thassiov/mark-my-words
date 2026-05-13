import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import-x';
import promisePlugin from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
      },
    },
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  promisePlugin.configs['flat/recommended'],
  unicorn.configs.recommended,
  sonarjs.configs.recommended,

  // The TS resolver lets import-x understand path aliases, the .js
  // suffix-on-TS-imports convention, and dependency types from
  // node_modules. Without it, every external import is flagged as
  // unresolved.
  {
    settings: {
      'import-x/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        node: true,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // The default flags fire-and-forget chains (the common case in UI
      // code), insisting every then() return a value. `ignoreLastCallback`
      // lets us handle UI side effects without ceremonial returns.
      'promise/always-return': ['error', { ignoreLastCallback: true }],
      'promise/catch-or-return': ['error', { allowFinally: true }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-default-export': 'warn',
      'import-x/no-cycle': 'error',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
      // The default `error_` catch param name conflicts with the `err`
      // convention used everywhere else in the codebase. Style only.
      'unicorn/catch-error-name': 'off',
      // Conflicts with TS argument inference: `mockResolvedValue(undefined)`
      // is the canonical way to satisfy a `Promise<undefined>` mock when
      // the function being mocked returns void/undefined.
      'unicorn/no-useless-undefined': 'off',
      // `import-x/no-named-as-default-member` warns about `dexie` /
      // `vitest` ambient namespaces — not actionable.
      'import-x/no-named-as-default-member': 'off',

      // -- Complexity thresholds --
      // Mirrors the spirit of Go's golangci-lint cyclop/funlen settings:
      // hard but generous gates. A function tripping any of these is
      // usually screaming for an extract-method refactor.
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': [
        'error',
        { max: 120, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-statements': ['error', { max: 30 }],
      'max-nested-callbacks': ['error', { max: 4 }],
      'max-params': ['error', { max: 5 }],
      // Cognitive complexity (sonarjs) measures readability load — a
      // better signal than cyclomatic for human-reviewability.
      'sonarjs/cognitive-complexity': ['error', 15],

      // -- Sonarjs noise we don't agree with --
      // `void promise` is the canonical way to mark a deliberately-fire-and-forget
      // call; we use it where required.
      'sonarjs/void-use': 'off',
      // Local readonly props in Preact components don't carry their weight
      // for our team's preferred terseness.
      'sonarjs/prefer-read-only-props': 'off',
      // Stable numeric/string sort is fine for our tag and snippet lists;
      // we don't need locale-aware ordering.
      'sonarjs/no-alphabetical-sort': 'off',
      // `Array#slice(start, undefined)` is the spec-defined "slice to end"
      // call — sonarjs's argument-type narrowing flags it as a bug.
      'sonarjs/argument-type': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Mock libraries (vitest-mock-extended, vi.fn) surface method refs to
      // tests for `.toHaveBeenCalledWith` etc. Binding them defeats the purpose.
      '@typescript-eslint/unbound-method': 'off',
      // Some union-narrowing assertions look "unnecessary" to the rule but
      // are needed because the literal omits an optional discriminator field.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // Tests build inline DOM helpers and assertion helpers — extracting
      // every nested function fights the locality of the tests they support.
      'unicorn/consistent-function-scoping': 'off',
      // `(await foo()).bar` is a normal idiom in test setup; insisting on a
      // temp var per call makes assertions unreadable.
      'unicorn/no-await-expression-member': 'off',
      // Test files have inherently large describe blocks; complexity gates
      // for production code don't apply.
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'max-statements': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/prefer-read-only-props': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
    },
  },

  {
    files: ['vite.config.ts', 'eslint.config.js', '*.config.{js,ts}'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // -- Per-file complexity exemptions (technical debt) --
  // Each entry below is a known offender with a clear refactor path. As
  // we land the refactors, drop the override. Do NOT add new files here
  // without a tracking ticket and a one-line justification.
  {
    files: ['src/manifest.ts'],
    rules: {
      // The build helper shells out to `git rev-parse` for the version
      // tag. PATH at build time is the dev's, not user input.
      'sonarjs/no-os-command-from-path': 'off',
    },
  },
  {
    // readSelectionInPage is a single algorithm with a clear classification
    // table — splitting it for complexity purity hurts more than it helps.
    files: ['src/content/read-selection.ts'],
    rules: {
      complexity: 'off',
      'max-statements': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },

  // The strict + stylistic typeChecked configs above target all files by
  // default. Type-aware rules try to look these JS config files up in
  // the TS project and blow up with `await-thenable` etc. Switch them
  // off for plain JS — these files don't need type-aware linting anyway.
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    // Build/test runner configs aren't in tsconfig.include, so type-aware
    // linting can't load them. Skipping them is fine — they're tiny
    // declarative files that don't ship at runtime.
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
      // Build/test runner configs and helper scripts aren't in the
      // production tsconfig — type-aware linting can't load them. They
      // don't ship at runtime, so we skip them.
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'scripts/**',
      'e2e/**',
      '.dependency-cruiser.cjs',
    ],
  },
);
