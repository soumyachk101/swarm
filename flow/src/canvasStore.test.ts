import { describe, it, expect, beforeEach } from "vitest";

// zustand/persist reaches for localStorage at store creation; node has none.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { useCanvasStore, DEFAULT_NODE_SIZE } = await import("./canvasStore.js");

const reset = () => useCanvasStore.setState({ nodes: {}, cameras: {}, topZ: 1 });

describe("canvas arrangement", () => {
  beforeEach(reset);

  it("gives a new pane a spot without overlapping its siblings", () => {
    const s = useCanvasStore.getState();
    s.ensureNode("a", ["a"]);
    s.ensureNode("b", ["a", "b"]);
    s.ensureNode("c", ["a", "b", "c"]);
    const { nodes } = useCanvasStore.getState();
    const boxes = [nodes.a, nodes.b, nodes.c];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const overlap =
          p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
        expect(overlap, `${i} overlaps ${j}`).toBe(false);
      }
    }
  });

  it("keeps a pane's spot once it has one", () => {
    const s = useCanvasStore.getState();
    s.ensureNode("a", ["a"]);
    useCanvasStore.getState().moveNode("a", 400, 300);
    useCanvasStore.getState().ensureNode("a", ["a"]);
    const n = useCanvasStore.getState().nodes.a;
    expect([n.x, n.y]).toEqual([400, 300]);
  });

  it("does not disturb another agent's layout", () => {
    // The canvas only ever sees the ACTIVE swarm's panes. Laying those out must
    // not touch geometry belonging to panes that are simply not on screen.
    const s = useCanvasStore.getState();
    s.ensureNode("swarmA-1", ["swarmA-1"]);
    useCanvasStore.getState().moveNode("swarmA-1", 900, 700);
    useCanvasStore.getState().ensureNode("swarmB-1", ["swarmB-1"]);
    const n = useCanvasStore.getState().nodes["swarmA-1"];
    expect([n.x, n.y]).toEqual([900, 700]);
  });

  it("drops geometry only for the pane actually removed", () => {
    const s = useCanvasStore.getState();
    s.ensureNode("a", ["a"]);
    useCanvasStore.getState().ensureNode("b", ["a", "b"]);
    useCanvasStore.getState().removeNode("a");
    const { nodes } = useCanvasStore.getState();
    expect(nodes.a).toBeUndefined();
    expect(nodes.b).toBeDefined();
  });

  it("snaps position and clamps size on drop", () => {
    const s = useCanvasStore.getState();
    s.ensureNode("a", ["a"]);
    useCanvasStore.getState().moveNode("a", 103, 97);
    useCanvasStore.getState().resizeNode("a", 10, 10);
    const n = useCanvasStore.getState().nodes.a;
    expect([n.x, n.y]).toEqual([100, 100]);
    expect(n.w).toBeGreaterThanOrEqual(260);
    expect(n.h).toBeGreaterThanOrEqual(160);
  });

  it("floats a raised pane above the rest", () => {
    const s = useCanvasStore.getState();
    s.ensureNode("a", ["a"]);
    useCanvasStore.getState().ensureNode("b", ["a", "b"]);
    useCanvasStore.getState().raiseNode("a");
    const { nodes } = useCanvasStore.getState();
    expect(nodes.a.z).toBeGreaterThan(nodes.b.z);
  });

  it("keeps a camera per agent", () => {
    const s = useCanvasStore.getState();
    s.setCamera("swarmA", { x: 10, y: 20, zoom: 1.5 });
    useCanvasStore.getState().setCamera("swarmB", { x: -5, y: 0, zoom: 0.8 });
    expect(useCanvasStore.getState().cameraFor("swarmA")).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(useCanvasStore.getState().cameraFor("swarmB")).toEqual({ x: -5, y: 0, zoom: 0.8 });
  });

  it("defaults an unseen agent to the origin at 100%", () => {
    expect(useCanvasStore.getState().cameraFor("never-opened")).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("tidy lays every pane out on a grid", () => {
    const s = useCanvasStore.getState();
    const ids = ["a", "b", "c", "d"];
    ids.forEach((id, i) => useCanvasStore.getState().ensureNode(id, ids.slice(0, i + 1)));
    useCanvasStore.getState().tidy(ids);
    const { nodes } = useCanvasStore.getState();
    for (const id of ids) {
      expect(nodes[id].w).toBe(DEFAULT_NODE_SIZE.w);
      expect(nodes[id].h).toBe(DEFAULT_NODE_SIZE.h);
    }
    // 4 panes -> 2 columns, so the third starts a new row.
    expect(nodes.a.y).toBe(nodes.b.y);
    expect(nodes.c.y).toBeGreaterThan(nodes.a.y);
  });
});
