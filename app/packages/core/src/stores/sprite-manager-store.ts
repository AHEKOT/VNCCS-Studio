import {
  type EmptyFolderScan,
  emptySpriteManagerState,
  type SpriteCatalog,
  type SpriteManagerState,
} from "@workspace/vnccs/sprite-manager";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SpriteManagerStore extends SpriteManagerState {
  catalog: SpriteCatalog | null;
  /** The empty-folder scan awaiting confirmation; null while the dialog is closed. */
  cleanup: EmptyFolderScan | null;
  deleting: boolean;
  legacy: boolean;
  loadError: string | null;
  loading: boolean;
  /** Cache-busts the sprite previews each time the costumes are re-read. */
  previewStamp: number;
  previews: Map<string, string>;
  scanning: boolean;
  set: (patch: Partial<SpriteManagerStore>) => void;
}

export const useSpriteManagerStore = create<SpriteManagerStore>()(
  persist(
    (set) => ({
      ...emptySpriteManagerState,
      catalog: null,
      cleanup: null,
      deleting: false,
      loadError: null,
      loading: false,
      legacy: true,
      previews: new Map(),
      previewStamp: 0,
      scanning: false,
      set: (patch) => set(patch),
    }),
    {
      name: "vnccs-studio-sprites",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ character, emotion }) => ({ character, emotion }),
    }
  )
);
