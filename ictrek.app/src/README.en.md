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
${MOTRIX_DOWNLOADS_PATH:-${VOS_APP_STORAGE_PATH}/downloads}
```

The container path is `/downloads`, and the aria2 session file is `/downloads/.aria2/aria2.session`.
`MOTRIX_DOWNLOADS_PATH` is configurable in the VOS install UI. Leave it empty to use the default app storage directory.
