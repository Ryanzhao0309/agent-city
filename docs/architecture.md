# Architecture

This document describes the current Agent City runtime and the boundaries that
matter for contributors.

## Runtime components

```text
Browser or Tauri webview
        |
        v
React client (apps/web)
        |
        | HTTP / Server-Sent Events
        v
Fastify server (apps/server)
        |
        +-- SQLite city and task data
        +-- local Agent configuration
        +-- approved workspace access
        +-- external AI and connector requests
```

The web client owns the interactive city canvas and local UI state. The server
owns persistence, Agent execution, approvals, scheduled tasks, knowledge
indexing, connector access, and filesystem boundaries.

The Docker image compiles the web client and serves it from the Fastify process.
The Tauri app packages the same server as a sidecar and opens the web client in
a native macOS window.

## Data boundaries

The default server data directory is `apps/server/data`. Packaged desktop
builds use an application-specific local data directory instead.

Runtime data can include:

- city layouts and saved layout schemes;
- Agent profiles and workspace selections;
- conversations, run history, approvals, and schedules;
- knowledge documents and assignment metadata;
- connector configuration.

These directories are ignored by Git and are not part of the source
distribution. The desktop packaging script creates an empty seed database and
does not read developer runtime data.

On macOS, configured secrets are written to Keychain. Database records retain
only the secret key and configuration state after migration.

## Agent execution boundary

Each Agent is granted a selected workspace root and explicit capability
permissions. Path resolution rejects traversal outside the authorized root,
including symbolic-link escapes. Mutating tools pause for user approval before
performing an operation.

Network reads reject private, loopback, link-local, and cloud metadata
addresses. Redirect targets and response sizes are checked as well.

These controls reduce risk but do not turn untrusted prompts or skills into
trusted code. Treat imported skills and external content as untrusted input.

## Theme packages

Built-in themes are currently compile-time data and bundled assets. A future
community registry will load a versioned catalog from a separate public
repository.

A remote theme package should be declarative and include:

- a versioned JSON manifest;
- preview, map, building, terrain, and decoration images;
- author and license metadata;
- file sizes and SHA-256 hashes.

The application must validate the manifest, enforce download limits, verify
hashes, reject unsafe paths, and refuse executable content. Publication should
require passing CI plus explicit maintainer approval.

## Compatibility

Layout migration and legacy-field normalization in the server and client are
intentional compatibility code. Do not remove them as unused code without a
documented data migration and regression tests.
