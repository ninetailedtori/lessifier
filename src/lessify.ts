// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

import postcss from "postcss";

import { Indent } from "./indent.js";
import { logger } from "./logger.js";
import { extractLeadingDocString } from "./reader.js";

const CC_PAREN_OPEN = 40;
const CC_PAREN_CLOSE = 41;
const CC_BRACKET_OPEN = 91;
const CC_BRACKET_CLOSE = 93;
const CC_BACKSLASH = 92;
const CC_SPACE = 32;
const CC_GT = 62;
const CC_PLUS = 43;
const CC_TILDE = 126;
const CC_COLON = 58;
const CC_DOT = 46;

type SelectorNode = {
    selector: string;
    combinator: string;
    is_pseudo: boolean;
    declKey: string;
    children: Map<string, SelectorNode>;
    declarations: Array<{ prop: string; value: string }>;
};

/**
 * @brief checks if a selector string has balanced parentheses and brackets.
 * used to validate selectors before processing (catches malformed :not(),
 * :has(), etc.).
 *
 * @param {string} sel - selector string to validate
 * @returns {boolean} true if all parens/brackets are balanced, false otherwise
 *
 * @example
 * isBalanced('div')            // true
 * isBalanced('a:not(.foo)')    // true
 * isBalanced('a:not(.foo')     // false
 */
function isBalanced(sel: string): boolean {
    let parens = 0,
        brackets = 0;
    const len = sel.length;

    for (let i = 0; i < len; i++) {
        const code = sel.charCodeAt(i);

        if (code === CC_BACKSLASH && i + 1 < len) {
            i++;
            continue;
        }

        if (code === CC_PAREN_OPEN) {
            parens++;
        } else if (code === CC_PAREN_CLOSE) {
            parens--;
            if (parens < 0) return false;
        } else if (code === CC_BRACKET_OPEN) {
            brackets++;
        } else if (code === CC_BRACKET_CLOSE) {
            brackets--;
            if (brackets < 0) return false;
        }
    }

    return parens === 0 && brackets === 0;
}

const INLINE_IS_PSEUDO = (code: number) => code === CC_COLON || code === CC_DOT;

/**
 * @brief computes a hash key of declarations for grouping similar selectors.
 * used to merge selectors with identical declaration sets during rendering.
 *
 * @param {Array} decls - array of { prop, value } declarations
 * @returns {string} normalized key representing the declaration set
 */
function computeDeclKey(
    decls: readonly {
        prop: string;
        value: string;
    }[]
): string {
    if (decls.length === 0) return "";

    const len = decls.length;
    let size = 0;

    for (let i = 0; i < len; i++) {
        size += decls[i].prop.length + decls[i].value.length + 2;
    }

    const parts: string[] = [];

    const sorted = [...decls].sort((a, b) => {
        const aLen = a.prop.length;
        const bLen = b.prop.length;

        if (aLen !== bLen) return aLen - bLen;
        return a.prop < b.prop ? -1 : a.prop > b.prop ? 1 : 0;
    });

    for (let i = 0; i < sorted.length; i++) {
        parts.push(sorted[i].prop, ":", sorted[i].value, "|");
    }

    return parts.join("");
}

interface Token {
    token: string;
    combinator: string;
}

const TOKEN_BUFFER: Token[] = [];

/**
 * @brief tokenizes a selector string into combinator-separated parts.
 * splits on descendant (space), child (>), adjacent (+), and sibling (~)
 * combinators, while respecting parentheses (for :not(), :is(), etc.).
 *
 * @param {string} sel - selector string to tokenize
 * @returns {Array<{token: string, combinator: string}>} array of tokens with their preceding combinator
 *
 * @example
 * tokenizeSelector('div > p:not(.skip)')
 * // [
 * //   { token: 'div', combinator: ' ' },
 * //   { token: 'p:not(.skip)', combinator: '>' }
 * // ]
 */
function tokenizeSelector(sel: string): Token[] {
    TOKEN_BUFFER.length = 0;

    const len = sel.length;
    let paren = 0;
    let token = "";
    let lastComb = " ";

    for (let i = 0; i < len; i++) {
        const code = sel.charCodeAt(i);

        if (code === CC_BACKSLASH && i + 1 < len) {
            token += sel[i] + sel[++i];
            continue;
        }

        paren += code === CC_PAREN_OPEN ? 1 : code === CC_PAREN_CLOSE ? -1 : 0;

        if (
            paren === 0 &&
            (code === CC_SPACE ||
                code === CC_GT ||
                code === CC_PLUS ||
                code === CC_TILDE)
        ) {
            if (token) {
                TOKEN_BUFFER.push({ token, combinator: lastComb });
                token = "";
            }

            if (code !== CC_SPACE) lastComb = String.fromCharCode(code);
            continue;
        }

        token += sel[i];
    }

    if (token) {
        TOKEN_BUFFER.push({ token, combinator: lastComb });
    }

    return TOKEN_BUFFER.slice();
}

/**
 * @brief builds a selector tree from a flat list of rules.
 * groups selectors hierarchically by their combinator-separated parts,
 * allowing later deduplication and nested rendering.
 *
 * @param {Array} rules - array of { selector, declarations } objects
 * @returns {SelectorNode} root node of the tree containing all rules
 */
