import path from "node:path";
import sharp from "sharp";

const sourcePath = path.resolve("store/assets/icon-source-v3.svg");
const storeIconPath = path.resolve("store/assets/icon-128.png");
const extensionIconDirectory = path.resolve("apps/extension/public/icon");

await sharp(sourcePath, { density: 768 })
  .resize(128, 128, { kernel: "lanczos3" })
  .png()
  .toFile(storeIconPath);

for (const size of [16, 32, 48, 128]) {
  await sharp(sourcePath, { density: 768 })
    .resize(size, size, { kernel: "lanczos3" })
    .png()
    .toFile(path.join(extensionIconDirectory, `${size}.png`));
}

console.log("Built the store icon and 16, 32, 48, and 128 px extension icons.");
