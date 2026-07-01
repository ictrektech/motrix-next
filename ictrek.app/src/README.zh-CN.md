# Motrix Next VOS 应用

Motrix Next 提供基于 aria2 的下载任务管理 Web UI。

## 访问方式

安装后通过平台侧边栏进入，页面由 VOS 网关代理到：

```text
/app/com.ictrek.motrix-next/
```

应用不需要宿主机外映端口。

## 数据持久化

下载文件和 aria2 会话状态保存在应用存储目录：

```text
${VOS_APP_STORAGE_PATH}/downloads
```

容器内映射路径为 `/downloads`，aria2 session 文件为 `/downloads/.aria2/aria2.session`。
