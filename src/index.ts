import * as oboe from 'oboe'
import * as fs from 'fs'

export type NodeType = "hidden" | "array" | "string" | "object" | "code" | "closure" | "regexp" | "number" | "native" | "synthetic" | "concatenated string" | "sliced string" | "symbol" | "bigint"
export type EdgeType = "context" | "element" | "property" | "internal" | "hidden" | "shortcut" | "weak"

type NodeTypeTypes = ["hidden", "array", "string", "object", "code", "closure", "regexp", "number", "native", "synthetic", "concatenated string", "sliced string", "symbol", "bigint"];

type MetaData = {
    readonly node_fields: ["type","name","id","self_size","edge_count","trace_node_id","detachedness"?]
    readonly node_types: [NodeTypeTypes,"string","number","number","number","number","number"?]
    readonly edge_fields: ["type","name_or_index","to_node"]
    readonly edge_types: [["context","element","property","internal","hidden","shortcut","weak"],"string_or_number","node"]
    readonly trace_function_info_fields: ["function_id","name","script_name","script_id","line","column"]
    readonly trace_node_fields: ["id","function_info_index","count","size","children"]
    readonly sample_fields: ["timestamp_us","last_assigned_id"]
    readonly location_fields: ["object_index", "script_id", "line", "column"]
}

type RawSnapshotData = {
    readonly snapshot: {
        readonly meta: MetaData
        readonly node_count: number
        readonly edge_count: number
        readonly trace_function_count: number
    }
    readonly nodes: number[]
    readonly edges: number[]
    readonly strings: string[]
    readonly trace_function_infos: unknown[]
    readonly trace_tree: unknown[]
    readonly samples: unknown[]
    readonly location_fields: unknown[]
}

function hasDetachedness(data: RawSnapshotData): boolean {
    return data.snapshot.meta.node_fields.length >= 7
}

interface ParseInfo {
    nodeFieldCount: number,
    edgeFieldCount: number,
}

function parseInfoFromSnapshot(data: RawSnapshotData): ParseInfo {
    return {
        nodeFieldCount: data.snapshot.meta.node_fields.length,
        edgeFieldCount: data.snapshot.meta.edge_fields.length,
    };
}

namespace Sanity {
    class Optional<T> {
        constructor(public readonly value: T) { }
    }

    function opt<T>(x: T): Optional<T> {
        return new Optional(x)
    }

    type Exclude<T, U> = T extends U ? never : T;

    type UndefinedAsOptional<T> =
        [undefined] extends [T] ? Optional<Exclude<T, undefined>> :
        T extends string? T :
        //T extends unknown[] ? { [Idx in keyof T]: UndefinedAsOptional<T[Idx]> } :
        {
            [Property in keyof T]-?: UndefinedAsOptional<T[Property]>
        };

    const nodeTypeTypesProto: UndefinedAsOptional<NodeTypeTypes> = ["hidden", "array", "string", "object", "code", "closure", "regexp", "number", "native", "synthetic", "concatenated string", "sliced string", "symbol", "bigint"];

    const metaDataProto: UndefinedAsOptional<MetaData> = {
        "node_fields": ["type", "name", "id", "self_size", "edge_count", "trace_node_id", opt("detachedness")],
        "node_types": [nodeTypeTypesProto, "string", "number", "number", "number", "number", opt("number")],
        "edge_fields": ["type", "name_or_index", "to_node"],
        "edge_types": [["context", "element", "property", "internal", "hidden", "shortcut", "weak"], "string_or_number", "node"],
        "trace_function_info_fields": ["function_id", "name", "script_name", "script_id", "line", "column"],
        "trace_node_fields": ["id", "function_info_index", "count", "size", "children"],
        "sample_fields": ["timestamp_us", "last_assigned_id"],
        "location_fields": ["object_index", "script_id", "line", "column"],
    };

    function assertX(desc: string, cond: boolean) {
        if (!cond) {
            throw new Error(desc)
        }
    }
    function assertObject(path: string, x: unknown) {
        assertX(`${path} is not an object, but is ${typeof x}`, typeof x === "object")
    }

