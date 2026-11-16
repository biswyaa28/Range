use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(120);
const FAILED: &str = "Sign-in failed. Try again.";

const SUCCESS_HTML: &str = "<!doctype html><meta charset=\"utf-8\"><title>Signed in</title>\
<body style=\"font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f\">\
<main style=\"text-align:center\"><h1 style=\"font-size:20px\">You can close this tab</h1><p style=\"color:#6e6e73\">Personal OS is signed in.</p></main></body>";
const CANCEL_HTML: &str = "<!doctype html><meta charset=\"utf-8\"><title>Sign-in cancelled</title>\
<body style=\"font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f\">\
<main style=\"text-align:center\"><h1 style=\"font-size:20px\">Sign-in cancelled</h1><p style=\"color:#6e6e73\">You can close this tab.</p></main></body>";
const FAIL_HTML: &str = "<!doctype html><meta charset=\"utf-8\"><title>Sign-in failed</title>\
<body style=\"font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f\">\
<main style=\"text-align:center\"><h1 style=\"font-size:20px\">Sign-in failed</h1><p style=\"color:#6e6e73\">Close this tab and try again in Personal OS.</p></main></body>";

/// Set by the `google_sign_in_cancel` command so an open loopback wait can end.
static CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleTokens {
  pub id_token: String,
  pub access_token: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationTokens {
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub expires_at: String,
  pub scopes: Vec<String>,
}

pub fn cancel() {
  CANCELLED.store(true, Ordering::SeqCst);
}

fn configured(value: Option<&'static str>) -> Option<&'static str> {
  value.map(str::trim).filter(|entry| !entry.is_empty())
}

fn random_token(bytes: usize) -> Result<String, String> {
  let mut buffer = vec![0u8; bytes];
  getrandom::fill(&mut buffer).map_err(|_| "Could not start sign-in.".to_string())?;
  Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buffer))
}

fn respond(stream: &mut TcpStream, status: u16, body: &str) {
  let reason = match status {
    200 => "OK",
    404 => "Not Found",
    _ => "Bad Request",
  };
  let response = format!(
    "HTTP/1.1 {status} {reason}\r\n\
     Content-Type: text/html; charset=utf-8\r\n\
     Content-Length: {}\r\n\
     Cache-Control: no-store\r\n\
     Connection: close\r\n\r\n{body}",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.flush();
}

/// Reads only the request line (and drains bounded headers) so a hostile local
/// client cannot make us buffer megabytes.
fn read_request_line(stream: &mut TcpStream) -> Option<String> {
  stream
    .set_read_timeout(Some(Duration::from_secs(5)))
    .ok()?;
  let clone = stream.try_clone().ok()?;
  let mut reader = BufReader::new(clone);
  let mut request_line = String::new();
  if reader.read_line(&mut request_line).ok()? == 0 {
    return None;
  }
  let mut consumed = request_line.len();
  for _ in 0..40 {
    let mut header = String::new();
    if reader.read_line(&mut header).ok()? == 0 {
      break;
    }
    consumed += header.len();
    if consumed > 8192 || header.trim().is_empty() {
      break;
    }
  }
  Some(request_line)
}

fn wait_for_code(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
  let deadline = Instant::now() + SIGN_IN_TIMEOUT;

  loop {
    if CANCELLED.load(Ordering::SeqCst) {
      return Err("Sign-in cancelled.".to_string());
    }
    if Instant::now() >= deadline {
      return Err("Sign-in timed out. Try again.".to_string());
    }

    match listener.accept() {
      Ok((mut stream, _)) => {
        let Some(request_line) = read_request_line(&mut stream) else {
          continue;
        };
        let target = request_line.split(' ').nth(1).unwrap_or("/");
        if !target.starts_with('/') {
          respond(&mut stream, 400, FAIL_HTML);
          return Err(FAILED.to_string());
        }

        let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{target}")) else {
          respond(&mut stream, 400, FAIL_HTML);
          return Err(FAILED.to_string());
        };

        if url.path() == "/favicon.ico" {
          respond(&mut stream, 404, "");
          continue;
        }

        let mut code: Option<String> = None;
        let mut state: Option<String> = None;
        let mut denied = false;
        for (key, value) in url.query_pairs() {
          match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => denied = true,
            _ => {}
          }
        }

        if denied {
          respond(&mut stream, 200, CANCEL_HTML);
          return Err("Sign-in cancelled.".to_string());
        }
        if state.as_deref() != Some(expected_state) {
          respond(&mut stream, 400, FAIL_HTML);
          return Err(FAILED.to_string());
        }
        let Some(code) = code else {
          respond(&mut stream, 400, FAIL_HTML);
          return Err(FAILED.to_string());
        };

        respond(&mut stream, 200, SUCCESS_HTML);
        return Ok(code);
      }
      Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
        std::thread::sleep(Duration::from_millis(100));
      }
      Err(_) => return Err(FAILED.to_string()),
    }
  }
}

