import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore, samePath, workspaceForFolder, folderName } from "./store.js";

const ws = (id: string, boundProjectPath = "") => ({
  id, name: id, color: "#c9a227", boundProjectPath, taskCards: [],
});

describe("one folder, one agent", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [ws("a"), ws("b")],
      activeWorkspaceId: "a",
    });
  });

  it("binds a free folder to the asking agent", () => {
    expect(useWorkspaceStore.getState().bindFolder("a", "C:/code/api")).toBe("a");
    expect(workspaceForFolder("C:/code/api")?.id).toBe("a");
  });

  it("keeps two folders in two workspaces", () => {
    useWorkspaceStore.getState().bindFolder("a", "C:/code/api");
    useWorkspaceStore.getState().bindFolder("b", "C:/code/web");
    expect(workspaceForFolder("C:/code/api")?.id).toBe("a");
    expect(workspaceForFolder("C:/code/web")?.id).toBe("b");
  });

  it("never splits one folder across two brains — it switches instead", () => {
    useWorkspaceStore.getState().bindFolder("a", "C:/code/api");
    // b asks for a folder a already owns: no rebind, just activate a.
    expect(useWorkspaceStore.getState().bindFolder("b", "C:/code/api")).toBe("a");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("a");
    expect(useWorkspaceStore.getState().workspaces.find((w: { id: string }) => w.id === "b")?.boundProjectPath).toBe("");
  });

  it("treats windows path spellings as the same folder", () => {
    expect(samePath("C:\\code\\api", "c:/code/api/")).toBe(true);
    expect(samePath("C:/code/api", "C:/code/api2")).toBe(false);
    expect(samePath("", "C:/code/api")).toBe(false);
    useWorkspaceStore.getState().bindFolder("a", "C:\\code\\api");
    expect(useWorkspaceStore.getState().bindFolder("b", "c:/code/api/")).toBe("a");
  });
});

describe("starting empty and opening folders", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: "" });
  });

  it("starts with no swarms at all — no placeholder", () => {
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("");
  });

  it("creates the first swarm when a folder is opened", () => {
    const id = useWorkspaceStore.getState().openFolder("C:/code/api");
    const swarms = useWorkspaceStore.getState().workspaces;
    expect(swarms).toHaveLength(1);
    expect(swarms[0].name).toBe("api");
    expect(swarms[0].boundProjectPath).toBe("C:/code/api");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(id);
  });

  it("opens a second folder as its own swarm, keeping the first", () => {
    useWorkspaceStore.getState().openFolder("C:/code/api");
    useWorkspaceStore.getState().openFolder("C:/code/web");
    const swarms = useWorkspaceStore.getState().workspaces;
    expect(swarms.map((h) => h.name)).toEqual(["api", "web"]);
  });

  it("switches to the owner instead of opening a folder twice", () => {
    const first = useWorkspaceStore.getState().openFolder("C:/code/api");
    useWorkspaceStore.getState().openFolder("C:/code/web");
    const again = useWorkspaceStore.getState().openFolder("c:\\code\\api\\");
    expect(again).toBe(first);
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(2);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(first);
  });

  it("adopts an unbound swarm rather than leaving it stranded", () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: "blank", name: "Untitled", autoNamed: true, color: "#c9a227", boundProjectPath: "", taskCards: [] }],
      activeWorkspaceId: "blank",
    });
    const id = useWorkspaceStore.getState().openFolder("C:/code/api");
    expect(id).toBe("blank");
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1);
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe("api");
  });

  it("can be emptied again — removing the last swarm is allowed", () => {
    const id = useWorkspaceStore.getState().openFolder("C:/code/api");
    useWorkspaceStore.getState().removeWorkspace(id);
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("");
  });

  it("remembers branches and board on the swarm it creates", () => {
    const id = useWorkspaceStore.getState().openFolder("C:/code/api");
    useWorkspaceStore.getState().updateWorkspace(id, {
      worktrees: [{ id: "fdf", name: "fdf", branch: "agent/fdf", path: "C:/code/api/.worktrees/fdf" }],
    });
    useWorkspaceStore.getState().addTask(id, "ship it");
    const swarm = useWorkspaceStore.getState().workspaces.find((h) => h.id === id)!;
    // These fields are what `partialize` writes to storage, so what survives a
    // restart is exactly this shape.
    expect(swarm.worktrees).toHaveLength(1);
    expect(swarm.taskCards).toHaveLength(1);
  });
});
