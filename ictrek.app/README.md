# Motrix Next VOS 应用打包说明

本目录包含 VOS app `com.ictrek.motrix-next` 的安装包模板。

## 打包

```bash
cd apps/motrix-next
./ictrek.app/scripts/package.sh
```

脚本只生成一个 pull 模式安装包：

```text
ictrek.app/dist/motrix-next_${VERSION}_pull.tar
```

安装包内只有一个 `docker-compose.yml`，其中包含 `arm` 和 `amd` 两个 Docker Compose profile。打包脚本会优先读取 `~/.feishu.components.json`，若文件不存在或读取失败则回退到 `~/.feishu.json`，分别从对应 sheet 读取 `motrix` 镜像最新版本，并写入包内 `.env`。

不再通过 `arm` / `amd` 参数生成多个 tar 包，也不再生成包含 `assets/` 镜像归档的 local 包。

## Profiles

| profile | 飞书 sheet | 适用平台 |
| --- | --- | --- |
| `arm` | `ARM_without_cuda` | ARM / L4T 类设备 |
| `amd` | `AMD_with_cuda` | x86_64 / AMD64 类设备 |

安装时由 VOS 指定其中一个 profile。手动验证 Compose 文件时也必须只启用一个 profile：

```bash
docker compose --profile amd config
docker compose --profile arm config
```


## 版本更新与 Release

`./scripts/package.sh` 成功执行后会自动递增 `ictrek.app/VERSION`，并在 `dist/` 下生成 pull 模式 tar 包。生成的 tar 包被 `.gitignore` 忽略，不提交到 git；需要把 `VERSION`、打包脚本、Compose/manifest/router/README 等源码改动提交并推送后，再创建 GitHub release 上传 tar 包。

标准流程：

```bash
cd apps/motrix-next
./ictrek.app/scripts/package.sh

# 确认 VERSION 中的新版本号，例如 0.0.3
VERSION=$(cat ictrek.app/VERSION)

# 在对应仓库提交并推送源码改动后发布 pull 包
gh release create vos-motrix-next-v${VERSION} ictrek.app/dist/motrix-next_${VERSION}_pull.tar \
  --repo ictrektech/motrix-next \
  --target main \
  --title "VOS motrix-next $VERSION" \
  --notes "Pull-mode VOS app package for this release."
```

如果 release tag 已存在，应先确认是否是重发同一版本；不要覆盖未知来源的资产。确需补传同一版本产物时使用：

```bash
gh release upload vos-motrix-next-v${VERSION} ictrek.app/dist/motrix-next_${VERSION}_pull.tar --repo ictrektech/motrix-next --clobber
```

## 安装

```bash
vos-platform-cli app install-local \
  --temp-dir ./tmp-motrix-next-install \
  --admin-password Aa123456 \
  --package-path ./motrix-next_${VERSION}_pull.tar \
  --volume app_space \
  -v
```

VOS 主机必须能访问并拉取 `swr.cn-southwest-2.myhuaweicloud.com/ictrek/motrix` 镜像。安装后入口为：

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next/
```

## 路由

`routers.yml` 使用完整的 group/page 结构，并保留 `keep-alive: true`。新增或修改入口时必须同步检查 `iframe-src` 指向 `/app/com.ictrek.motrix-next/`。
