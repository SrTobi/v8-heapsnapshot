import * as api from ".";

function unrun(_: () => void) {}

test("Check all original API exports do compile", async () => {
  let snapshot: api.Snapshot = await api.parseSnapshotFromFile("test-snapshots/nodejs-20.19.6.heapsnapshot")
  
  expect(snapshot.nodes.length).toBe(52327);
  expect(snapshot.edges.length).toBe(232190);
  expect(snapshot.hasDetachedness).toBe(true);

  unrun(async () => {
    let s2: api.Snapshot = await api.parseSnapshot("");
    let global: api.Node = snapshot.global;
    let some_node: api.Node | undefined = snapshot.findNodeById(1);
    
    global.print(2, 0, "edge_prefix_")

    console.log([
      s2,
      global,
      some_node,
    ])
  })
  
  let modules: api.Node[] = snapshot.modules;
  expect(modules.length).toBe(4);

  let n: api.Node = snapshot.nodes[0];

  {
    let nodeType: api.NodeType = n.type;
    expect(nodeType).toBe("synthetic");
    let nodeName: string = n.name;
    expect(nodeName).toBe("")
    let nodeId: number = n.id;
    expect(nodeId).toBe(1);
    let nodeSelfSize: number = n.self_size;
    expect(nodeSelfSize).toBe(0);
    let nodeEdgeCount: number = n.edge_count;
    expect(nodeEdgeCount).toBe(9);
    let nodeTraceNodeId: number = n.trace_node_id;
    expect(nodeTraceNodeId).toBe(0);
    let nodeDetached: boolean | undefined = n.detached;
    expect(nodeDetached).toBe(false);

    let outEdges: api.Edge[] = n.out_edges;
    expect(outEdges.length).toBe(9);
    let inEdges: api.Edge[] = n.in_edges;
    expect(inEdges.length).toBe(0);

    let longString: string = n.toLongString();
    expect(longString).toBe([
      "[synthetic]@1{",
      "[element]1 -> (GC roots)[synthetic]@3, ",
      "[shortcut]2 -> global[object]@6049, ",
      "[element]3 -> C++ roots[synthetic]@1717330176, ",
      "[element]4 -> C++ cross-thread roots[synthetic]@1717724320, ",
      "[element]5 -> Node / Environment[synthetic]@1717330336, ",
      "[element]6 -> Node / TTYWrap[synthetic]@1717631744, ",
      "[element]7 -> Node / TTYWrap[synthetic]@1717632000, ",
      "[element]8 -> Node / SignalWrap[synthetic]@1717632256, ",
      "[element]9 -> Node / TTYWrap[synthetic]@1717632512",
      "}"
    ].join(""));
  }


  let e: api.Edge = n.out_edges[0];
  {
    let edgeType: api.EdgeType = e.type;
    expect(edgeType).toBe("element");
    let edgeName: string | number = e.name;
    expect(edgeName).toBe(1);
    let edgeFrom: api.Node = e.from;
    expect(edgeFrom.id).toBe(1);
    let edgeTo: api.Node = e.to;
    expect(edgeTo.id).toBe(3);
  }
}, 10000)