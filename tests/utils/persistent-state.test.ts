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
} & fs.FileHandle;

function makeFakeHandle(content: Uint8Array = new Uint8Array()): FakeHandle {
    return {
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
            await ps.close();

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
            await ps.close();

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
            await ps.close();

            expect(mockedOpen).toHaveBeenCalledWith("/tmp/state.bin", "r+");
            expect(mockedOpen).toHaveBeenCalledOnce();
        });

        test("falls back to 'w' when fileExists=true but r+ fails", async () => {
            const handle = makeFakeHandle();
            mockedOpen.mockRejectedValueOnce(new Error("EPERM")).mockResolvedValueOnce(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.getState();
            await ps.close();

            expect(mockedOpen).toHaveBeenCalledTimes(2);
            expect(mockedOpen).toHaveBeenNthCalledWith(1, "/tmp/state.bin", "r+");
            expect(mockedOpen).toHaveBeenNthCalledWith(2, "/tmp/state.bin", "w");
        });

        test("throws when 'w' open also fails", async () => {
            mockedOpen.mockRejectedValueOnce(new Error("EPERM")).mockRejectedValueOnce(new Error("EACCES"));

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));

            await expect(ps.getState()).rejects.toThrow("EACCES");
        });

        test("logs console.error on r+ failure", async () => {
            const handle = makeFakeHandle();
            mockedOpen.mockRejectedValueOnce(new Error("EPERM")).mockResolvedValueOnce(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.getState();
            await ps.close();

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Failed to open file `/tmp/state.bin` for reading / writing"),
            );
        });

        test("logs console.error on 'w' failure too", async () => {
            mockedOpen.mockRejectedValueOnce(new Error("EPERM")).mockRejectedValueOnce(new Error("EACCES"));

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

            await ps.close();
        });

        test("accepts a plain T (non-Promise) as defaultState", async () => {
            const handle = makeFakeHandle();
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            // Pass a raw string, not a Promise<string>
            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, "plain-default");
            expect(await ps.getState()).toBe("plain-default");
            await ps.close();
        });

        test("returns defaultState when readFile throws", async () => {
            const handle = makeFakeHandle();
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState(
                "/tmp/state.bin",
                textSerializer,
                textDeserializer,
                Promise.resolve("fallback"),
            );
            expect(await ps.getState()).toBe("fallback");

            await ps.close();
        });

        test("logs console.error when readFile throws", async () => {
            const handle = makeFakeHandle();
            handle.readFile.mockRejectedValue(new Error("read error"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve("x"));
            await ps.getState();
            await ps.close();

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

            await ps.close();
        });

        test("logs console.error when deserializer throws", async () => {
            const handle = makeFakeHandle(encoder.encode("corrupt"));
            mockedOpen.mockResolvedValue(handle);

            const badDeserializer = () => {
                throw new Error("bad data");
            };

            const ps = new PersistentState("/tmp/state.bin", textSerializer, badDeserializer, Promise.resolve("x"));
            await ps.getState();
            await ps.close();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to deserialize state"));
        });

        test("deserializer can be async (returns a Promise<T>)", async () => {
            const handle = makeFakeHandle(encoder.encode("async-value"));
            mockedOpen.mockResolvedValue(handle);

            const asyncDeserializer = async (b: Uint8Array) => decoder.decode(b) + "-decoded";

            const ps = new PersistentState("/tmp/state.bin", textSerializer, asyncDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("async-value-decoded");
            await ps.close();
        });
    });

    // -----------------------------------------------------------------------
    describe("getState()", () => {
        test("returns the current state", async () => {
            const handle = makeFakeHandle(encoder.encode("current"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            expect(await ps.getState()).toBe("current");
            await ps.close();
        });

        test("returns updated state after setState()", async () => {
            const handle = makeFakeHandle(encoder.encode("old"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("new-value");
            expect(await ps.getState()).toBe("new-value");
            await ps.close();
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

            await ps.close();
        });

        test("accepts a Promise<T> as the new state", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState(Promise.resolve("from-promise"));

            expect(await ps.getState()).toBe("from-promise");
            await ps.close();
        });

        test("serializer can be async (returns Promise<Uint8Array>)", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const asyncSerializer = async (s: string) => encoder.encode(s);

            const ps = new PersistentState("/tmp/state.bin", asyncSerializer, textDeserializer, Promise.resolve(""));
            await ps.setState("async-serial");

            expect(handle.write).toHaveBeenCalled();
            await ps.close();
        });

        test("throws (and re-throws) when serializer fails", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState("/tmp/state.bin", badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow("serial failure");
            await ps.close();
        });

        test("logs console.error when serializer fails", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            mockedOpen.mockResolvedValue(handle);

            const badSerializer = () => {
                throw new Error("serial failure");
            };

            const ps = new PersistentState("/tmp/state.bin", badSerializer, textDeserializer, Promise.resolve(""));
            await expect(ps.setState("boom")).rejects.toThrow();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Failed to serialized state"));
            await ps.close();
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
            await ps.close();
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
            await ps.close();

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
            await ps.close();
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
            await ps.close();
        });
    });

    // -----------------------------------------------------------------------
    describe("close()", () => {
        test("closes the file handle when no setState() was called (lastWrite === null)", async () => {
            const handle = makeFakeHandle(encoder.encode("data"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            await ps.getState();
            await ps.close();

            expect(handle.close).toHaveBeenCalledOnce();
        });

        test("waits for the pending write to finish before closing", async () => {
            const order: string[] = [];

            let resolveWrite!: () => void;
            const writeGate = new Promise<void>(res => (resolveWrite = res));

            const handle = makeFakeHandle(new Uint8Array());
            handle.write.mockImplementation(async (_buf: Uint8Array, _offset: number, length: number) => {
                await writeGate;
                order.push("write-done");
                return { bytesWritten: length };
            });
            handle.close.mockImplementation(async () => {
                order.push("file-closed");
            });
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));

            // setState sets this.lastWrite = this.write(serialized); close() awaits that same ref.
            // Await the state to be initialised first so the file open has settled.
            await ps.getState();

            // Fire setState — this assigns this.lastWrite, but write() is blocked by writeGate
            const setStateP = ps.setState("data");
            // Give a micro-task tick so this.lastWrite is assigned before close() reads it
            await Promise.resolve();

            const closeP = ps.close();

            resolveWrite();
            await Promise.all([setStateP, closeP]);

            // close must come AFTER write
            expect(order).toEqual(["write-done", "file-closed"]);
        });

        test("close() propagates error when lastWrite rejects", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            handle.write.mockRejectedValue(new Error("write failed"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            const setP = ps.setState("data");
            await expect(setP).rejects.toThrow("write failed");

            // close() simply `await this.lastWrite` with no try/finally,
            // so it rejects and does NOT call fileHandle.close().
            await expect(ps.close()).rejects.toThrow("write failed");
        });

        test("close() does NOT call fileHandle.close() when lastWrite rejects (no try/finally)", async () => {
            const handle = makeFakeHandle(new Uint8Array());
            handle.write.mockRejectedValue(new Error("write failed"));
            mockedOpen.mockResolvedValue(handle);

            const ps = new PersistentState("/tmp/state.bin", textSerializer, textDeserializer, Promise.resolve(""));
            const setP = ps.setState("data");
            await expect(setP).rejects.toThrow();

            // Because close() has no finally block, handle.close is skipped on error
            await expect(ps.close()).rejects.toThrow();
            expect(handle.close).not.toHaveBeenCalled();
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
