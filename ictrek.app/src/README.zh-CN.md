# Motrix Next VOS 应用

Motrix Next 提供基于 aria2 的下载任务管理 Web UI。

## 访问方式

安装后通过平台侧边栏进入，页面由 VOS 网关代理到：

```text
/app/com.ictrek.motrix-next/
```

应用不需要宿主机外映端口。

## 数据持久化

安装时只选择一个 Motrix 公共根目录：

```text
${MOTRIX_SHARED_PATH:-/data/vos_workspace/motrix}
```

下载文件和 aria2 会话状态放在该根目录的 `downloads/` 子目录，容器内映射路径为 `/downloads`，aria2 session 文件为 `/downloads/.aria2/aria2.session`。`MOTRIX_SHARED_PATH` 使用 `com.ictrek.download.storage` 共享提示，其他应用声明相同 hint 后可选择同一个公共目录。
