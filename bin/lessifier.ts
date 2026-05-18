#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { Command, Option } from "commander";

import {
    collateSelectors,
    filterColours,
    Indent,
    lessify
} from "../src/index.js";
import { logger } from "../src/logger.js";
import { readStdin } from "../src/reader.js";

const pkg = JSON.parse(
    readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
        "utf-8"
    )
);

const program = new Command()
    .name(pkg.name)
    .version(pkg.version)
    .description(pkg.description);

program
    .command("collate [input]")
    .addOption(
        new Option(
            "-i, --input <file>",
            "input file path (explicitly set as opposed to in positional)"
        )
    )
    .addOption(new Option("-o, --output <file>", "output file path"))
    .option("--stdin", "read from stdin")
    .addOption(
        new Option("-p, --preprocessor <type>", "CSS preprocessor")
            .choices(["css", "less"])
            .default("css")
    )
    .option("--nested", "enable nested mode")
    .addOption(
        new Option("--indent-style <type>", "indent style")
            .choices(["spaces", "tabs"])
            .default("spaces")
    )
    .option("--indent-size <num>", "indent size", "2")
    .action(async (inputPositional, opts) => {
        const css = await parseInputs(inputPositional, opts.input, opts.stdin);
        const indent = Indent.from({
            style: opts.indentStyle,
            size: parseInt(opts.indentSize, 10)
        });
        const result = await collateSelectors(css, {
            preprocessor: opts.preprocessor,
            nested: opts.nested,
            indent
        });
        outputResult(result, opts.output);
    });

program
    .command("lessifier [input]")
    .addOption(
        new Option(
            "-i, --input <file>",
            "input file path (alternative to positional argument)"
        )
    )
    .addOption(new Option("-o, --output <file>", "output file path"))
    .option("--stdin", "read from stdin")
    .addOption(
        new Option("--indent-style <type>", "indent style")
            .choices(["spaces", "tabs"])
            .default("spaces")
    )
    .option("--indent-size <num>", "indent size", "2")
    .action(async (inputPositional, opts) => {
        const css = await parseInputs(inputPositional, opts.input, opts.stdin);
        const indent = Indent.from({
            style: opts.indentStyle,
            size: parseInt(opts.indentSize, 10)
        });
        const result = await lessify(css, { indent });
        outputResult(result, opts.output);
    });

program
    .command("filter [input]")
    .addOption(new Option("-i, --input <file>", "input file path"))
    .addOption(new Option("-o, --output <file>", "output file path"))
    .option("--stdin", "read from stdin")
    .action(async (inputPositional, opts) => {
        const css = await parseInputs(inputPositional, opts.input, opts.stdin);
        const result = await filterColours(css);
        outputResult(result, opts.output);
    });

function outputResult(
    result: string,
    outPath: string | null | undefined
): void {
    if (outPath) {
        writeFileSync(resolve(outPath), result, "utf-8");
        logger.success(`written to ${outPath}`);
    } else {
        process.stdout.write(result);
    }
}

async function parseInputs(
    positional: string | null | undefined,
    flag: string | null | undefined,
    stdin: boolean
): Promise<string> {
    const inputCount = [positional, flag, stdin].filter(Boolean).length;

    if (inputCount > 1) {
        throw new Error(
            "Cannot specify multiple input sources. Use one of: positional argument, --input, or --stdin"
        );
    }

    if (inputCount === 0) {
        return await readStdin();
    }

    const inputFile = positional || flag;

    if (!inputFile) {
        throw new Error("Input file is required");
    }

    if (stdin) {
        return await readStdin();
    }

    return readFileSync(resolve(inputFile), "utf-8");
}

program.parse(process.argv);
