//! Pre-flight database migration compatibility check.
//!
//! Runs **before** `tauri_plugin_sql` initializes to prevent panics when
//! the user downgrades to a version whose binary does not register all
//! previously applied migrations.
//!
//! # Strategy
//!
//! 1. Open `history.db` read-only with `rusqlite` (no tauri dependency).
//! 2. Query `_sqlx_migrations` for applied version numbers.
//! 3. Compare against [`REGISTERED_VERSIONS`] (hardcoded in this binary).
//! 4. On conflict → show a native OS dialog via `rfd` (no WebView needed).
//!    - **OK** → delete the database files and let the app start fresh.
//!    - **Cancel** → exit the process immediately.
//!
//! # i18n
//!
//! The dialog reads the user's saved locale from `config.json` on disk
//! (the `tauri-plugin-store` file), falling back to `sys_locale` and
//! finally `en-US`.  All 27 supported locales have native translations.

use std::path::Path;

/// Migration versions registered in the current binary.
///
/// **MUST** be kept in sync with the `add_migrations()` vec in `lib.rs`.
/// When adding a new migration, append its version here as well.
const REGISTERED_VERSIONS: &[i64] = &[1, 2, 3];

// ─── Public API ──────────────────────────────────────────────────────

/// Checks `history.db` for migration versions unknown to this binary.
///
/// - Missing DB file or missing `_sqlx_migrations` table → no-op.
/// - All applied versions in [`REGISTERED_VERSIONS`] → no-op.
/// - Unknown versions → native dialog; user picks reset or quit.
pub fn check(app_data_dir: &Path) {
    let db_path = app_data_dir.join("history.db");
    if !db_path.exists() {
        return; // Fresh install — nothing to check.
    }

    let unknown = match find_unknown_versions(&db_path) {
        Ok(v) => v,
        Err(e) => {
            // Cannot read DB — let tauri_plugin_sql handle it normally.
            log::debug!("db_guard: skipping check: {}", e);
            return;
        }
    };

    if unknown.is_empty() {
        return; // All migrations recognised — safe to proceed.
    }

    log::warn!(
        "db_guard: found {} unknown migration version(s): {:?}",
        unknown.len(),
        unknown
    );

    let locale = crate::i18n::resolve_supported_locale(&detect_locale(app_data_dir));
    let texts = crate::i18n::database_conflict_texts(&locale);

    let result = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Warning)
        .set_title(&texts.title)
        .set_description(&texts.body)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(
            texts.confirm.clone(),
            texts.cancel,
        ))
        .show();

    match result {
        rfd::MessageDialogResult::Custom(ref selection) if selection == &texts.confirm => {
            log::info!("db_guard: user chose RESET — deleting history.db");
            delete_db_files(app_data_dir);
        }
        _ => {
            log::info!("db_guard: user chose QUIT");
            std::process::exit(0);
        }
    }
}

// ─── Database inspection ─────────────────────────────────────────────

/// Opens the DB read-only and returns migration versions absent from
/// [`REGISTERED_VERSIONS`].
fn find_unknown_versions(db_path: &Path) -> Result<Vec<i64>, String> {
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("failed to open DB: {e}"))?;

    // Fresh databases may not have the migrations tracking table yet.
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master \
             WHERE type = 'table' AND name = '_sqlx_migrations'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("failed to check table existence: {e}"))?;

    if !table_exists {
        return Ok(vec![]);
    }

    let mut stmt = conn
        .prepare(
            "SELECT version FROM _sqlx_migrations \
             WHERE success = 1 ORDER BY version",
        )
        .map_err(|e| format!("failed to prepare query: {e}"))?;

    let applied: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("failed to query versions: {e}"))?
        .filter_map(std::result::Result::ok)
        .collect();

    let unknown: Vec<i64> = applied
        .into_iter()
        .filter(|v| !REGISTERED_VERSIONS.contains(v))
        .collect();

    Ok(unknown)
}

// ─── File cleanup ────────────────────────────────────────────────────

/// Deletes the SQLite database and its WAL/SHM companion files.
fn delete_db_files(app_data_dir: &Path) {
    for suffix in &["", "-wal", "-shm"] {
        let file = app_data_dir.join(format!("history.db{suffix}"));
        if file.exists() {
            match std::fs::remove_file(&file) {
                Ok(()) => log::info!("db_guard: deleted {}", file.display()),
                Err(e) => log::warn!("db_guard: failed to delete {}: {}", file.display(), e),
            }
        }
    }
}

// ─── Locale detection ────────────────────────────────────────────────