fn exchange_code(
  code: &str,
  client_id: &str,
  client_secret: &str,
  redirect_uri: &str,
  verifier: &str,
) -> Result<GoogleTokens, String> {
  let response = ureq::post(TOKEN_ENDPOINT).send_form(&[
    ("code", code),
    ("client_id", client_id),
    ("client_secret", client_secret),
    ("redirect_uri", redirect_uri),
    ("grant_type", "authorization_code"),
    ("code_verifier", verifier),
  ]);

  let body = match response {
    Ok(ok) => ok
      .into_string()
      .map_err(|_| "Google did not accept the sign-in.".to_string())?,
    Err(ureq::Error::Status(_, _)) => {
      return Err("Google did not accept the sign-in. Check the OAuth client.".to_string())
    }
    Err(_) => return Err("Could not reach Google. Check your connection.".to_string()),
  };

  // The body may contain tokens: parse it, never log it.
  let parsed: serde_json::Value =
    serde_json::from_str(&body).map_err(|_| "Google did not accept the sign-in.".to_string())?;
  let id_token = parsed
    .get("id_token")
    .and_then(|value| value.as_str())
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "Google did not return an ID token.".to_string())?;
  let access_token = parsed
    .get("access_token")
    .and_then(|value| value.as_str())
    .filter(|value| !value.is_empty())
    .map(str::to_string);

  Ok(GoogleTokens {
    id_token: id_token.to_string(),
    access_token,
  })
}

fn integration_client() -> Result<(&'static str, &'static str), String> {
  let client_id = configured(option_env!("GOOGLE_DESKTOP_CLIENT_ID"))
    .ok_or_else(|| "Google integrations are not configured in this build.".to_string())?;
  let client_secret = configured(option_env!("GOOGLE_DESKTOP_CLIENT_SECRET"))
    .ok_or_else(|| "Google integrations are not configured in this build.".to_string())?;
  Ok((client_id, client_secret))
}

fn token_expiry(seconds: u64) -> String {
  let millis = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|value| value.as_millis() as u64)
    .unwrap_or(0)
    .saturating_add(seconds.saturating_mul(1000));
  let secs = millis / 1000;
  let days = secs / 86_400;
  let rem = secs % 86_400;
  let (year, month, day) = civil_from_days(days as i64);
  let hour = rem / 3_600;
  let minute = (rem % 3_600) / 60;
  let second = rem % 60;
  format!(
    "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z"
  )
}

/// Howard Hinnant's civil-from-days algorithm, avoiding a chrono dependency.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
  let mut year = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
  let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
  if month <= 2 {
    year += 1;
  }
  (year, month, day)
}

/// Incremental consent for read-only Gmail and Classroom scopes. Returns the
/// refresh token only to the app's protected store; it is never logged.
pub fn integration_sign_in(app: &AppHandle, scopes: &[String]) -> Result<IntegrationTokens, String> {
  let (client_id, client_secret) = integration_client()?;
  if scopes.is_empty() {
    return Err("Choose an integration first.".to_string());
  }

  CANCELLED.store(false, Ordering::SeqCst);
  let listener = TcpListener::bind(("127.0.0.1", 0))
    .map_err(|_| "Could not start sign-in.".to_string())?;
  listener
    .set_nonblocking(true)
    .map_err(|_| "Could not start sign-in.".to_string())?;
  let port = listener
    .local_addr()
    .map_err(|_| "Could not start sign-in.".to_string())?
    .port();
  let redirect_uri = format!("http://127.0.0.1:{port}");
  let verifier = random_token(32)?;
  let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
    .encode(Sha256::digest(verifier.as_bytes()));
  let state = random_token(16)?;
  let scope = scopes.join(" ");

  let mut url =
    url::Url::parse(AUTH_ENDPOINT).map_err(|_| "Could not start sign-in.".to_string())?;
  url
    .query_pairs_mut()
    .append_pair("client_id", client_id)
    .append_pair("redirect_uri", &redirect_uri)
    .append_pair("response_type", "code")
    .append_pair("scope", &scope)
    .append_pair("state", &state)
    .append_pair("code_challenge", &challenge)
    .append_pair("code_challenge_method", "S256")
    .append_pair("access_type", "offline")
    .append_pair("prompt", "consent");

  app
    .opener()
    .open_url(url.as_str(), None::<&str>)
    .map_err(|_| "Could not open the browser.".to_string())?;

  let code = wait_for_code(&listener, &state)?;
  let response = ureq::post(TOKEN_ENDPOINT).send_form(&[
    ("code", code.as_str()),
    ("client_id", client_id),
    ("client_secret", client_secret),
    ("redirect_uri", redirect_uri.as_str()),
    ("grant_type", "authorization_code"),
    ("code_verifier", verifier.as_str()),
  ]);
  let body = match response {
    Ok(ok) => ok
      .into_string()
      .map_err(|_| "Google did not accept the connection.".to_string())?,
    Err(_) => return Err("Google did not accept the connection. Check the OAuth client.".to_string()),
  };
  let parsed: serde_json::Value = serde_json::from_str(&body)
    .map_err(|_| "Google did not accept the connection.".to_string())?;
  let access_token = parsed
    .get("access_token")
    .and_then(|value| value.as_str())
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "Google did not return an access token.".to_string())?;
  let refresh_token = parsed
    .get("refresh_token")
    .and_then(|value| value.as_str())
    .filter(|value| !value.is_empty())
    .map(str::to_string);
  let expires_in = parsed
    .get("expires_in")
    .and_then(|value| value.as_u64())
    .unwrap_or(3_600);

  Ok(IntegrationTokens {
    access_token: access_token.to_string(),
    refresh_token,
    expires_at: token_expiry(expires_in),
    scopes: scopes.to_vec(),
  })
}

