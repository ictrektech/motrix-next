use std::fs;
#[cfg(not(windows))]
use std::io::Write;
use std::path::{Path, PathBuf};

use motrix_next_browser_launcher::{
    chromium_manifest_json, firefox_manifest_json, HOST_NAME, LAUNCHER_FILE_STEM,
};
use tauri::AppHandle;
#[cfg(any(windows, target_os = "linux"))]
use tauri::Manager;

use crate::error::AppError;

#[cfg(windows)]
const WINDOWS_CHROMIUM_MANIFEST: &str = "native-messaging/manifests/chromium.json";
#[cfg(windows)]
const WINDOWS_FIREFOX_MANIFEST: &str = "native-messaging/manifests/firefox.json";

#[cfg(not(windows))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ManifestKind {
    Chromium,
    Firefox,
}

#[cfg(not(windows))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct ManifestDestination {
    kind: ManifestKind,
    path: PathBuf,
}

pub fn schedule_repair(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || match repair(&app) {
        Ok(repaired) => log::info!(
            target: "native_messaging",
            event = "registration_repaired",
            repaired;
            "registration_repaired"
        ),
        Err(error) => log::warn!(
            target: "native_messaging",
            event = "registration_failed",
            error:% = error;
            "registration_failed"
        ),
    });
}

fn repair(app: &AppHandle) -> Result<usize, AppError> {
    let bundled_launcher = bundled_launcher_path()?;
    if !bundled_launcher.is_file() {
        return Err(AppError::Io(format!(
            "Native messaging launcher is missing: {}",
            bundled_launcher.display()
        )));
    }

    #[cfg(windows)]
    {
        repair_windows(app)
    }

    #[cfg(not(windows))]
    {
        let launcher = stable_launcher_path(app, &bundled_launcher)?;
        repair_file_manifests(&launcher)
    }
}

fn bundled_launcher_path() -> Result<PathBuf, AppError> {
    let current_exe = std::env::current_exe()
        .map_err(|error| AppError::Io(format!("Failed to resolve current executable: {error}")))?;
    let extension = if cfg!(windows) { ".exe" } else { "" };
    Ok(current_exe.with_file_name(format!("{LAUNCHER_FILE_STEM}{extension}")))
}

#[cfg(windows)]
fn repair_windows(app: &AppHandle) -> Result<usize, AppError> {
    use tauri::path::BaseDirectory;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let chromium = app
        .path()
        .resolve(WINDOWS_CHROMIUM_MANIFEST, BaseDirectory::Resource)
        .map_err(|error| AppError::Io(format!("Failed to resolve Chromium manifest: {error}")))?;
    let firefox = app
        .path()
        .resolve(WINDOWS_FIREFOX_MANIFEST, BaseDirectory::Resource)
        .map_err(|error| AppError::Io(format!("Failed to resolve Firefox manifest: {error}")))?;

    validate_bundled_manifest(
        &chromium,
        &chromium_manifest_json(Path::new(r"..\..\motrix-next-browser-launcher.exe"))
            .map_err(|error| AppError::Io(format!("Failed to build Chromium manifest: {error}")))?,
    )?;
    validate_bundled_manifest(
        &firefox,
        &firefox_manifest_json(Path::new(r"..\..\motrix-next-browser-launcher.exe"))
            .map_err(|error| AppError::Io(format!("Failed to build Firefox manifest: {error}")))?,
    )?;

    let chrome_key = format!("Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}");
    let edge_key = format!("Software\\Microsoft\\Edge\\NativeMessagingHosts\\{HOST_NAME}");
    let firefox_key = format!("Software\\Mozilla\\NativeMessagingHosts\\{HOST_NAME}");
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let mut repaired = 0;
    for (key_path, manifest) in [
        (chrome_key, chromium.as_path()),
        (edge_key, chromium.as_path()),
        (firefox_key, firefox.as_path()),
    ] {
        let manifest = path_to_string(manifest)?;
        let (key, _) = current_user.create_subkey(&key_path).map_err(|error| {
            AppError::Io(format!(
                "Failed to create native messaging registry key: {error}"
            ))
        })?;
        let current = key.get_value::<String, _>("").ok();
        if current.as_deref() != Some(manifest.as_str()) {
            key.set_value("", &manifest).map_err(|error| {
                AppError::Io(format!(
                    "Failed to write native messaging registry key: {error}"
                ))
            })?;
            repaired += 1;
        }
    }
    Ok(repaired)
}

