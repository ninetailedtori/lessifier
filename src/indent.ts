// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

export class Indent {
    style: "space" | "tab";
    size: number;

    constructor(style: "space" | "tab" = "space", size: number = 2) {
        if (size <= 0) {
            throw new Error(`invalid indent-size: must be positive`);
        }
        this.style = style;
        this.size = size;
    }

    static from(opts: { style: string; size: number }): Indent {
        let style: "space" | "tab" = "space";
        let size = 2;

        if (opts.style && opts.style !== "space" && opts.style !== "tab") {
            throw new Error(`unsupported indent-style: ${opts.style}`);
        }
        if (opts.style) style = opts.style as "space" | "tab";

        if (opts.size > 0) {
            size = opts.size;
        }

        return new Indent(style, size);
    }

    toString(): string {
        return this.style === "tab" ? "\t" : " ".repeat(this.size);
    }
}
