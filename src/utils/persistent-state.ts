import fs from "fs/promises";

type DefaultState<T> = T | Promise<T> | (() => T | Promise<T>);

export class PersistentState<T> {
    private fileHandlePromise: Promise<fs.FileHandle>;
    private statePromise: Promise<T>;
    private lastSetState: Promise<void> | null = null;

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

            serialized = new Uint8Array(await fileHandle.readFile());
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

    private async write(serialized: Uint8Array) {
        try {
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
        } catch {}
    }

    async setState(newState: T | Promise<T>): Promise<void> {
        this.lastSetState = (async () => {
            try {
                await this.lastSetState;
            } catch {}

            const newStateAwaited = await newState;
            this.statePromise = Promise.resolve(newStateAwaited);

            let serialized: Uint8Array;

            try {
                serialized = await this.serializer(newStateAwaited);
            } catch (error) {
                console.error(`Failed to serialize state`);
                throw error;
            }

            await this.write(serialized);
        })();

        await this.lastSetState;
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
