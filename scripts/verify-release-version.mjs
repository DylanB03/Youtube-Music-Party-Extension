import { readFile } from "node:fs/promises";

const releaseTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!releaseTag) {
  throw new Error(
    "Pass a release tag (for example, v0.1.4) or set GITHUB_REF_NAME.",
  );
}

const [rootPackage, extensionPackage] = await Promise.all([
  readPackageJson("package.json"),
  readPackageJson("apps/extension/package.json"),
]);
const expectedTag = `v${extensionPackage.version}`;

if (releaseTag !== expectedTag) {
  throw new Error(
    `Release tag ${releaseTag} does not match extension version ${extensionPackage.version}; expected ${expectedTag}.`,
  );
}

if (rootPackage.version !== extensionPackage.version) {
  throw new Error(
    `Root version ${rootPackage.version} does not match extension version ${extensionPackage.version}.`,
  );
}

console.log(`Verified release tag ${releaseTag} for TogetherTune ${extensionPackage.version}.`);

async function readPackageJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
