import { describe, test, expect, vi, beforeEach, type MockedFunction } from "vitest";
import fs from "fs/promises";
import { AsyncFileWriter } from "@/utils/async-file-writer";

// ---------------------------------------------------------------------------
// Mock fs/promises so no real disk I/O happens
// ---------------------------------------------------------------------------
vi.mock("fs/promises");

const mockedOpen = fs.open as MockedFunction<typeof fs.open>;

// Helper that builds a fake FileHandle
function makeFakeHandle(writeImpl?: (...args: unknown[]) => Promise<{ bytesWritten: number }>) {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const write = vi.fn(writeImpl ?? ((_buf: unknown, _offset: unknown) => Promise.resolve({ bytesWritten: 0 })));

    return {
        close,
        write,
    } as unknown as fs.FileHandle;
}

beforeEach(() => {
    vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
describe("async-file-writer", () => {
    // -----------------------------------------------------------------------
    describe("constructor", () => {
        test("opens the file with the given pathname and default flag 'w'", async () => {
            const fakeHandle = makeFakeHandle();
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");

            expect(mockedOpen).toHaveBeenCalledOnce();
            expect(mockedOpen).toHaveBeenCalledWith("/tmp/out.bin", "w", undefined);
            expect(writer.pathname).toBe("/tmp/out.bin");

            // settle the open promise so nothing leaks
            await writer.close();
        });

        test("opens the file with a custom string flag", async () => {
            const fakeHandle = makeFakeHandle();
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin", "a");
            await writer.close();

            expect(mockedOpen).toHaveBeenCalledWith("/tmp/out.bin", "a", undefined);
        });

        test("opens the file with a custom numeric flag and mode", async () => {
            const fakeHandle = makeFakeHandle();
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin", 0o1, 0o600);
            await writer.close();

            expect(mockedOpen).toHaveBeenCalledWith("/tmp/out.bin", 0o1, 0o600);
        });
    });

    // -----------------------------------------------------------------------
    describe("write() / doWrite()", () => {
        test("writes all bytes in a single fileHandle.write() call", async () => {
            const chunk = Buffer.from("hello");

            const fakeHandle = makeFakeHandle((_buf, _offset) => Promise.resolve({ bytesWritten: chunk.byteLength }));
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(chunk);
            await writer.close();

            expect(fakeHandle.write).toHaveBeenCalledOnce();
            expect(fakeHandle.write).toHaveBeenCalledWith(chunk, 0);
        });

        test("loops until all bytes are written when partial writes occur", async () => {
            const chunk = Buffer.from("hello"); // 5 bytes
            const calls: number[] = [];

            // First call writes 3 bytes, second writes the remaining 2
            const fakeHandle = makeFakeHandle((_buf, offset) => {
                calls.push(offset as number);
                if (calls.length === 1) {
                    return Promise.resolve({ bytesWritten: 3 });
                }
                return Promise.resolve({ bytesWritten: 2 });
            });
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(chunk);
            await writer.close();

            expect(fakeHandle.write).toHaveBeenCalledTimes(2);
            expect(calls[0]).toBe(0);
            expect(calls[1]).toBe(3);
        });

        test("sequential writes are serialised (second write awaits first)", async () => {
            const order: string[] = [];

            let resolveFirst!: () => void;
            const firstWriteStarted = new Promise<void>(res => {
                resolveFirst = res;
            });

            let resolveFirstWrite!: () => void;
            const firstWriteGate = new Promise<void>(res => {
                resolveFirstWrite = res;
            });

            const chunkA = Buffer.from("A");
            const chunkB = Buffer.from("B");

            let callCount = 0;
            const fakeHandle = makeFakeHandle(async (_buf, _offset) => {
                callCount++;
                if (callCount === 1) {
                    order.push("start-A");
                    resolveFirst();
                    await firstWriteGate;
                    order.push("end-A");
                    return { bytesWritten: 1 };
                }
                order.push("start-B");
                return { bytesWritten: 1 };
            });
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(chunkA);
            writer.write(chunkB);

            // wait until the first write has actually started before unblocking it
            await firstWriteStarted;
            resolveFirstWrite();

            await writer.close();

            // B must not start until A has fully finished
            expect(order).toEqual(["start-A", "end-A", "start-B"]);
        });

        test("write() with a Uint8Array (non-Buffer ArrayBufferView)", async () => {
            const chunk = new Uint8Array([1, 2, 3]);

            const fakeHandle = makeFakeHandle((_buf, _offset) => Promise.resolve({ bytesWritten: chunk.byteLength }));
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(chunk);
            await writer.close();

            expect(fakeHandle.write).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    describe("close()", () => {
        test("closes the file handle after all writes complete", async () => {
            const chunk = Buffer.from("data");
            const fakeHandle = makeFakeHandle((_buf, _offset) => Promise.resolve({ bytesWritten: chunk.byteLength }));
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(chunk);
            await writer.close();

            expect(fakeHandle.close).toHaveBeenCalledOnce();
        });

        test("closes the file handle even when no write() was called", async () => {
            const fakeHandle = makeFakeHandle();
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            await writer.close();

            expect(fakeHandle.close).toHaveBeenCalledOnce();
            // write should never have been invoked
            expect(fakeHandle.write).not.toHaveBeenCalled();
        });

        test("re-throws write error but still closes the file handle", async () => {
            const writeError = new Error("disk full");

            const fakeHandle = makeFakeHandle(() => Promise.reject(writeError));
            mockedOpen.mockResolvedValue(fakeHandle);

            const writer = new AsyncFileWriter("/tmp/out.bin");
            writer.write(Buffer.from("boom"));

            await expect(writer.close()).rejects.toThrow("disk full");

            // The finally block must have run
            expect(fakeHandle.close).toHaveBeenCalledOnce();
        });

        test("close() still resolves when fs.open rejects during construction", async () => {
            const openError = new Error("permission denied");
            mockedOpen.mockRejectedValue(openError);

            const writer = new AsyncFileWriter("/restricted/out.bin");

            // close() awaits the fileHandlePromise — it will throw because open failed
            await expect(writer.close()).rejects.toThrow("permission denied");
        });
    });
});
