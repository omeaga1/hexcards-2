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
    // Which champions you own, so champ select suggestions are ones you can pick.
    ("GET", "/lol-champions/v1/owned-champions-minimal"),
    ("PATCH", "/lol-champ-select/v1/session/my-selection"),
    ("GET", "/lol-perks/v1/styles"),
    ("GET", "/lol-perks/v1/pages"),
    ("GET", "/lol-perks/v1/inventory"),
    ("POST", "/lol-perks/v1/pages"),
    ("PUT", "/lol-perks/v1/pages/*"),
    ("PUT", "/lol-perks/v1/currentpage"),
    ("GET", "/lol-item-sets/v1/item-sets/*/sets"),
    ("PUT", "/lol-item-sets/v1/item-sets/*/sets"),
    // Player stats: the same profile, rank and match history the client's own profile pages show.
    ("GET", "/riotclient/region-locale"),
    ("GET", "/lol-summoner/v1/summoners"),
    ("GET", "/lol-summoner/v2/summoners/puuid/*"),
    ("GET", "/player-account/aliases/v1/lookup"),
    ("GET", "/lol-ranked/v1/ranked-stats/*"),
    ("GET", "/lol-match-history/v1/products/lol/*/matches"),
    ("GET", "/lol-match-history/v1/games/*"),
];

/// Paths that take a query string, e.g. `?name=Faker%23KR1` or `?begIndex=0&endIndex=20`.
const QUERY_ALLOWED: &[&str] = &[
    "/lol-summoner/v1/summoners",
    "/player-account/aliases/v1/lookup",
    "/lol-match-history/v1/products/lol/*/matches",
];

fn matches(pattern: &str, segments: &[&str]) -> bool {
    let pattern: Vec<&str> = pattern.split('/').collect();
    pattern.len() == segments.len()
        && pattern.iter().zip(segments).all(|(p, s)| {
            // IDs and PUUIDs: letters, digits, "-" and "_". Never "." or an encoded slash.
            if *p == "*" { !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') } else { p == s }
        })
}

pub fn is_allowed(method: &str, path: &str) -> bool {
    let (path, query) = match path.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (path, None),
    };
    let segments: Vec<&str> = path.split('/').collect();
    if let Some(query) = query {
        // Percent-encoded values only, so a query can't smuggle in another path or fragment.
        let safe = !query.is_empty() && query.chars().all(|c| c.is_ascii_alphanumeric() || "%=&-_.+".contains(c));
        if !safe || !QUERY_ALLOWED.iter().any(|p| matches(p, &segments)) {
            return false;
        }
    }
    ALLOWED.iter().any(|(m, pattern)| m.eq_ignore_ascii_case(method) && matches(pattern, &segments))
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
        assert!(is_allowed("GET", "/lol-champions/v1/owned-champions-minimal"));
        assert!(!is_allowed("POST", "/lol-champions/v1/owned-champions-minimal"));
        assert!(!is_allowed("DELETE", "/lol-perks/v1/pages/123"));
        assert!(!is_allowed("GET", "/lol-perks/v1/pages/123/../../x"));
        assert!(!is_allowed("POST", "/lol-login/v1/session"));
        assert!(!is_allowed("PUT", "/lol-perks/v1/pages/"));
    }

    #[test]
    fn allows_player_lookups_with_safe_queries() {
        assert!(is_allowed("GET", "/lol-summoner/v1/summoners?name=Hide%20on%20bush%23KR1"));
        assert!(is_allowed("GET", "/player-account/aliases/v1/lookup?gameName=Faker&tagLine=KR1"));
        assert!(is_allowed("GET", "/lol-ranked/v1/ranked-stats/a1B2-c3_D4"));
        assert!(is_allowed("GET", "/lol-match-history/v1/products/lol/a1B2-c3_D4/matches?begIndex=0&endIndex=20"));
        assert!(is_allowed("GET", "/lol-match-history/v1/games/5123456789"));
        assert!(!is_allowed("GET", "/lol-summoner/v1/summoners?name=x#y"));
        assert!(!is_allowed("GET", "/lol-summoner/v1/summoners?name=../../lol-login"));
        assert!(!is_allowed("GET", "/lol-ranked/v1/ranked-stats/abc?x=1"));
        assert!(!is_allowed("GET", "/lol-perks/v1/pages?x=1"));
        assert!(!is_allowed("GET", "/lol-match-history/v1/games/.."));
        assert!(!is_allowed("POST", "/lol-summoner/v1/summoners?name=a"));
    }
}
