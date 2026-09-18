# Release configuration

This checkout builds Rayburst locally. It does not create a store listing, publish a
website, change Git remotes or submit a signing request during development.

## Desktop updates

Keep the existing `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets. The matching public key
is in `src-tauri/tauri.conf.json`; `src-tauri/tauri.release.json` enables signed
updater artifacts for release builds. There is no second key or public-key variable.

Update manifests stay under the existing `updater` release tag:

- Stable: `https://github.com/AnInsomniacy/rayburst/releases/download/updater/latest.json`
- Prerelease: `https://github.com/AnInsomniacy/rayburst/releases/download/updater/beta.json`

Previous releases reach these files through GitHub's repository redirect and verify
updates with the same key. Keep the release tag; replace only the channel JSON after
all referenced packages and signatures exist. Missing assets or signatures stop
publication. The website continues to select the latest stable release only.

The new application identifier uses separate settings, task state and history.
There is no data import or installer migration layer. Native installation may
replace the app in place or leave both products installed, depending on the package
type. Existing filenames and shortcuts can retain the previous name. Recommend a
fresh installation in the README and website migration notices.

## Bundled engine

Release builds download the engine version pinned in `.github/workflows/release.yml`
from the aria2-next repository and verify its published SHA-256 checksum. Publish
that engine release before building the desktop release. Every platform uses the
same engine version; a missing release or checksum fails the build. Development
sidecars in the checkout are not a substitute for release preparation.

## Browser identities

`src-tauri/native-messaging/identity.json` owns the allowed Chromium IDs and Firefox
ID. Native Messaging is activation-only. Chrome and Edge retain their published
store identities; Firefox uses the new Rayburst Connect identity.

When an identity changes, update this allowlist and the extension configuration in
the same delivery. Regenerate packaged manifests with `pnpm build:native-launcher`
and distribute the rebuilt app before the extension. No wildcard origins are allowed.

## Platform distribution

Homebrew publication requires `HOMEBREW_ENABLED=true` and `HOMEBREW_TAP_TOKEN`
with write access to `AnInsomniacy/homebrew-rayburst`. The tap owns `Casks/rayburst.rb`;
the stable release job uses `brew bump-cask-pr --write-only` to update both architecture
checksums without replacing its installation or cleanup rules. Windows signing requires `SIGNPATH_ENABLED=true` and the existing
`SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and
`SIGNPATH_RELEASE_ARTIFACT_CONFIGURATION_SLUG` settings. Match the artifact
configuration to the new installer names in the signing service.

When SignPath is enabled, the release build leaves the update channel unchanged.
Run the existing Windows signing workflow to sign the installers, regenerate their
updater signatures and publish the complete channel JSON. Without SignPath, the
release build publishes the channel JSON after all platform builds finish.
Community package entries are not assumed to exist. Keep installation instructions
limited to packages that have been published.

Use `scripts/bump-version.sh` for a chosen release version. Creating a release,
submitting to stores and platform acceptance are separate actions.

## Website

Cloudflare Pages serves `https://rayburst.pages.dev` from this repository's `main`
branch. Use the `website` root directory, `.` output directory, no framework preset,
and `exit 0` build command. Set `SKIP_DEPENDENCY_INSTALL=1`.

Include only `website/*` in build watch paths, leave exclusions empty, and disable
preview branch deployments. Cloudflare bypasses path filtering for pushes with no
changed files, at least 3,000 changed files, or at least 20 commits. The website uses
native Pages caching and `404.html`; it has no separate deployment workflow.
