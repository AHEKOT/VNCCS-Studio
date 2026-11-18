"use client";

import { Page } from "@workspace/core/components/common/page";
import { GeneratorPanel } from "@workspace/core/components/generator/generator-panel";
import {
  useGenerator,
  useGeneratorProgress,
} from "@workspace/core/hooks/use-generator";
import {
  generatorData,
  prepareGeneratorRun,
  refreshGeneratorProgress,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { runPrompt } from "@workspace/core/lib/jobs";
import { inDesktopApp } from "@workspace/core/lib/tauri";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { useGeneratorStore } from "@workspace/core/stores/generator-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { Button } from "@workspace/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { nativeSeedvrProblem } from "@workspace/vnccs/character-generator";
import { viewNodeState } from "@workspace/vnccs/control-center-state";
import {
  BACKGROUND_GENERATOR_ID,
  buildBackgroundVariantsPrompt,
} from "@workspace/vnccs/graphs";
import { hostOrigin, studioFrameUrl } from "@workspace/vnccs/pose-host";
import { Loader2, Play } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

const editors = {
  backgrounds: "Background Creator",
  cg: "CG Creator",
} as const;
type Editor = keyof typeof editors;

const BACKGROUND_GENERATOR = {
  kind: "backgrounds",
  nodeId: BACKGROUND_GENERATOR_ID,
} as const;

interface SceneHandle {
  finish(): void;
  prepare(): Promise<string>;
}

interface SceneFrameProps {
  active: boolean;
  editor: Editor;
  onDraft?: (value: string) => void;
  onReady?: (ready: boolean) => void;
  ref?: Ref<SceneHandle>;
  server: string;
}

function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveDraft(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The editor saves scene documents directly to ComfyUI.
  }
}

interface Preparation {
  reject: (error: Error) => void;
  resolve: (value: string) => void;
}

function settlePreparation(
  request: Preparation | null,
  data: { value?: unknown; error?: unknown }
) {
  if (typeof data.value === "string") {
    request?.resolve(data.value);
  } else {
    request?.reject(
      new Error(String(data.error || "Could not prepare the background."))
    );
  }
}

function SceneFrame({
  active,
  editor,
  onDraft,
  onReady,
  ref,
  server,
}: SceneFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef<Preparation>(null);
  const origin = hostOrigin(server);
  const storageKey = `vnccs-scene:${server}:${editor}`;
  const [status, setStatus] = useState("Loading editor…");
  const nativeOrigin = inDesktopApp() ? window.location.origin : "";

  function send(type: string) {
    if (origin) {
      frame.current?.contentWindow?.postMessage(
        { source: "vnccs-studio", editor, type },
        origin
      );
    }
  }

  useImperativeHandle(ref, () => ({
    prepare: () =>
      new Promise<string>((resolve, reject) => {
        if (pending.current || !frame.current?.contentWindow || !origin) {
          reject(new Error("Wait for Background Creator to finish loading."));
          return;
        }
        pending.current = { resolve, reject };
        send("prepare-background");
      }),
    finish: () => send("background-finished"),
  }));

  useEffect(() => {
    if (!origin) {
      return;
    }
    const timer = setTimeout(() => {
      setStatus("This ComfyUI server did not load the editor.");
    }, 15_000);
    const receive = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target || event.origin !== origin) {
        return;
      }
      const data = event.data;
      if (data?.source !== "vnccs-scene-host" || data.editor !== editor) {
        return;
      }
      switch (data.type) {
        case "hello":
          target.postMessage(
            {
              source: "vnccs-studio",
              editor,
              type: "init",
              value: readDraft(storageKey),
            },
            origin
          );
          break;
        case "ready":
          clearTimeout(timer);
          setStatus("");
          onReady?.(true);
          break;
        case "error":
          clearTimeout(timer);
          setStatus(
            typeof data.message === "string"
              ? data.message
              : "Editor failed to load."
          );
          onReady?.(false);
          break;
        case "state":
          if (typeof data.value === "string") {
            saveDraft(storageKey, data.value);
            onDraft?.(data.value);
          }
          break;
        case "background-prepared": {
          settlePreparation(pending.current, data);
          pending.current = null;
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      pending.current?.reject(new Error("The background editor was closed."));
      pending.current = null;
    };
  }, [editor, onDraft, onReady, origin, storageKey]);

  useEffect(() => {
    if (active && origin) {
      frame.current?.contentWindow?.postMessage(
        { source: "vnccs-studio", editor, type: "activate" },
        origin
      );
    }
  }, [active, editor, origin]);

  return (
    <div className="relative h-full">
      {status && (
        <p
          className="absolute inset-x-0 top-0 px-6 py-4 text-muted-foreground text-sm"
          role="status"
        >
          {status}
        </p>
      )}
      <iframe
        className={`h-full w-full border-0 align-top ${status ? "invisible" : ""}`}
        ref={frame}
        src={
          nativeOrigin
            ? studioFrameUrl(server, "scene", editor, nativeOrigin)
            : `${server}/vnccs/studio/scene_host?editor=${editor}`
        }
        title={editors[editor]}
      />
    </div>
  );
}

