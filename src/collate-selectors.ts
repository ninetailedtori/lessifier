/*
 * lessify
 * Copyright (C) 2026–present ninetailedtori
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import postcss from 'postcss';
import { readStdin } from './reader.js';
import { logger } from './logger.js';

interface RuleGroup {
    declarations: postcss.Declaration[];
}

/**
 * collates duplicate selectors and merges their declarations. takes a css
 * string with potentially repeated selectors, deduplicates them, and
 * combines their property declarations into single rules.
 *
 * @param {string} css - raw css string to parse and collate
 * @returns {Promise<string>} compacted css with merged selectors
 *
 * @example
 * const input  = '.foo { color: red; } .foo { padding: 10px; }';
 * const output = await collateSelectors(input);
 * // output: '.foo { color: red; padding: 10px; }'
 */
export async function collateSelectors(css: string): Promise<string> {
    logger.debug(`parsing ${css.length} bytes of CSS`);
    const root = postcss.parse(css);
    const groups = new Map<string, RuleGroup>();
    let rulesProcessed = 0;

    root.walkRules((rule) => {
        rulesProcessed++;
        const nodes = rule.nodes;

        if (!nodes || nodes.length === 0) return;

        const decls: postcss.Declaration[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.type === 'decl') decls.push(node as postcss.Declaration);
        }

        if (decls.length === 0) return;

        rule.selectors.forEach((selector) => {
            const existing = groups.get(selector);

            if (!existing) {
                groups.set(selector, { declarations: decls });
                logger.debug(`  → new "${selector}"`);
            } else {
                const propMap = new Map<string, postcss.Declaration>();

                for (let i = 0; i < existing.declarations.length; i++) {
                    const d = existing.declarations[i];
                    propMap.set(d.prop, d);
                }

                for (let i = 0; i < decls.length; i++) {
                    const d = decls[i];
                    propMap.set(d.prop, d);
                }

                const merged: postcss.Declaration[] = [];
                propMap.forEach((v) => merged.push(v));
                existing.declarations = merged;

                logger.debug(`  → merged "${selector}"`);
            }
        });
    });

    logger.log(
        `processed ${rulesProcessed} rules → ${groups.size} unique selectors`
    );

    const output: string[] = [];
    groups.forEach((group, selector) => {
        output.push(`${selector}{`);

        for (let i = 0; i < group.declarations.length; i++) {
            const d = group.declarations[i];
            output.push(`${d.prop}:${d.value};`);
        }

        output.push('}');
    });

    const result = output.join('');
    logger.debug(`generated ${result.length} bytes`);
    return result;
}

/**
 * cli entry point. invoked by bin scripts.
 * reads css from a file or stdin, collates selectors, writes to file or stdout.
 *
 * usage:
 *   collate-selectors input.css output.css
 *   cat file.css | collate-selectors
 *
 * @returns {Promise<void>}
 * @throws exits with code 1 on error
 */
async function main(): Promise<void> {
    try {
        let css: string;
        let outPath: string | null;

        if (process.argv[2]) {
            const inPath = process.argv[2];
            outPath = process.argv[3] || 'collated.css';
            logger.log(`reading ${inPath}`);
            css = readFileSync(resolve(inPath), 'utf-8');
        } else {
            if (process.stdin.isTTY) {
                logger.error(
                    'Usage: collate-selectors [input.css] [output.css]'
                );
                logger.error('   or: cat file.css | collate-selectors');
                process.exit(1);
            }
            logger.log('reading stdin...');
            css = await readStdin();
            outPath = null;
        }

        css = await collateSelectors(css);

        if (outPath) {
            writeFileSync(outPath, css, 'utf-8');
            logger.success(`written to ${outPath}`);
        } else {
            process.stdout.write(css);
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown';
        logger.error(`Error: ${msg}`);
        process.exit(1);
    }
}

export default main;