    function assertArray<T>(path: string, arr: T[]) {
        assertX(`${path} is not an array, but is '${typeof arr}'`, Array.isArray(arr))
    }

    function assertInteger(path: string, n: number) {
        assertX(`${path} is not an integer, but is '${typeof n}'`, Number.isInteger(n))
    }

    function assertLength(name: string, len: number, expectedLen: number) {
        if (len !== expectedLen) {
            throw new Error(`But Expected ${expectedLen} ${name}, but got ${len}`)
        }
    }

    type GenericMetaData<Additionals> = GenericMetaData<Additionals>[] | string | { readonly [p: string]: GenericMetaData<Additionals> } | Additionals;

    function checkMetaData<T>(path: string, data: GenericMetaData<undefined>, proto: GenericMetaData<Optional<string>>): boolean {
        let ok = true;
        if (proto instanceof Optional) {
            if (data !== undefined) {
                ok = checkMetaData(path, data, proto.value)
            }
        } else if (typeof proto === "string") {
            if (proto !== data) {
                console.warn(`Expected '${path}' to be '${proto}' but was '${data}'!`)
                ok = false
            }
        } else if (Array.isArray(proto)) {
            if (!Array.isArray(data)) {
                console.warn(`Expected '${path}' to be an array but was ${JSON.stringify(data)}!`)
                return false
            }
            if (data.length > proto.length) {
                console.warn(`Array at '${path}' has ${data.length - proto.length} new element!`)

                for (let idx = proto.length; idx < data.length; ++idx) {
                    console.warn(`- At index ${idx}: ${JSON.stringify(data[idx])}`)
                }

                ok = false
            }
            
            for (let idx = 0; idx < proto.length; ++idx) {
                ok = checkMetaData(`${path}[${idx}]`, data[idx], proto[idx]) && ok
            }
        } else {
            if (Array.isArray(data) || typeof data !== "object") {
                console.warn(`Expected '${path}' to be an object but was ${JSON.stringify(data)}!`)
                return false
            }
            for (let prop in proto) {
                ok = checkMetaData(`${path}.${prop}`, data[prop], proto[prop]) && ok
            }
        }

        return ok
    }

    export function check(data: RawSnapshotData) {
        // assert root
        assertObject("data", data)

        // assert root properties
        assertArray("data.nodes", data.nodes)
        assertArray("data.edges", data.edges)
        assertArray("data.strings", data.strings)
        assertArray("data.trace_function_infos", data.trace_function_infos)
        assertArray("data.trace_tree", data.trace_tree)
        assertArray("data.samples", data.samples)

        // assert snapshot
        const snapshot = data.snapshot
        assertInteger("data.snapshot.node_count", snapshot.node_count)
        assertInteger("data.snapshot.edge_count", snapshot.edge_count)
        assertInteger("data.snapshot.trace_function_count", snapshot.trace_function_count)

        const meta = snapshot.meta
        assertObject("data.snapshot.meta", snapshot.meta)
        assertX("data.snapshot.meta.node_fields must have same length as data.snapshot.meta.node_types", meta.node_fields.length == meta.node_types.length)
        assertX("data.snapshot.meta.edge_fields must have same length as data.snapshot.meta.edge_types", meta.edge_fields.length == meta.edge_types.length)

        // assert ParseInfo
        const parseInfo = parseInfoFromSnapshot(data);
        assertX(`expected at least 6 node fields, but got ${parseInfo.nodeFieldCount}`, parseInfo.nodeFieldCount >= 6)
        assertLength("edge fields", parseInfo.edgeFieldCount, 3)

        const ok = checkMetaData("data.snapshot.meta", meta, metaDataProto)
        if (!ok) {
            console.error("Heapsnapshot format changed! Please report to https://github.com/SrTobi/v8-heapsnapshot/issues");
            console.error("Continuing anyway... :)")
        }

        // assert elemnt counts
        assertLength("node elements", data.nodes.length, snapshot.node_count * meta.node_fields.length)
        assertLength("edge elements", data.edges.length, snapshot.edge_count * meta.edge_fields.length)
        assertLength("trace function elements", data.trace_function_infos.length, snapshot.trace_function_count * meta.trace_function_info_fields.length)
    }
}

