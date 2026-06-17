import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ResultAsync } from "neverthrow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeMkdir } from "@/utils/safe-mkdir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory that is cleaned up after each test. */
async function makeTmpDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "safe-mkdir-test-"));
}

function makeErrnoException(message: string, code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(message), { code });
}

// ---------------------------------------------------------------------------
// Integration tests — real filesystem
// ---------------------------------------------------------------------------

describe("safeMkdir (integration)", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        // Best-effort cleanup
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    // -----------------------------------------------------------------------
    // Happy path: directory already exists
    // -----------------------------------------------------------------------

    describe("when the directory already exists", () => {
        it("returns Ok(undefined)", async () => {
            const result = await safeMkdir(tmpDir);

            expect(result.isOk()).toBe(true);
            result._unsafeUnwrap(); // should not throw
        });

        it("does not throw or reject", async () => {
            await expect(safeMkdir(tmpDir)).resolves.toBeDefined();
        });

        it("leaves the existing directory intact", async () => {
            // Write a file inside the existing directory first
            const sentinel = path.join(tmpDir, "sentinel.txt");
            await fs.writeFile(sentinel, "hello");

            await safeMkdir(tmpDir);

            // The sentinel file must still be there
            const content = await fs.readFile(sentinel, "utf8");
            expect(content).toBe("hello");
        });

        it("returns Ok carrying undefined as its value", async () => {
            const result = await safeMkdir(tmpDir);

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // Happy path: directory does not yet exist
    // -----------------------------------------------------------------------

    describe("when the directory does not exist", () => {
        it("creates the directory and returns Ok(undefined)", async () => {
            const target = path.join(tmpDir, "new-dir");

            const result = await safeMkdir(target);

            expect(result.isOk()).toBe(true);
            result._unsafeUnwrap();

            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });

        it("creates a directory whose name contains spaces", async () => {
            const target = path.join(tmpDir, "dir with spaces");

            const result = await safeMkdir(target);

            expect(result.isOk()).toBe(true);
            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });

        it("creates a directory whose name contains unicode characters", async () => {
            const target = path.join(tmpDir, "日本語フォルダ");

            const result = await safeMkdir(target);

            expect(result.isOk()).toBe(true);
            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });

        it("creates a directory with a dotfile name", async () => {
            const target = path.join(tmpDir, ".hidden-dir");

            const result = await safeMkdir(target);

            expect(result.isOk()).toBe(true);
            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });

        it("returns Ok carrying undefined as its value", async () => {
            const target = path.join(tmpDir, "brand-new");

            const result = await safeMkdir(target);

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // Error path: mkdir fails (parent does not exist)
    // -----------------------------------------------------------------------

    describe("when mkdir fails because the parent directory does not exist", () => {
        it("returns Err with an ErrnoException", async () => {
            // Two levels deep — mkdir does NOT receive { recursive: true }
            // so it will fail because the intermediate directory is missing
            const target = path.join(tmpDir, "nonexistent-parent", "child");

            const result = await safeMkdir(target);

            expect(result.isErr()).toBe(true);
        });

        it("the Err value is a NodeJS.ErrnoException", async () => {
            const target = path.join(tmpDir, "no-parent", "child");

            const result = await safeMkdir(target);

            expect(result.isErr()).toBe(true);
            const err = result._unsafeUnwrapErr();
            expect(err).toBeInstanceOf(Error);
            expect(err.code).toBeDefined();
        });

        it("the error code is ENOENT", async () => {
            const target = path.join(tmpDir, "ghost", "child");

            const result = await safeMkdir(target);

            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().code).toBe("ENOENT");
        });

        it("does not create any directory on the filesystem", async () => {
            const target = path.join(tmpDir, "missing-parent", "child");

            await safeMkdir(target);

            await expect(fs.access(path.join(tmpDir, "missing-parent"))).rejects.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // Idempotency — calling safeMkdir twice on the same path
    // -----------------------------------------------------------------------

    describe("idempotency", () => {
        it("calling safeMkdir twice on a non-existent path returns Ok both times", async () => {
            const target = path.join(tmpDir, "idempotent");

            const first = await safeMkdir(target);
            const second = await safeMkdir(target);

            expect(first.isOk()).toBe(true);
            expect(second.isOk()).toBe(true);
        });

        it("the directory exists after both calls", async () => {
            const target = path.join(tmpDir, "idempotent2");

            await safeMkdir(target);
            await safeMkdir(target);

            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });

        it("calling safeMkdir three times in a row returns Ok every time", async () => {
            const target = path.join(tmpDir, "triple");

            const r1 = await safeMkdir(target);
            const r2 = await safeMkdir(target);
            const r3 = await safeMkdir(target);

            expect(r1.isOk()).toBe(true);
            expect(r2.isOk()).toBe(true);
            expect(r3.isOk()).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Concurrency — multiple simultaneous calls on the same new path
    // -----------------------------------------------------------------------

    describe("concurrency", () => {
        it("concurrent calls on the same non-existent path all resolve", async () => {
            const target = path.join(tmpDir, "concurrent");

            // Fire five simultaneous requests
            const results = await Promise.all([
                safeMkdir(target),
                safeMkdir(target),
                safeMkdir(target),
                safeMkdir(target),
                safeMkdir(target),
            ]);

            // At least one should succeed; no call should throw
            const okCount = results.filter(r => r.isOk()).length;
            expect(okCount).toBeGreaterThanOrEqual(1);
        });

        it("directory exists after all concurrent calls finish", async () => {
            const target = path.join(tmpDir, "concurrent2");

            await Promise.all([safeMkdir(target), safeMkdir(target), safeMkdir(target)]);

            const stat = await fs.stat(target);
            expect(stat.isDirectory()).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    describe("edge cases", () => {
        it("works when pathname is the tmpdir itself (already exists)", async () => {
            const result = await safeMkdir(tmpDir);
            expect(result.isOk()).toBe(true);
        });

        it("returns Err when given an empty string pathname", async () => {
            // fs.mkdir("") throws ENOENT on all platforms
            const result = await safeMkdir("");
            // access("") also fails, then mkdir("") fails → Err
            expect(result.isErr()).toBe(true);
        });

        it("returns Err when three-level deep path cannot be created without recursive flag", async () => {
            const target = path.join(tmpDir, "a", "b", "c");
            const result = await safeMkdir(target);
            expect(result.isErr()).toBe(true);
        });

        it("creates a single-level directory correctly", async () => {
            const target = path.join(tmpDir, "single");
            const result = await safeMkdir(target);
            expect(result.isOk()).toBe(true);
            expect((await fs.stat(target)).isDirectory()).toBe(true);
        });

        it("does not mutate the pathname string argument", async () => {
            const target = path.join(tmpDir, "immutable");
            const copy = target;

            await safeMkdir(target);

            expect(target).toBe(copy);
        });
    });
});

// ---------------------------------------------------------------------------
// Unit tests — spied fs (fine-grained control, no global mock pollution)
// ---------------------------------------------------------------------------

describe("safeMkdir (unit, spied fs)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // access succeeds — directory already exists
    // -----------------------------------------------------------------------

    describe("when fs.access resolves (directory exists)", () => {
        it("does not call fs.mkdir", async () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);
            const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            await safeMkdir("/some/path");

            expect(mkdirSpy).not.toHaveBeenCalled();
        });

        it("returns Ok(undefined)", async () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/some/path");

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeUndefined();
        });

        it("calls fs.access with the exact pathname supplied", async () => {
            const accessSpy = vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            await safeMkdir("/exact/path");

            expect(accessSpy).toHaveBeenCalledWith("/exact/path");
            expect(accessSpy).toHaveBeenCalledTimes(1);
        });

        it("isOk() returns true and isErr() returns false", async () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/path");

            expect(result.isOk()).toBe(true);
            expect(result.isErr()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // access fails + mkdir succeeds — directory created
    // -----------------------------------------------------------------------

    describe("when fs.access rejects and fs.mkdir resolves (directory created)", () => {
        it("calls fs.mkdir with the exact pathname", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("ENOENT", "ENOENT"));
            const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            await safeMkdir("/new/path");

            expect(mkdirSpy).toHaveBeenCalledWith("/new/path");
        });

        it("calls fs.mkdir exactly once", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("ENOENT", "ENOENT"));
            const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            await safeMkdir("/new/path");

            expect(mkdirSpy).toHaveBeenCalledTimes(1);
        });

        it("returns Ok(undefined)", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("ENOENT", "ENOENT"));
            vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/new/path");

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeUndefined();
        });

        it("isOk() returns true and isErr() returns false", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("ENOENT", "ENOENT"));
            vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/new/path");

            expect(result.isOk()).toBe(true);
            expect(result.isErr()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // access fails + mkdir fails — propagates mkdir error
    // -----------------------------------------------------------------------

    describe("when both fs.access and fs.mkdir reject", () => {
        it("returns Err with the error thrown by fs.mkdir", async () => {
            const accessErr = makeErrnoException("ENOENT", "ENOENT");
            const mkdirErr = makeErrnoException("EPERM", "EPERM");

            vi.spyOn(fs, "access").mockRejectedValueOnce(accessErr);
            vi.spyOn(fs, "mkdir").mockRejectedValueOnce(mkdirErr);

            const result = await safeMkdir("/forbidden/path");

            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr()).toBe(mkdirErr);
        });

        it("the Err code matches the mkdir error code", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("ENOENT", "ENOENT"));
            vi.spyOn(fs, "mkdir").mockRejectedValueOnce(makeErrnoException("ENOSPC", "ENOSPC"));

            const result = await safeMkdir("/out/of/space");

            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().code).toBe("ENOSPC");
        });

        it("the access error is NOT propagated — only the mkdir error is", async () => {
            const accessErr = makeErrnoException("access-error", "EACCES");
            const mkdirErr = makeErrnoException("mkdir-error", "EPERM");

            vi.spyOn(fs, "access").mockRejectedValueOnce(accessErr);
            vi.spyOn(fs, "mkdir").mockRejectedValueOnce(mkdirErr);

            const result = await safeMkdir("/whatever");

            expect(result._unsafeUnwrapErr()).not.toBe(accessErr);
            expect(result._unsafeUnwrapErr()).toBe(mkdirErr);
        });

        it("calls fs.mkdir exactly once even though access failed", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("nope", "ENOENT"));
            const mkdirSpy = vi
                .spyOn(fs, "mkdir")
                .mockRejectedValueOnce(makeErrnoException("also nope", "EPERM"));

            await safeMkdir("/path");

            expect(mkdirSpy).toHaveBeenCalledTimes(1);
        });

        it("isErr() returns true and isOk() returns false", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("x", "ENOENT"));
            vi.spyOn(fs, "mkdir").mockRejectedValueOnce(makeErrnoException("y", "EPERM"));

            const result = await safeMkdir("/path");

            expect(result.isErr()).toBe(true);
            expect(result.isOk()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Argument passthrough
    // -----------------------------------------------------------------------

    describe("argument passthrough", () => {
        it("passes the pathname verbatim to fs.access", async () => {
            const accessSpy = vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            await safeMkdir("/verbatim/path");

            expect(accessSpy).toHaveBeenCalledWith("/verbatim/path");
            expect(accessSpy).toHaveBeenCalledTimes(1);
        });

        it("passes the pathname verbatim to fs.mkdir when access fails", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("nope", "ENOENT"));
            const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            await safeMkdir("/verbatim/path");

            expect(mkdirSpy).toHaveBeenCalledWith("/verbatim/path");
        });

        it("does NOT add any extra arguments to fs.mkdir (no { recursive: true })", async () => {
            // The current implementation calls mkdir(pathname) with NO options.
            // This test documents that behaviour — it will fail if the impl changes.
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("nope", "ENOENT"));
            const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValueOnce(undefined);

            await safeMkdir("/path");

            // Called with exactly one argument
            expect(mkdirSpy).toHaveBeenCalledWith("/path");
            expect(mkdirSpy.mock.calls[0]).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    // Return type / neverthrow contract
    // -----------------------------------------------------------------------

    describe("return type contract", () => {
        it("returns a ResultAsync (neverthrow)", () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const returnValue = safeMkdir("/path");

            expect(returnValue).toBeInstanceOf(ResultAsync);
        });

        it("ResultAsync is awaitable (thenable)", () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const returnValue = safeMkdir("/path");

            expect(typeof (returnValue as unknown as PromiseLike<unknown>).then).toBe("function");
        });

        it("the resolved value has isOk() method (neverthrow Result shape)", async () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/path");

            expect(typeof result.isOk).toBe("function");
            expect(typeof result.isErr).toBe("function");
        });

        it("Ok result: isOk() returns true and isErr() returns false", async () => {
            vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);

            const result = await safeMkdir("/path");

            expect(result.isOk()).toBe(true);
            expect(result.isErr()).toBe(false);
        });

        it("Err result: isErr() returns true and isOk() returns false", async () => {
            vi.spyOn(fs, "access").mockRejectedValueOnce(makeErrnoException("x", "ENOENT"));
            vi.spyOn(fs, "mkdir").mockRejectedValueOnce(makeErrnoException("y", "EPERM"));

            const result = await safeMkdir("/path");

            expect(result.isErr()).toBe(true);
            expect(result.isOk()).toBe(false);
        });
    });
});
