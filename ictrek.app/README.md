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
