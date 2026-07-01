# Motrix Next VOS 应用打包说明

本目录包含 `com.ictrek.motrix-next` 的 VOS 应用打包文件。

## 安装包内容

生成结果是一个 VOS 应用安装 tar 包，始终包含：

- `app.tar.gz`：VOS 元数据和 Compose 文件。

在默认的 `local` 镜像来源模式下，还会包含：

- `assets/<arch>/`：`motrix` 的本地 `docker-archive` 镜像文件。

Motrix Next 通过单个 Docker 容器运行。该镜像同时包含构建后的 Web 静态资源、Node Web 服务和 aria2 下载进程。VOS 安装包不会把前端源码作为运行时代码交付。

```bash
cd apps/motrix-next

# 先构建并推送镜像，再打包。
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd

# 构建一个小体积在线安装包。该包只包含镜像名称；
# VOS 主机会在 docker compose up 时拉取镜像。
./ictrek.app/scripts/package.sh amd --image-source pull
```

打包脚本需要 `~/.feishu.json` 中的飞书凭据。只有默认 `local` 模式需要 Docker，因为该模式会通过 `docker save` 导出镜像归档。

脚本会从飞书发布表读取 `motrix` 组件的最新标签。

| profile | 飞书 sheet | 资源架构 |
|---------|------------|----------|
| `arm` | `ARM_without_cuda` | `arm64` |
| `amd` | `AMD_with_cuda` | `amd64` |

## 镜像来源

`--image-source local` 是默认且适合发布的模式。它会拉取选定镜像，将镜像导出为 `dist/assets/<arch>/` 下的 `docker-archive` 资源，写入 `manifest.assets`，并让 VOS 在安装阶段通过 `docker load` 导入镜像。

`--image-source pull` 会生成更小的安装包。它会把完整镜像名称写入 `docker-compose.yml`，省略 `manifest.assets`，并设置 `pull_policy: always`，让 VOS 主机在 `docker compose up` 时拉取镜像。主机必须能访问镜像仓库，并且 VOS 使用的 Docker daemon 用户必须已经登录 SWR。当前 VOS 主机上通常意味着 root 的 Docker 配置需要包含 `swr.cn-southwest-2.myhuaweicloud.com` 的登录信息。

local 模式生成：

```text
dist/motrix-next_<profile>_<YYMMDD>.tar
```

pull 模式生成：

```text
dist/motrix-next_<profile>_<YYMMDD>_pull.tar
```

`dist/` 目录和生成的 tar 文件已被忽略，不应提交。

## 版本号

安装包文件名使用 `<profile>_YYMMDD`，例如：

```text
motrix-next_amd_260701.tar
motrix-next_amd_260701_pull.tar
```

VOS 要求 `manifest.yml.version` 使用 SemVer，因此 manifest 中使用：

```text
0.0.1-<profile>.<YYMMDD>
```

例如：

```text
0.0.1-amd.260701
```

## 本地 VOS 安装测试

在 `tc192`、`tc232` 等 VOS 开发主机上，将生成的 tar 拷贝到共享用户数据路径，然后从 `vos-platform-backend` 中安装。

以 `tc232` 的 `app_space` volume 为例：

```bash
docker exec -it vos-platform-backend bash

cd /share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps_tmp

vos-platform-cli app install-local \
  --temp-dir /share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps_tmp/ \
  --admin-password Aa123456 \
  --package-path ./motrix-next_amd_260701.tar \
  --volume app_space \
  -v
```

安装后，应用应可通过 VOS 网关访问：

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next/
```

不带尾斜杠的地址也可访问，Traefik 会重定向到带尾斜杠地址：

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next
```

## VOS 网络

生成的 Compose 文件会加入已有的外部 Docker 网络 `vos_default`。

Motrix Next 只有一个服务：

- `motrix-next`

应用不暴露宿主机端口。VOS 通过 Traefik 将 `/app/com.ictrek.motrix-next/` 转发到容器内的 `47000` 端口。

## 存储映射

VOS 会为应用设置 `${VOS_APP_STORAGE_PATH}`。Motrix Next 的 Compose 文件将下载目录映射为：

```text
${VOS_APP_STORAGE_PATH}/downloads:/downloads
```

容器内路径：

```text
/downloads
```

下载文件和 aria2 任务恢复文件都位于该挂载目录下：

```text
/downloads/.aria2/aria2.session
```

