import { describe, test, expect, vi, beforeEach, type MockedFunction } from "vitest";
import fs from "fs/promises";
import { PersistentState } from "@/utils/persistent-state";

// ---------------------------------------------------------------------------
// Mock fs/promises — no real disk I/O
// ---------------------------------------------------------------------------
vi.mock("fs/promises");

const mockedOpen = fs.open as MockedFunction<typeof fs.open>;
const mockedAccess = fs.access as MockedFunction<typeof fs.access>;

// Encoder/decoder used by most tests
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const textSerializer = (s: string) => encoder.encode(s);
const textDeserializer = (b: Uint8Array) => decoder.decode(b);

// ---------------------------------------------------------------------------
// Fake FileHandle factory
// ---------------------------------------------------------------------------
type FakeHandle = {
    readFile: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    truncate: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
} & fs.FileHandle;

function makeFakeHandle(content: Uint8Array = new Uint8Array()): FakeHandle {
    return {
        // initializeState() calls fileHandle.stat() to short-circuit on empty files.
        stat: vi.fn().mockResolvedValue({ size: content.byteLength }),
        readFile: vi.fn().mockResolvedValue(content),
        write: vi
            .fn()
            .mockImplementation((_buf: Uint8Array, _offset: number, length: number) =>
                Promise.resolve({ bytesWritten: length }),
            ),
        truncate: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    } as unknown as FakeHandle;
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Default: both access() calls succeed (file exists and is readable/writable)
    mockedAccess.mockResolvedValue(undefined);
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

/** An externally-resolvable promise, used to control serializer timing precisely. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/**
 * A fake FileHandle that actually stores the bytes written to it, so a test can
 * inspect what ended up "on disk" independently of the in-memory state. It honours
 * truncate(0) + positional write() exactly as PersistentState.write() drives it.
 */
type StatefulHandle = FakeHandle & {
    /** Snapshot of the current on-disk bytes. */
    diskBytes(): Uint8Array;
    /** Every chunk handed to write(), in the order it was written. */
    writeCalls: Uint8Array[];
};

function makeStatefulHandle(initial: Uint8Array = new Uint8Array()): StatefulHandle {
    let buffer = Uint8Array.from(initial);
    const writeCalls: Uint8Array[] = [];

    const handle = {
        stat: vi.fn(async () => ({ size: buffer.byteLength })),
        readFile: vi.fn(async () => Uint8Array.from(buffer)),
        truncate: vi.fn(async (len = 0) => {
            const next = new Uint8Array(len);
            next.set(buffer.subarray(0, Math.min(len, buffer.byteLength)));
            buffer = next;
        }),
        write: vi.fn(async (buf: Uint8Array, offset: number, length: number, position: number) => {
            const chunk = Uint8Array.from(buf.subarray(offset, offset + length));
            writeCalls.push(chunk);
            const end = position + length;
            if (end > buffer.byteLength) {
                const grown = new Uint8Array(end);
                grown.set(buffer);
                buffer = grown;
            }
            buffer.set(chunk, position);
            return { bytesWritten: length };
        }),
        close: vi.fn(async () => {}),
    } as unknown as StatefulHandle;

    handle.diskBytes = () => Uint8Array.from(buffer);
    handle.writeCalls = writeCalls;
    return handle;
}

// ===========================================================================
describe("persistent-state", () => {
    // -----------------------------------------------------------------------
    describe("openFile() — fs.access() existence check", () => {
        test("when F_OK access succeeds, fileExists is set to true and R_OK|W_OK is checked", async () => {
            const handle = makeFakeHandle();
            mockedAccess.mockResolvedValue(undefined); // both access calls succeed
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.getState();
            // First call: F_OK, second call: R_OK | W_OK
            expect(mockedAccess).toHaveBeenCalledTimes(2);
            expect(mockedAccess).toHaveBeenNthCalledWith(1, "/tmp/state.bin", fs.constants.F_OK);
            expect(mockedAccess).toHaveBeenNthCalledWith(2, "/tmp/state.bin", fs.constants.R_OK | fs.constants.W_OK);
        });

        test("when F_OK access fails, logs console.warn and skips the R_OK|W_OK check entirely", async () => {
            const handle = makeFakeHandle();
            // F_OK fails → fileExists stays false
            mockedAccess.mockRejectedValueOnce(new Error("ENOENT"));
            // No r+ attempt when fileExists=false — goes straight to w
            mockedOpen.mockResolvedValueOnce(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, "");
            await expect(ps.getState()).resolves.toBe("");
            // Only the F_OK access call is made; R_OK|W_OK is skipped
            expect(mockedAccess).toHaveBeenCalledOnce();
            expect(mockedAccess).toHaveBeenCalledWith("/tmp/state.bin", fs.constants.F_OK);

            // console.warn fires for missing file
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("does not exists"));

            // r+ is never attempted when fileExists=false — only w is called
            expect(mockedOpen).toHaveBeenCalledOnce();
            expect(mockedOpen).toHaveBeenCalledWith("/tmp/state.bin", "w");
        });

        test("when R_OK|W_OK access fails, logs console.error and throws (never reaches fs.open)", async () => {
            const permError = new Error("EACCES");
            // F_OK succeeds, R_OK|W_OK fails
            mockedAccess.mockResolvedValueOnce(undefined).mockRejectedValueOnce(permError);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.getState()).rejects.toThrow("EACCES");

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("exists but is not readable / writable"),
            );

            // fs.open must never be called when permissions check fails
            expect(mockedOpen).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("openFile() — file-open strategy (fileExists=true path)", () => {
        test("opens with 'r+' when fileExists=true and r+ succeeds", async () => {
            const handle = makeFakeHandle(encoder.encode("hello"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.getState();
            expect(mockedOpen).toHaveBeenCalledWith("/tmp/state.bin", "r+");
            expect(mockedOpen).toHaveBeenCalledOnce();
        });

        test("throws when fileExists=true but r+ fails (never falls back to a truncating mode)", async () => {
            // Safety guard: opening an existing file with "w"/"w+" would truncate it and
            // destroy the persisted state, so r+ failure must throw — never retry with "w".
            mockedOpen.mockRejectedValueOnce(new Error("EPERM"));

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.getState()).rejects.toThrow("EPERM");

            // Only "r+" is attempted; there is no fallback open for an existing file.
            expect(mockedOpen).toHaveBeenCalledOnce();
            expect(mockedOpen).toHaveBeenCalledWith("/tmp/state.bin", "r+");
        });

        test("throws when fileExists=false and 'w' open fails", async () => {
            mockedAccess.mockRejectedValueOnce(new Error("ENOENT")); // F_OK fails → fileExists=false
            mockedOpen.mockRejectedValueOnce(new Error("EACCES")); // "w" create fails

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.getState()).rejects.toThrow("EACCES");

            expect(mockedOpen).toHaveBeenCalledOnce();
            expect(mockedOpen).toHaveBeenCalledWith("/tmp/state.bin", "w");
        });

        test("logs console.error on r+ failure", async () => {
            mockedOpen.mockRejectedValueOnce(new Error("EPERM"));

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.getState()).rejects.toThrow("EPERM");

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to open file `/tmp/state.bin` for reading / writing"),
            );
        });

        test("logs console.error on 'w' failure (fileExists=false)", async () => {
            mockedAccess.mockRejectedValueOnce(new Error("ENOENT")); // F_OK fails → fileExists=false
            mockedOpen.mockRejectedValueOnce(new Error("EACCES")); // "w" create fails

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.getState()).rejects.toThrow();

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to open file `/tmp/state.bin` for writing"),
            );
        });

        test("pathname is stored as a public property", () => {
            mockedOpen.mockResolvedValue(makeFakeHandle());
            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            expect(ps.pathname).toBe("/tmp/state.bin");
        });
    });

    // -----------------------------------------------------------------------
    describe("initializeState() — reading & deserializing existing data", () => {
        test("deserializes existing file content as the initial state", async () => {
            const handle = makeFakeHandle(encoder.encode("persisted-value"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                textSerializer,
                textDeserializer,
                Promise.resolve("default"),
            );
            expect(await ps.getState()).toBe("persisted-value");
        });

        test("accepts a plain T (non-Promise) as defaultState", async () => {
            const handle = makeFakeHandle(encoder.encode("non-empty"));
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            // Pass a raw string, not a Promise<string>
            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, "plain-default");
            expect(await ps.getState()).toBe("plain-default");
        });

        test("accepts a function (lazy factory) as defaultState", async () => {
            // Empty file → getDefaultState() invokes the factory to produce the default.
            const handle = makeFakeHandle();
            mockedOpen.mockResolvedValue(handle);

            const factory = vi.fn(() => "lazy-default");
            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, factory);
            expect(await ps.getState()).toBe("lazy-default");
            expect(factory).toHaveBeenCalledOnce();
        });

        test("accepts an async function (lazy factory returning Promise<T>) as defaultState", async () => {
            const handle = makeFakeHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                textSerializer,
                textDeserializer,
                async () => "async-lazy-default",
            );
            expect(await ps.getState()).toBe("async-lazy-default");
        });

        test("returns defaultState when readFile throws", async () => {
            const handle = makeFakeHandle(encoder.encode("non-empty"));
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                textSerializer,
                textDeserializer,
                Promise.resolve("fallback"),
            );
            expect(await ps.getState()).toBe("fallback");
        });

        test("logs console.error when readFile throws", async () => {
            const handle = makeFakeHandle(encoder.encode("non-empty"));
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve("x"));
            await ps.getState();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to read file"));
        });

        test("returns defaultState when deserializer throws", async () => {
            const handle = makeFakeHandle(encoder.encode("corrupt"));
            mockedOpen.mockResolvedValue(handle);

            const badDeserializer = () => {
                throw new Error("bad data");
            };

            const ps = new PersistentState(
                "/tmp/state.bin",
                textSerializer,
                badDeserializer,
                Promise.resolve("safe-default"),
            );
            expect(await ps.getState()).toBe("safe-default");
        });

        test("logs console.error when deserializer throws", async () => {
            const handle = makeFakeHandle(encoder.encode("corrupt"));
            mockedOpen.mockResolvedValue(handle);

            const badDeserializer = () => {
                throw new Error("bad data");
            };

            const ps = new PersistentState("/tmp/state.bin", textSerializer, badDeserializer, Promise.resolve("x"));
            await ps.getState();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to deserialize state"));
        });

        test("deserializer can be async (returns a Promise<T>)", async () => {
            const handle = makeFakeHandle(encoder.encode("async-value"));
            mockedOpen.mockResolvedValue(handle);

            const asyncDeserializer = async (b: Uint8Array) => decoder.decode(b) + "-decoded";

            const ps = new PersistentState("/tmp/state.bin", textSerializer, asyncDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("async-value-decoded");
        });
    });

    // -----------------------------------------------------------------------
    describe("getState()", () => {
        test("returns the current state", async () => {
            const handle = makeFakeHandle(encoder.encode("current"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("current");
        });

        test("returns updated state after setState()", async () => {
            const handle = makeFakeHandle(encoder.encode("old"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("new-value");
            expect(await ps.getState()).toBe("new-value");
        });
    });

    // -----------------------------------------------------------------------
    describe("setState()", () => {
        test("serializes and writes new state to disk", async () => {
            const handle = makeFakeHandle(encoder.encode("initial"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("updated");

            expect(handle.truncate).toHaveBeenCalledWith(0);
            expect(handle.write).toHaveBeenCalled();
        });

        test("accepts a Promise<T> as the new state", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState(Promise.resolve("from-promise"));

            expect(await ps.getState()).toBe("from-promise");
        });

        test("serializer can be async (returns Promise<Uint8Array>)", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const asyncSerializer = async (s: string) => encoder.encode(s);

            const ps = new PersistentState("/tmp/state.bin", asyncSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("async-serial");

            expect(handle.write).toHaveBeenCalled();
        });

        test("throws (and re-throws) when serializer fails", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState("/tmp/state.bin", badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow("serial failure");
        });

        test("logs console.error when serializer fails", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState("/tmp/state.bin", badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to serialize state"));
        });

        test("write loop handles partial writes (loops until all bytes written)", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            const payload = encoder.encode("hello"); // 5 bytes

            let callCount = 0;
            handle.write.mockImplementation((_buf: Uint8Array, _offset: number, length: number) => {
                callCount++;
                // First write: only 3 bytes
                if (callCount === 1) return Promise.resolve({ bytesWritten: 3 });
                // Second write: remaining 2 bytes
                return Promise.resolve({ bytesWritten: length });
            });
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", () => payload, textDeserializer, Promise.resolve(""));
            await ps.setState("hello");

            expect(handle.write).toHaveBeenCalledTimes(2);
        });
    });

    // -----------------------------------------------------------------------
    describe("write() concurrency — sequential write chaining", () => {
        test("concurrent setState() calls are serialized (no interleaving)", async () => {
            const writeOrder: string[] = [];

            let resolveFirst!: () => void;
            const firstGate = new Promise<void>(res => (resolveFirst = res));
            let firstStarted!: () => void;
            const firstStartedP = new Promise<void>(res => (firstStarted = res));

            let callCount = 0;
            const handle = makeFakeHandle(new Uint8Array());
            handle.write.mockImplementation(async (_buf: Uint8Array, _offset: number, length: number) => {
                callCount++;
                const id = callCount === 1 ? "A" : "B";

                if (id === "A") {
                    writeOrder.push("start-A");
                    firstStarted();
                    await firstGate;
                    writeOrder.push("end-A");
                } else {
                    writeOrder.push("start-B");
                }
                return { bytesWritten: length };
            });
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));

            const p1 = ps.setState("first");
            const p2 = ps.setState("second");

            await firstStartedP;
            resolveFirst();

            await Promise.all([p1, p2]);
            // B must not start until A has fully finished
            expect(writeOrder).toEqual(["start-A", "end-A", "start-B"]);
        });

        test("a failed previous write is silently ignored and the next write still proceeds", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            let callCount = 0;

            handle.write.mockImplementation((_buf: Uint8Array, _offset: number, length: number) => {
                callCount++;
                if (callCount === 1) return Promise.reject(new Error("disk error"));
                return Promise.resolve({ bytesWritten: length });
            });
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));

            // First setState fails at the write level (after truncate)
            const p1 = ps.setState("first");

            // Second setState must not reject even though the first write failed,
            // because write() swallows the previous lastWrite error.
            const p2 = ps.setState("second");

            // p1 rejects because setState awaits lastWrite
            await expect(p1).rejects.toThrow("disk error");

            // p2 must succeed — the failed lastWrite error is caught and ignored
            await expect(p2).resolves.toBeUndefined();
        });

        test("setState() updates statePromise immediately (before write resolves)", async () => {
            let resolveWrite!: () => void;
            const writeGate = new Promise<void>(res => (resolveWrite = res));

            const handle = makeFakeHandle(new Uint8Array());
            handle.write.mockImplementation(async (_buf: Uint8Array, _offset: number, length: number) => {
                await writeGate;
                return { bytesWritten: length };
            });
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve("old"));

            // Fire setState but don't await it yet
            const setStateP = ps.setState("new-value");

            // Give the micro-task queue a chance to update statePromise
            await flushPromises();

            // statePromise should already reflect the new value
            expect(await ps.getState()).toBe("new-value");

            // Unblock the write so we can clean up
            resolveWrite();
            await setStateP;
        });
    });

    // -----------------------------------------------------------------------
    // Regression tests for the "setState ordering race" once documented in
    // persistent-state.ts: with un-awaited concurrent writes, the in-memory
    // state and the on-disk bytes could diverge — with disk silently keeping the
    // OLDER value — because the write chain was gated on serializer-completion
    // order rather than call order. These verify that *call order* is the single
    // source of truth for BOTH memory and disk.
    describe("setState() ordering & durability under concurrency (race regression)", () => {
        test("a later un-awaited setState wins on disk even when its serializer resolves first", async () => {
            const gateA = deferred();
            const gateB = deferred();
            const serializer = async (s: string) => {
                if (s === "A") await gateA.promise;
                if (s === "B") await gateB.promise;
                return encoder.encode(s);
            };

            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A"); // called first
            const pB = ps.setState("B"); // called last → must win

            // Unblock B's serializer first. In the buggy version this raced B's write
            // to disk ahead of A's, then A's later write clobbered it — leaving the
            // stale "A" on disk while memory said "B".
            gateB.resolve();
            await flushPromises();
            gateA.resolve();

            await Promise.all([pA, pB]);

            expect(await ps.getState()).toBe("B"); // memory
            expect(decoder.decode(handle.diskBytes())).toBe("B"); // disk
        });

        test("with three un-awaited writes, the last call is the durable value regardless of serializer speed", async () => {
            const gates = {
                A: deferred(),
                B: deferred(),
                C: deferred(),
            } as const;

            const serializer = async (s: keyof typeof gates) => {
                await gates[s].promise;
                return encoder.encode(s);
            };

            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                serializer,
                textDeserializer as (serialized: Uint8Array) => keyof typeof gates,
                "A",
            );
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            const pC = ps.setState("C"); // last → must win

            // Resolve the serializers in a scrambled order; the outcome must not depend on it.
            gates.C.resolve();
            gates.A.resolve();
            gates.B.resolve();

            await Promise.all([pA, pB, pC]);

            expect(await ps.getState()).toBe("C");
            expect(decoder.decode(handle.diskBytes())).toBe("C");
        });

        test("writes reach disk in call order, not serializer-completion order", async () => {
            const gates = {
                A: deferred(),
                B: deferred(),
                C: deferred(),
            };
            const serializer = async (s: keyof typeof gates) => {
                await gates[s].promise;
                return encoder.encode(s);
            };

            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                serializer,
                textDeserializer as (serialized: Uint8Array) => keyof typeof gates,
                "A",
            );
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            const pC = ps.setState("C");

            // Let serializers finish in reverse order — writes must still be A, B, C.
            gates.C.resolve();
            gates.B.resolve();
            gates.A.resolve();

            await Promise.all([pA, pB, pC]);

            const writtenOrder = handle.writeCalls.map(b => decoder.decode(b));
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

            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B");
            gateB.resolve();
            await flushPromises();
            gateA.resolve();
            await Promise.all([pA, pB]);
            // Simulate a process restart: a brand-new instance reading the same on-disk bytes.
            const reloadHandle = makeStatefulHandle(handle.diskBytes());
            mockedOpen.mockResolvedValue(reloadHandle);

            const reloaded = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, "DEFAULT");
            // The user's last value ("B") must survive the restart — not the stale "A".
            expect(await reloaded.getState()).toBe("B");
        });

        test("setState values that are Promises resolving out of order still persist in call order", async () => {
            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, "");
            await ps.getState();

            // First call's value resolves LATER; last call's value resolves immediately.
            const slowA = new Promise<string>(res => setTimeout(() => res("A"), 20));
            const fastB = Promise.resolve("B");

            const pA = ps.setState(slowA);
            const pB = ps.setState(fastB);

            await Promise.all([pA, pB]);

            expect(await ps.getState()).toBe("B");
            expect(decoder.decode(handle.diskBytes())).toBe("B");
        });

        test("a serializer failure on a middle write does not corrupt ordering of the surrounding writes", async () => {
            const serializer = (s: string) => {
                if (s === "B") throw new Error("serialize B failed");
                return encoder.encode(s);
            };

            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", serializer, textDeserializer, "");
            await ps.getState();

            const pA = ps.setState("A");
            const pB = ps.setState("B"); // fails to serialize
            const pC = ps.setState("C");

            await expect(pA).resolves.toBeUndefined();
            await expect(pB).rejects.toThrow("serialize B failed");
            await expect(pC).resolves.toBeUndefined();

            // B never made it to disk; A then C did, in order. Final state is C.
            expect(await ps.getState()).toBe("C");
            expect(decoder.decode(handle.diskBytes())).toBe("C");
            expect(handle.writeCalls.map(b => decoder.decode(b))).toEqual(["A", "C"]);
        });

        test("many rapid un-awaited writes converge to the final value with intact bytes", async () => {
            const handle = makeStatefulHandle();
            mockedOpen.mockResolvedValue(handle);

            // Randomised serializer latency to scramble completion order.
            const serializer = async (s: string) => {
                await new Promise(res => setTimeout(res, Math.floor(Math.random() * 5)));
                return encoder.encode(s);
            };

            const ps = new PersistentState("/tmp/state.bin", serializer, textDeserializer, "");
            await ps.getState();

            const N = 25;
            const promises: Promise<void>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(ps.setState(`v${i}`));
            }
            await Promise.all(promises);

            const last = `v${N - 1}`;
            expect(await ps.getState()).toBe(last); // memory converged
            expect(decoder.decode(handle.diskBytes())).toBe(last); // disk converged, no torn bytes

            // Every write landed exactly once, in call order.
            expect(handle.writeCalls.map(b => decoder.decode(b))).toEqual(Array.from({ length: N }, (_, i) => `v${i}`));
        });
    });

    // -----------------------------------------------------------------------
    describe("serializer / deserializer public properties", () => {
        test("serializer and deserializer are stored as public properties", () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/s.bin", textSerializer, textDeserializer, Promise.resolve(""));

            expect(ps.serializer).toBe(textSerializer);
            expect(ps.deserializer).toBe(textDeserializer);
        });
    });
});