#[cfg(windows)]
fn validate_bundled_manifest(path: &Path, expected: &[u8]) -> Result<(), AppError> {
    let actual = fs::read(path).map_err(|error| {
        AppError::Io(format!(
            "Failed to read native messaging manifest {}: {error}",
            path.display()
        ))
    })?;
    let actual: serde_json::Value = serde_json::from_slice(&actual).map_err(|error| {
        AppError::Io(format!(
            "Invalid native messaging manifest {}: {error}",
            path.display()
        ))
    })?;
    let expected: serde_json::Value = serde_json::from_slice(expected)
        .map_err(|error| AppError::Io(format!("Invalid expected manifest: {error}")))?;
    if actual != expected {
        return Err(AppError::Io(format!(
            "Native messaging manifest does not match the compiled contract: {}",
            path.display()
        )));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn stable_launcher_path(app: &AppHandle, bundled: &Path) -> Result<PathBuf, AppError> {
    if app.env().appimage.is_some() {
        let destination = app
            .path()
            .app_data_dir()
            .map_err(|error| {
                AppError::Io(format!("Failed to resolve app data directory: {error}"))
            })?
            .join("native-messaging")
            .join(LAUNCHER_FILE_STEM);
        copy_executable_if_changed(bundled, &destination)?;
        return Ok(destination);
    }

    Ok(bundled.to_path_buf())
}

#[cfg(target_os = "macos")]
fn stable_launcher_path(_app: &AppHandle, bundled: &Path) -> Result<PathBuf, AppError> {
    Ok(bundled.to_path_buf())
}

#[cfg(target_os = "linux")]
fn copy_executable_if_changed(source: &Path, destination: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;

    let source_bytes = fs::read(source).map_err(|error| {
        AppError::Io(format!(
            "Failed to read bundled native messaging launcher: {error}"
        ))
    })?;
    if fs::read(destination).ok().as_deref() == Some(source_bytes.as_slice()) {
        let mut permissions = fs::metadata(destination)?.permissions();
        if permissions.mode() & 0o111 == 0 {
            permissions.set_mode(0o755);
            fs::set_permissions(destination, permissions)?;
        }
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Io("Launcher destination has no parent directory".into()))?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(&source_bytes)?;
    temporary.as_file().sync_all()?;
    let mut permissions = temporary.as_file().metadata()?.permissions();
    permissions.set_mode(0o755);
    temporary.as_file().set_permissions(permissions)?;
    temporary.persist(destination).map_err(|error| {
        AppError::Io(format!(
            "Failed to install stable native messaging launcher: {}",
            error.error
        ))
    })?;
    Ok(())
}

#[cfg(not(windows))]
fn repair_file_manifests(launcher: &Path) -> Result<usize, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Io("Failed to resolve the user home directory".into()))?;
    let config = dirs::config_dir()
        .ok_or_else(|| AppError::Io("Failed to resolve the user config directory".into()))?;
    let mut repaired = 0;
    for destination in manifest_destinations(std::env::consts::OS, &home, &config) {
        let content = match destination.kind {
            ManifestKind::Chromium => chromium_manifest_json(launcher),
            ManifestKind::Firefox => firefox_manifest_json(launcher),
        }
        .map_err(|error| AppError::Io(format!("Failed to serialize native manifest: {error}")))?;
        if write_if_changed(&destination.path, &content)? {
            repaired += 1;
        }
    }
    Ok(repaired)
}

#[cfg(not(windows))]
fn manifest_destinations(os: &str, home: &Path, config: &Path) -> Vec<ManifestDestination> {
    let file_name = format!("{HOST_NAME}.json");
    match os {
        "macos" => vec![
            ManifestDestination {
                kind: ManifestKind::Chromium,
                path: home
                    .join("Library/Application Support/Google/Chrome/NativeMessagingHosts")
                    .join(&file_name),
            },
            ManifestDestination {
                kind: ManifestKind::Chromium,
                path: home
                    .join("Library/Application Support/Microsoft Edge/NativeMessagingHosts")
                    .join(&file_name),
            },
            ManifestDestination {
                kind: ManifestKind::Firefox,
                path: home
                    .join("Library/Application Support/Mozilla/NativeMessagingHosts")
                    .join(&file_name),
            },
        ],
        "linux" => vec![
            ManifestDestination {
                kind: ManifestKind::Chromium,
                path: config
                    .join("google-chrome/NativeMessagingHosts")
                    .join(&file_name),
            },
            ManifestDestination {
                kind: ManifestKind::Chromium,
                path: config
                    .join("microsoft-edge/NativeMessagingHosts")
                    .join(&file_name),
            },
            ManifestDestination {
                kind: ManifestKind::Firefox,
                path: home
                    .join(".mozilla/native-messaging-hosts")
                    .join(&file_name),
            },
        ],
        _ => Vec::new(),
    }
}

