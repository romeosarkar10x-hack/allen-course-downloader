import { describe, test, expect, vi, beforeEach, type MockedFunction } from "vitest";
import fs from "fs/promises";
import { PersistentState } from "@/utils/persistent-state";

// ---------------------------------------------------------------------------
// Mock fs/promises — no real disk I/O.
//
// The current implementation no longer opens a long-lived FileHandle. Instead it
// drives the module-level functions directly:
//   - initializeState(): fs.stat() + fs.readFile()
//   - write():           fs.writeFile(tmp) + fs.rename(tmp -> pathname)
// So the tests mock those four functions against a tiny in-memory "disk".
// ---------------------------------------------------------------------------
vi.mock("fs/promises");

const mockedStat = fs.stat as unknown as MockedFunction<typeof fs.stat>;
const mockedReadFile = fs.readFile as unknown as MockedFunction<typeof fs.readFile>;
const mockedWriteFile = fs.writeFile as unknown as MockedFunction<typeof fs.writeFile>;
const mockedRename = fs.rename as unknown as MockedFunction<typeof fs.rename>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const textSerializer = (s: string) => encoder.encode(s);
const textDeserializer = (b: Uint8Array) => decoder.decode(b);

const PATH = "/tmp/state.bin";
const TMP = PATH + ".tmp";

// ---------------------------------------------------------------------------
// In-memory disk shared by stat/readFile/writeFile/rename.
// ---------------------------------------------------------------------------
let disk: Map<string, Uint8Array>;
/** Every payload handed to fs.writeFile (i.e. every durable write), in order. */
let writeCalls: Uint8Array[];

/** Seed a file on the fake disk. */
function seed(bytes: Uint8Array, pathname = PATH) {
    disk.set(pathname, Uint8Array.from(bytes));
}