function buildSelectorTree(
    rules: Array<{
        selector: string;
        declarations: Array<{ prop: string; value: string }>;
    }>
): SelectorNode {
    const root: SelectorNode = {
        selector: "root",
        combinator: "",
        is_pseudo: false,
        declKey: "",
        children: new Map(),
        declarations: []
    };

    for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
        const rule = rules[ruleIdx];
        const tokens = tokenizeSelector(rule.selector);

        if (!tokens.length) {
            logger.warn(`empty tokens: "${rule.selector}"`);
            continue;
        }

        let node = root;
        for (let tokenIdx = 0; tokenIdx < tokens.length; tokenIdx++) {
            const tok = tokens[tokenIdx];
            const key = tok.combinator + tok.token;

            let child = node.children.get(key);
            if (!child) {
                const selectorCode = tok.token.charCodeAt(0);
                child = {
                    selector: tok.token,
                    combinator: tok.combinator,
                    is_pseudo: INLINE_IS_PSEUDO(selectorCode),
                    declKey: "",
                    children: new Map(),
                    declarations: []
                };
                node.children.set(key, child);
            }
            node = child;
        }

        node.declarations.push(...rule.declarations);
    }

    computeAllDeclKeys(root);

    return root;
}

function computeAllDeclKeys(node: SelectorNode): void {
    if (node.declarations.length > 0) {
        node.declKey = computeDeclKey(node.declarations);
    }
    for (const child of node.children.values()) {
        computeAllDeclKeys(child);
    }
}

/**
 *
 */
class RenderBuffer {
    private parts: string[] = [];
    private depth = 0;
    private indentStr: string;

    constructor(indent: Indent) {
        this.indentStr = indent.toString();
    }

    push(s: string): void {
        this.parts.push(s);
    }

    indent(n: number = 1): void {
        this.parts.push(this.indentStr.repeat(this.depth + n));
    }

    newline(): void {
        this.parts.push("\n");
    }

    toString(): string {
        return this.parts.join("");
    }
}

/**
 * @brief renders a selector tree back to less/css syntax.
 * handles nested selectors, groups siblings with matching declarations,
 * and outputs properly formatted less with indentation.
 *
 * @param {SelectorNode} node - tree node to render
 * @param {RenderBuffer} buffer - output buffer to append to
 * @param {number} depth - current nesting depth (for indentation)
 * @param {boolean} nested - whether this node is nested (affects & prefixing)
 * @returns {void}
 */
function render(
    node: SelectorNode,
    buffer: RenderBuffer,
    depth: number = 0,
    nested: boolean = false
): void {
    if (node.selector === "root") {
        for (const child of node.children.values()) {
            render(child, buffer, depth, false);
        }
        return;
    }

    const sel = nested && node.is_pseudo ? "&" + node.selector : node.selector;

    if (!node.children.size && !node.declarations.length) {
        buffer.indent(depth);
        buffer.push(sel);
        buffer.push(" {}");
        buffer.newline();
        return;
    }

    buffer.indent(depth);
    buffer.push(sel);
    buffer.push(" {\n");

    const decls = node.declarations;
    for (let i = 0; i < decls.length; i++) {
        const d = decls[i];
        buffer.indent(depth + 1);
        buffer.push(d.prop);
        buffer.push(": ");
        buffer.push(d.value);
        buffer.push(";\n");
    }

    const grouped = new Map<string, SelectorNode[]>();
    for (const child of node.children.values()) {
        const key = child.declKey;
        let group = grouped.get(key);
        if (!group) {
            group = [];
            grouped.set(key, group);
        }
        group.push(child);
    }

    for (const siblings of grouped.values()) {
        if (siblings.length === 1) {
            render(siblings[0], buffer, depth + 1, true);
        } else {
            buffer.indent(depth + 1);

            const selList: string[] = [];
            for (let i = 0; i < siblings.length; i++) {
                const sib = siblings[i];
                selList.push(sib.is_pseudo ? "&" + sib.selector : sib.selector);
            }
            buffer.push(selList.join(", "));
            buffer.push(" {\n");

            const firstDecls = siblings[0].declarations;
            for (let i = 0; i < firstDecls.length; i++) {
                const d = firstDecls[i];
                buffer.indent(depth + 2);
                buffer.push(d.prop);
                buffer.push(": ");
                buffer.push(d.value);
                buffer.push(";\n");
            }

            for (const child of siblings[0].children.values()) {
                render(child, buffer, depth + 2, true);
            }

            buffer.indent(depth + 1);
            buffer.push("}\n");
        }
    }

    buffer.indent(depth);
    buffer.push("}\n");
}

/**
 * @brief processes a css string into nested less syntax.
 * parses css, builds a selector tree, deduplicates rules, and renders as less.
 * logs performance timing and rule counts.
 *
 * @param {string} css - raw css string
 * @returns {Promise<string>} formatted less output
 *
 * @example
 * const input  = 'body { margin: 0; } body { padding: 0; }';
 * const output = await lessify(input);
 * // output: 'body { margin: 0; padding: 0; }'
 */
export async function lessify(
    css: string,
    options: {
        indent: Indent;
    }
): Promise<string> {
    const t0 = performance.now();
    const root = postcss.parse(css);
    const rules: Array<{
        selector: string;
        declarations: Array<{ prop: string; value: string }>;
    }> = [];

    root.walkRules((rule) => {
        const decls: Array<{ prop: string; value: string }> = [];
        rule.walkDecls(({ prop, value }) => {
            decls.push({ prop, value });
        });

        if (!decls.length) return;

        const selectors = rule.selectors;
        for (let i = 0; i < selectors.length; i++) {
            const trimmed = selectors[i].trim();
            if (!isBalanced(trimmed)) {
                logger.warn(`malformed: ${selectors[i]}`);
                continue;
            }
            rules.push({ selector: trimmed, declarations: decls });
        }
    });

    logger.log(`found ${rules.length} rules`);

    const tree = buildSelectorTree(rules);
    const buffer = new RenderBuffer(options.indent);
    buffer.push(extractLeadingDocString(root));
    render(tree, buffer);

    const elapsed = (performance.now() - t0).toFixed(2);
    logger.log(`rendered in ${elapsed}ms`);

    return buffer.toString();
}
