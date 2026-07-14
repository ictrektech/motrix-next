# Motrix Next VOS 应用打包说明

本目录包含 VOS app `com.ictrek.motrix-next` 的安装包模板。

## 打包

```bash
cd apps/motrix-next
./ictrek.app/scripts/package.sh
```

脚本只生成一个 pull 模式安装包：

```text
ictrek.app/dist/motrix-next_<version>_pull.tar
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

## 安装

```bash
vos-platform-cli app install-local \
  --temp-dir ./tmp-motrix-next-install \
  --admin-password Aa123456 \
  --package-path ./motrix-next_<version>_pull.tar \
  --volume app_space \
  -v
```

VOS 主机必须能访问并拉取 `swr.cn-southwest-2.myhuaweicloud.com/ictrek/motrix` 镜像。安装后入口为：

```text
https://<vos-host>:1180/app/com.ictrek.motrix-next/
```

## 路由

`routers.yml` 使用完整的 group/page 结构，并保留 `keep-alive: true`。新增或修改入口时必须同步检查 `iframe-src` 指向 `/app/com.ictrek.motrix-next/`。
