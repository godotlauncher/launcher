module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: [
    "dist/**",
    "dist-react/**",
    "dist-electron/**",
    "*config.js",
    "*.cts",
    ".eslintrc.cjs",
    "*.spec.ts",
    "*.test.ts",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "linebreak-style": ["error", "unix"],
    "no-console": "warn",
    quotes: ["error", "single"],
    semi: ["error", "always"],
    indent: ["error", 4],
  },
};
