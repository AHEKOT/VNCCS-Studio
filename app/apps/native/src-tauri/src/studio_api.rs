use serde::Serialize;
use std::{
  io::Write,
  process::{Command, Stdio},
};
use tauri::Url;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
  status: u16,
  content_type: String,
  body: String,
}

fn request(url: Url, body: String) -> Result<Reply, String> {
  #[cfg(target_os = "macos")]
  let program = "/usr/bin/curl";
  #[cfg(target_os = "windows")]
  let program = std::env::var_os("SystemRoot")
    .map(|root| std::path::PathBuf::from(root).join("System32/curl.exe"))
    .ok_or("Windows system folder is unavailable")?;
  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  let program = "curl";

  let mut command = Command::new(program);
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
  }
  let mut child = command
    .args([
      "-q",
      "--silent",
      "--show-error",
      "--globoff",
      "--connect-timeout",
      "10",
      "--header",
      "X-VNCCS-CSRF: 1",
      "--header",
      "Content-Type: application/json",
      "--write-out",
      "\n%{http_code}\n%{content_type}",
      "--data-binary",
      "@-",
      "--url",
      url.as_str(),
    ])
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|error| error.to_string())?;
  let sent = child
    .stdin
    .take()
    .ok_or("Could not send VNCCS request")?
    .write_all(body.as_bytes());
  let output = child
    .wait_with_output()
    .map_err(|error| error.to_string())?;
  sent.map_err(|error| error.to_string())?;
  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
  }
  let text = String::from_utf8_lossy(&output.stdout);
  let mut parts = text.rsplitn(3, '\n');
  let content_type = parts
    .next()
    .filter(|value| !value.is_empty())
    .unwrap_or("text/plain");
  let status = parts
    .next()
    .and_then(|value| value.parse().ok())
    .ok_or("Invalid VNCCS response")?;
  let body = parts.next().unwrap_or_default().to_owned();
  Ok(Reply {
    body,
    content_type: content_type.to_owned(),
    status,
  })
}

#[tauri::command]
pub async fn vnccs_post(url: String, body: String) -> Result<Reply, String> {
  let url = Url::parse(&url).map_err(|error| error.to_string())?;
  if !matches!(url.scheme(), "http" | "https")
    || url.host().is_none()
    || !url.username().is_empty()
    || url.password().is_some()
    || !url.path().starts_with("/api/vnccs/")
  {
    return Err("Invalid VNCCS API URL".into());
  }
  tauri::async_runtime::spawn_blocking(move || request(url, body))
    .await
    .map_err(|error| error.to_string())?
}
