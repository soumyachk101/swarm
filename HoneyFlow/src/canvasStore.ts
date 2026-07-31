import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_CAMERA, clampZoom, fitTo, panBy, placeNear, snap, zoomAbout,
  type Camera, type Rect,
} from "./camera.js";

export interface NodeBox extends Rect {
  /** Stacking order. Touching a node floats it above the rest. */
  z: number;
}

export const DEFAULT_NODE_SIZE = { w: 520, h: 380 };

interface CanvasState {
  /** Node geometry, keyed by pane id. One flat map across all workhives: pane
   *  ids are already unique, and a pane keeps its spot when hives switch. */
  nodes: Record<string, NodeBox>;
  /** Camera per workhive, so each project keeps its own viewpoint. */
  cameras: Record<string, Camera>;
  topZ: number;

  cameraFor: (hiveId: string) => Camera;
  setCamera: (hiveId: string, cam: Camera) => void;
  panCamera: (hiveId: string, dxScreen: number, dyScreen: number) => void;
  zoomCamera: (hiveId: string, sx: number, sy: number, factor: number) => void;
  setZoom: (hiveId: string, zoom: number, viewW: number, viewH: number) => void;
  fitAll: (hiveId: string, ids: string[], viewW: number, viewH: number) => void;

  boxFor: (id: string) => NodeBox | undefined;
  /** Give a pane a spot if it has none yet, avoiding everything already placed. */
  ensureNode: (id: string, siblingIds: string[]) => NodeBox;
  moveNode: (id: string, x: number, y: number) => void;
  resizeNode: (id: string, w: number, h: number) => void;
  raiseNode: (id: string) => void;
  removeNode: (id: string) => void;
  /** Lay every pane out in a tidy grid — the escape hatch from a messy canvas. */
  tidy: (ids: string[]) => void;
}

const MIN_W = 260;
const MIN_H = 160;

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      nodes: {},
      cameras: {},
      topZ: 1,

      cameraFor: (hiveId) => get().cameras[hiveId] ?? DEFAULT_CAMERA,
      setCamera: (hiveId, cam) =>
        set((s) => ({ cameras: { ...s.cameras, [hiveId]: { ...cam, zoom: clampZoom(cam.zoom) } } })),
      panCamera: (hiveId, dx, dy) =>
        set((s) => ({ cameras: { ...s.cameras, [hiveId]: panBy(s.cameras[hiveId] ?? DEFAULT_CAMERA, dx, dy) } })),
      zoomCamera: (hiveId, sx, sy, factor) =>
        set((s) => ({ cameras: { ...s.cameras, [hiveId]: zoomAbout(s.cameras[hiveId] ?? DEFAULT_CAMERA, sx, sy, factor) } })),
      setZoom: (hiveId, zoom, viewW, viewH) =>
        set((s) => {
          const cam = s.cameras[hiveId] ?? DEFAULT_CAMERA;
          // Zoom from the middle of the viewport, which is where the user is
          // looking when they press a zoom button rather than scroll.
          const factor = clampZoom(zoom) / cam.zoom;
          return { cameras: { ...s.cameras, [hiveId]: zoomAbout(cam, viewW / 2, viewH / 2, factor) } };
        }),
      fitAll: (hiveId, ids, viewW, viewH) =>
        set((s) => {
          const rects = ids.map((id) => s.nodes[id]).filter(Boolean) as Rect[];
          return { cameras: { ...s.cameras, [hiveId]: fitTo(rects, viewW, viewH) } };
        }),

      boxFor: (id) => get().nodes[id],

      ensureNode: (id, siblingIds) => {
        const existing = get().nodes[id];
        if (existing) return existing;
        const others = siblingIds
          .filter((s) => s !== id)
          .map((s) => get().nodes[s])
          .filter(Boolean) as Rect[];
        const spot = placeNear(others, DEFAULT_NODE_SIZE, { x: 0, y: 0 });
        const z = get().topZ + 1;
        const box: NodeBox = { ...spot, ...DEFAULT_NODE_SIZE, z };
        set((s) => ({ nodes: { ...s.nodes, [id]: box }, topZ: z }));
        return box;
      },

      moveNode: (id, x, y) =>
        set((s) => {
          const n = s.nodes[id];
          if (!n) return s;
          return { nodes: { ...s.nodes, [id]: { ...n, x: snap(x), y: snap(y) } } };
        }),

      resizeNode: (id, w, h) =>
        set((s) => {
          const n = s.nodes[id];
          if (!n) return s;
          return {
            nodes: { ...s.nodes, [id]: { ...n, w: Math.max(MIN_W, snap(w)), h: Math.max(MIN_H, snap(h)) } },
          };
        }),

      raiseNode: (id) =>
        set((s) => {
          const n = s.nodes[id];
          if (!n || n.z === s.topZ) return s;
          const z = s.topZ + 1;
          return { nodes: { ...s.nodes, [id]: { ...n, z } }, topZ: z };
        }),

      removeNode: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.nodes;
          return { nodes: rest };
        }),

      tidy: (ids) =>
        set((s) => {
          const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
          const gap = 28;
          const nodes = { ...s.nodes };
          ids.forEach((id, i) => {
            const n = nodes[id];
            if (!n) return;
            nodes[id] = {
              ...n,
              ...DEFAULT_NODE_SIZE,
              x: (i % cols) * (DEFAULT_NODE_SIZE.w + gap),
              y: Math.floor(i / cols) * (DEFAULT_NODE_SIZE.h + gap),
            };
          });
          return { nodes };
        }),
    }),
    {
      name: "hiveory-canvas",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ nodes: s.nodes, cameras: s.cameras, topZ: s.topZ }),
    },
  ),
);