因此，只要 VOS 应用存储目录不被删除，下载文件以及 aria2 已完成、停止、未完成任务的恢复状态都会在容器重启和应用重启后保留。浏览器侧的 UI 偏好仍由浏览器本地存储维护。

在 `tc232` 上，`app_space` 对应的宿主机路径示例为：

```text
/share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps/com.ictrek.motrix-next/downloads
```

# Motrix Next VOS Package

This directory contains VOS app packaging files for `com.ictrek.motrix-next`.

## Package

The package is a VOS install tar. It always contains:

- `app.tar.gz`: VOS metadata and Compose files.

In the default `local` image source mode, it also contains:

- `assets/<arch>/`: the local `docker-archive` image file for `motrix`.

Motrix Next runs as a single Docker container. The image contains the built web assets, the Node web service, and the aria2 download process. Frontend source code is not shipped as runtime code in the VOS package.

```bash
cd apps/motrix-next

# Build and push the image first, then build the package.
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd

# Build a small online-install package. The package contains image names only;
# the VOS host pulls images during docker compose up.
./ictrek.app/scripts/package.sh amd --image-source pull
```

The package script requires Feishu credentials at `~/.feishu.json`. Docker is required only for the default `local` mode because that mode exports image archives with `docker save`.

The script reads the latest component tag for `motrix` from the Feishu release spreadsheet.

| profile | Feishu sheet | Asset arch |
|---------|--------------|------------|
| `arm` | `ARM_without_cuda` | `arm64` |
| `amd` | `AMD_with_cuda` | `amd64` |

## Image Source

`--image-source local` is the default and release-safe mode. It pulls the selected image, exports it as a `docker-archive` asset under `dist/assets/<arch>/`, writes `manifest.assets`, and lets VOS import it with `docker load` during installation.

`--image-source pull` creates a much smaller package. It writes the full image name into `docker-compose.yml`, omits `manifest.assets`, and sets `pull_policy: always` so the VOS host pulls the image during `docker compose up`. The host must have network access to the registry and the Docker daemon user used by VOS must already be logged in to SWR. On current VOS hosts this usually means root's Docker config must include `swr.cn-southwest-2.myhuaweicloud.com`.

Local mode creates:

```text
dist/motrix-next_<profile>_<YYMMDD>.tar
```

Pull mode creates:

```text
dist/motrix-next_<profile>_<YYMMDD>_pull.tar
```

The `dist/` directory and generated tar files are ignored and must not be committed.

## Version

The package filename version uses `<profile>_YYMMDD`, for example:

```text
motrix-next_amd_260701.tar
motrix-next_amd_260701_pull.tar
```

VOS requires `manifest.yml.version` to be SemVer, so the manifest uses:

```text
0.0.1-<profile>.<YYMMDD>
```

For example:

```text
0.0.1-amd.260701
```

## Local VOS Install Test

On a VOS development host such as `tc192` or `tc232`, copy the generated tar into the shared user data path and install it from `vos-platform-backend`.

For example, on `tc232` with the `app_space` volume:

```bash
docker exec -it vos-platform-backend bash

cd /share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps_tmp

vos-platform-cli app install-local \
  --temp-dir /share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps_tmp/ \
  --admin-password Aa123456 \
  --package-path ./motrix-next_amd_260701.tar \
  --volume app_space \
  -v
```

After installation, the app should be available through the VOS gateway at:

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next/
```

The no-trailing-slash URL is also supported. Traefik redirects it to the trailing-slash URL:

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next
```

## VOS Network

The generated Compose file joins the existing external Docker network `vos_default`.

Motrix Next has one service:

- `motrix-next`

The app does not expose a host port. VOS routes `/app/com.ictrek.motrix-next/` through Traefik to port `47000` inside the container.

## Storage Mapping

VOS sets `${VOS_APP_STORAGE_PATH}` for the app. Motrix Next maps the download directory as:

```text
${VOS_APP_STORAGE_PATH}/downloads:/downloads
```

Container path:

```text
/downloads
```

Downloaded files and the aria2 session file are both inside this mounted directory:

```text
/downloads/.aria2/aria2.session
```

As long as the VOS app storage directory is not deleted, downloaded files and aria2's completed, stopped, and unfinished task restore state survive container and app restarts. Browser-side UI preferences are still stored by the browser.

On `tc232`, the `app_space` host path is currently:

```text
/share/032bb03e-628e-4e9e-96ae-440dea8263d3/apps/com.ictrek.motrix-next/downloads
```
