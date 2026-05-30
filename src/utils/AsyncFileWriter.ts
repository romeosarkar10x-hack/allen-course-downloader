import fs from "fs/promises";
import Queue from "./Queue.js";

class AsyncFileWriter {
    constructor(pathname) {
        if (pathname == null) {
            throw Error("Property '_writes' may not exist on type 'FileWriter'");
        }

        this.pathname = pathname;
        this._writes = new Queue();

        const self = this;

        async function _initialize() {
            self.file = await fs.open(self.pathname, "w");
        }

        this._initialize = _initialize();
    }

    async _write(chunk, awaitFor) {
        await this._initialize;
        await awaitFor;

        let numBytesToWrite = chunk.length;

        while (numBytesToWrite) {
            const { bytesWritten } = await this.file.write(chunk);
            numBytesToWrite -= bytesWritten;
        }
    }

    async write(chunk) {
        this._writes.push(this._write(chunk, this._writes.back()));
        await this._writes.back();
    }

    async abort() {
        await this._writes.back();
        await this.file.truncate(0);
        await this.file.close();
        await fs.unlink(this.pathname);
    }

    async close() {
        await this._writes.back();
        await this.file.close();
    }
}

/*
(async function test() {
    const asyncFileWriter = new AsyncFileWriter("test-file");
    asyncFileWriter.write("Hello world!\n");
    asyncFileWriter.write("0!\n");
    asyncFileWriter.write("1!\n");
    asyncFileWriter.write("2!\n");
    asyncFileWriter.write("3!\n");
    asyncFileWriter.write("4!\n");
    asyncFileWriter.write("5!\n");
    asyncFileWriter.write("6!\n");
    asyncFileWriter.write("7!\n");
    asyncFileWriter.write("8!\n");
    asyncFileWriter.write("9!\n");

    await asyncFileWriter.abort();

    console.log("Done!");
})();
*/

export default AsyncFileWriter;
