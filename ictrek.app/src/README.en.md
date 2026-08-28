# Motrix Next VOS App

Motrix Next provides a web UI for aria2 download task management.

## Access

After installation, open it from the platform sidebar. VOS proxies the page through:

```text
/app/com.ictrek.motrix-next/
```

The app does not require a host port mapping.

## Persistence

The install form selects one public Motrix root:

```text
${MOTRIX_SHARED_PATH:-/data/vos_workspace/motrix}
```

Downloads and aria2 session state are stored in its `downloads/` subdirectory. The container path is `/downloads`, and the aria2 session file is `/downloads/.aria2/aria2.session`. `MOTRIX_SHARED_PATH` declares the `com.ictrek.download.storage` sharing hint, so other apps declaring the same hint can select this public directory.
