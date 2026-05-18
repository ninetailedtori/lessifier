// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import postcss from "postcss";

import { logger } from "./logger.js";

const COLOUR_PROP_NAMES = [
    "color",
    "background-color",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-inline-start-color",
    "border-inline-end-color",
    "border-block-start-color",
    "border-block-end-color",
    "outline-color",
    "box-shadow",
    "text-shadow",
    "fill",
    "stroke",
    "caret-color",
    "accent-color",
    "column-rule-color",
    "text-decoration-color",
    "text-emphasis-color",
    "stop-color",
    "flood-color",
    "lighting-color"
] as const;

const COLOUR_PROPS_CACHED: Set<string> = new Set(COLOUR_PROP_NAMES);

const GENERIC_KW = [
    "none",
    "inherit",
    "unset",
    "initial",
    "revert",
    "revert-layer"
] as const;
const GENERIC_KW_CACHED: Set<string> = new Set(GENERIC_KW);

/**
 * @brief extracts a single colour value from a css property.
 * handles hex, rgb(a)/hsl(a)/hwb/lab/lch/oklab/oklch, color() function
 * syntax, and the common, named colours (red, blue, transparent, etc.)
 *
 * @param {string} val - the css property value to parse
 * @returns {string | null} the extracted colour string, or null if no valid
 * colour found
 *
 * @example
 * extractColour('#ff0000')          // ==> '#ff0000'
 * extractColour('rgb(255,0,0)')    // ==> 'rgb(255,0,0)'
 * extractColour('red')             // ==> 'red'
 * extractColour('none')            // ==> null
 */
export function extractColour(val: string): string | null {
    const len = val.length;
    if (len < 3) return null;

    const first = val.charCodeAt(0);

    if (first === 35) {
        let hexLen = 1;
        for (let i = 1; i < len && i < 9; i++) {
            const c = val.charCodeAt(i);
            if (
                (c >= 48 && c <= 57) ||
                (c >= 97 && c <= 102) ||
                (c >= 65 && c <= 70)
            ) {
                hexLen++;
            } else {
                break;
            }
        }
        if (hexLen === 4 || hexLen === 5 || hexLen === 7 || hexLen === 9) {
            return val.slice(0, hexLen);
        }
        return null;
    }

    const parenIdx = val.indexOf("(");
    if (parenIdx > 0 && parenIdx < 12) {
        const funcName = val.slice(0, parenIdx).toLowerCase();
        if (
            funcName === "rgb" ||
            funcName === "rgba" ||
            funcName === "hsl" ||
            funcName === "hsla" ||
            funcName === "hwb" ||
            funcName === "lab" ||
            funcName === "lch" ||
            funcName === "oklab" ||
            funcName === "oklch" ||
            funcName === "color"
        ) {
            const closeIdx = val.indexOf(")", parenIdx);
            if (closeIdx > parenIdx) {
                return val.slice(0, closeIdx + 1);
            }
        }
        return null;
    }

    const spaceIdx = val.indexOf(" ");
    const checkLen = spaceIdx > 0 ? spaceIdx : len;
    const word = val.slice(0, checkLen).toLowerCase();

    const namedColours = [
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "indigo",
        "violet",
        "purple",
        "pink",
        "brown",
        "gray",
        "grey",
        "black",
        "white",
        "transparent",
        "currentcolor"
    ];

    if (namedColours.includes(word)) {
        return word;
    }

    return null;
}

const PROP_NORM_CACHE = new Map<string, string>();

function getPropLower(prop: string): string {
    let lower = PROP_NORM_CACHE.get(prop);
    if (lower === undefined) {
        lower = prop.toLowerCase();
        if (PROP_NORM_CACHE.size < 512) {
            PROP_NORM_CACHE.set(prop, lower);
        }
    }
    return lower;
}

interface Decl {
    prop: string;
    value: string;
}

interface FilterStats {
    rulesProcessed: number;
    rulesKept: number;
    coloursExtracted: number;
    declsRemoved: number;
}

/**
 * @brief processes a single declaration, determining whether to keep it and if it
 * needs modification.
 * removes generic keywords (inherit, unset, etc.), extracts colours from
 * shorthand properties, and filters non-colour properties.
 *
 * @param {Decl} decl - the css declaration to process (mutates if modified)
 * @param {object} stats - stats object to track what we're doing
 * @param {number} stats.rulesProcessed - total rules seen
 * @param {number} stats.rulesKept - rules with colour declarations
 * @param {number} stats.colorsExtracted - colours pulled from values
 * @param {number} stats.declsRemoved - declarations filtered out
 * @returns {object} { keep: boolean, modified: boolean } - whether to keep
 * the decl and if we changed it
 */
function filterDecls(
    decl: Decl,
    stats: FilterStats
): { keep: boolean; modified: boolean } {
    const propLower = getPropLower(decl.prop);
    const valueLower = decl.value.toLowerCase();

    if (GENERIC_KW_CACHED.has(valueLower)) {
        stats.declsRemoved++;
        return { keep: false, modified: false };
    }

    const shorthandMatch = propLower.match(
        /^(border|outline|background)(?:-(?:top|right|bottom|left|inline-start|inline-end|block-start|block-end))?$/i
    );
    if (shorthandMatch) {
        const colour = extractColour(decl.value);
        if (colour) {
            stats.coloursExtracted++;
            decl.prop = propLower + "-colour";
            decl.value = colour;
            return { keep: true, modified: true };
        }
        stats.declsRemoved++;
        return { keep: false, modified: false };
    }

    if (COLOUR_PROPS_CACHED.has(propLower)) {
        stats.coloursExtracted++;
        return { keep: true, modified: false };
    }

    stats.declsRemoved++;
    return { keep: false, modified: false };
}

/**
 * @brief filters a css string to keep only colour-related declarations.
 * strips all at-rules, removes non-colour properties, extracts colour values
 * from shorthands. logs stats about what was processed.
 *
 * @param {string} css - raw css string to parse and filter
 * @returns {Promise<string>} filtered css with only colour rules
 *
 * @example
 * const input  = 'body { color: red; margin: 10px; }';
 * const output = await filterColours(input);
 * // output: 'body { color: red; }'
 */
export async function filterColours(css: string): Promise<string> {
    const t0 = performance.now();
    const root = postcss.parse(css);
    const stats = {
        rulesProcessed: 0,
        rulesKept: 0,
        coloursExtracted: 0,
        declsRemoved: 0
    };

    root.walkAtRules((atRule) => {
        atRule.remove();
    });

    stats.rulesProcessed = 0;
    stats.rulesKept = 0;
    stats.coloursExtracted = 0;
    stats.declsRemoved = 0;

    root.walkRules((rule) => {
        stats.rulesProcessed++;
        let hasAnyColour = false;

        rule.walkDecls((decl) => {
            const { keep } = filterDecls(decl as Decl, stats);
            if (keep) {
                hasAnyColour = true;
            } else {
                decl.remove();
            }
        });

        if (!hasAnyColour || rule.nodes?.length === 0) {
            rule.remove();
        } else {
            stats.rulesKept++;
        }
    });

    const elapsed = (performance.now() - t0).toFixed(2);
    logger.log(
        `processed ${stats.rulesProcessed} rules, kept ${stats.rulesKept}, ` +
            `extracted ${stats.coloursExtracted} colours, removed ${stats.declsRemoved} (${elapsed}ms)`
    );

    return root.toString();
}
