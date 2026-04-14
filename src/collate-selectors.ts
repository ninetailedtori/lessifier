import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import * as process from 'node:process';
import { readStdin } from './helpers';

type RuleGroup = {
    selectors: string[];
    declarations: postcss.Declaration[];
};

function getDeclarationsHash(rule: postcss.Rule): string {
    return (
        rule.nodes
            ?.filter(
                (node): node is postcss.Declaration => node.type === 'decl'
            )
            .map((decl) => `${decl.prop}:${decl.value}`)
            .sort()
            .join('|') ?? ''
    );
}

async function collateSelectors(css: string): Promise<string> {
    const root = postcss.parse(css);
    const groups = new Map<string, RuleGroup>();

    root.walkRules((rule) => {
        const hash = getDeclarationsHash(rule);

        if (!groups.has(hash)) {
            const decls =
                rule.nodes
                    ?.filter(
                        (node): node is postcss.Declaration =>
                            node.type === 'decl'
                    )
                    .map((d) => d.clone()) ?? [];

            groups.set(hash, {
                selectors: [...rule.selectors], // Use rule.selectors array
                declarations: decls,
            });
        } else {
            groups.get(hash)!.selectors.push(...rule.selectors); // Spread array
        }
    });

    const newRoot = postcss.root();
    groups.forEach((group) => {
        const newRule = postcss.rule({ selector: group.selectors.join(', ') });
        group.declarations.forEach((decl) => newRule.append(decl));
        newRoot.append(newRule);
    });

    return newRoot.toString();
}

async function main() {
    try {
        let css: string;
        let out_path: string | null = null;

        if (process.argv[2]) {
            css = readFileSync(resolve(process.argv[2]), 'utf-8');
            out_path = 'collated.css';
        } else {
            if (process.stdin.isTTY) {
                console.error('Usage:');
                console.error('  collate-selectors <file.css>');
                console.error('  cat file.css | collate-selectors');
                process.exit(1);
            }
            css = await readStdin();
        }

        css = await collateSelectors(css);

        if (out_path) {
            writeFileSync(out_path, css, 'utf-8');
            console.log(`Collated CSS written to: ${out_path}`);
        } else {
            process.stdout.write(css);
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
