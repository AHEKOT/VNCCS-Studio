const editors = {
    backgrounds: { script: "vnccs_background_creator.js", type: "VNCCS_BackgroundCreator", state: "background_data", initial: '{"schema_version":2}' },
    cg: { script: "vnccs_cg_creator.js", type: "VNCCS_CGCreator", state: "cg_data", initial: '{"schema_version":1}' },
};
const params = new URLSearchParams(location.search);
const id = params.get("editor");
const desktop = params.has("vnccs-studio-scene");
const draftKey = `vnccs-studio-scene:${id}`;
const origin = document.querySelector('meta[name="vnccs-studio-origin"]').content;
const status = document.getElementById("scene-status");
const mount = document.getElementById("scene-editor");
const graph = { _nodes: [], setDirtyCanvas() {} };
const extensions = [];
const app = { graph, registerExtension: extension => extensions.push(extension) };
const api = new EventTarget();
api.apiURL = route => route.startsWith("/api/") ? route : `/api${route}`;
api.fetchApi = (route, options) => fetch(api.apiURL(route), options);
window.comfyAPI = { app: { app }, api: { api } };

let node;
let socket;
let retry;
let started = false;
let leaving = false;
let preparedBackground;

function post(type, data = {}) {
    window.parent.postMessage({ source: "vnccs-scene-host", editor: id, type, ...data }, origin);
}

function connect() {
    const url = new URL("/ws", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.addEventListener("open", () => api.dispatchEvent(new Event("reconnected")));
    socket.addEventListener("message", event => {
        if (typeof event.data !== "string") return;
        try {
            const message = JSON.parse(event.data);
            if (typeof message?.type === "string") {
                const detail = message.type === "status" ? message.data?.status ?? message.data : message.data;
                api.dispatchEvent(new CustomEvent(message.type, { detail }));
            }
        } catch { /* Ignore malformed event frames. */ }
    });
    socket.addEventListener("close", () => {
        if (leaving) return;
        api.dispatchEvent(new Event("reconnecting"));
        retry = setTimeout(connect, 3000);
    });
}

async function prepareBackground() {
    const widget = node.backgroundCreator;
    await widget.operations;
    await widget.refreshWorkflowBusy();
    if (widget.busy || widget.restoring || widget.workflowBusy) {
        throw new Error("Wait for Background Creator and ComfyUI to finish their current work.");
    }
    if (widget.document?._recovery || widget.document?.archived) {
        throw new Error("The selected background is read-only.");
    }
    if (!await widget.ensureDocument()) {
        throw new Error("Select or create a background first.");
    }
    widget.randomizeSeedIfNeeded();
    await widget.persist();
    const value = widget.sync() || node.widgets[1].value;
    const state = JSON.parse(value);
    preparedBackground = state;
    widget.setWorkflowBusy(true);
    return JSON.stringify({ ...state, _vnccs_seed_resolved: true });
}

async function refreshBackground() {
    const widget = node.backgroundCreator, prepared = preparedBackground;
    preparedBackground = null;
    try {
        if (!prepared || widget.state.background_id !== prepared.background_id) return;
        const epoch = widget.epoch;
        const document = await widget.request(`/backgrounds/${prepared.background_id}`);
        if (epoch !== widget.epoch || widget.disposed) return;
        if (!widget.unsaved && widget.state.selected_image_id === prepared.selected_image_id) {
            widget.state.selected_image_id = document.selected_image_id;
            widget.state.revision = document.revision;
        }
        await widget.acceptDocument(document, false, epoch);
    } finally {
        widget.refreshWorkflowBusy();
    }
}

function scaleToViewport() {
    const scale = window.innerHeight / mount.offsetHeight;
    mount.style.transform = scale < 1 ? `scale(${scale})` : "";
}

const fitContent = new ResizeObserver(scaleToViewport);

function fit() {
    if (!node || !window.innerWidth) return;
    if (desktop && id === "cg") {
        const width = Math.max(880, window.innerWidth);
        const zoom = window.innerWidth / width;
        mount.style.setProperty("--studio-cg-width", `${width}px`);
        mount.style.setProperty("--studio-cg-height", `${window.innerHeight / zoom}px`);
        mount.style.setProperty("--studio-cg-zoom", zoom);
    }
    node.setSize([window.innerWidth, window.innerHeight + 90]);
    node.onResize?.(node.size);
    scaleToViewport();
}

async function start(editor, initialState) {
    const response = await fetch("/extensions");
    if (!response.ok) throw new Error(`Could not list VNCCS extensions (HTTP ${response.status}).`);
    const urls = await response.json();
    const script = urls.find(url => /^\/extensions\/[^/]+\//.test(url) && url.endsWith(`/${editor.script}`));
    if (!script) throw new Error("The connected ComfyUI does not provide this VNCCS editor.");
    await import(new URL(script, location.origin).href);

    class EditorNode {
        id = `studio-${id}`;
        type = editor.type;
        studioHost = true;
        graph = graph;
        size = [window.innerWidth, window.innerHeight + 90];
        widgets = [{ name: "seed", value: 0 }, { name: editor.state, value: initialState }];

        setSize(size) {
            this.size = [window.innerWidth || size[0], size[1]];
        }

        addDOMWidget(name, type, element, options) {
            mount.append(element);
            const widget = { name, type, element, options };
            this.widgets.push(widget);
            return widget;
        }
    }

    for (const extension of extensions) {
        await extension.setup?.(app);
        await extension.beforeRegisterNodeDef?.(EditorNode, { name: editor.type }, app);
    }
    node = new EditorNode();
    graph._nodes.push(node);
    const widget = node.widgets[1];
    let value = widget.value;
    Object.defineProperty(widget, "value", {
        get: () => value,
        set: next => {
            value = next;
            post("state", { value });
        },
    });
    node.onNodeCreated();
    fit();
    fitContent.observe(mount);
    status.hidden = true;
    post("state", { value });
    post("ready");
    connect();
}

window.addEventListener("resize", fit);
window.addEventListener("pagehide", () => {
    leaving = true;
    fitContent.disconnect();
    node?.onRemoved?.();
    clearTimeout(retry);
    socket?.close();
});
window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const message = event.data;
    if (message?.source !== "vnccs-studio" || message.editor !== id) return;
    if (message.type === "activate") api.dispatchEvent(new Event("reconnected"));
    if (message.type === "prepare-background" && node?.backgroundCreator) {
        prepareBackground().then(
            value => post("background-prepared", { value }),
            error => post("background-prepared", { error: error.message })
        );
    }
    if (message.type === "background-finished" && node?.backgroundCreator) {
        refreshBackground().catch(error => node.backgroundCreator.message(error.message, true));
    }
    if (message.type !== "init" || started) return;
    started = true;
    const editor = editors[id];
    let saved = typeof message.value === "string" ? message.value : null;
    if (desktop && !saved) {
        try { saved = localStorage.getItem(draftKey); } catch { /* Optional draft storage. */ }
    }
    start(editor, saved ?? editor.initial).catch(error => {
        status.textContent = error.message;
        post("error", { message: error.message });
    });
});

if (!Object.hasOwn(editors, id) || window.parent === window || !origin) {
    status.textContent = "Open this editor from a VNCCS Studio origin trusted by ComfyUI.";
} else {
    if (desktop) mount.dataset.desktop = "";
    post("hello");
}
