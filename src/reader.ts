/*
 * lessify
 * Copyright (C) 2026–present ninetailedtori
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 */

const MAX_SIZE = 50 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const CHUNK_BUFFER: Buffer[] = [];

export async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        CHUNK_BUFFER.length = 0;
        let totalSize = 0;
        let timedOut = false;

        process.stdin.setEncoding('utf-8');

        const timeout = setTimeout(() => {
            timedOut = true;
            process.stdin.destroy();
            reject(new Error('stdin read timeout (30s)'));
        }, TIMEOUT_MS);

        const cleanup = () => {
            clearTimeout(timeout);
            process.stdin.removeAllListeners();
        };

        process.stdin.on('data', (chunk: Buffer | string) => {
            if (timedOut) return;

            const buf =
                typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
            const chunkSize = buf.length;

            totalSize += chunkSize;

            if (totalSize > MAX_SIZE) {
                cleanup();
                process.stdin.destroy();
                reject(
                    new Error(`Input exceeds maximum size of ${MAX_SIZE} bytes`)
                );
                return;
            }

            CHUNK_BUFFER.push(buf);
        });

        process.stdin.on('end', () => {
            cleanup();

            const result = Buffer.concat(CHUNK_BUFFER, totalSize).toString(
                'utf-8'
            );
            resolve(result);
        });

        process.stdin.on('error', (err) => {
            cleanup();
            reject(err);
        });
    });
}
