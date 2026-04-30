/**
 * Generate PWA icons from public/favicon.svg.
 * Reads the brand SVG, rasterizes to PNG at multiple sizes,
 * and writes them under public/icons/.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'favicon.svg');
const outDir = join(root, 'public', 'icons');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath);
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// iOS splash for iPhone 14 Pro Max (1170×2532). Center the 512px icon
// on a navy background.
const iconBuf = await sharp(svg, { density: 768 })
  .resize(512, 512)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1170,
    height: 2532,
    channels: 4,
    background: { r: 10, g: 22, b: 40, alpha: 1 },
  },
})
  .composite([{ input: iconBuf, gravity: 'center' }])
  .png()
  .toFile(join(outDir, 'splash-1170x2532.png'));

console.log('✓ splash-1170x2532.png');
console.log('Done.');
