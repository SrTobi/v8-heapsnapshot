import * as oboe from 'oboe'
import * as fs from 'fs'

export type NodeType = "hidden" | "array" | "string" | "object" | "code" | "closure" | "regexp" | "number" | "native" | "synthetic" | "concatenated string" | "sliced string" | "symbol" | "bigint"
export type EdgeType = "context" | "element" | "property" | "internal" | "hidden" | "shortcut" | "weak"

interface MetaData {
    readonly node_fields: ["type","name","id","self_size","edge_count","trace_node_id"]
    readonly node_types: [["hidden","array","string","object","code","closure","regexp","number","native","synthetic","concatenated string","sliced string", "symbol", "bigint"],"string","number","number","number","number","number"]
    readonly edge_fields: ["type","name_or_index","to_node"]
    readonly edge_types: [["context","element","property","internal","hidden","shortcut","weak"],"string_or_number","node"]
    readonly trace_function_info_fields: ["function_id","name","script_name","script_id","line","column"]
    readonly trace_node_fields: ["id","function_info_index","count","size","children"]
    readonly sample_fields: ["timestamp_us","last_assigned_id"]
}

interface RawSnapshotData {
    readonly snapshot: {
        readonly meta: MetaData
        readonly node_count: number
        readonly edge_count: number
        readonly trace_function_count: number
    }
    readonly nodes: number[]
    readonly edges: number[]
    readonly strings: string[]
    readonly trace_function_infos: any[]
    readonly trace_tree: any[]
    readonly samples: any[]
}

const NodeFieldCount = 6
const EdgeFieldCount = 3


const metaData: MetaData = {
    "node_fields": ["type","name","id","self_size","edge_count","trace_node_id"],
    "node_types": [["hidden","array","string","object","code","closure","regexp","number","native","synthetic","concatenated string","sliced string","symbol", "bigint"],"string","number","number","number","number","number"],
    "edge_fields":["type","name_or_index","to_node"],
    "edge_types":[["context","element","property","internal","hidden","shortcut","weak"],"string_or_number","node"],
    "trace_function_info_fields":["function_id","name","script_name","script_id","line","column"],
    "trace_node_fields":["id","function_info_index","count","size","children"],
    "sample_fields":["timestamp_us","last_assigned_id"]
};

let checkNodeTypes: NodeType = metaData.node_types[0][0 as number];
let checkEdgeTypes: EdgeType = metaData.edge_types[0][0 as number];
<any>checkNodeTypes;
<any>checkEdgeTypes;


let warnedAboutChangedHeapFormat = false

function sanityCheck(data: RawSnapshotData) {
    function check<T>(ok: T) {
        if (!ok && !warnedAboutChangedHeapFormat) {
            warnedAboutChangedHeapFormat = true
            console.error("Heapsnapshot format changed! Please report to https://github.com/SrTobi/v8-heapsnapshot/issues");
        }
    }

    check(data)

    check(Array.isArray(data.nodes))
    check(Array.isArray(data.edges))
    check(Array.isArray(data.strings))
    check(Array.isArray(data.trace_function_infos))
    check(Array.isArray(data.trace_tree))
    check(Array.isArray(data.samples))

    const ss = data.snapshot
    check(Number.isInteger(ss.node_count))
    check(Number.isInteger(ss.edge_count))
    check(Number.isInteger(ss.trace_function_count))

    check(ss.meta)
    const meta = ss.meta
    check(JSON.stringify(meta) === JSON.stringify(metaData));
    check(meta.node_fields.length == NodeFieldCount)
    check(meta.edge_fields.length == EdgeFieldCount)
    check(ss.node_count * meta.node_fields.length == data.nodes.length)
    check(ss.edge_count * meta.edge_fields.length == data.edges.length)
    check(ss.trace_function_count * meta.trace_function_info_fields.length == data.trace_function_infos.length)
}


export interface Node {
    readonly type: NodeType
    readonly name: string
    readonly id: number
    readonly self_size: number
    readonly edge_count: number
    readonly trace_node_id: number

    readonly out_edges: Edge[]
    readonly in_edges: Edge[]

    toLongString(): string
    print(deep?: number, indent?: number, edge_prefix?: string): void
}

class NodeImpl implements Node {
    constructor(
        public readonly type: NodeType,
        public readonly name: string,
        public readonly id: number,
        public readonly self_size: number,
        public readonly edge_count: number,
        public readonly trace_node_id: number
    ) {}

    out_edges: Edge[] = []
    in_edges: Edge[] = []

    toString(): string {
        return `${this.name}[${this.type}]@${this.id}`
    }

    toLongString(): string {
        return `${this.name}[${this.type}]@${this.id}{${this.out_edges.join(", ")}}`
    }

    print(deep: number = 2, indent: number = 0, edge_prefix?: string): void {
        console.log("|" + Array(indent + 1).join("  ") + (edge_prefix || "") + this.toString())

        if (deep > 0) {
            for (const e of this.out_edges) {
                e.to.print(deep - 1, indent + 1, `[${e.type}]${e.name} -> `)
            }
        }
    }
}


