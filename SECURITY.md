# Security Policy

## Reporting a vulnerability

Please do not disclose exploitable vulnerabilities or credentials in a public issue. Use GitHub's private vulnerability reporting feature for this repository when available. If private reporting is unavailable, open a minimal issue asking the maintainer for a private contact channel without including technical exploit details.

Include the affected version, impact, reproduction conditions, and any suggested mitigation. Reports will be acknowledged as soon as practical.

## Supported version

Until the first stable release, only the latest published Chrome Web Store version and the current `main` branch receive security fixes.

## Dependency audit scope

CI blocks high-severity findings in production dependencies. The extension ZIP contains compiled browser assets and no `node_modules` tree. WXT and its browser-launch helpers are development-only tools; upstream advisories in those tools are tracked separately and do not ship in the Chrome Web Store archive.
