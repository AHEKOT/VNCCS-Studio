import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { VnccsHttp } from "@workspace/vnccs/http";
import { type ComfyHost, comfyHost } from "@workspace/vnccs/runner";

let http: VnccsHttp | null = null;

interface NativeReply {
  body: string;
  contentType: string;
  status: number;
}

async function studioFetch(url: string, init?: RequestInit): Promise<Response> {
  if (
    inDesktopApp() &&
    init?.method === "POST" &&
    typeof init.body === "string" &&
    new URL(url).pathname.startsWith("/api/vnccs/")
  ) {
    const reply = await invoke<NativeReply>("vnccs_post", {
      url,
      body: init.body,
    });
    return new Response(reply.body || null, {
      headers: { "Content-Type": reply.contentType },
      status: reply.status,
    });
  }
  return fetch(url, init);
}

/** REST client for the configured ComfyUI, rebuilt when the URL changes. */
export function studioHttp(): VnccsHttp {
  const { comfyUrl } = useSettingsStore.getState();
  if (http?.baseUrl !== comfyUrl) {
    http = new VnccsHttp(comfyUrl, studioFetch);
  }
  return http;
}

/** comfy-ts host for the configured ComfyUI. */
export function studioHost(): ComfyHost {
  return comfyHost(useSettingsStore.getState().comfyUrl);
}

import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "@workspace/core/lib/tauri";
