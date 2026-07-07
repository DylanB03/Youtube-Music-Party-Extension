import { access, readFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("apps/extension/.output/chrome-mv3");
const releaseEnvironment = await readFile(
  path.resolve("apps/extension/.env.production"),
  "utf8",
);
const configuredBackendUrl = releaseEnvironment
  .split(/\r?\n/)
  .find((line) => line.startsWith("WXT_PUBLIC_PARTY_API_BASE_URL="))
  ?.slice("WXT_PUBLIC_PARTY_API_BASE_URL=".length)
  .trim();
assertConfiguredBackend(configuredBackendUrl);
const configuredBackendOrigin = new URL(configuredBackendUrl).origin;
const manifest = JSON.parse(
  await readFile(path.join(outputDirectory, "manifest.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertConfiguredBackend(value) {
  if (!value?.startsWith("https://")) {
    throw new Error(".env.production must define an HTTPS backend URL.");
  }
}

assert(manifest.manifest_version === 3, "Release must use Manifest V3.");
assert(manifest.minimum_chrome_version === "116", "Release must require Chrome 116.");
assert(manifest.action?.default_icon, "Release must expose a toolbar action.");
assert(!manifest.permissions?.includes("tabs"), "Release must not request broad tabs access.");
assert(
  manifest.host_permissions?.includes("https://music.youtube.com/*"),
  "Release must be scoped to YouTube Music.",
);
assert(
  manifest.host_permissions?.some((origin) =>
    origin.startsWith(`${configuredBackendOrigin}/`),
  ),
  "Release must target the production HTTPS backend.",
);
assert(
  manifest.host_permissions?.every((origin) => origin.startsWith("https://")),
  "Release host permissions must all use HTTPS.",
);

for (const size of [16, 32, 48, 128]) {
  const iconPath = manifest.icons?.[String(size)];
  assert(iconPath, `Release is missing its ${size}px icon declaration.`);
  await access(path.join(outputDirectory, iconPath));
}

console.log("Verified production extension manifest, permissions, backend, and icons.");
