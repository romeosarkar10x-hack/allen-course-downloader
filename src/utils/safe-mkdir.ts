import fs from "node:fs/promises";
import { fromPromise } from "neverthrow";

export function safeMkdir(pathname: string) {
    return fromPromise(fs.access(pathname), error => error as NodeJS.ErrnoException).orElse(() =>
        fromPromise(fs.mkdir(pathname), error => error as NodeJS.ErrnoException),
    );
}
