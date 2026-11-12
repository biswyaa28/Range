use std::collections::HashMap;

/// Reads KEY=VALUE pairs from the project env files so the desktop OAuth client
/// stays in the same git-ignored place as the rest of the local secrets.
fn read_env_file(path: &str, into: &mut HashMap<String, String>) {
  println!("cargo:rerun-if-changed={path}");
  let Ok(contents) = std::fs::read_to_string(path) else {
    return;
  };
  for raw in contents.lines() {
    let line = raw.trim();
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    let Some((key, value)) = line.split_once('=') else {
      continue;
    };
    let key = key.trim();
    if key.is_empty() {
      continue;
    }
    let value = value.trim().trim_matches('"').trim_matches('\'');
    into.insert(key.to_string(), value.to_string());
  }
}

fn emit(name: &str, value: &str) {
  // Values are secrets: they are passed to rustc, never printed.
  if value.is_empty() || value.contains('\n') {
    return;
  }
  println!("cargo:rustc-env={name}={value}");
}

fn main() {
  let mut values: HashMap<String, String> = HashMap::new();
  read_env_file("../.env", &mut values);
  read_env_file("../.env.local", &mut values);

  for key in [
    "GOOGLE_DESKTOP_CLIENT_ID",
    "VITE_GOOGLE_DESKTOP_CLIENT_ID",
    "GOOGLE_DESKTOP_CLIENT_SECRET",
  ] {
    println!("cargo:rerun-if-env-changed={key}");
    if let Ok(value) = std::env::var(key) {
      values.insert(key.to_string(), value);
    }
  }

  let client_id = values
    .get("GOOGLE_DESKTOP_CLIENT_ID")
    .or_else(|| values.get("VITE_GOOGLE_DESKTOP_CLIENT_ID"));
  if let Some(client_id) = client_id {
    emit("GOOGLE_DESKTOP_CLIENT_ID", client_id);
  }
  if let Some(client_secret) = values.get("GOOGLE_DESKTOP_CLIENT_SECRET") {
    emit("GOOGLE_DESKTOP_CLIENT_SECRET", client_secret);
  }

  tauri_build::build()
}
