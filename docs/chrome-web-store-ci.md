# Chrome Web Store release automation

The `Publish Chrome extension` GitHub Actions workflow builds, verifies, uploads,
and submits a release whenever a version tag such as `v0.1.4` is pushed. Chrome
publishes the update with the listing's existing visibility after it passes the
normal Web Store review.

The workflow uses Chrome Web Store API v2 and GitHub OpenID Connect (OIDC). OIDC
gives each workflow run a short-lived Google access token, so no Google key or
OAuth refresh token needs to be stored in GitHub.

## One-time setup

### 1. Create the Chrome Web Store service account

1. Select or create a project in Google Cloud.
2. Enable the **Chrome Web Store API** for that project.
3. Create a Google Cloud service account. It does not need a project role for
   the Web Store API itself.
4. In the Chrome Web Store Developer Dashboard, open **Account** and add that
   service account's email address. Chrome currently permits one service account
   per publisher.
5. Copy the publisher ID from **Publisher > Settings** and the extension ID from
   the extension's Web Store URL or dashboard page.

The listing must already exist, and its Store listing, Privacy, and visibility
settings must have been completed manually. If visibility was just changed,
publish that visibility change manually once before relying on the API.

### 2. Trust this GitHub repository through Google Workload Identity Federation

Create a Workload Identity Pool and OIDC provider in Google Cloud with:

- Issuer: `https://token.actions.githubusercontent.com`
- Attribute mappings:
  - `google.subject=assertion.sub`
  - `attribute.repository=assertion.repository`
  - `attribute.ref=assertion.ref`
- Attribute condition:
  `assertion.repository == 'DylanB03/Youtube-Music-Party-Extension' && assertion.ref.startsWith('refs/tags/v')`

Grant identities from this repository the **Workload Identity User**
(`roles/iam.workloadIdentityUser`) role on the service account. The workflow
does not use domain-wide delegation, so the broader **Service Account Token
Creator** role is not required.

Use this repository-specific principal set when granting those roles:

```text
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository/DylanB03/Youtube-Music-Party-Extension
```

Use the numeric Google Cloud project number in that principal, not the project
ID. Google and GitHub's OIDC documentation covers the Cloud Console and `gcloud`
setup paths.

### 3. Configure the GitHub deployment environment

In the GitHub repository, create an environment named `chrome-web-store`. Add
these environment variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name, beginning with `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/` |
| `GCP_SERVICE_ACCOUNT` | Service account email address |
| `CWS_PUBLISHER_ID` | Publisher ID from the Chrome Web Store dashboard |
| `CWS_EXTENSION_ID` | Existing Chrome Web Store extension ID |

These identifiers are not credentials, so environment variables are sufficient;
the short-lived credential is generated during the workflow. Restrict the
environment's deployment tags to `v*.*.*`. Optionally add a required reviewer if
you want a final approval click before a submission; omit the reviewer for fully
automatic submission.

## Release an update

Chrome requires every uploaded manifest version to be higher than the last one.
Bump the monorepo and extension versions together, commit the result, then push a
matching tag:

```sh
npm version patch --workspaces --include-workspace-root --no-git-tag-version
npm run check
npm test
git add package.json package-lock.json apps/*/package.json packages/*/package.json
git commit -m "Release v0.1.4"
git tag v0.1.4
git push origin main v0.1.4
```

Replace `v0.1.4` with the version written by `npm version`. The workflow refuses
to publish if the tag, root package version, and extension package version do not
match. A failed run can be re-run from GitHub Actions without creating another
tag.

The uploaded ZIP remains available as a GitHub Actions artifact for 30 days. The
submission blocks on Chrome validation warnings and leaves the current store
visibility unchanged.