export interface Node {
    readonly type: NodeType
    readonly name: string
    readonly id: number
    readonly self_size: number
    readonly edge_count: number
    readonly trace_node_id: number
    readonly detached?: boolean

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
        public readonly trace_node_id: number,
        public readonly detached?: boolean,
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

class EdgeImpl implements Edge {
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

    readonly hasDetachedness: boolean

    findNodeById(id: number): Node | undefined
}

class SnapshotImpl implements Snapshot {
    idToNodeMapping: Map<number, Node> = new Map()
    _global: Node | undefined
    _modules: Node[] | undefined

    constructor(
        public nodes: Node[],
        public edges: Edge[],
        public hasDetachedness: boolean,
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

function access<T>(arr: number[], idx: number, baseIdx: number, length: number, f: (num: number) => T): T | undefined {
    return (idx - baseIdx) < length ? f(arr[idx]) : undefined;
}

function parseNodes(data: RawSnapshotData, parseInfo: ParseInfo): NodeImpl[] {
    const nodes = data.nodes
    const strings = data.strings
    const types = data.snapshot.meta.node_types[0]
    const result: NodeImpl[] = []
    const nodeFieldCount = parseInfo.nodeFieldCount;

    for (let nodeIndex = 0; nodeIndex < data.snapshot.node_count; ++nodeIndex) {
        const baseIndex = nodeIndex * nodeFieldCount
        let dataIndex = baseIndex
        
        const node = new NodeImpl(
            types[nodes[dataIndex++]]!,
            strings[nodes[dataIndex++]],
            nodes[dataIndex++],
            nodes[dataIndex++],
            nodes[dataIndex++],
            nodes[dataIndex++],
            access(nodes, dataIndex++, baseIndex, nodeFieldCount, num => num == 1),
        )
        result.push(node)
    }
    return result
}

function parseAndWireEdges(data: RawSnapshotData, nodes: NodeImpl[], parseInfo: ParseInfo): Edge[] {
    const result: Edge[] = []
    const edges = data.edges
    const strings = data.strings
    const types = data.snapshot.meta.edge_types[0]

    function name_or_index(type: EdgeType, i: number): number | string {
        if (type == "element" || type == "hidden") {
            return i
        }
        if (i >= strings.length) {
            throw new Error("Invalid string index!")
        }
        return strings[i]
    }

    const nodeFieldCount = parseInfo.nodeFieldCount;
    let edgeIndex = 0
    nodes.forEach((from_node) => {
        for (let edgeCount = 0; edgeCount < from_node.edge_count; ++edgeCount) {
            const type = types[edges[edgeIndex++]]
            const name = name_or_index(type, edges[edgeIndex++])
            const to_node = nodes[edges[edgeIndex++] / nodeFieldCount]

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
    
    Sanity.check(data)

    const parseInfo = parseInfoFromSnapshot(data)
    const nodes = parseNodes(data, parseInfo)
    const edges = parseAndWireEdges(data, nodes, parseInfo)

    return new SnapshotImpl(nodes, edges, hasDetachedness(data))
}

export async function parseSnapshotFromFile(filename: fs.PathLike, options?: BufferEncoding | {
    flags?: string | undefined;
    encoding?: BufferEncoding | undefined;
    fd?: number | fs.promises.FileHandle | undefined;
    mode?: number | undefined;
    autoClose?: boolean | undefined;
    emitClose?: boolean | undefined;
    start?: number | undefined;
    highWaterMark?: number | undefined;
    end?: number | undefined;
}): Promise<Snapshot> {
    const stream = fs.createReadStream(filename, options);
    return await parseSnapshot(stream);
}




async function main() {
    console.log("Run...")
    const snapshot = await parseSnapshotFromFile(process.argv[2] || "blub.js.heapsnapshot")
    console.log("nodes:", snapshot.nodes.length)
    console.log("edges:", snapshot.edges.length)

    debugger;
}

main()


