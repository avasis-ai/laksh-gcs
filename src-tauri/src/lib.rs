//! Laksh desktop backend.
//!
//! Mirrors the Next.js server routes (`app/api/reactor/*`) as native Tauri
//! commands so the desktop build never needs the Node server — and, crucially,
//! so the secret `REACTOR_API_KEY` lives ONLY in this Rust process and is never
//! shipped in or exposed to the webview/JS bundle.
//!
//! The browser build keeps using the Next API routes unchanged; the frontend
//! picks the right transport at runtime (see `lib/reactor/client.ts`).

use serde::Serialize;
use serde_json::Value;

const DEFAULT_API_URL: &str = "https://api.reactor.inc";

/// Resolve the Reactor API base URL (no trailing slash).
fn api_url() -> String {
    std::env::var("REACTOR_API_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Read the server-side API key, with a clear error if missing.
///
/// The key is read from the process environment. During development the
/// environment is hydrated from `.env.local` / `.env` (see [`load_env`]); for a
/// shipped bundle the key should come from the OS environment (or, in future, a
/// secure prompt + OS keychain). It is never returned to JS.
fn api_key() -> Result<String, String> {
    std::env::var("REACTOR_API_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| {
            "REACTOR_API_KEY is not set. Add it to .env.local (dev) or the environment.".to_string()
        })
}

#[derive(Serialize)]
pub struct HealthResponse {
    ok: bool,
    configured: bool,
    #[serde(rename = "apiUrl")]
    api_url: String,
    #[serde(rename = "tokenExpiresAt", skip_serializing_if = "Option::is_none")]
    token_expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Mint a short-lived JWT from the long-lived API key.
///
/// The key never leaves Rust; only the `{ jwt, expires_at }` JSON is returned
/// to the webview, exactly like `POST /api/reactor/token` in the web build.
#[tauri::command]
async fn mint_reactor_token(expires_after: Option<u64>) -> Result<Value, String> {
    let key = api_key()?;
    let client = http_client()?;

    let mut req = client
        .post(format!("{}/tokens", api_url()))
        .header("Reactor-API-Key", key)
        .header("Content-Type", "application/json");

    if let Some(exp) = expires_after {
        req = req.json(&serde_json::json!({ "expires_after": exp }));
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Failed to mint token ({}): {}",
            status.as_u16(),
            text.chars().take(500).collect::<String>()
        ));
    }

    serde_json::from_str(&text).map_err(|e| format!("Invalid token response: {e}"))
}

/// Fetch the public Reactor pricing table (no auth required).
#[tauri::command]
async fn reactor_pricing() -> Result<Value, String> {
    let client = http_client()?;
    let res = client
        .get(format!("{}/pricing", api_url()))
        .send()
        .await
        .map_err(|e| format!("Pricing request failed: {e}"))?;

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Failed to fetch pricing ({}): {}",
            status.as_u16(),
            text.chars().take(500).collect::<String>()
        ));
    }

    serde_json::from_str(&text).map_err(|e| format!("Invalid pricing response: {e}"))
}

/// Readiness probe: confirm the key is configured and can mint a token.
/// Mirrors `GET /api/reactor/health`.
#[tauri::command]
async fn reactor_health() -> Result<HealthResponse, String> {
    let api_url = api_url();
    let key = match api_key() {
        Ok(k) => k,
        Err(_) => {
            return Ok(HealthResponse {
                ok: false,
                configured: false,
                api_url,
                token_expires_at: None,
                error: Some("REACTOR_API_KEY is not set.".to_string()),
            })
        }
    };

    let client = http_client()?;
    let res = client
        .post(format!("{}/tokens", api_url))
        .header("Reactor-API-Key", key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "expires_after": 60 }))
        .send()
        .await;

    match res {
        Ok(r) if r.status().is_success() => {
            let body: Value = r.json().await.unwrap_or_default();
            let token_expires_at = body.get("expires_at").and_then(|v| v.as_i64());
            Ok(HealthResponse {
                ok: true,
                configured: true,
                api_url,
                token_expires_at,
                error: None,
            })
        }
        Ok(r) => {
            let status = r.status().as_u16();
            let text = r.text().await.unwrap_or_default();
            Ok(HealthResponse {
                ok: false,
                configured: true,
                api_url,
                token_expires_at: None,
                error: Some(format!("Credential check failed ({status}): {text}")),
            })
        }
        Err(e) => Ok(HealthResponse {
            ok: false,
            configured: true,
            api_url,
            token_expires_at: None,
            error: Some(format!("Credential check failed: {e}")),
        }),
    }
}

/// Hydrate the process environment from local dotfiles during development.
///
/// `dotenvy` does not override variables that are already set, so a real OS
/// environment (e.g. a packaged build launched with `REACTOR_API_KEY=…`) always
/// wins. We probe both the current dir and the parent, because `tauri dev`/
/// `cargo` usually run with the working dir at `src-tauri/`.
fn load_env() {
    for name in [".env.local", ".env"] {
        let _ = dotenvy::from_filename(name);
        let _ = dotenvy::from_filename(format!("../{name}"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            mint_reactor_token,
            reactor_pricing,
            reactor_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running Laksh desktop application");
}
