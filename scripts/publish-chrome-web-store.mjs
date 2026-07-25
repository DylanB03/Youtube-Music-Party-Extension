import { access, readFile } from "node:fs/promises";
import path from "node:path";

const accessToken = requireEnvironmentVariable("CWS_ACCESS_TOKEN");
const publisherId = requireEnvironmentVariable("CWS_PUBLISHER_ID");
const extensionId = requireEnvironmentVariable("CWS_EXTENSION_ID");
const extensionPackage = JSON.parse(
  await readFile("apps/extension/package.json", "utf8"),
);
const zipPath = path.resolve(
  process.env.CWS_ZIP_PATH ??
    `apps/extension/.output/${extensionPackage.name}-${extensionPackage.version}-chrome.zip`,
);

await access(zipPath);

const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
const authorizationHeaders = {
  authorization: `Bearer ${accessToken}`,
};

console.log(`Uploading ${path.relative(process.cwd(), zipPath)} to Chrome Web Store.`);
const upload = await requestJson(
  `https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload`,
  {
    method: "POST",
    headers: {
      ...authorizationHeaders,
      "content-type": "application/zip",
    },
    body: await readFile(zipPath),
  },
  "Package upload",
);

await waitForUpload(upload.uploadState);

if (upload.crxVersion && upload.crxVersion !== extensionPackage.version) {
  throw new Error(
    `Chrome Web Store read version ${upload.crxVersion}, but the extension package is ${extensionPackage.version}.`,
  );
}

console.log("Upload succeeded. Submitting the extension for review.");
const submission = await requestJson(
  `https://chromewebstore.googleapis.com/v2/${itemName}:publish`,
  {
    method: "POST",
    headers: {
      ...authorizationHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      publishType: "DEFAULT_PUBLISH",
      blockOnWarnings: true,
    }),
  },
  "Publish submission",
);

console.log(
  `Chrome Web Store accepted version ${extensionPackage.version}; submission state: ${submission.state ?? "unknown"}.`,
);

const warnings = submission.warningInfo?.warnings ?? [];
for (const warning of warnings) {
  console.warn(
    `Chrome Web Store warning (${warning.reason ?? "unknown"}): ${warning.description ?? "No description"}`,
  );
}

async function waitForUpload(initialState) {
  if (initialState === "SUCCEEDED") return;
  if (initialState === "FAILED") {
    throw new Error("Chrome Web Store reported that the package upload failed.");
  }
  if (initialState !== "IN_PROGRESS") {
    throw new Error(
      `Chrome Web Store returned an unexpected upload state: ${initialState ?? "missing"}.`,
    );
  }

  for (let attempt = 1; attempt <= 24; attempt += 1) {
    await delay(5_000);
    const status = await requestJson(
      `https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`,
      { headers: authorizationHeaders },
      "Upload status check",
    );
    const state = status.lastAsyncUploadState;

    if (state === "SUCCEEDED") return;
    if (state === "FAILED") {
      throw new Error("Chrome Web Store reported that the package upload failed.");
    }

    console.log(`Upload is still processing (${attempt}/24).`);
  }

  throw new Error("Chrome Web Store upload did not finish within two minutes.");
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  let responseBody = {};

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { responseText };
    }
  }

  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status} ${response.statusText}): ${JSON.stringify(responseBody)}`,
    );
  }

  return responseBody;
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
