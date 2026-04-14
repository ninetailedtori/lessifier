import * as process from 'node:process';

export async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        const MAX_SIZE = 50 * 1024 * 1024;
        process.stdin.setEncoding('utf-8');

        const timeout = setTimeout(() => {
            reject(new Error('stdin read timeout (30s)'));
        }, 30000);

        process.stdin.on('data', (chunk: string) => {
            data += chunk;
            if (data.length > MAX_SIZE) {
                clearTimeout(timeout);
                reject(
                    new Error(`Input exceeds maximum size of ${MAX_SIZE} bytes`)
                );
                process.stdin.destroy();
            }
        });

        process.stdin.on('end', () => {
            clearTimeout(timeout);
            resolve(data);
        });

        process.stdin.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
