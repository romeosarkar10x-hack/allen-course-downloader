import fs from "fs/promises";

type DefaultState<T> = T | Promise<T> | (() => T | Promise<T>);

export class PersistentState<T> {
    private statePromise: Promise<T>;
    private lastSetState: Promise<void> | null = null;

    constructor(
        public pathname: string,
        public serializer: (state: T) => Uint8Array | Promise<Uint8Array>,
        public deserializer: (serialized: Uint8Array) => T | Promise<T>,
        defaultState: DefaultState<T>,
    ) {
        this.statePromise = this.initializeState(defaultState);
    }

    private async getDefaultState(defaultState: DefaultState<T>): Promise<T> {
        if (typeof defaultState === "function") {
            return await (defaultState as () => T | Promise<T>)();
        }

        return await defaultState;
    }

    private async initializeState(defaultState: DefaultState<T>): Promise<T> {
        let serialized: Uint8Array;

        try {
            serialized = new Uint8Array(await fs.readFile(this.pathname));
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
            const tmpFilePathname = this.pathname + ".tmp";
            await fs.writeFile(tmpFilePathname, serialized);
            await fs.rename(tmpFilePathname, this.pathname);
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
    Related: there's no fsync/datasync anywhere. A SIGKILL is fine without it (the OS page cache survives a process death),
    but a power loss / kernel panic can lose buffered writes. If you care about that, add fileHandle.sync() before declaring a write durable.
 */
