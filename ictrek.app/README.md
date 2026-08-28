# Motrix Next VOS 应用打包说明

本目录包含 VOS app `com.ictrek.motrix-next` 的安装包模板。
发布流程以 `update_version.sh` 触发的 GitHub Actions 为准。

## 打包

正式发布不要在本地读取飞书并打包。发布入口是 `ictrek.app/scripts/update_version.sh`：它只更新 `VERSION`、提交 release commit、推送 `vos-motrix-next-v${VERSION}` 触发 tag；GitHub Actions 收到 tag 后才会读取飞书组件版本、生成 pull 包并更新 GitHub release。

本地 `package.sh` 只用于调试模板或手动验证。它不会递增或写回 `VERSION`；未设置 `PACKAGE_VERSION` 时读取当前 `ictrek.app/VERSION`，CI 会显式传入 tag 中解析出的 `PACKAGE_VERSION`。

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
| `arm` | `ARM_with_cuda` | ARM / L4T 类设备 |
| `amd` | `AMD_with_cuda` | x86_64 / AMD64 类设备 |

安装时由 VOS 指定其中一个 profile。手动验证 Compose 文件时也必须只启用一个 profile：

```bash
docker compose --profile amd config
docker compose --profile arm config
```


## 版本更新与 Release

推荐通过 `ictrek.app/scripts/update_version.sh` 触发版本更新和 GitHub Actions release。脚本只更新 `VERSION`、提交、打 tag 并 push；真正的 pull 包打包、release notes 生成和 tar 上传由 `.github/workflows/vos-release.yml` 完成。

发布前先提交业务代码改动，保持工作区干净，然后运行：

```bash
./ictrek.app/scripts/update_version.sh patch
```

可选参数为 `patch`、`minor`、`major`，默认是 `patch`。脚本会生成并推送 `vos-motrix-next-v${VERSION}` 形式的 CI 触发 tag。GitHub Actions 收到 tag 后会：

- 使用 tag 中的版本号作为 `PACKAGE_VERSION` 调用 `package.sh`，生成 `dist/motrix-next_${VERSION}_pull.tar`。
- 读取 `~/.feishu.components.json` 所需的 GitHub Secrets：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`，可选 `FEISHU_SPREADSHEET_TOKEN`。
- 在 CI 中通过飞书发布表读取 `motrix` 最新镜像 tag；当前不读取其他 VOS app release，因此不需要 `VOS_DEPENDENCY_RELEASE_TOKEN`。
- 查找上一个 VOS release tag，把两个 tag 之间的提交记录写入 release notes。
- 创建标准 SemVer GitHub release tag `v${VERSION}`，标题使用 `v${VERSION}`，并上传 pull 模式 tar 包。`vos-motrix-next-v${VERSION}` 只用于触发 CI，不作为公开 release tag。

如果 release tag 已存在，应先确认是否是重发同一版本；不要覆盖未知来源的资产。确需补传同一版本产物时再手动使用 `gh release upload --clobber`。

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

安装表单只配置一个 `MOTRIX_SHARED_PATH` 公共根目录，默认 `/data/vos_workspace/motrix`。下载文件和 aria2 session 统一放在其 `downloads/` 子目录；配置声明 `com.ictrek.download.storage` hint，其他应用使用相同 hint 即可选择该公共目录。

## 路由

`manifest.yml` 保留 `frontend.enabled: true` 和 `frontend.basePath: /app/com.ictrek.motrix-next`，用于兼容当前仍从应用列表读取 `frontend_enabled/frontend_base_path` 的 VOS“我的应用”打开按钮。

`routers.yml` 使用完整的 group/page 结构。真实可见页面继续作为 VOS iframe 页面，并保留 `entry-point: true` 和 `embed: true`。Compose/Traefik 会把顶层文档请求 `/app/com.ictrek.motrix-next/` 重定向到 VOS hash；iframe 请求不重定向。Motrix Next 的固定入口契约是：

- `app id`: `com.ictrek.motrix-next`
- `group.id`: `com-ictrek-motrix-next`
- sidebar page: `id=downloads`、`entry-point: true`、`embed: true`、`iframe-src: /app/com.ictrek.motrix-next/`
- top-level redirect: `Sec-Fetch-Dest: document` 的 `/app/com.ictrek.motrix-next/` 请求跳转到 VOS 内部侧边栏路径
- VOS 内部侧边栏路径：`#/app/com.ictrek.motrix-next/com-ictrek-motrix-next/downloads`

`scripts/package.sh` 会在生成 `app.tar.gz` 后校验以上字段；不匹配时直接失败。新增或修改入口时必须同步更新模板和脚本校验值。
