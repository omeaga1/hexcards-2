//! Talks to the League client (LCU) on 127.0.0.1.
//!
//! TLS trusts Riot's published root certificate (certs/riotgames.pem) for this client only.
//! The client's certificate isn't issued for "127.0.0.1", so the hostname check is skipped,
//! but the chain must still lead to Riot's root.
//!
//! Requests are limited to an allowlist. There is deliberately no DELETE: Hex Cards never
//! removes a rune page or item set.

use crate::lockfile::Credentials;
use base64::Engine;
use serde_json::Value;

const RIOT_ROOT_PEM: &[u8] = include_bytes!("../certs/riotgames.pem");

#[derive(Debug, thiserror::Error)]
pub enum LcuError {
    #[error("That client request isn't allowed: {0} {1}")]
    NotAllowed(String, String),
    #[error("League client request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("TLS setup failed: {0}")]
    Tls(#[from] native_tls::Error),
}

/// (method, path pattern). `*` matches one path segment.
const ALLOWED: &[(&str, &str)] = &[
    ("GET", "/lol-summoner/v1/current-summoner"),
    ("GET", "/lol-gameflow/v1/gameflow-phase"),
    ("GET", "/lol-champ-select/v1/session"),
    ("PATCH", "/lol-champ-select/v1/session/my-selection"),
    ("GET", "/lol-perks/v1/styles"),
    ("GET", "/lol-perks/v1/pages"),
    ("GET", "/lol-perks/v1/inventory"),
    ("POST", "/lol-perks/v1/pages"),
    ("PUT", "/lol-perks/v1/pages/*"),
    ("PUT", "/lol-perks/v1/currentpage"),
    ("GET", "/lol-item-sets/v1/item-sets/*/sets"),
    ("PUT", "/lol-item-sets/v1/item-sets/*/sets"),
];

pub fn is_allowed(method: &str, path: &str) -> bool {
    let segments: Vec<&str> = path.split('/').collect();
    ALLOWED.iter().any(|(m, pattern)| {
        let pattern: Vec<&str> = pattern.split('/').collect();
        m.eq_ignore_ascii_case(method)
            && pattern.len() == segments.len()
            && pattern.iter().zip(&segments).all(|(p, s)| {
                if *p == "*" { !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') } else { p == s }
            })
    })
}

pub fn tls_connector() -> Result<native_tls::TlsConnector, native_tls::Error> {
    native_tls::TlsConnector::builder()
        .add_root_certificate(native_tls::Certificate::from_pem(RIOT_ROOT_PEM)?)
        .danger_accept_invalid_hostnames(true)
        .build()
}

pub fn basic_auth(creds: &Credentials) -> String {
    let token = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", creds.password));
    format!("Basic {token}")
}

#[derive(Clone)]
pub struct Lcu {
    pub creds: Credentials,
    http: reqwest::Client,
}

#[derive(serde::Serialize)]
pub struct LcuResponse {
    pub status: u16,
    pub body: Value,
}

impl Lcu {
    pub fn new(creds: Credentials) -> Result<Self, LcuError> {
        let http = reqwest::Client::builder()
            .use_preconfigured_tls(tls_connector()?)
            .timeout(std::time::Duration::from_secs(5))
            .build()?;
        Ok(Self { creds, http })
    }

    pub async fn request(&self, method: &str, path: &str, body: Option<Value>) -> Result<LcuResponse, LcuError> {
        if !is_allowed(method, path) {
            return Err(LcuError::NotAllowed(method.into(), path.into()));
        }
        let method = reqwest::Method::from_bytes(method.to_ascii_uppercase().as_bytes())
            .map_err(|_| LcuError::NotAllowed(method.into(), path.into()))?;
        let url = format!("https://127.0.0.1:{}{}", self.creds.port, path);
        let mut req = self.http.request(method, url).header("Authorization", basic_auth(&self.creds));
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await?;
        let status = res.status().as_u16();
        let text = res.text().await?;
        let body = serde_json::from_str(&text).unwrap_or(Value::String(text));
        Ok(LcuResponse { status, body })
    }
}

#[cfg(test)]
mod tests {
    use super::is_allowed;

    #[test]
    fn allows_only_listed_requests() {
        assert!(is_allowed("GET", "/lol-perks/v1/pages"));
        assert!(is_allowed("put", "/lol-perks/v1/pages/123"));
        assert!(is_allowed("PUT", "/lol-item-sets/v1/item-sets/9876/sets"));
        assert!(!is_allowed("DELETE", "/lol-perks/v1/pages/123"));
        assert!(!is_allowed("GET", "/lol-perks/v1/pages/123/../../x"));
        assert!(!is_allowed("POST", "/lol-login/v1/session"));
        assert!(!is_allowed("PUT", "/lol-perks/v1/pages/"));
    }
}
