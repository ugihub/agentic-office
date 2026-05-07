# Config Templates

These files cannot be created by the automated setup due to config-protection hooks.
Create them manually by copying from the templates below.

## .eslintrc.cjs

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.base.json",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],
    "no-throw-literal": "error",
    "no-console": "warn",
    "prefer-const": "error",
    eqeqeq: ["error", "always"],
  },
  ignorePatterns: ["node_modules/", "dist/", ".turbo/", "coverage/"],
};
```

## .prettierrc.json

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

## Setup Commands

```bash
# Copy templates
cp config-templates/.eslintrc.cjs.template .eslintrc.cjs
cp config-templates/.prettierrc.json.template .prettierrc.json

# Install dependencies
pnpm install

# Setup husky
pnpm prepare
```