#[cfg(not(windows))]
fn write_if_changed(path: &Path, content: &[u8]) -> Result<bool, AppError> {
    if fs::read(path).ok().as_deref() == Some(content) {
        return Ok(false);
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Io("Manifest destination has no parent directory".into()))?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| {
        AppError::Io(format!(
            "Failed to install native messaging manifest: {}",
            error.error
        ))
    })?;
    Ok(true)
}

#[cfg(windows)]
fn path_to_string(path: &Path) -> Result<String, AppError> {
    dunce::simplified(path)
        .to_str()
        .map(ToString::to_string)
        .ok_or_else(|| AppError::Io(format!("Path is not valid UTF-8: {}", path.display())))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn macos_uses_only_formal_browser_locations() {
        let destinations = manifest_destinations(
            "macos",
            Path::new("/Users/test"),
            Path::new("/Users/test/.config"),
        );
        let paths: Vec<String> = destinations
            .iter()
            .map(|destination| destination.path.to_string_lossy().into_owned())
            .collect();
        assert_eq!(destinations.len(), 3);
        assert!(paths.iter().any(|path| path.contains("Google/Chrome")));
        assert!(paths.iter().any(|path| path.contains("Microsoft Edge")));
        assert!(paths.iter().any(|path| path.contains("Mozilla")));
    }

    #[cfg(not(windows))]
    #[test]
    fn linux_uses_only_formal_browser_locations() {
        let destinations = manifest_destinations(
            "linux",
            Path::new("/home/test"),
            Path::new("/home/test/.config"),
        );
        let paths: Vec<String> = destinations
            .iter()
            .map(|destination| destination.path.to_string_lossy().into_owned())
            .collect();
        assert_eq!(destinations.len(), 3);
        assert!(paths.iter().any(|path| path.contains("google-chrome")));
        assert!(paths.iter().any(|path| path.contains("microsoft-edge")));
        assert!(paths.iter().any(|path| path.contains(".mozilla")));
    }

    #[cfg(not(windows))]
    #[test]
    fn manifest_repair_is_idempotent() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let manifest = directory.path().join("nested").join("manifest.json");
        let content = br#"{"name":"com.motrix.next.browser"}"#;

        assert!(write_if_changed(&manifest, content).expect("initial manifest write"));
        assert!(!write_if_changed(&manifest, content).expect("idempotent manifest check"));
        assert_eq!(fs::read(manifest).expect("saved manifest"), content);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn appimage_launcher_copy_is_stable_and_executable() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().expect("temporary directory");
        let source = directory.path().join("bundled-launcher");
        let destination = directory.path().join("stable").join("launcher");
        fs::write(&source, b"launcher-v1").expect("source launcher");

        copy_executable_if_changed(&source, &destination).expect("initial launcher copy");
        copy_executable_if_changed(&source, &destination).expect("idempotent launcher copy");

        assert_eq!(
            fs::read(&destination).expect("stable launcher"),
            b"launcher-v1"
        );
        assert_ne!(
            fs::metadata(destination)
                .expect("launcher metadata")
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }

    #[test]
    fn windows_resource_manifests_match_the_shared_contract() {
        let relative_launcher = Path::new(r"..\..\motrix-next-browser-launcher.exe");
        let expected_chromium: serde_json::Value = serde_json::from_slice(
            &chromium_manifest_json(relative_launcher).expect("Chromium contract"),
        )
        .expect("Chromium JSON");
        let expected_firefox: serde_json::Value = serde_json::from_slice(
            &firefox_manifest_json(relative_launcher).expect("Firefox contract"),
        )
        .expect("Firefox JSON");
        let actual_chromium: serde_json::Value =
            serde_json::from_str(include_str!("../native-messaging/manifests/chromium.json"))
                .expect("bundled Chromium JSON");
        let actual_firefox: serde_json::Value =
            serde_json::from_str(include_str!("../native-messaging/manifests/firefox.json"))
                .expect("bundled Firefox JSON");
        assert_eq!(actual_chromium, expected_chromium);
        assert_eq!(actual_firefox, expected_firefox);
    }
}