/** Current persisted bytes for the main path. */
function diskBytes(pathname = PATH): Uint8Array {
    return Uint8Array.from(disk.get(pathname) ?? new Uint8Array());
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    disk = new Map();
    writeCalls = [];

    mockedStat.mockImplementation(async (p: any) => {
        const bytes = disk.get(p);
        if (bytes === undefined) {
            const err: any = new Error(`ENOENT: no such file '${p}'`);
            err.code = "ENOENT";
            throw err;
        }
        return { size: bytes.byteLength } as any;
    });

    mockedReadFile.mockImplementation(async (p: any) => {
        const bytes = disk.get(p);
        if (bytes === undefined) throw new Error(`ENOENT: no such file '${p}'`);
        return Buffer.from(bytes) as any;
    });

    mockedWriteFile.mockImplementation(async (p: any, data: any) => {
        const bytes = Uint8Array.from(data as Uint8Array);
        writeCalls.push(bytes);
        disk.set(p, bytes);
    });

    mockedRename.mockImplementation(async (from: any, to: any) => {
        const bytes = disk.get(from);
        if (bytes === undefined) throw new Error(`ENOENT: cannot rename '${from}'`);
        disk.set(to, bytes);
        disk.delete(from);
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for all micro-tasks and pending promise continuations to drain. */
async function flushPromises(rounds = 20) {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

/** An externally-resolvable promise, used to control timing precisely. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// ===========================================================================
describe("persistent-state", () => {
    // -----------------------------------------------------------------------
    describe("initializeState() — reading & deserializing existing data", () => {
        test("deserializes existing file content as the initial state", async () => {
            seed(encoder.encode("persisted-value"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve("default"));
            expect(await ps.getState()).toBe("persisted-value");
            expect(mockedReadFile).toHaveBeenCalledWith(PATH);
        });

        test("reads and deserializes an empty (zero-byte) file (no empty-file short-circuit)", async () => {
            seed(new Uint8Array());

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve("default"));
            // The implementation no longer special-cases zero-byte files: the empty
            // bytes are read and handed to the deserializer (here -> "").
            expect(await ps.getState()).toBe("");
            expect(mockedReadFile).toHaveBeenCalledWith(PATH);
        });

        test("accepts a plain T (non-Promise) as defaultState", async () => {
            // No file on disk -> readFile throws -> defaultState is used.

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, "plain-default");
            expect(await ps.getState()).toBe("plain-default");
        });

        test("accepts a function (lazy factory) as defaultState", async () => {
            // No file on disk -> readFile throws -> defaultState factory is used.

            const factory = vi.fn(() => "lazy-default");
            const ps = new PersistentState(PATH, textSerializer, textDeserializer, factory);
            expect(await ps.getState()).toBe("lazy-default");
            expect(factory).toHaveBeenCalledOnce();
        });

        test("accepts an async function (lazy factory returning Promise<T>) as defaultState", async () => {
            // No file on disk -> readFile throws -> async defaultState factory is used.

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, async () => "async-lazy-default");
            expect(await ps.getState()).toBe("async-lazy-default");
        });

        test("returns defaultState when readFile throws", async () => {
            seed(encoder.encode("non-empty"));
            mockedReadFile.mockRejectedValue(new Error("read error"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve("fallback"));
            expect(await ps.getState()).toBe("fallback");
        });

        test("logs console.error when readFile throws", async () => {
            seed(encoder.encode("non-empty"));
            mockedReadFile.mockRejectedValue(new Error("read error"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve("x"));
            await ps.getState();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to read file"));
        });

        test("returns defaultState when deserializer throws", async () => {
            seed(encoder.encode("corrupt"));

            const badDeserializer = () => {
                throw new Error("bad data");
            };

            const ps = new PersistentState(PATH, textSerializer, badDeserializer, Promise.resolve("safe-default"));
            expect(await ps.getState()).toBe("safe-default");
        });

        test("logs console.error when deserializer throws", async () => {
            seed(encoder.encode("corrupt"));

            const badDeserializer = () => {
                throw new Error("bad data");
            };

            const ps = new PersistentState(PATH, textSerializer, badDeserializer, Promise.resolve("x"));
            await ps.getState();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to deserialize state"));
        });

        test("deserializer can be async (returns a Promise<T>)", async () => {
            seed(encoder.encode("async-value"));

            const asyncDeserializer = async (b: Uint8Array) => decoder.decode(b) + "-decoded";

            const ps = new PersistentState(PATH, textSerializer, asyncDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("async-value-decoded");
        });

        test("pathname / serializer / deserializer are stored as public properties", () => {
            seed(new Uint8Array());
            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));
            expect(ps.pathname).toBe(PATH);
            expect(ps.serializer).toBe(textSerializer);
            expect(ps.deserializer).toBe(textDeserializer);
        });
    });

    // -----------------------------------------------------------------------
    describe("getState()", () => {
        test("returns the current state", async () => {
            seed(encoder.encode("current"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("current");
        });

        test("returns updated state after setState()", async () => {
            seed(encoder.encode("old"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("new-value");
            expect(await ps.getState()).toBe("new-value");
        });
    });

    // -----------------------------------------------------------------------
    describe("setState()", () => {
        test("serializes and writes new state durably (writeFile temp + atomic rename)", async () => {
            seed(encoder.encode("initial"));

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("updated");

            // Written to the temp path first, then renamed onto the real path.
            expect(mockedWriteFile).toHaveBeenCalledWith(TMP, expect.anything());
            expect(mockedRename).toHaveBeenCalledWith(TMP, PATH);
            expect(decoder.decode(diskBytes())).toBe("updated");
            // The temp file is gone after the rename.
            expect(disk.has(TMP)).toBe(false);
        });

        test("accepts a Promise<T> as the new state", async () => {
            seed(new Uint8Array());

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState(Promise.resolve("from-promise"));

            expect(await ps.getState()).toBe("from-promise");
            expect(decoder.decode(diskBytes())).toBe("from-promise");
        });

        test("serializer can be async (returns Promise<Uint8Array>)", async () => {
            seed(new Uint8Array());

            const asyncSerializer = async (s: string) => encoder.encode(s);

            const ps = new PersistentState(PATH, asyncSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("async-serial");

            expect(decoder.decode(diskBytes())).toBe("async-serial");
        });

        test("throws (and re-throws) when serializer fails", async () => {
            seed(new Uint8Array());

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState(PATH, badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow("serial failure");
            // Nothing reaches disk when serialization fails.
            expect(mockedWriteFile).not.toHaveBeenCalled();
        });

        test("logs console.error when serializer fails", async () => {
            seed(new Uint8Array());

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState(PATH, badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to serialize state"));
        });
    });

    // -----------------------------------------------------------------------
    describe("write() concurrency — sequential write chaining", () => {
        test("concurrent setState() calls are serialized (no interleaving)", async () => {
            seed(new Uint8Array());

            const writeOrder: string[] = [];
            const firstGate = deferred();
            const firstStarted = deferred();

            let callCount = 0;
            mockedWriteFile.mockImplementation(async (_p: any, data: any) => {
                callCount++;
                const id = callCount === 1 ? "A" : "B";
                if (id === "A") {
                    writeOrder.push("start-A");
                    firstStarted.resolve();
                    await firstGate.promise;
                    writeOrder.push("end-A");
                } else {
                    writeOrder.push("start-B");
                }
                disk.set(_p, Uint8Array.from(data as Uint8Array));
            });

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));

            const p1 = ps.setState("first");
            const p2 = ps.setState("second");

            await firstStarted.promise;
            firstGate.resolve();

            await Promise.all([p1, p2]);
            // B must not start until A has fully finished.
            expect(writeOrder).toEqual(["start-A", "end-A", "start-B"]);
        });

        // PRE-EXISTING FAILURE — do not "fix" this by touching the implementation.
        // It documents the same behaviour the old suite flagged: write() swallows its
        // own errors, so a failed write does NOT surface through setState(). The
        // assertion that p1 rejects is therefore expected to fail against the current
        // implementation. Left in place intentionally as a red flag for that behaviour.
        test("a failed previous write is silently ignored and the next write still proceeds", async () => {
            seed(new Uint8Array());

            let callCount = 0;
            mockedWriteFile.mockImplementation(async (_p: any, data: any) => {
                callCount++;
                if (callCount === 1) throw new Error("disk error");
                disk.set(_p, Uint8Array.from(data as Uint8Array));
            });

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve(""));

            const p1 = ps.setState("first");
            const p2 = ps.setState("second");

            // (Pre-existing failing expectation: write() swallows the error, so p1 resolves.)
            await expect(p1).rejects.toThrow("disk error");

            // p2 must succeed regardless.
            await expect(p2).resolves.toBeUndefined();
        });

        test("setState() updates statePromise immediately (before write resolves)", async () => {
            seed(new Uint8Array());

            const writeGate = deferred();
            mockedWriteFile.mockImplementation(async (_p: any, data: any) => {
                await writeGate.promise;
                disk.set(_p, Uint8Array.from(data as Uint8Array));
            });

            const ps = new PersistentState(PATH, textSerializer, textDeserializer, Promise.resolve("old"));

            const setStateP = ps.setState("new-value");

            await flushPromises();

            // statePromise already reflects the new value, even though the write is gated.
            expect(await ps.getState()).toBe("new-value");

            writeGate.resolve();
            await setStateP;
        });
    });

    // -----------------------------------------------------------------------
    // Regression tests for the "setState ordering race": with un-awaited concurrent
    // writes, in-memory state and on-disk bytes could diverge because the write chain
    // was gated on serializer-completion order rather than call order. These verify
    // that *call order* is the single source of truth for BOTH memory and disk.
    describe("setState() ordering & durability under concurrency (race regression)", () => {
        test("a later un-awaited setState wins on disk even when its serializer resolves first", async () => {
            const gateA = deferred();
            const gateB = deferred();
            const serializer = async (s: string) => {
                if (s === "A") await gateA.promise;
                if (s === "B") await gateB.promise;
                return encoder.encode(s);
            };

            seed(new Uint8Array());
            const ps = new PersistentState(PATH, serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A"); // called first
            const pB = ps.setState("B"); // called last → must win

            gateB.resolve();
            await flushPromises();
            gateA.resolve();

            await Promise.all([pA, pB]);

            expect(await ps.getState()).toBe("B"); // memory
            expect(decoder.decode(diskBytes())).toBe("B"); // disk
        });

        test("with three un-awaited writes, the last call is the durable value regardless of serializer speed", async () => {
            const gates = { A: deferred(), B: deferred(), C: deferred() } as const;

            const serializer = async (s: keyof typeof gates) => {
                await gates[s].promise;
                return encoder.encode(s);
            };

            seed(new Uint8Array());
            const ps = new PersistentState(
                PATH,
                serializer,
                textDeserializer as (serialized: Uint8Array) => keyof typeof gates,
                "A",
            );
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            const pC = ps.setState("C"); // last → must win

            gates.C.resolve();
            gates.A.resolve();
            gates.B.resolve();

            await Promise.all([pA, pB, pC]);

            expect(await ps.getState()).toBe("C");
            expect(decoder.decode(diskBytes())).toBe("C");
        });

        test("writes reach disk in call order, not serializer-completion order", async () => {
            const gates = { A: deferred(), B: deferred(), C: deferred() };
            const serializer = async (s: keyof typeof gates) => {
                await gates[s].promise;
                return encoder.encode(s);
            };

            seed(new Uint8Array());
            const ps = new PersistentState(
                PATH,
                serializer,
                textDeserializer as (serialized: Uint8Array) => keyof typeof gates,
                "A",
            );
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            const pC = ps.setState("C");

            gates.C.resolve();
            gates.B.resolve();
            gates.A.resolve();

            await Promise.all([pA, pB, pC]);

            const writtenOrder = writeCalls.map(b => decoder.decode(b));
            expect(writtenOrder).toEqual(["A", "B", "C"]);
        });

        test("a fresh instance (simulated restart) reads back the last-written value", async () => {
            const gateA = deferred();
            const gateB = deferred();
            const serializer = async (s: string) => {
                if (s === "A") await gateA.promise;
                if (s === "B") await gateB.promise;
                return encoder.encode(s);
            };

            seed(new Uint8Array());
            const ps = new PersistentState(PATH, serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            gateB.resolve();
            await flushPromises();
            gateA.resolve();
            await Promise.all([pA, pB]);

            // Simulate a process restart: a brand-new instance reading the same on-disk bytes.
            const reloaded = new PersistentState(PATH, textSerializer, textDeserializer, "DEFAULT");
            // The user's last value ("B") must survive — not the stale "A".
            expect(await reloaded.getState()).toBe("B");
        });

        test("setState values that are Promises resolving out of order still persist in call order", async () => {
            seed(new Uint8Array());
            const ps = new PersistentState(PATH, textSerializer, textDeserializer, "");
            await ps.getState();

            const slowA = new Promise<string>(res => setTimeout(() => res("A"), 20));
            const fastB = Promise.resolve("B");

            const pA = ps.setState(slowA);
            const pB = ps.setState(fastB);

            await Promise.all([pA, pB]);

            expect(await ps.getState()).toBe("B");
            expect(decoder.decode(diskBytes())).toBe("B");
        });

        test("a serializer failure on a middle write does not corrupt ordering of the surrounding writes", async () => {
            const serializer = (s: string) => {
                if (s === "B") throw new Error("serialize B failed");
                return encoder.encode(s);
            };

            seed(new Uint8Array());
            const ps = new PersistentState(PATH, serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B"); // fails to serialize
            const pC = ps.setState("C");

            await expect(pA).resolves.toBeUndefined();
            await expect(pB).rejects.toThrow("serialize B failed");
            await expect(pC).resolves.toBeUndefined();

            // B never made it to disk; A then C did, in order. Final state is C.
            expect(await ps.getState()).toBe("C");
            expect(decoder.decode(diskBytes())).toBe("C");
            expect(writeCalls.map(b => decoder.decode(b))).toEqual(["A", "C"]);
        });

        test("many rapid un-awaited writes converge to the final value with intact bytes", async () => {
            seed(new Uint8Array());

            const serializer = async (s: string) => {
                await new Promise(res => setTimeout(res, Math.floor(Math.random() * 5)));
                return encoder.encode(s);
            };

            const ps = new PersistentState(PATH, serializer, textDeserializer, "");
            await ps.getState();

            const N = 25;
            const promises: Promise<void>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(ps.setState(`v${i}`));
            }
            await Promise.all(promises);

            const last = `v${N - 1}`;
            expect(await ps.getState()).toBe(last); // memory converged
            expect(decoder.decode(diskBytes())).toBe(last); // disk converged, no torn bytes

            // Every write landed exactly once, in call order.
            expect(writeCalls.map(b => decoder.decode(b))).toEqual(Array.from({ length: N }, (_, i) => `v${i}`));
        });
    });
});
