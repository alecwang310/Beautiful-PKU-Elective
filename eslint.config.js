import js from '@eslint/js';
import globals from 'globals';

export default [
  // dino.js and its assets are vendored Chromium source, not ours to lint
  { ignores: ['dist/**', 'node_modules/**', 'src/static/dino.js', 'src/static/dino-assets.js'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],   // swallow storage/parse errors
      'no-useless-escape': 'off',                          // escaped brackets in char classes
      'no-irregular-whitespace': 'off',                    // NBSP in match regexes
      'no-unused-vars': 'off',                             // not the gate's concern (yet)
    },
  },
];
