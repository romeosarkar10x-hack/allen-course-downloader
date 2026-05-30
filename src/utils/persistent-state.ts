import fs from "fs/promises";

class PersistentState {
    constructor(
        pathname,
        resolver = async () => {
            return {};
        },
    ) {
        this.pathname = pathname;
        this.promises = [];

        const self = this;

        this.promises.push(
            (async function initialize() {
                /* Open file */
                try {
                    await self._openFile();
                } catch (err) {
                    console.log(`Failed to open file \`${pathname}\` [ ${err.message} ] for reading/writing`);
                    throw err;
                }

                /* Parse state */
                try {
                    self.state = JSON.parse(await self._readFile());
                    // console.log("parsed state:", self.state);
                } catch (err) {
                    console.log(`Failed to parse file \`${pathname}\` [ ${err.message} ]`);
                    console.log(`Error restoring state from file \`${pathname}\``);

                    /* Fallback to default state */
                    self.state = await resolver();
                    // console.log("state:", self.state);

                    try {
                        await self._writeFile(self.state);
                    } catch (err) {
                        console.log(`Error opening file \`${pathname}\` for writing`);
                        console.log(err);
                    }
                }
            })(),
        );

        // this.promises.push(initialize());
    }

    async getStateObj() {
        await this.promises[0];
        return this.state;
    }

    _stringify(obj) {
        return JSON.stringify(obj, null, 4);
    }

    async _openFile() {
        try {
            this._fileHandle = await fs.open(this.pathname, "r+");
        } catch (err) {
            console.log(`Failed to open file \`${this.pathname}\` for reading/writing`);
            try {
                this._fileHandle = await fs.open(this.pathname, "w");
            } catch (err) {
                console.log(`Failed to open file \`${this.pathname}\` for writing`);
                throw err;
            }
        }
    }

    async _readFile() {
        return await this._fileHandle.readFile({ encoding: "utf8" });
    }

    async _writeFile(obj, awaitFor) {
        await awaitFor;

        if (this._fileHandle == null) {
            console.log("Error saving `state` to file; File is not open for writing");
            throw Error("File is not open for writing");
        }

        if (awaitFor != null) {
            await this._fileHandle.truncate(0);
        }

        await this._fileHandle.write(this._stringify(obj), 0);
    }

    async setStateObj(arg) {
        if (this.closed) {
            throw Error("File has been closed");
        }

        if (typeof arg == "function") {
            // console.log("setStateObj this.state:", this.state);
            this.state = await arg(this.state);
            // console.log("Function!!", this.state);
        } else {
            this.state = arg;
        }

        try {
            this.promises.push(this._writeFile(this.state, this.promises.at(-1)));
            await this.promises.at(-1);
        } catch (err) {
            console.log("Error setting state");
            throw err;
        }
    }

    async close() {
        if (!this._fileHandle) {
            return;
        }

        await this.promises.at(-1);

        delete this.pathname;
        delete this.promises;

        await this._fileHandle.close();

        delete this._fileHandle;

        this.closed = true;
    }
}

/*
const persistentState = new PersistentState("obj", () => {
    return { message: "Hello world!", date: new Date().toLocaleString(), count: 2 };
});

persistentState.setStateObj({ count: 8 });
persistentState.setStateObj(obj => {
    return {
        ...obj,
        message: "Hello world!",
    };
});
*/

/*
persistentState.setStateObj({ message: "Hello gadha!" });
persistentState.setStateObj({ count: 9 });
persistentState.setStateObj({ count: 10 });
persistentState.setStateObj({ count: 11 });
persistentState.setStateObj({ count: 12 });
persistentState.setStateObj({ count: 13 });
persistentState.setStateObj({ count: 14 });
persistentState.setStateObj({ count: new Date().toLocaleString() });
*/

export default PersistentState;
