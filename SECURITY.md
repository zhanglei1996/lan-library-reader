# Security Policy

## Supported versions

Security fixes are applied to the latest code on the `main` branch.

## Reporting a vulnerability

Please do not publish sensitive vulnerability details in a public Issue.
Use GitHub's private vulnerability reporting feature on this repository when
available. Include the affected version, reproduction steps, impact, and any
suggested mitigation.

## Deployment model

LAN Library Reader is designed for trusted local networks. It does not provide
authentication or transport encryption. Do not expose its port directly to the
public internet or run it on an untrusted public Wi-Fi network.

The document API is intentionally read-only and restricts access to the
selected library root. It blocks hidden files, path traversal, and symbolic
links that resolve outside the library. The only state-changing endpoint
gracefully stops the running server; it requires a per-instance random secret
stored in a user-only local registration file and is used by the
`lan-reader stop` command.
