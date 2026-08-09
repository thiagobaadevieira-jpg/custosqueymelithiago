import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');

for (const size of [192, 512]) {
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
  console.log(`wrote public/icon-${size}.png`);
}
