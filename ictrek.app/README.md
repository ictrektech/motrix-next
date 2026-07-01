# Motrix Next VOS Package

Build and push the Docker image first, then package the latest Feishu-recorded image tag:

```bash
cd apps/motrix-next
./build_image.sh arm
./ictrek.app/scripts/package.sh arm

./build_image.sh amd
./ictrek.app/scripts/package.sh amd
```

`arm` reads the `ARM_without_cuda` sheet. `amd` reads the `AMD_with_cuda` sheet. Both use the `motrix` component column.

The package filename version format is `<profile>_YYMMDD`, for example `arm_260701`. VOS requires `manifest.yml.version` to be SemVer, so the manifest uses `0.0.1-<profile>.<YYMMDD>`, for example `0.0.1-arm.260701`. The package tar is written to `ictrek.app/dist/`.

The package contains the Docker image as a local `docker-archive` asset and does not expose a host port. VOS routes traffic through `/app/com.ictrek.motrix-next/` and persists downloads in `${VOS_APP_STORAGE_PATH}/downloads`.
