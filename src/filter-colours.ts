import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import * as process from 'node:process';
import { readStdin } from './helpers';

const COLOR_PROPS = new Set([
    'color',
    'background-color',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-inline-start-color',
    'border-inline-end-color',
    'border-block-start-color',
    'border-block-end-color',
    'outline-color',
    'box-shadow',
    'text-shadow',
    'fill',
    'stroke',
    'caret-color',
    'accent-color',
    'column-rule-color',
    'text-decoration-color',
    'text-emphasis-color',
    'stop-color',
    'flood-color',
    'lighting-color',
]);
const GENERIC_KEYWORDS = new Set([
    'none',
    'inherit',
    'unset',
    'initial',
    'revert',
    'revert-layer',
]);

const PATTERN_COLOR_VALUE =
    /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\w*\([^)]*\)|(?:red|orange|yellow|green|blue|indigo|violet|purple|pink|brown|gray|grey|black|white|transparent|currentColor|inherit|initial|unset|revert)(?![a-zA-Z0-9-])/i;
const PATTERN_SECOND_PASS =
    /^(border|outline|background)(?:-(?:top|right|bottom|left|inline-start|inline-end|block-start|block-end))?$/i;

function extractColorFromValue(value: string): string | null {
    return value.trim().match(PATTERN_COLOR_VALUE)?.[0] ?? null;
}

async function processCss(css: string): Promise<string> {
    const root = postcss.parse(css);

    root.walkRules((rule) => {
        let hasAnyColor = false;

        root.walkAtRules((atRule) => {
            atRule.remove();
        });

        rule.walkDecls((decl) => {
            const propLower = decl.prop.toLowerCase();
            const valueLower = decl.value.toLowerCase();

            if (PATTERN_SECOND_PASS.test(propLower)) {
                const color = extractColorFromValue(decl.value);
                if (color) {
                    hasAnyColor = true;
                    decl.prop = propLower + '-color';
                    decl.value = color;
                } else {
                    decl.remove();
                }
            } else if (COLOR_PROPS.has(propLower)) {
                if (GENERIC_KEYWORDS.has(valueLower)) {
                    decl.remove();
                } else {
                    hasAnyColor = true;
                }
            } else {
                decl.remove();
            }
        });

        if (!hasAnyColor || rule.nodes?.length === 0) {
            rule.remove();
        }
    });

    return root.toString();
}

async function main() {
    try {
        let css_buffer: string;
        let out_path: string | null = null;

        if (process.argv[2]) {
            css_buffer = readFileSync(resolve(process.argv[2]), 'utf-8');
            out_path = 'filtered.user.less';
        } else {
            if (process.stdin.isTTY) {
                console.error('Usage:');
                console.error('  filter-colors <file.css>');
                console.error('  cat file.css | filter-colors');
                process.exit(1);
            }
            css_buffer = await readStdin();
        }

        css_buffer = await processCss(css_buffer);

        if (out_path) {
            writeFileSync(out_path, css_buffer, 'utf-8');
            console.log(`Filtered CSS written to: ${out_path}`);
        } else {
            process.stdout.write(css_buffer);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.error('Unknown error occurred');
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
