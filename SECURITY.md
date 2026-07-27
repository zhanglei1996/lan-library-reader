# Security Policy

## Supported versions

Security fixes are applied to the latest code on the `main` branch.

## Reporting a vulnerability

Please do not publish sensitive vulnerability details in a public Issue.
Use GitHub's private vulnerability reporting feature on this repository when
available. Include the affected version, reproduction steps, impact, and any
suggested mitigation.

## Deployment model

LAN Library Reader is designed for local networks. It does not provide transport
encryption. Do not expose its port directly to the public internet or run it on
an untrusted public Wi-Fi network.

Authentication is optional. `lan-reader --protect` creates a temporary access
code, while `LAN_READER_ACCESS_CODE` supplies a fixed code through the
environment. Successful login creates a 12-hour, HttpOnly, SameSite=Strict
session cookie. Failed logins are rate limited. Because the service normally
uses HTTP on the LAN, use a unique access code and treat authentication as an
additional local safeguard rather than encrypted remote access.

The document API is intentionally read-only and restricts access to the
selected library root. It blocks hidden files, path traversal, symbolic links
that resolve outside the library, and unconfigured source file types. Text and
source previews are rendered as data and are never executed. The state-changing
authentication endpoints only create or clear in-memory sessions. The other
state-changing endpoint
gracefully stops the running server; it requires a per-instance random secret
stored in a user-only local registration file and is used by the
`lan-reader stop` command.
