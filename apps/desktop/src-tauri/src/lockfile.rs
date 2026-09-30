//! Finds the running League client's port and password.
//!
//! The client writes `LeagueClient:<pid>:<port>:<password>:https` to a `lockfile` in its
//! install folder while it runs. We find that folder from Riot's own install metadata, then
//! from the running `LeagueClientUx.exe`, and as a last resort read its command-line flags.
//! (Hex Cards 1.0 used `wmic`, which Windows 11 24H2 no longer ships.)

use std::path::{Path, PathBuf};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, UpdateKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credentials {
    pub port: u16,
    pub password: String,
}

const METADATA: &str = r"Riot Games\Metadata\league_of_legends.live\league_of_legends.live.product_settings.yaml";
const UX_PROCESS: &str = "LeagueClientUx.exe";

pub fn find() -> Option<Credentials> {
    install_dirs().iter().find_map(|dir| read_lockfile(&dir.join("lockfile"))).or_else(from_process_args)
}

fn install_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(dir) = dir_from_metadata() {
        dirs.push(dir);
    }
    for process in ux_processes() {
        if let Some(dir) = process.exe.as_deref().and_then(Path::parent) {
            dirs.push(dir.to_path_buf());
        }
    }
    dirs
}

/// `product_install_full_path: "C:/Riot Games/League of Legends"` in Riot's metadata file.
fn dir_from_metadata() -> Option<PathBuf> {
    let program_data = std::env::var_os("ProgramData")?;
    let text = std::fs::read_to_string(Path::new(&program_data).join(METADATA)).ok()?;
    text.lines()
        .find_map(|line| line.trim().strip_prefix("product_install_full_path:"))
        .map(|value| PathBuf::from(value.trim().trim_matches('"')))
}

fn read_lockfile(path: &Path) -> Option<Credentials> {
    parse_lockfile(&std::fs::read_to_string(path).ok()?)
}

pub fn parse_lockfile(text: &str) -> Option<Credentials> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    let [_name, _pid, port, password, _protocol] = parts.as_slice() else {
        return None;
    };
    Some(Credentials { port: port.parse().ok()?, password: (*password).to_string() })
}

fn from_process_args() -> Option<Credentials> {
    ux_processes().into_iter().find_map(|process| {
        let flag = |name: &str| process.args.iter().find_map(|a| a.strip_prefix(name).map(str::to_string));
        Some(Credentials {
            port: flag("--app-port=")?.parse().ok()?,
            password: flag("--remoting-auth-token=")?,
        })
    })
}

struct UxProcess {
    exe: Option<PathBuf>,
    args: Vec<String>,
}

fn ux_processes() -> Vec<UxProcess> {
    let mut system = System::new_with_specifics(RefreshKind::nothing());
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::Always).with_cmd(UpdateKind::Always),
    );
    system
        .processes()
        .values()
        .filter(|p| p.name().eq_ignore_ascii_case(UX_PROCESS))
        .map(|p| UxProcess {
            exe: p.exe().map(Path::to_path_buf),
            args: p.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_lockfile() {
        let creds = parse_lockfile("LeagueClient:12345:54321:s3cr3t-Token_x:https").unwrap();
        assert_eq!(creds, Credentials { port: 54321, password: "s3cr3t-Token_x".into() });
    }

    #[test]
    fn rejects_a_malformed_lockfile() {
        assert!(parse_lockfile("").is_none());
        assert!(parse_lockfile("LeagueClient:1:notaport:pw:https").is_none());
        assert!(parse_lockfile("LeagueClient:1:2:pw").is_none());
    }
}