export interface Edge {
    readonly type: EdgeType
    readonly name: string | number
    readonly from: Node
    readonly to: Node

    toLongString(): string
}

class EdgeImpl implements Edge{
    constructor(
        public readonly type: EdgeType,
        public readonly name: string | number,
        public readonly from: Node,
        public readonly to: Node
    ) {}

    toString(): string {
        return `[${this.type}]${this.name} -> ${this.to}`
    }

    toLongString(): string {
        return `[${this.type}]${this.name} -> ${this.to.toLongString()}`
    }
}

export interface Snapshot {
    readonly nodes: Node[]
    readonly edges: Edge[]

    readonly global: Node
    readonly modules: Node[]

    findNodeById(id: number): Node | undefined
}

class SnapshotImpl implements Snapshot{
    idToNodeMapping: Map<number, Node> = new Map()
    _global: Node | undefined
    _modules: Node[] | undefined

    constructor(
        public nodes: Node[],
        public edges: Edge[]
    ) {
        nodes.forEach(node => this.idToNodeMapping.set(node.id, node))
    }

    findNodeById(id: number): Node | undefined {
        return this.idToNodeMapping.get(id)
    }

    get global(): Node {
        if (!this._global) {
            this._global = this.nodes.find(node => node.name === "global / ")!

            if (!this._global) {
                throw new Error("Could not find global object!");
            }
        }
        return this._global
    }

    get modules(): Node[] {
        if (!this._modules) {
            this._modules = this.nodes.filter(node => node.name === "Module" && node.type === "object")
        }
        return this._modules
    }
}


function parseNodes(data: RawSnapshotData): NodeImpl[] {
    const nodes = data.nodes
    const strings = data.strings
    const types = metaData.node_types[0]
    const result: NodeImpl[] = []
    for (let nodeIndex = 0; nodeIndex < data.snapshot.node_count; ++nodeIndex) {
        let dataIndex = nodeIndex * 6
        
        const node = new NodeImpl(
            types[nodes[dataIndex++]],
            strings[nodes[dataIndex++]],
            nodes[dataIndex++],
            nodes[dataIndex++],
            nodes[dataIndex++],
            nodes[dataIndex++],
        )
        result.push(node)
    }
    return result
}

function parseAndWireEdges(data: RawSnapshotData, nodes: NodeImpl[]): Edge[] {
    const result: Edge[] = []
    const edges = data.edges
    const strings = data.strings
    const types = metaData.edge_types[0]

    function name_or_index(type: EdgeType, i: number): number | string {
        if (type == "element" || type == "hidden") {
            return i
        }
        if (i >= strings.length) {
            throw new Error("Invalid string index!")
        }
        return strings[i]
    }

    let edgeIndex = 0
    nodes.forEach((from_node, nodeIndex) => {
        for (let edgeCount = 0; edgeCount < from_node.edge_count; ++edgeCount) {
            const type = types[edges[edgeIndex++]]
            const name = name_or_index(type, edges[edgeIndex++])
            const to_node = nodes[edges[edgeIndex++] / NodeFieldCount]

            const edge = new EdgeImpl(type, name, from_node, to_node)
            result.push(edge)
            from_node.out_edges.push(edge)
            to_node.in_edges.push(edge)
        }
    })
    return result
}
    

export async function parseSnapshot(stream: fs.ReadStream): Promise<Snapshot>
export async function parseSnapshot(json: string): Promise<Snapshot>
export async function parseSnapshot(obj: Object): Promise<Snapshot>
export async function parseSnapshot(arg1: any): Promise<Snapshot> {

    let data: RawSnapshotData;
    if (typeof arg1 === "string") {
        data = JSON.parse(arg1) as RawSnapshotData

    } else if (arg1 instanceof fs.ReadStream) {
        data = await new Promise<RawSnapshotData>((resolve, reject) => {
            oboe(arg1)
                .node("!", resolve)
                .fail(reject)
        });
    } else if (typeof arg1 === "object") {
        data = <RawSnapshotData>arg1;
    } else {
        throw new Error("Illigal snapshot data!")
    }
    
    sanityCheck(data)

    const nodes = parseNodes(data)
    const edges = parseAndWireEdges(data, nodes)

    return new SnapshotImpl(nodes, edges)
}

export async function parseSnapshotFromFile(filename: fs.PathLike, options?: string | {
    flags?: string;
    encoding?: string;
    fd?: number;
    mode?: number;
    autoClose?: boolean;
    start?: number;
    end?: number;
    highWaterMark?: number;
}): Promise<Snapshot> {
    const stream = fs.createReadStream(filename, options);
    return await parseSnapshot(stream);
}


/*

async function main() {
    const snapshot = await parseSnapshotFromFile(process.argv[2] || "blub.js.heapsnapshot")
    console.log("nodes:", snapshot.nodes.length)
    console.log("edges:", snapshot.edges.length)

    debugger;
}

main()

*/
