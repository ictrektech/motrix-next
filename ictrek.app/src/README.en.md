# Motrix Next VOS App

Motrix Next provides a web UI for aria2 download task management.

## Access

After installation, open it from the platform sidebar. VOS proxies the page through:

```text
/app/com.ictrek.motrix-next/
```

The app does not require a host port mapping.

## Persistence

Downloaded files and aria2 session state are stored under:

```text
${VOS_APP_STORAGE_PATH}/downloads
```

The container path is `/downloads`, and the aria2 session file is `/downloads/.aria2/aria2.session`.
