// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Ajustes para reduzir falsos positivos em construtores e DTOs durante o desenvolvimento
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["off", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    // Guarda arquitetural (Fase 11): core e shared são camadas internas e não
    // podem depender de infrastructure. Qualquer implementação concreta deve
    // entrar por injeção de dependência ou factory de infra.
    files: ["src/core/**/*.ts", "src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/infrastructure",
              message: "core/shared não podem importar de infrastructure",
            },
          ],
          patterns: [
            {
              group: ["@/infrastructure", "@/infrastructure/**"],
              message: "core/shared não podem importar de infrastructure",
            },
          ],
        },
      ],
    },
  },
];
