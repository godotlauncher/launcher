# Windows Git credential client

This directory builds the small Windows executable used by Git as an askpass
client and as a destination-bound credential helper for automated publication.
It does not store credentials, open a user interface, or make non-loopback
connections.

The private protocol uses a fixed 49-byte request containing `GLAP`, protocol
version 1, the requested credential kind, and the 43-byte session reference.
Destination-bound helper requests use a fixed version 2 frame that also carries
the bounded Git credential protocol, host, and repository path. The loopback
server releases a publication credential only when all three fields exactly
match the confirmed repository URL.
The response contains an eight-byte versioned header, a bounded two-byte body
length, and the credential bytes.

Requirements:

- Windows 10 or later
- Node.js 24 and the repository's npm dependencies
- Visual Studio 2019 or later with the Desktop development with C++ workload
  and the MSVC ARM64 build tools

The helper source is C and is built directly through its MSBuild project. The
Visual Studio workload supplies MSBuild, the MSVC compiler and linker, the
Windows SDK, and the resource compiler. Python, GYP, CMake, and Node headers are
not required. Run the build commands from a Visual Studio Developer PowerShell
or Developer Command Prompt so `msbuild` is available on `PATH`.

Build one architecture with `npm run build:native:git-askpass:x64` or
`npm run build:native:git-askpass:arm64`. Build both shipping architectures with
`npm run build:native:git-askpass:windows`. Outputs are written to
`out/win32-x64/` and `out/win32-arm64/` and are ignored by Git.

Run the native black-box checks with `npm run test:native:git-askpass`. Release
builds require the raw executable to be signed through the SignPath artifact
configuration named `release-windows-helper` before it is packaged. That remote
configuration is maintained manually and is not created by this repository.
