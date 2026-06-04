/**
 * Rasterizes the app icon (build/icon.svg) to build/icon.png. electron-builder derives
 * the platform formats (.ico/.icns) from this PNG. The SVG is the source of truth and is
 * versioned; the PNG is generated (and git-ignored), mirroring how the bundles are handled.
 * Run: npm run icon:gen
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const SIZE = 1024;
const svgPath = path.resolve('build/icon.svg');
const outPath = path.resolve('build/icon.png');

const resvg = new Resvg(readFileSync(svgPath, 'utf8'), { fitTo: { mode: 'width', value: SIZE } });
writeFileSync(outPath, resvg.render().asPng());
console.log(`Icon geschrieben: ${outPath} (${SIZE}x${SIZE})`);
