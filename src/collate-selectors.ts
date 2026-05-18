// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import postcss, { Root } from "postcss";

import { Indent } from "./indent.js";
import { logger } from "./logger.js";
import { extractLeadingDocString } from "./reader.js";

/**
 * @brief conditionally loads and parses CSS or LESS syntax
 * dynamically imports postcss-less only when needed to minimize bundle impact.
 *
 * @param {string} css - Raw CSS or LESS string
 * @param {'postcss' | 'postcss-less' | 'postcss-nested'} parserName - Which parser to use
 * @returns {Promise<Root>} Parsed PostCSS AST
 * @throws {Error} if parsing fails
 */
async function postcssParser(
    css: string,
    parserName: "postcss" | "postcss-less" | "postcss-nested"
): Promise<Root> {
    if (parserName === "postcss-less") {
        const { default: lessParser } = await import("postcss-less");
        return postcss.parse(css, { syntax: lessParser } as any);
    }
    if (parserName === "postcss-nested") {
        const { default: nestedParser } = await import("postcss-nested");
        return postcss.parse(css, { syntax: nestedParser } as any);
    }
    return postcss.parse(css);
}

/**
 * @brief collapses duplicate selectors by merging declarations.
 * handles both flat CSS and nested CSS/LESS structures.
 *
 * For flat CSS:
 *   .foo { color: red; } .foo { padding: 10px; }
 *   ==> .foo { color: red; padding: 10px; }
 *
 * For nested CSS/LESS:
 *   h1 { small { color: gray; } }
 *   h2 { small { color: gray; } }
 *   ==> h1, h2 { small { color: gray; } }
 *
 * @param {string} css - CSS or nested CSS/LESS string
 * @param {object} options - { preprocessor?: 'css' | 'less', nested?: boolean, indent?: Indent }
 * @returns {Promise<string>} collated output
 */
export async function collateSelectors(
    css: string,
    options?: {
        preprocessor?: "css" | "less";
        nested?: boolean;
        indent?: Indent;
    }
): Promise<string> {
    const preprocessor = options?.preprocessor ?? "css";
    const indentStr = options?.indent ? options.indent.toString() : "  ";

    let parserName: "postcss" | "postcss-less" | "postcss-nested";
    if (preprocessor === "less") {
        parserName = "postcss-less";
    } else if (options?.nested === true) {
        parserName = "postcss-nested";
    } else {
        parserName = "postcss";
    }

    const root = await postcssParser(css, parserName);
    const hasNesting =
        options?.nested !== undefined ? options.nested : isNested(root);

    if (hasNesting) {
        return collateNestedSelectors(root, indentStr);
    } else {
        return collateFlatSelectors(root, indentStr);
    }
}

/**
 * @brief detects whether the CSS/LESS AST contains nested rules.
 * scans the root for any rule nodes that contain child rules (early exit on first match).
 *
 * @param {Root} root - PostCSS parsed AST
 * @returns {boolean} true if nesting detected
 */
function isNested(root: Root): boolean {
    let foundNesting = false;
    root.walkRules((rule) => {
        for (let i = 0; i < rule.nodes.length; i++) {
            if (rule.nodes[i].type === "rule") {
                foundNesting = true;
                return false;
            }
        }
    });
    return foundNesting;
}

/**
 * @brief collapses flat CSS selectors by merging duplicate rules.
 * groups rules by selector, deduplicates declarations (later wins on conflicts),
 * and emits compacted output without whitespace.
 *
 * @param {Root} root - PostCSS parsed AST (non-nested)
 * @param {string} indentStr - Indentation string (e.g., '  ' or '\t')
 * @returns {Promise<string>} minified CSS with collapsed selectors
 */
