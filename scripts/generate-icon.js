/**
 * Generates assets/icon.png (256×256) and assets/icon.ico
 * — pixel glasses + eyes matching the in-app art, gray-white bg, black frames.
 *
 * Run: node scripts/generate-icon.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pngToIco = require('png-to-ico');

const OUT_PNG = path.join(__dirname, '..', 'assets', 'icon.png');
const OUT_ICO = path.join(__dirname, '..', 'assets', 'icon.ico');

const OPEN = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 3, 3, 3, 3, 1, 0, 0],
  [0, 0, 1, 3, 5, 2, 3, 1, 0, 0],
  [0, 0, 1, 3, 2, 2, 3, 1, 0, 0],
  [0, 0, 1, 3, 3, 3, 3, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const GLASSES = [
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 0],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6],
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 0],
];

/** RGBA for icon (index matches renderer palette; 6 = black glasses) */
const PAL = {
  1: [244, 244, 244, 255], // sclera
  2: [10, 10, 10, 255],    // pupil
  3: [68, 114, 216, 255],  // iris
  5: [221, 232, 255, 255], // highlight
  6: [10, 10, 10, 255],    // glasses — black
};

const BG = [236, 236, 236, 255];

function fillBg(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i]     = BG[0];
    png.data[i + 1] = BG[1];
    png.data[i + 2] = BG[2];
    png.data[i + 3] = BG[3];
  }
}

function drawGrid(png, grid, ox, oy, scale) {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const v = grid[row][col];
      if (v === 0) continue;
      const c = PAL[v];
      if (!c) continue;
      const x0 = ox + col * scale;
      const y0 = oy + row * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
          const i = (png.width * y + x) * 4;
          png.data[i]     = c[0];
          png.data[i + 1] = c[1];
          png.data[i + 2] = c[2];
          png.data[i + 3] = c[3];
        }
      }
    }
  }
}

function drawBridge(png, oxLeft, oy, scale) {
  const c = PAL[6];
  const x0 = oxLeft + 10 * scale;
  const w = 4 * scale;
  for (let row = 3; row <= 4; row++) {
    const y0 = oy + row * scale;
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        const i = (png.width * y + x) * 4;
        png.data[i] = c[0];
        png.data[i + 1] = c[1];
        png.data[i + 2] = c[2];
        png.data[i + 3] = c[3];
      }
    }
  }
}

async function main() {
  const W = 256;
  const H = 256;
  const scale = 8;
  const artW = 10 * scale + 4 * scale + 10 * scale; // 192
  const artH = 8 * scale; // 64
  const ox = Math.floor((W - artW) / 2);
  const oy = Math.floor((H - artH) / 2);

  const png = new PNG({ width: W, height: H });
  fillBg(png);

  const oxRight = ox + 14 * scale; // 10 + gap 4

  drawGrid(png, OPEN, ox, oy, scale);
  drawGrid(png, OPEN, oxRight, oy, scale);
  drawGrid(png, GLASSES, ox, oy, scale);
  drawGrid(png, GLASSES, oxRight, oy, scale);
  drawBridge(png, ox, oy, scale);

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  await new Promise((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(OUT_PNG)).on('finish', resolve).on('error', reject);
  });

  const icoBuf = await pngToIco(OUT_PNG);
  fs.writeFileSync(OUT_ICO, icoBuf);

  console.log('Wrote', OUT_PNG);
  console.log('Wrote', OUT_ICO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
