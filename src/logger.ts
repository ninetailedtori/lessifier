// SPDX-FileCopyrightText: 2026-Present ninetailedtori <ninetailedtori@uwu.gal>
// Copyright (C) 2026–present ninetailedtori
//
// SPDX-License-Identifier: GPL-3.0-or-later

const COLOURS = {
    debug: "\x1b[36m",
    log: "\x1b[32m",
    success: "\x1b[34m",
    warn: "\x1b[33m",
    error: "\x1b[31m"
} as const;

const RESET = "\x1b[0m";
const PAD_WIDTH = 20;

const PADDED_LEVELS = {
    debug: "DEBUG  ",
    log: "LOG    ",
    success: "SUCCESS",
    warn: "WARN   ",
    error: "ERROR  "
} as const;

const LOG_LEVELS = {
    debug: 0,
    log: 1,
    warn: 2,
    error: 3
} as const;

type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

function parseLogLevel(envValue: string | undefined): LogLevel {
    if (!envValue) return LOG_LEVELS.log;
    const level = LOG_LEVELS[envValue.toLowerCase() as keyof typeof LOG_LEVELS];
    return level !== undefined ? level : LOG_LEVELS.log;
}

const currentLogLevel = parseLogLevel(process.env.LOG_LEVEL);

const CALLER_CACHE = new Map<string, string>();
const CACHE_MAX_SIZE = 256;

function getCaller(stackLine: string): string {
    const atIdx = stackLine.indexOf("at ");
    if (atIdx === -1) return "anonymous";

    let start = atIdx + 3;
    let end = stackLine.indexOf("(", start);

    if (end === -1) end = stackLine.length;

    while (start < end && stackLine.charCodeAt(start) === 32) start++;
    while (end > start && stackLine.charCodeAt(end - 1) === 32) end--;

    if (start >= end) return "anonymous";

    const caller = stackLine.slice(start, end);
    const dot = caller.lastIndexOf(".");
    return dot === -1 ? caller : caller.slice(dot + 1);
}

function getCallerNameCached(): string {
    const stack = new Error().stack;
    if (!stack) return "anonymous";

    const lines = stack.split("\n");
    if (lines.length < 5) return "anonymous";

    const stackLine = lines[4];
    if (!stackLine) return "anonymous";

    let caller = CALLER_CACHE.get(stackLine);
    if (caller !== undefined) return caller;

    caller = getCaller(stackLine);

    if (CALLER_CACHE.size >= CACHE_MAX_SIZE) {
        const oldestKey = CALLER_CACHE.keys().next().value as
            | string
            | undefined;
        if (oldestKey !== undefined) {
            CALLER_CACHE.delete(oldestKey);
        }
    }

    CALLER_CACHE.set(stackLine, caller);
    return caller;
}

const PAD_CACHE = new Map<string, string>();
const SPACE_64 = " ".repeat(64);

function padRightCached(str: string, width: number): string {
    if (width !== PAD_WIDTH) {
        const need = width - str.length;
        return need > 0 ? str + SPACE_64.slice(0, need) : str;
    }

    let padded = PAD_CACHE.get(str);
    if (padded === undefined) {
        const need = PAD_WIDTH - str.length;
        padded = need > 0 ? str + SPACE_64.slice(0, need) : str;
        if (PAD_CACHE.size < 512) {
            PAD_CACHE.set(str, padded);
        }
    }
    return padded;
}

interface LogConfig {
    level: LogLevel;
    levelName: keyof typeof PADDED_LEVELS;
    colour: string;
    stream: "log" | "warn" | "error";
}

const LOG_CONFIGS = {
    debug: {
        level: LOG_LEVELS.debug,
        levelName: "debug",
        colour: COLOURS.debug,
        stream: "error"
    },
    log: {
        level: LOG_LEVELS.log,
        levelName: "log",
        colour: COLOURS.log,
        stream: "log"
    },
    success: {
        level: LOG_LEVELS.log,
        levelName: "success",
        colour: COLOURS.success,
        stream: "log"
    },
    warn: {
        level: LOG_LEVELS.warn,
        levelName: "warn",
        colour: COLOURS.warn,
        stream: "warn"
    },
    error: {
        level: LOG_LEVELS.error,
        levelName: "error",
        colour: COLOURS.error,
        stream: "error"
    }
} as const;

function formatLogMessage(msg: string, config: LogConfig): string {
    const caller = padRightCached(getCallerNameCached(), PAD_WIDTH);
    const level = PADDED_LEVELS[config.levelName];
    return `${config.colour}[${level}]${RESET} ${caller} : ${msg}`;
}

function doLog(
    key: keyof typeof LOG_CONFIGS,
    msg: string,
    args: unknown[]
): void {
    const config = LOG_CONFIGS[key];
    if (currentLogLevel > config.level) return;

    const formatted = formatLogMessage(msg, config);
    const stream = console[config.stream] as (...args: unknown[]) => void;

    if (args.length) {
        stream(formatted, ...args);
    } else {
        stream(formatted);
    }
}

export const logger = {
    debug: (msg: string, ...args: unknown[]) => doLog("debug", msg, args),
    log: (msg: string, ...args: unknown[]) => doLog("log", msg, args),
    success: (msg: string, ...args: unknown[]) => doLog("success", msg, args),
    warn: (msg: string, ...args: unknown[]) => doLog("warn", msg, args),
    error: (msg: string, ...args: unknown[]) => doLog("error", msg, args)
};
