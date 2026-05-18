// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        lessifier: "bin/lessifier.ts"
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: "dist"
});
