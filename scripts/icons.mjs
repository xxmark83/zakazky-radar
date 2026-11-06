// Ikony PWA (ikona na ploše) z loga MB: bílé logo na modré. Spustit jen při změně loga: node scripts/icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const path = readFileSync("lib/logo.ts", "utf8").match(/"(M[^"]+)"/)[1];
// logo 456×312 do čtverce; „maskable“ má větší okraj, protože ho Android ořízne do kruhu
const svg = (size, pad) => {
  const w = size * (1 - 2 * pad);
  const s = w / 456;
  const x = (size - w) / 2;
  const y = (size - 312 * s) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#1f5eff"/>` +
      `<path transform="translate(${x} ${y}) scale(${s})" fill="#fff" fill-rule="evenodd" d="${path}"/></svg>`,
  );
};
for (const [file, size, pad] of [
  ["public/icon-192.png", 192, 0.16],
  ["public/icon-512.png", 512, 0.16],
  ["public/icon-maskable-512.png", 512, 0.26],
  ["public/apple-touch-icon.png", 180, 0.16],
]) {
  await sharp(svg(size, pad)).png().toFile(file);
  console.log(file);
}
