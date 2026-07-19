# Contributing to Agent City

Thank you for helping build Agent City.

## Before you start

- Search existing issues and pull requests before beginning a large change.
- Discuss broad architecture, data-format, security, or product changes in an
  issue first.
- Keep personal data, credentials, local databases, generated build output, and
  machine-specific paths out of commits.
- Only submit code and assets that you have the right to contribute under
  `AGPL-3.0-only`.

## Development setup

Requirements: Node.js 22.5 or newer and npm.

```bash
npm ci
npm --prefix apps/server ci
npm --prefix apps/web ci
./start-dev.sh
```

## Required checks

Run these before opening a pull request:

```bash
npm --prefix apps/server test
npm --prefix apps/web test
npm --prefix apps/web run build
```

Add or update tests when changing behavior. Keep compatibility code unless the
pull request includes a migration strategy and regression coverage.

## Pull requests

- Create a branch in your fork.
- Keep the change focused and explain its user impact.
- Describe the checks you ran.
- Include screenshots for visible UI changes.
- Do not commit generated `dist`, Tauri build, runtime database, or temporary
  comparison files.

All pull requests are reviewed before merge. Passing automation does not
guarantee acceptance.

## Reporting security issues

Do not disclose vulnerabilities or real credentials in a public issue. Follow
[SECURITY.md](SECURITY.md).
