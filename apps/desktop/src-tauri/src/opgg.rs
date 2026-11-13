//! Player stats when the League client isn't running: OP.GG's public data service (the same one
//! behind its AI integrations). It needs no key and answers for every region.
//!
//! Only three read-only lookups are allowed: a player's profile, their recent games, and one game.
//! The request goes from here rather than the window because the service doesn't send CORS headers.

use serde_json::{json, Value};
use std::time::Duration;

const ENDPOINT: &str = "https://mcp-api.op.gg/mcp";
const TOOLS: &[&str] = &["lol_get_summoner_profile", "lol_list_summoner_matches", "lol_get_summoner_game_detail"];

pub fn is_allowed(tool: &str) -> bool {
    TOOLS.contains(&tool)
}

/// Calls one lookup and returns its text result (OP.GG's compact class notation; the UI parses it).
pub async fn call(tool: &str, arguments: Value) -> Result<String, String> {
    if !is_allowed(tool) {
        return Err(format!("That lookup isn't allowed: {tool}"));
    }
    let mut arguments = arguments;
    if let Some(args) = arguments.as_object_mut() {
        args.insert("client_app".into(), json!(concat!("HexCards/", env!("CARGO_PKG_VERSION"))));
    } else {
        return Err("Lookup arguments must be an object.".into());
    }
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": tool, "arguments": arguments } });
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let res = client
        .post(ENDPOINT)
        .header("Accept", "application/json, text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| "Couldn't reach OP.GG. Check your internet connection.".to_string())?;
    let status = res.status();
    let value: Value = res.json().await.map_err(|_| format!("OP.GG sent an unreadable answer (status {status})."))?;
    text_of(&value)
}

/// The text of a JSON-RPC tool result, or its error message.
fn text_of(value: &Value) -> Result<String, String> {
    if let Some(message) = value.pointer("/error/message").and_then(Value::as_str) {
        return Err(message.to_string());
    }
    let text = value.pointer("/result/content/0/text").and_then(Value::as_str).ok_or("OP.GG sent an empty answer.")?;
    if value.pointer("/result/isError").and_then(Value::as_bool) == Some(true) {
        return Err(text.to_string());
    }
    Ok(text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_player_lookups() {
        assert!(is_allowed("lol_get_summoner_profile"));
        assert!(is_allowed("lol_list_summoner_matches"));
        assert!(is_allowed("lol_get_summoner_game_detail"));
        assert!(!is_allowed("lol_get_champion_analysis"));
        assert!(!is_allowed("valorant_list_player_matches"));
    }

    #[test]
    fn reads_results_and_errors() {
        let ok = json!({ "result": { "content": [{ "type": "text", "text": "class A: b\n\nA(1)" }] } });
        assert_eq!(text_of(&ok).unwrap(), "class A: b\n\nA(1)");
        let err = json!({ "error": { "code": -32600, "message": "Summoner not found" } });
        assert_eq!(text_of(&err).unwrap_err(), "Summoner not found");
        let tool_err = json!({ "result": { "isError": true, "content": [{ "type": "text", "text": "Bad region" }] } });
        assert_eq!(text_of(&tool_err).unwrap_err(), "Bad region");
    }
}