pub fn integration_refresh(refresh_token: &str) -> Result<IntegrationTokens, String> {
  let (client_id, client_secret) = integration_client()?;
  let response = ureq::post(TOKEN_ENDPOINT).send_form(&[
    ("client_id", client_id),
    ("client_secret", client_secret),
    ("refresh_token", refresh_token),
    ("grant_type", "refresh_token"),
  ]);
  let body = match response {
    Ok(ok) => ok
      .into_string()
      .map_err(|_| "Google access expired. Reconnect Google.".to_string())?,
    Err(ureq::Error::Status(_, _)) => {
      return Err("Google access expired. Reconnect Google.".to_string())
    }
    Err(_) => return Err("Could not reach Google. Check your connection.".to_string()),
  };
  let parsed: serde_json::Value = serde_json::from_str(&body)
    .map_err(|_| "Google access expired. Reconnect Google.".to_string())?;
  let access_token = parsed
    .get("access_token")
    .and_then(|value| value.as_str())
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "Google access expired. Reconnect Google.".to_string())?;
  let expires_in = parsed
    .get("expires_in")
    .and_then(|value| value.as_u64())
    .unwrap_or(3_600);
  Ok(IntegrationTokens {
    access_token: access_token.to_string(),
    refresh_token: Some(refresh_token.to_string()),
    expires_at: token_expiry(expires_in),
    scopes: Vec::new(),
  })
}

/// System-browser OAuth with PKCE and a one-shot loopback redirect listener.
pub fn google_sign_in(app: &AppHandle) -> Result<GoogleTokens, String> {
  let client_id = configured(option_env!("GOOGLE_DESKTOP_CLIENT_ID"))
    .ok_or_else(|| "Google sign-in is not configured in this build.".to_string())?;
  let client_secret = configured(option_env!("GOOGLE_DESKTOP_CLIENT_SECRET"))
    .ok_or_else(|| "Google sign-in is not configured in this build.".to_string())?;

  CANCELLED.store(false, Ordering::SeqCst);

  let listener = TcpListener::bind(("127.0.0.1", 0))
    .map_err(|_| "Could not start sign-in.".to_string())?;
  listener
    .set_nonblocking(true)
    .map_err(|_| "Could not start sign-in.".to_string())?;
  let port = listener
    .local_addr()
    .map_err(|_| "Could not start sign-in.".to_string())?
    .port();
  let redirect_uri = format!("http://127.0.0.1:{port}");

  let verifier = random_token(32)?;
  let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
    .encode(Sha256::digest(verifier.as_bytes()));
  let state = random_token(16)?;

  let mut url =
    url::Url::parse(AUTH_ENDPOINT).map_err(|_| "Could not start sign-in.".to_string())?;
  url
    .query_pairs_mut()
    .append_pair("client_id", client_id)
    .append_pair("redirect_uri", &redirect_uri)
    .append_pair("response_type", "code")
    .append_pair("scope", "openid email profile")
    .append_pair("state", &state)
    .append_pair("code_challenge", &challenge)
    .append_pair("code_challenge_method", "S256")
    .append_pair("access_type", "online")
    .append_pair("prompt", "select_account");

  app
    .opener()
    .open_url(url.as_str(), None::<&str>)
    .map_err(|_| "Could not open the browser.".to_string())?;

  let code = wait_for_code(&listener, &state)?;
  exchange_code(&code, client_id, client_secret, &redirect_uri, &verifier)
}
