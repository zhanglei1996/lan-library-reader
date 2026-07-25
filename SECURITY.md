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

The server is intentionally read-only and restricts access to the selected
library root. It blocks non-read HTTP methods, hidden files, path traversal,
and symbolic links that resolve outside the library.
