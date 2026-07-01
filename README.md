# Motrix Next Web Service

This fork adds a browser-based Motrix Next web service for Linux container deployment. The web app listens on port `47000`, proxies `/jsonrpc` to aria2, and uses `/downloads` as the default download directory.

The original project README is preserved here: [README-UPSTREAM.md](./README-UPSTREAM.md).

## What Changed

- Adds a Web mode for browser deployment while keeping the original Tauri desktop path intact.
- Replaces Tauri-only APIs with browser shims when `VITE_WEB_APP=true`.
- Proxies aria2 JSON-RPC through `/jsonrpc`.
- Serves static web assets and aria2 from a single Docker container.
- Uses Vivibit branding in the sidebar logo, linking to [vivibit.com](https://www.vivibit.com/).

## Web Build

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
```

Run the web app in development mode:

```bash
pnpm start:web
```

Build the web assets:

```bash
pnpm build:web
```

In web mode, Tauri-only desktop APIs are replaced by browser shims, while aria2 calls go through `/jsonrpc`. The development server proxies `/jsonrpc` to `127.0.0.1:29100`, so start aria2 separately when running `pnpm start:web` outside Docker.

Example local aria2 command:

```bash
mkdir -p /tmp/motrix-next-downloads
aria2c \
  --enable-rpc=true \
  --rpc-listen-all=false \
  --rpc-listen-port=29100 \
  --rpc-allow-origin-all=true \
  --disable-ipv6=true \
  --dir=/tmp/motrix-next-downloads
```

## Docker Build

Two non-CUDA Dockerfiles are provided:

- `Dockerfile.amd` builds a `linux/amd64` image.
- `Dockerfile.arm` builds a `linux/arm64` image.

Use one of the two supported profiles:

```bash
./build_image.sh amd
./build_image.sh arm
```

The image name is `motrix`, and the pushed image tag format is:

```text
swr.cn-southwest-2.myhuaweicloud.com/ictrek/motrix:<profile>_YYYYMMDD
```

`build_image.sh` writes the pushed tag to the existing Feishu release table:

- `amd` -> sheets `AMD_with_cuda`, `AMD_with_mxn100`, column `motrix`
- `arm` -> sheets `ARM_without_cuda`, `ARM_with_cuda`, `l4t`, `thor_spark`, `SOPHON_bm1688`, column `motrix`

The sheet names are compatibility labels only. The Docker images do not use CUDA.

## Docker Run

The container starts both the static web server and aria2. It exposes:

```text
47000 -> 47000
```

Inside the container, aria2 downloads to `/downloads`. Map that to a host directory so completed files and aria2 task state persist after the container restarts.

The container stores aria2's session file under:

```text
/downloads/.aria2/aria2.session
```

Because this file is inside `/downloads`, a single host bind mount persists both downloaded files and the completed/stopped task list shown by the web UI. The browser-side UI history is stored in the browser's localStorage, while aria2's source-of-truth task state is restored from this session file.

For tc232 testing, map `/downloads` to the `jhu` user's local Downloads directory:

```bash
mkdir -p /home/jhu/Downloads
docker run -d \
  --name motrix \
  --restart unless-stopped \
  -p 47000:47000 \
  -v /home/jhu/Downloads:/downloads \
  motrix
```

Health check:

```bash
curl http://127.0.0.1:47000/healthz
```

JSON-RPC check:

```bash
curl -X POST http://127.0.0.1:47000/jsonrpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"v","method":"aria2.getVersion"}'
```

File-existence checks used by task cards are scoped to `/downloads`:

```bash
curl 'http://127.0.0.1:47000/api/path-exists?path=%2Fdownloads%2Fexample.zip'
```

## VOS App Package

The VOS app package lives in `ictrek.app`. It uses the same Feishu release table as `build_image.sh`: build and push the image first, then package by reading the latest `motrix` tag from Feishu.

```bash
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd
```

The package filename version format is `<profile>_YYMMDD`, for example `arm_260701`. VOS requires the manifest version to be SemVer, so `manifest.yml` uses `0.0.1-<profile>.<YYMMDD>`, for example `0.0.1-arm.260701`. The package contains the Motrix Docker image as a `docker-archive` asset. It does not expose a host port; VOS routes the app through:

```text
/app/com.ictrek.motrix-next/
```

VOS persists downloads and aria2 task state through `${VOS_APP_STORAGE_PATH}/downloads:/downloads`.

## Desktop Code Signing

Motrix Next desktop release artifacts are not code-signed on macOS or Windows, so browsers or antivirus tools may show a warning. Upstream `.sig` files are Tauri updater signatures. See [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) for verification details.

## tc232 Deployment

The current tc232 deployment uses:

```text
Host path:      /home/jhu/Downloads
Container path: /downloads
Port mapping:   47000:47000
Session file:   /home/jhu/Downloads/.aria2/aria2.session
Image:          swr.cn-southwest-2.myhuaweicloud.com/ictrek/motrix:amd_YYYYMMDD
```

After pushing a new AMD image:

```bash
docker rm -f motrix 2>/dev/null || true
docker run -d \
  --name motrix \
  --restart unless-stopped \
  -p 47000:47000 \
  -v /home/jhu/Downloads:/downloads \
  swr.cn-southwest-2.myhuaweicloud.com/ictrek/motrix:amd_YYYYMMDD
```
