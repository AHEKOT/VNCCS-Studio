# VNCCS Studio

VNCCS Studio is a standalone desktop UI for ComfyUI with VNCCS installed.
Enter the URL of your ComfyUI server under **Settings**. ComfyUI provides
the nodes, models, widgets, and saved assets. Studio communicates with
that server over HTTP and WebSocket.

## Build and run

Use Node.js 22 or later, pnpm 10, and a Rust toolchain. Run these commands
from the repository root.

```sh
cd app
pnpm install --frozen-lockfile
pnpm tauri dev
pnpm tauri build --bundles app  # macOS application
pnpm tauri build              # Windows installer on Windows
```

Use `pnpm test` for the client tests and `pnpm typecheck` for type checks.
The desktop app embeds the scene and Pose Studio hosts in Tauri. Browser
development mode (`pnpm dev`) uses the corresponding host routes when
they are available on the configured server.

## Layout

- `app/apps/native` contains the Next.js frontend and Tauri shell.
- `app/packages/core` contains the editor pages, state, and hooks.
- `app/packages/ui` contains the shared components and styles.
- `app/packages/vnccs` contains the client for the ComfyUI API.