/// Reads the user's preferred locale without any Tauri dependency.
///
/// 1. Parse `config.json` (tauri-plugin-store format) → `preferences.locale`
/// 2. Fall back to `sys_locale::get_locale()` (OS language)
/// 3. Fall back to `"en-US"`
fn detect_locale(app_data_dir: &Path) -> String {
    // 1. Saved user preference
    let config_path = app_data_dir.join("config.json");
    if let Ok(file) = std::fs::File::open(config_path) {
        if let Ok(json) = serde_json::from_reader::<_, serde_json::Value>(file) {
            if let Some(locale) = json
                .get("preferences")
                .and_then(|p| p.get("locale"))
                .and_then(|v| v.as_str())
            {
                if !locale.is_empty() && locale != "auto" {
                    return locale.to_string();
                }
            }
        }
    }

    // 2. System locale
    sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string())
}

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temporary SQLite DB with the given migration versions.
    fn create_test_db(dir: &Path, versions: &[i64]) {
        let db_path = dir.join("history.db");
        let conn = rusqlite::Connection::open(&db_path).expect("open test DB");
        conn.execute_batch(
            "CREATE TABLE _sqlx_migrations (
                version  BIGINT PRIMARY KEY,
                description TEXT NOT NULL DEFAULT '',
                installed_on TEXT NOT NULL DEFAULT '',
                success  BOOLEAN NOT NULL DEFAULT 1,
                checksum BLOB NOT NULL DEFAULT X'00',
                execution_time BIGINT NOT NULL DEFAULT 0
            )",
        )
        .expect("create migrations table");

        for &v in versions {
            conn.execute(
                "INSERT INTO _sqlx_migrations (version, success) VALUES (?1, 1)",
                [v],
            )
            .expect("insert version");
        }
    }

    #[test]
    fn fresh_install_no_db() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let result = find_unknown_versions(&dir.path().join("history.db"));
        assert!(result.is_err()); // File doesn't exist → error (handled by caller)
    }

    #[test]
    fn db_without_migrations_table() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let db_path = dir.path().join("history.db");
        let conn = rusqlite::Connection::open(&db_path).expect("open");
        conn.execute_batch("CREATE TABLE dummy (id INTEGER)")
            .expect("create dummy");
        drop(conn);

        let unknown = find_unknown_versions(&db_path).expect("should succeed");
        assert!(unknown.is_empty());
    }

    #[test]
    fn all_versions_recognised() {
        let dir = tempfile::tempdir().expect("tmpdir");
        create_test_db(dir.path(), &[1, 2, 3]);

        let unknown =
            find_unknown_versions(&dir.path().join("history.db")).expect("should succeed");
        assert!(unknown.is_empty());
    }

    #[test]
    fn unknown_version_detected() {
        let dir = tempfile::tempdir().expect("tmpdir");
        create_test_db(dir.path(), &[1, 2, 3, 4]);

        let unknown =
            find_unknown_versions(&dir.path().join("history.db")).expect("should succeed");
        assert_eq!(unknown, vec![4]);
    }

    #[test]
    fn multiple_unknown_versions() {
        let dir = tempfile::tempdir().expect("tmpdir");
        create_test_db(dir.path(), &[1, 2, 3, 4, 5, 6]);

        let unknown =
            find_unknown_versions(&dir.path().join("history.db")).expect("should succeed");
        assert_eq!(unknown, vec![4, 5, 6]);
    }

    #[test]
    fn delete_removes_all_db_files() {
        let dir = tempfile::tempdir().expect("tmpdir");
        fs::write(dir.path().join("history.db"), b"data").expect("write db");
        fs::write(dir.path().join("history.db-wal"), b"wal").expect("write wal");
        fs::write(dir.path().join("history.db-shm"), b"shm").expect("write shm");

        delete_db_files(dir.path());

        assert!(!dir.path().join("history.db").exists());
        assert!(!dir.path().join("history.db-wal").exists());
        assert!(!dir.path().join("history.db-shm").exists());
    }

    #[test]
    fn locale_detection_from_config() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let config = r#"{"preferences":{"locale":"ja"}}"#;
        fs::write(dir.path().join("config.json"), config).expect("write config");

        let locale = detect_locale(dir.path());
        assert_eq!(locale, "ja");
    }

    #[test]
    fn locale_fallback_no_config() {
        let dir = tempfile::tempdir().expect("tmpdir");
        // No config.json → falls back to sys_locale or en-US.
        let locale = detect_locale(dir.path());
        assert!(!locale.is_empty());
    }

    #[test]
    fn locale_fallback_empty_locale() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let config = r#"{"preferences":{"locale":""}}"#;
        fs::write(dir.path().join("config.json"), config).expect("write config");

        let locale = detect_locale(dir.path());
        // Empty string → fallback to sys_locale, never returns "".
        assert!(!locale.is_empty());
    }

    #[test]
    fn locale_auto_uses_system_preference() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let config = r#"{"preferences":{"locale":"auto"}}"#;
        fs::write(dir.path().join("config.json"), config).expect("write config");

        let locale = detect_locale(dir.path());
        assert_ne!(locale, "auto");
        assert!(!locale.is_empty());
    }
}
