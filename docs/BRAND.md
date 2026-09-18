# Rayburst brand

Product: **Rayburst**. Package: `rayburst`. Application ID: `dev.aninsomniacy.rayburst`.

Redefining the open-source download manager

`public/logo.svg` is the artwork source. Run `pnpm icons` to generate desktop icons
with the Tauri CLI. The tray uses the same mark; macOS renders its alpha channel as
a native template image. `docs/brand/banner.png` is the English README banner with the current slogan. Use no terminal punctuation in slogans, including translations.

The default interface seed is `#946ECE`, softened from the original purple while
preserving its hue. Material Color Utilities generates both themes through the
standard source palette.
The original logo artwork retains its purple gradients.
The empty-list background reuses `public/logo.svg` as a monochrome CSS mask,
without a wordmark. It follows the rendered list immediately, independent of
engine startup or database readiness.
CSS, Naive UI and canvas drawing use semantic roles. Warning, error and success
colors describe state; they are not aliases for the brand color. Button foregrounds
must remain readable in normal, hover, focus and pressed states.

Use the product name without translation. Keep interface labels short and literal.
Use the slogan in the README, website and About panel. Review prose with Sepia;
remove unsupported claims and unnecessary adjectives.

The engine remains aria2-next. Its code, protocols and binary contents are independent
of this branding change. The desktop bundle uses the engine's actual executable name.

Interface slogans use the existing i18n dictionaries in all 27 supported locales.
The approved Simplified Chinese slogan is “重新定义开源下载器”
Use its Traditional Chinese equivalent for zh-TW. Preserve the approved English
slogan in English interfaces, README banners and promotional artwork.

The website remains a standalone HTML, CSS and JavaScript site. Its light and dark
colors use the desktop's default palette; the SVG logos retain their original colors.
Website artwork copies come from `public/logo.svg`, Rayburst Connect's
`public/icon/icon.svg`, and the screenshots in `docs/media/`.
Use the current repository URLs throughout the app, website and documentation.
Keep the previous product name in the README and website migration notices only.
The website continues to offer the latest stable release, even before the first
release under the new brand. Localize website copy in all 27 languages.

Product names belong in visible copy and distributable filenames. Internal symbols
use their responsibility, and published protocol and storage identities stay fixed.
Rebranding does not rotate signing keys, rename update channels or change engine APIs.
