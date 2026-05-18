#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile, writeFile } from "fs/promises";

import {
    collateSelectors,
    filterColours,
    Indent,
    lessify
} from "../dist/index.js";

async function main() {
    const indent = new Indent("space", 2);
    const input = await readFile("demo/css/in.1.css", "utf-8");

    console.log("1. filtering colours...");
    const filtered = await filterColours(input);
    await writeFile("demo/css/filtered.2.css", filtered);

    console.log("2. collating selectors...");
    const collated = await collateSelectors(filtered, { indent });
    await writeFile("demo/css/collated.3.css", collated);

    console.log("3. lessifying...");
    const lessified = await lessify(collated, { indent });
    await writeFile("demo/css/lessified.4.less", lessified);

    console.log("4. collating nested less...");
    const output = await collateSelectors(lessified, {
        preprocessor: "less",
        indent
    });
    await writeFile("demo/css/out.5.less", output);

    console.log(":3 lessification complete!");
}

main().catch(console.error);
