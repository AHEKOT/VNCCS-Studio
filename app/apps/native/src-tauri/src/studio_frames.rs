const POSE_HTML: &str = include_str!("../studio_host/pose_host.html");
const POSE_SCRIPT: &str = include_str!("../studio_host/pose_host.mjs");
const SCENE_HTML: &str = include_str!("../studio_host/scene_host.html");
const SCENE_SCRIPT: &str = include_str!("../studio_host/scene_host.mjs");

pub fn bootstrap() -> String {
  let html = serde_json::to_string(POSE_HTML).unwrap();
  let scene_html = serde_json::to_string(SCENE_HTML).unwrap();
  format!(
    r#"(() => {{
      if (window.parent === window || window.parent !== window.top ||
          !["http:", "https:"].includes(location.protocol) || location.pathname !== "/extensions") return;
      const params = new URLSearchParams(location.search);
      const pose = /^[A-Za-z0-9_-]{{1,64}}$/.test(params.get("node") ?? "");
      const scene = ["backgrounds", "cg"].includes(params.get("editor"));
      const origin = pose ? params.get("vnccs-studio-pose") : scene ? params.get("vnccs-studio-scene") : null;
      if (!["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420"].includes(origin)) return;
      const mount = () => {{
        const page = new DOMParser().parseFromString(pose ? {html} : {scene_html}, "text/html");
        page.head.querySelector("script")?.remove();
        page.head.querySelector('meta[name="vnccs-studio-origin"]').content = origin;
        document.documentElement.lang = "en";
        document.head.replaceChildren(...page.head.childNodes);
        document.body.replaceChildren(...page.body.childNodes);
        if (pose) {{
          {POSE_SCRIPT}
        }} else {{
          {SCENE_SCRIPT}
        }}
      }};
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount, {{ once: true }});
    }})();"#
  )
}
