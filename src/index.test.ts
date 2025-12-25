import * as api from "./index";

test("Check api throws if file cannot be found", async () => {
  await expect(
    api.parseSnapshotFromFile("test-snapshots/this-file-does-not-exist.heapsnapshot")
  ).rejects.toMatchObject({ code: "ENOENT", path: "test-snapshots/this-file-does-not-exist.heapsnapshot" });
});