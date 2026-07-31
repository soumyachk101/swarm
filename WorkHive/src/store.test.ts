import { describe, it, expect, beforeEach } from "vitest";
import { useWorkHiveStore, samePath, workHiveForFolder, folderName } from "./store.js";

const ws = (id: string, boundProjectPath = "") => ({
  id, name: id, color: "#c9a227", boundProjectPath, taskCards: [],
});

describe("one folder, one workhive", () => {
  beforeEach(() => {
    useWorkHiveStore.setState({
      workHives: [ws("a"), ws("b")],
      activeWorkHiveId: "a",
    });
  });

  it("binds a free folder to the asking workhive", () => {
    expect(useWorkHiveStore.getState().bindFolder("a", "C:/code/api")).toBe("a");
    expect(workHiveForFolder("C:/code/api")?.id).toBe("a");
  });

  it("keeps two folders in two workHives", () => {
    useWorkHiveStore.getState().bindFolder("a", "C:/code/api");
    useWorkHiveStore.getState().bindFolder("b", "C:/code/web");
    expect(workHiveForFolder("C:/code/api")?.id).toBe("a");
    expect(workHiveForFolder("C:/code/web")?.id).toBe("b");
  });

  it("never splits one folder across two brains — it switches instead", () => {
    useWorkHiveStore.getState().bindFolder("a", "C:/code/api");
    // b asks for a folder a already owns: no rebind, just activate a.
    expect(useWorkHiveStore.getState().bindFolder("b", "C:/code/api")).toBe("a");
    expect(useWorkHiveStore.getState().activeWorkHiveId).toBe("a");
    expect(useWorkHiveStore.getState().workHives.find((w: { id: string }) => w.id === "b")?.boundProjectPath).toBe("");
  });

  it("treats windows path spellings as the same folder", () => {
    expect(samePath("C:\\code\\api", "c:/code/api/")).toBe(true);
    expect(samePath("C:/code/api", "C:/code/api2")).toBe(false);
    expect(samePath("", "C:/code/api")).toBe(false);
    useWorkHiveStore.getState().bindFolder("a", "C:\\code\\api");
    expect(useWorkHiveStore.getState().bindFolder("b", "c:/code/api/")).toBe("a");
  });
});

describe("starting empty and opening folders", () => {
  beforeEach(() => {
    useWorkHiveStore.setState({ workHives: [], activeWorkHiveId: "" });
  });

  it("starts with no hives at all — no placeholder", () => {
    expect(useWorkHiveStore.getState().workHives).toHaveLength(0);
    expect(useWorkHiveStore.getState().activeWorkHiveId).toBe("");
  });

  it("creates the first hive when a folder is opened", () => {
    const id = useWorkHiveStore.getState().openFolder("C:/code/api");
    const hives = useWorkHiveStore.getState().workHives;
    expect(hives).toHaveLength(1);
    expect(hives[0].name).toBe("api");
    expect(hives[0].boundProjectPath).toBe("C:/code/api");
    expect(useWorkHiveStore.getState().activeWorkHiveId).toBe(id);
  });

  it("opens a second folder as its own hive, keeping the first", () => {
    useWorkHiveStore.getState().openFolder("C:/code/api");
    useWorkHiveStore.getState().openFolder("C:/code/web");
    const hives = useWorkHiveStore.getState().workHives;
    expect(hives.map((h) => h.name)).toEqual(["api", "web"]);
  });

  it("switches to the owner instead of opening a folder twice", () => {
    const first = useWorkHiveStore.getState().openFolder("C:/code/api");
    useWorkHiveStore.getState().openFolder("C:/code/web");
    const again = useWorkHiveStore.getState().openFolder("c:\\code\\api\\");
    expect(again).toBe(first);
    expect(useWorkHiveStore.getState().workHives).toHaveLength(2);
    expect(useWorkHiveStore.getState().activeWorkHiveId).toBe(first);
  });

  it("adopts an unbound hive rather than leaving it stranded", () => {
    useWorkHiveStore.setState({
      workHives: [{ id: "blank", name: "Untitled", autoNamed: true, color: "#c9a227", boundProjectPath: "", taskCards: [] }],
      activeWorkHiveId: "blank",
    });
    const id = useWorkHiveStore.getState().openFolder("C:/code/api");
    expect(id).toBe("blank");
    expect(useWorkHiveStore.getState().workHives).toHaveLength(1);
    expect(useWorkHiveStore.getState().workHives[0].name).toBe("api");
  });

  it("can be emptied again — removing the last hive is allowed", () => {
    const id = useWorkHiveStore.getState().openFolder("C:/code/api");
    useWorkHiveStore.getState().removeWorkHive(id);
    expect(useWorkHiveStore.getState().workHives).toHaveLength(0);
    expect(useWorkHiveStore.getState().activeWorkHiveId).toBe("");
  });

  it("remembers branches and board on the hive it creates", () => {
    const id = useWorkHiveStore.getState().openFolder("C:/code/api");
    useWorkHiveStore.getState().updateWorkHive(id, {
      worktrees: [{ id: "fdf", name: "fdf", branch: "agent/fdf", path: "C:/code/api/.worktrees/fdf" }],
    });
    useWorkHiveStore.getState().addTask(id, "ship it");
    const hive = useWorkHiveStore.getState().workHives.find((h) => h.id === id)!;
    // These fields are what `partialize` writes to storage, so what survives a
    // restart is exactly this shape.
    expect(hive.worktrees).toHaveLength(1);
    expect(hive.taskCards).toHaveLength(1);
  });
});
