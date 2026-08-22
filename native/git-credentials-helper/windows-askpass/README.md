# Windows Git askpass helper

This directory builds the small Windows executable used by Git to request one
credential field from Godot Launcher's attempt-owned loopback service. It does
not store credentials, open a user interface, or make non-loopback connections.

The private protocol uses a fixed 49-byte request containing `GLAP`, protocol
version 1, the requested credential kind, and the 43-byte session reference.
The response contains an eight-byte versioned header, a bounded two-byte body
length, and the credential bytes.

Requirements:

- Windows 10 or later
- Node.js 24 and the repository's npm dependencies
- Visual Studio 2022 Build Tools with the Desktop development with C++ workload

Build the current architecture with `npm run build:native:git-askpass`. Build
both shipping architectures with `npm run build:native:git-askpass:windows`.
Outputs are written to `out/win32-x64/` and `out/win32-arm64/` and are ignored by
Git.

Run the native black-box checks with `npm run test:native:git-askpass`. Release
builds require the raw executable to be signed through the SignPath artifact
configuration named `release-windows-helper` before it is packaged. That remote
configuration is maintained manually and is not created by this repository.
