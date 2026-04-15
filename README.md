# lessifier

Converts your flat pure CSS into nested LESS syntax. Say goodbye to the days
of manually refactoring messy scraped CSS!

## what does it do?

You feed it CSS, it spits out LESS with proper nesting. Handles
pseudo-selectors, functional selectors like `:is()` and
`:where()`, and combinator relationships.

```bash
lessifier [input.css] [output.less]
# or
cat [input.css] | lessifier
```

## quick example

**input:**

```css
.button {
    background: #005ea2;
    color: white;
}

.button:hover {
    background: #1a4480;
}

.button:focus {
    outline: 2px solid #2491ff;
}
```

**output:**

```less
.button {
    background: #005ea2;
    color: white;

    &:hover {
        background: #1a4480;
    }

    &:focus {
        outline: 2px solid #2491ff;
    }
}
```

## install

```bash
npm install -D lessifier
```

## how it works

1. Tokenises selectors (respects `>`, `+`, `~`, `:not()`, `::before`, etc.)
2. Builds a tree of selector relationships
3. Generates LESS with proper `&` references and nesting

## weird edge cases it handles

- Functional pseudo-selectors with nested parentheses: `:not(.active:hover)`
- Chained pseudo-elements: `::-webkit-slider-runnable-track:active`
- Multiple selectors with the same rules (get grouped)

## what it doesn't do

- Preserve comments (yet)
- Handle `@media`, `@keyframes`, etc.
  (they'll confuse the lexer, so we remove them)
- Minify (only groups same-level selectors with the same rules together)
- Generate source maps

## dev

```bash
npm run build
npm test
```

## license

[GPL-3.0 or later](/LICENSE)
