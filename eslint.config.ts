// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import skipFormatting from "eslint-config-prettier/flat";
import pluginOxlint from "eslint-plugin-oxlint";

export default [
    {
        ignores: ["**/dist/**", "**/out/**", "**/coverage/**"]
    },

    {
        files: ["**/*.{ts,mts,tsx}"],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2024,
            sourceType: "module"
        },
        plugins: { "@typescript-eslint": tsPlugin }
    },

    ...pluginOxlint.buildFromOxlintConfigFile(".oxlintrc.json"),

    skipFormatting
];