async function collateFlatSelectors(
    root: Root,
    indentStr: string
): Promise<string> {
    const groups = new Map<
        string,
        {
            selectors: string[];
            declarations: postcss.Declaration[];
        }
    >();
    let rulesProcessed = 0;

    root.walkRules((rule) => {
        rulesProcessed++;
        const nodes = rule.nodes;
        if (!nodes || nodes.length === 0) return;

        const decls: postcss.Declaration[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.type === "decl") decls.push(node as postcss.Declaration);
        }

        if (decls.length === 0) return;

        const declKey = decls
            .map((d) => `${d.prop}:${d.value}`)
            .sort()
            .join("|");

        const existing = groups.get(declKey);
        if (!existing) {
            groups.set(declKey, {
                selectors: [...rule.selectors],
                declarations: decls
            });
            logger.debug(
                `  ==> new group with ${rule.selectors.length} selectors`
            );
        } else {
            // Merge selectors, avoiding duplicates
            const selectorSet = new Set([
                ...existing.selectors,
                ...rule.selectors
            ]);
            existing.selectors = Array.from(selectorSet);
            logger.debug(
                `  ==> merged, now ${existing.selectors.length} selectors`
            );
        }
    });

    logger.log(
        `processed ${rulesProcessed} rules ==> ${groups.size} unique declaration groups`
    );

    const output: string[] = [];

    groups.forEach((group) => {
        output.push(`${group.selectors.join(", ")} {\n`);
        for (let i = 0; i < group.declarations.length; i++) {
            const d = group.declarations[i];
            output.push(`${indentStr}${d.prop}: ${d.value};\n`);
        }
        output.push("}\n");
    });

    return extractLeadingDocString(root) + output.join("");
}

/**
 * @brief collapses nested CSS/LESS rules by grouping selectors with identical subtrees.
 * computes a hash of each rule's nested structure and children, then merges
 * selectors that share the same hash into a comma-separated list.
 *
 * Example:
 *   h1 { .btn { color: blue; } }
 *   h2 { .btn { color: blue; } }
 *   ==> h1, h2 { .btn { color: blue; } }
 *
 * @param {Root} root - PostCSS parsed AST (may contain nested rules)
 * @param {string} indentStr - Indentation string (e.g., '  ' or '\t')
 * @returns {string} output with merged nested selectors and proper indentation
 */
function collateNestedSelectors(root: Root, indentStr: string): string {
    /**
     * helper that recursively stringifies PostCSS nodes with proper indentation!
     */
    function stringifyWithIndent(
        nodes: postcss.Node[],
        currentIndent: string = ""
    ): string {
        const output: string[] = [];

        nodes.forEach((node) => {
            if (node.type === "rule") {
                const rule = node as postcss.Rule;
                output.push(`${currentIndent}${rule.selector} {\n`);

                const nested = stringifyWithIndent(
                    rule.nodes || [],
                    currentIndent + indentStr
                );
                output.push(nested);

                output.push(`${currentIndent}}\n`);
            } else if (node.type === "decl") {
                const decl = node as postcss.Declaration;
                output.push(`${currentIndent}${decl.prop}: ${decl.value};\n`);
            }
        });

        return output.join("");
    }

    const grouped = new Map<
        string,
        {
            hash: string;
            selectors: Set<string>;
            rule: postcss.Rule;
        }
    >();

    root.each((node) => {
        if (node.type !== "rule") return;
        const rule = node as postcss.Rule;
        const hash = calcSubtreeHash(rule);

        if (!grouped.has(hash)) {
            grouped.set(hash, {
                hash,
                selectors: new Set([rule.selector]),
                rule: rule.clone()
            });
        } else {
            grouped.get(hash)!.selectors.add(rule.selector);
        }
    });

    const output: string[] = [];
    grouped.forEach(({ selectors, rule }) => {
        const merged = new postcss.Rule({
            selector: Array.from(selectors).join(", ")
        });
        rule.each((node) => {
            merged.append(node.clone());
        });
        output.push(stringifyWithIndent([merged]));
    });

    return extractLeadingDocString(root) + output.join("");
}

/**
 * @brief computes a content hash of a rule's subtree (declarations and nested rules).
 * used to identify rules with identical structure for grouping/collation.
 *
 * hash format: `D:prop:value|R:selector|prop:value|...`
 * - `D:` prefix for declarations
 * - `R:` prefix for nested rules
 *
 * @param {postcss.Rule} rule - The rule to hash
 * @returns {string} opaque hash representing the rule's content
 */
function calcSubtreeHash(rule: postcss.Rule): string {
    const parts: string[] = [];
    rule.each((node) => {
        if (node.type === "decl") {
            const d = node as postcss.Declaration;
            parts.push(`D:${d.prop}:${d.value}`);
        } else if (node.type === "rule") {
            const child = node as postcss.Rule;
            parts.push(`R:${child.selector}`);
            child.walkDecls((d) => {
                parts.push(`${d.prop}:${d.value}`);
            });
        }
    });
    return parts.join("|");
}
