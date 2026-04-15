/*
 * lessify
 * Copyright (C) 2026–present ninetailedtori
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 */

import { collateSelectors, filterColours, lessify } from '../dist/index.js';
import fs from 'fs';

async function main() {
    const input = fs.readFileSync('demo/css/in.1.css', 'utf-8');

    console.log('filtering colours...in.1.css => filtered.2.css');
    const filtered = filterColours(input);
    fs.writeFileSync('demo/css/filtered.2.css', filtered);

    console.log('collating selectors...filtered.2.css => collated.3.css');
    const collated = collateSelectors(filtered);
    fs.writeFileSync('demo/css/collated.3.css', collated);

    console.log('lessifying...collated.3.css => lessified.4.less');
    const lessified = lessify(collated);
    fs.writeFileSync('demo/css/lessified.4.less', lessified);

    console.log('lessification complete!');
}

main().catch(console.error);
