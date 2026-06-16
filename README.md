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

- `amd` -> sheet `AMD_with_cuda`, column `motrix`
- `arm` -> sheet `ARM_without_cuda`, column `motrix`

The sheet names are compatibility labels only. The Docker images do not use CUDA.

## Docker Run

The container starts both the static web server and aria2. It exposes:

```text
47000 -> 47000
```

Inside the container, aria2 downloads to `/downloads`. Map that to a host directory so completed files persist after the container restarts.

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

## tc232 Deployment

The current tc232 deployment uses:

```text
Host path:      /home/jhu/Downloads
Container path: /downloads
Port mapping:   47000:47000
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
