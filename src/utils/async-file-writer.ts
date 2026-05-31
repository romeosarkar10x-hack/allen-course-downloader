import fs from "fs/promises";
import type { Mode } from "fs";

export class AsyncFileWriter {
    private lastChunkWritePromise: Promise<void> | null;
    private fileHandlePromise: Promise<fs.FileHandle>;

    constructor(
        public pathname: string,
        flags?: string | number,
        mode?: Mode,
    ) {
        this.lastChunkWritePromise = null;
        this.fileHandlePromise = fs.open(pathname, flags ?? "w", mode);
    }

    private async doWrite<TBuffer extends NodeJS.ArrayBufferView | Uint8Array>(
        chunk: TBuffer,
        awaitFor: Promise<void> | null,
    ): Promise<void> {
        const fileHandle = await this.fileHandlePromise!;
        await awaitFor;

        let numBytesToWrite = chunk.byteLength;
        let totalNumBytesWritten = 0;

        while (numBytesToWrite) {
            const { bytesWritten: numBytesWritten } = await fileHandle.write(chunk, totalNumBytesWritten);
            numBytesToWrite -= numBytesWritten;
            totalNumBytesWritten += numBytesWritten;
        }
    }

    write<TBuffer extends NodeJS.ArrayBufferView | Uint8Array>(chunk: TBuffer) {
        this.lastChunkWritePromise = this.doWrite(chunk, this.lastChunkWritePromise);
    }

    async close() {
        const fileHandle = await this.fileHandlePromise;

        try {
            await this.lastChunkWritePromise;
        } finally {
            await fileHandle.close();
        }
    }
}