function backgroundSource(raw: string) {
  try {
    const data = JSON.parse(raw);
    return {
      id: String(data.background_id || ""),
      imageId: String(data.selected_image_id || ""),
      variants: Array.isArray(data.editor?.variants)
        ? data.editor.variants.map((variant: { name?: string }) =>
            String(variant.name || "")
          )
        : [],
    };
  } catch {
    return { id: "", imageId: "", variants: [] };
  }
}

async function queueBackgrounds(
  editor: SceneHandle,
  setTab: (value: string) => void
) {
  const { catalog, nodeState, repoId } = useControlCenterStore.getState();
  const model = viewNodeState(nodeState, catalog);
  const entry = model.selectedModelEntry();
  if (entry?.status !== "installed" || model.selectedType() === "custom") {
    throw new Error(
      "Select an installed QI2, Klein9b or MiniMax H3 model in Control Center."
    );
  }
  const data = generatorData(BACKGROUND_GENERATOR);
  const problem = nativeSeedvrProblem(
    { ...data, upscaler: { ...data.upscaler, mode: "seedvr" } },
    useGeneratorStore.getState().schemas
  );
  if (problem) {
    throw new Error(problem);
  }
  if (!data.background_id) {
    setTab("backgrounds");
  }
  const prepared = await editor.prepare();
  try {
    syncGenerator(BACKGROUND_GENERATOR, {
      background: backgroundSource(prepared),
      nodeState,
    });
    setTab("generator");
    await runPrompt(
      "Backgrounds",
      buildBackgroundVariantsPrompt(
        { nodeState, repoId },
        prepared,
        prepareGeneratorRun(BACKGROUND_GENERATOR)
      ),
      model.activeKind().toLowerCase()
    );
    await refreshGeneratorProgress(BACKGROUND_GENERATOR);
  } finally {
    editor.finish();
  }
}

function BackgroundWorkspace({
  active,
  server,
}: {
  active: boolean;
  server: string;
}) {
  const editor = useRef<SceneHandle>(null);
  const [tab, setTab] = useState("backgrounds");
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const nodeState = useControlCenterStore((state) => state.nodeState);
  const busy = useConnectionStore(
    (state) => state.queue.running + state.queue.pending > 0
  );
  const online = useConnectionStore((state) => state.status === "online");
  const background = useMemo(() => backgroundSource(draft), [draft]);
  const sources = useMemo(
    () => ({ background, nodeState }),
    [background, nodeState]
  );
  const generator = useGenerator(
    BACKGROUND_GENERATOR.kind,
    BACKGROUND_GENERATOR.nodeId,
    sources
  );
  useGeneratorProgress(BACKGROUND_GENERATOR, running);

  const run = async () => {
    if (!editor.current || running) {
      return;
    }
    setRunning(true);
    try {
      await queueBackgrounds(editor.current, setTab);
    } catch (error) {
      toast.error("Background generation failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full" hidden={!active}>
      <Page className="h-full min-h-0 pb-0">
        <Tabs className="min-h-0 flex-1" onValueChange={setTab} value={tab}>
          <div className="flex flex-wrap items-center gap-3">
            <TabsList>
              <TabsTrigger value="backgrounds">Creator</TabsTrigger>
              <TabsTrigger value="generator">Generator</TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-3">
              <Button
                disabled={!(ready && online) || running || busy}
                onClick={run}
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {running ? "Generating…" : "Generate backgrounds"}
              </Button>
            </div>
          </div>
          <div className="relative mt-4 min-h-0 flex-1">
            <TabsContent
              className="absolute inset-0 data-[state=inactive]:invisible"
              forceMount
              value="backgrounds"
            >
              <SceneFrame
                active={active && tab === "backgrounds"}
                editor="backgrounds"
                onDraft={setDraft}
                onReady={setReady}
                ref={editor}
                server={server}
              />
            </TabsContent>
            <TabsContent className="h-full overflow-auto" value="generator">
              {generator && (
                <GeneratorPanel handle={generator} sources={sources} />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </Page>
    </div>
  );
}

function ConnectedEditors({
  pathname,
  server,
}: {
  pathname: string;
  server: string;
}) {
  const online = useConnectionStore((state) => state.status === "online");
  const active = (Object.keys(editors) as Editor[]).find(
    (editor) => pathname === `/${editor}`
  );
  const [opened, setOpened] = useState<Editor[]>([]);
  useEffect(() => {
    if (active && online) {
      setOpened((previous) =>
        previous.includes(active) ? previous : [...previous, active]
      );
    }
  }, [active, online]);

  return (
    <>
      {active && !online && !opened.includes(active) && (
        <p className="px-6 py-4 text-muted-foreground text-sm">
          Connect to ComfyUI in Settings to open {editors[active]}.
        </p>
      )}
      {opened.includes("backgrounds") && (
        <BackgroundWorkspace
          active={active === "backgrounds"}
          server={server}
        />
      )}
      {opened.includes("cg") && (
        <div className="h-full" hidden={active !== "cg"}>
          <SceneFrame active={active === "cg"} editor="cg" server={server} />
        </div>
      )}
    </>
  );
}

export function SceneEditors({ pathname }: { pathname: string }) {
  const server = useSettingsStore((state) => state.comfyUrl);
  return <ConnectedEditors key={server} pathname={pathname} server={server} />;
}
