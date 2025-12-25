import * as api from ".";


test("Check all original API exports do compile", async () => {
  let x: api.Snapshot = await api.parseSnapshotFromFile("xtest-snapshots/chrome-143.0.7499.169.heapsnapshot")
  x.edges
}, 10000)