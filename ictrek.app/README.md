# Motrix Next VOS 应用打包说明

先构建并推送 Docker 镜像，再根据飞书发布表中记录的最新镜像 tag 生成 VOS 应用安装包：

```bash
cd apps/motrix-next
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd
```

使用 `--image-source local` 可以把 Motrix 镜像作为 `docker-archive` 资源放入安装包。这是默认模式，安装时不要求 VOS 主机再拉取镜像。

使用 `--image-source pull` 可以生成更小的安装包。该模式只写入镜像引用，VOS 主机会在 `docker compose up` 阶段自行拉取镜像：

```bash
./ictrek.app/scripts/package.sh amd --image-source pull
```

`arm` 读取飞书发布表中的 `ARM_without_cuda` sheet，`amd` 读取 `AMD_with_cuda` sheet，二者都使用 `motrix` 组件列。

安装包文件名版本格式为 `<profile>_YYMMDD`，例如 `arm_260701`。VOS 要求 `manifest.yml.version` 使用 SemVer，因此 manifest 中使用 `0.0.1-<profile>.<YYMMDD>`，例如 `0.0.1-arm.260701`。生成的安装包 tar 会写入 `ictrek.app/dist/`。

在本地镜像资源模式下，安装包会包含 Docker 镜像作为本地 `docker-archive` 资源。在 pull 模式下，安装包不包含 `assets/`，并设置 `pull_policy: always`。应用不暴露宿主机端口，VOS 通过 `/app/com.ictrek.motrix-next/` 转发访问，并把 `/app/com.ictrek.motrix-next` 重定向到带尾斜杠的 URL，确保相对路径 Web 资源能正确解析。下载文件持久化保存在 `${VOS_APP_STORAGE_PATH}/downloads`。

# Motrix Next VOS Package

Build and push the Docker image first, then package the latest Feishu-recorded image tag:

```bash
cd apps/motrix-next
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd
```

Use `--image-source local` to include the Motrix image as a `docker-archive` asset. This is the default and does not require the VOS host to pull the image during install. Use `--image-source pull` to build a smaller package that contains only the image reference and lets the VOS host pull the image during `docker compose up`:

```bash
./ictrek.app/scripts/package.sh amd --image-source pull
```

`arm` reads the `ARM_without_cuda` sheet. `amd` reads the `AMD_with_cuda` sheet. Both use the `motrix` component column.

The package filename version format is `<profile>_YYMMDD`, for example `arm_260701`. VOS requires `manifest.yml.version` to be SemVer, so the manifest uses `0.0.1-<profile>.<YYMMDD>`, for example `0.0.1-arm.260701`. The package tar is written to `ictrek.app/dist/`.

In local image-source mode, the package contains the Docker image as a local `docker-archive` asset. In pull mode, the package omits `assets/` and sets `pull_policy: always`. The app does not expose a host port. VOS routes traffic through `/app/com.ictrek.motrix-next/` and redirects `/app/com.ictrek.motrix-next` to the trailing-slash URL so relative web assets resolve correctly. Downloads persist in `${VOS_APP_STORAGE_PATH}/downloads`.
