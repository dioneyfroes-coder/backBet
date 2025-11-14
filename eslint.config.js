// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ["node_modules", "dist", "build"],
    rules: {
      // Ajustes para reduzir falsos positivos em construtores e DTOs durante o desenvolvimento
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["off", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
];
