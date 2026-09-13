// SPDX-License-Identifier: GPL-3.0-or-later

import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
execFileSync('node_modules/.bin/tsc', ['--project', 'tsconfig.build.json'], { stdio: 'inherit' });
await cp('metadata.json', 'dist/metadata.json');
await cp('stylesheet.css', 'dist/stylesheet.css');
await mkdir('dist/schemas', { recursive: true });
await cp(
  'schemas/org.gnome.shell.extensions.zonecraft.gschema.xml',
  'dist/schemas/org.gnome.shell.extensions.zonecraft.gschema.xml',
);
