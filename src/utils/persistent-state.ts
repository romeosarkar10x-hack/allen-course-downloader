import fs from "fs/promises";

type DefaultState<T> = T | Promise<T> | (() => T | Promise<T>);

export class PersistentState<T> {
    private fileHandlePromise: Promise<fs.FileHandle>;
    private statePromise: Promise<T>;
    private lastWrite: Promise<void> | null = null;
    // private lastSetState: Promise<void> | null = null;

    constructor(
        public pathname: string,
        public serializer: (state: T) => Uint8Array | Promise<Uint8Array>,
        public deserializer: (serialized: Uint8Array) => T | Promise<T>,
        defaultState: DefaultState<T>,
    ) {
        this.fileHandlePromise = this.openFile();
        this.statePromise = this.initializeState(defaultState);
    }

    private async openFile() {
        let fileExists = false;

        try {
            await fs.access(this.pathname, fs.constants.F_OK);
            fileExists = true;
        } catch {
            console.warn(`File '${this.pathname}' does not exists`);
            // Ignore error
        }

        try {
            if (fileExists) {
                await fs.access(this.pathname, fs.constants.R_OK | fs.constants.W_OK);
            }
        } catch (error) {
            console.error(`File '${this.pathname}' exists but is not readable / writable by the current process`);
            throw error;
        }

        try {
            if (fileExists) {
                // Can fail due to some non-permission reason like EMFILE (too many open files), transient fs error, the file got unlinked between access and open
                return await fs.open(this.pathname, "r+");
            }
        } catch (error) {
            // The file exists but we couldn't open it for reading/writing. We deliberately
            // throw here instead of falling back to "w"/"w+": those modes truncate the file
            // on open, which would silently destroy the existing persisted state. Better to
            // surface the error than to wipe the data we were trying to protect.
            console.error(`Failed to open file \`${this.pathname}\` for reading / writing`);
            throw error;
        }

        // Only reached when the file does NOT exist. Safe to create it with "w" — there is no
        // prior state to lose.
        try {
            return await fs.open(this.pathname, "w");
        } catch (error) {
            console.error(`Failed to open file \`${this.pathname}\` for writing`);
            throw error;
        }
    }

    private async getDefaultState(defaultState: DefaultState<T>): Promise<T> {
        if (typeof defaultState === "function") {
            return await (defaultState as () => T | Promise<T>)();
        }

        return await defaultState;
    }

    private async initializeState(defaultState: DefaultState<T>): Promise<T> {
        const fileHandle = await this.fileHandlePromise;
        let serialized: Uint8Array;

        const fileStats = await fileHandle.stat();

        try {
            if (fileStats.size === 0) {
                return await this.getDefaultState(defaultState);
            }

            serialized = await PersistentState.readFile(fileHandle);
        } catch {
            console.error(`Failed to read file '${this.pathname}'`);
            return await this.getDefaultState(defaultState);
        }

        try {
            return await this.deserializer(serialized);
        } catch {
            console.error(`Failed to deserialize state from file '${this.pathname}'`);
            return await this.getDefaultState(defaultState);
        }
    }

    async getState() {
        return await this.statePromise;
    }

    private static async readFile(fileHandle: fs.FileHandle): Promise<Uint8Array> {
        return new Uint8Array(await fileHandle.readFile());
    }

    private async write(serialized: Uint8Array) {
        try {
            await this.lastWrite;
        } catch {
            // Ignore error
        }

        const fileHandle = await this.fileHandlePromise;
        await fileHandle.truncate(0);

        let numBytesToWrite = serialized.byteLength;
        let totalNumBytesWritten = 0;

        while (numBytesToWrite) {
            const { bytesWritten: numBytesWritten } = await fileHandle.write(
                serialized,
                totalNumBytesWritten,
                numBytesToWrite,
                totalNumBytesWritten,
            );

            totalNumBytesWritten += numBytesWritten;
            numBytesToWrite -= numBytesWritten;
        }
    }

    /* setState ordering race — disk and memory can both end up stale
        This is the concurrency bug you're probably hunting for. The write chain is ordered by when each serializer finishes, not by call order, because the lastWrite chain is only established after await this.serializer(...):
            serialized = await this.serializer(newStateAwaited);  // unordered point
            this.lastWrite = this.write(serialized);              // chain set up here

        Consider two un-awaited calls where the second value serializes faster:
            s.setState(A);  // serializer(A) slow
            s.setState(B);  // serializer(B) fast — called last, "should" win

        serializer(B) finishes first → lastWrite = write(B) → disk = B.
        serializer(A) finishes later → lastWrite = write(A) → chained after write(B) → disk = A (stale).
        Meanwhile statePromise was set synchronously in source order, so in memory it's B.

        End result: memory says B, disk says A. They've diverged, and the disk holds the older value. The write-vs-write chaining itself is correct (you read the old this.lastWrite synchronously before reassigning, which works), but it's gated by the wrong point.
        The clean fix is to put the entire operation — snapshot, state update, serialize, write — inside the chain so call order is preserved:
            setState(newState) {
                const prev = this.lastWrite;
                this.lastWrite = (async () => {
                    try { await prev; } catch {}
                    const state = await newState;
                    const serialized = await this.serializer(state);
                    await this.write(serialized);
                    this.statePromise = Promise.resolve(state); // only after durable
                })();
                return this.lastWrite;
            }
        (If serializing under the lock is too slow, the alternative is a monotonically increasing version number: tag each write, and have write no-op if a newer version has already been written.)
    */
    async setState(newState: T | Promise<T>): Promise<void> {
        const newStateAwaited = await newState;
        this.statePromise = Promise.resolve(newState); // Concurrency issue here...

        let serialized: Uint8Array;

        try {
            serialized = await this.serializer(newStateAwaited);
        } catch (error) {
            console.error(`Failed to serialized state`);
            throw error;
        }

        this.lastWrite = this.write(serialized);
        await this.lastWrite;
    }

    async close(): Promise<void> {
        const fileHandle = await this.fileHandlePromise;
        await this.lastWrite;
        await fileHandle.close();
    }
}

/*
    Writes are not crash-safe (this defeats the whole purpose)
        await fileHandle.truncate(0);
        // ... write loop ...
    This is the big one given "restored if the process is killed." truncate(0) followed by a series of write()s is not atomic.
    If the process dies (or the disk errors) between the truncate and the end of the write loop,
    the file is left empty or partially written — i.e. you've corrupted exactly the data you were trying to protect, and on restart initializeState falls back to defaultState.

    The standard fix is write-to-temp + atomic rename:
        const tmp = `${this.pathname}.tmp`;
        await fs.writeFile(tmp, serialized);
        // optionally fsync the tmp file here
        await fs.rename(tmp, this.pathname);  // atomic on POSIX

    rename is atomic, so a reader/restart always sees either the old complete file or the new complete file, never a torn one.
    (This does mean reopening/replacing your long-lived handle, which is a reasonable tradeoff for durability.)

    Related: there's no fsync/datasync anywhere. A SIGKILL is fine without it (the OS page cache survives a process death),
    but a power loss / kernel panic can lose buffered writes. If you care about that, add fileHandle.sync() before declaring a write durable.
 */
