import { studioHttp } from "@workspace/core/lib/studio";
import { useSpriteManagerStore } from "@workspace/core/stores/sprite-manager-store";
import {
  catalogEmotions,
  catalogPreviews,
  deleteEmptyFolders,
  fetchCostumesForEmotion,
  fetchSpriteCatalog,
  fetchSpriteCharacters,
  fetchSpriteEmotions,
  findEmptyFolders,
  normalizeEmotions,
  pickCharacter,
  pickEmotion,
} from "@workspace/vnccs/sprite-manager";
import { toast } from "sonner";

/**
 * The Sprite Manager widget's flows (`web/vnccs_sprite_manager.js`). Each
 * browse request supersedes the previous one, so a slow reply for an earlier
 * character or emotion never overwrites the current selection.
 */

let request = 0;

function beginRequest(): () => boolean {
  request += 1;
  const id = request;
  return () => id === request;
}

function store() {
  return useSpriteManagerStore.getState();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function showCostumes(
  character: string,
  emotion: string,
  isCurrent: () => boolean
): Promise<void> {
  const { catalog } = store();
  if (catalog) {
    const previews = catalogPreviews(catalog, emotion);
    store().set({
      costumes: [...previews.keys()],
      loading: false,
      previews,
      previewStamp: Date.now(),
    });
    return;
  }
  let costumes: string[] = [];
  try {
    costumes = await fetchCostumesForEmotion(studioHttp(), character, emotion);
  } catch (error) {
    if (isCurrent()) {
      store().set({ loadError: errorText(error), loading: false });
    }
    return;
  }
  if (isCurrent()) {
    store().set({ costumes, loading: false, previewStamp: Date.now() });
  }
}

async function showCharacter(
  character: string,
  isCurrent: () => boolean
): Promise<void> {
  const { legacy } = store();
  store().set({
    catalog: null,
    character,
    costumes: [],
    loadError: null,
    loading: true,
    previews: new Map(),
  });
  try {
    const http = studioHttp();
    const catalog =
      !legacy && character ? await fetchSpriteCatalog(http, character) : null;
    const emotions = catalog
      ? catalogEmotions(catalog)
      : await fetchSpriteEmotions(http, character);
    if (!isCurrent()) {
      return;
    }
    const available = normalizeEmotions(emotions);
    const emotion = pickEmotion(store().emotion, available);
    store().set({ catalog, emotions: available, emotion });
    await showCostumes(character, emotion, isCurrent);
  } catch (error) {
    if (isCurrent()) {
      store().set({ loadError: errorText(error), loading: false });
    }
  }
}

/** Load the character list and show the saved (or first) character. */
export async function initSprites(): Promise<void> {
  const isCurrent = beginRequest();
  store().set({ loading: true, loadError: null });
  try {
    const { characters, legacy } = await fetchSpriteCharacters(studioHttp());
    if (!isCurrent()) {
      return;
    }
    store().set({ characters, legacy });
    await showCharacter(
      pickCharacter(characters, store().character),
      isCurrent
    );
  } catch (error) {
    if (isCurrent()) {
      store().set({ loadError: errorText(error), loading: false });
    }
  }
}

export function selectSpriteCharacter(character: string): Promise<void> {
  return showCharacter(character, beginRequest());
}

export function selectSpriteEmotion(emotion: string): Promise<void> {
  const isCurrent = beginRequest();
  store().set({ emotion, loading: true });
  return showCostumes(store().character, emotion, isCurrent);
}

/** Leaving the page drops any reply still in flight. */
export function leaveSprites(): void {
  beginRequest();
  store().set({ cleanup: null, loading: false, scanning: false });
}

/** "Remove empty folders": scan first, then ask before deleting anything. */
export async function scanEmptyFolders(): Promise<void> {
  const { character, legacy, scanning } = store();
  if (!legacy || scanning) {
    return;
  }
  if (!character) {
    toast.error("No Character Selected", {
      description: "Please select a character first",
    });
    return;
  }
  store().set({ scanning: true });
  try {
    const scan = await findEmptyFolders(studioHttp(), character);
    if (store().character === character) {
      store().set({ cleanup: scan });
    }
  } catch (error) {
    toast.error("Error", { description: errorText(error) });
  } finally {
    store().set({ scanning: false });
  }
}

export function closeCleanup(): void {
  if (!store().deleting) {
    store().set({ cleanup: null });
  }
}

export async function confirmCleanup(): Promise<void> {
  const { cleanup, deleting } = store();
  if (!cleanup || cleanup.folders.length === 0 || deleting) {
    return;
  }
  store().set({ deleting: true });
  try {
    const result = await deleteEmptyFolders(studioHttp(), cleanup);
    const count = result.deleted.length;
    const summary = `Deleted ${count} empty ${count === 1 ? "folder" : "folders"}`;
    if (result.errors.length > 0) {
      toast.warning(summary, { description: result.errors.join("\n") });
    } else {
      toast.success(summary);
    }
  } catch (error) {
    toast.error("Cleanup failed", { description: errorText(error) });
  } finally {
    store().set({ cleanup: null, deleting: false });
  }
  await selectSpriteCharacter(store().character);
}
