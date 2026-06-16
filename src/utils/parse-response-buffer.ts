import { fromPromise } from "neverthrow";

export function parseResponseBuffer(response: Response) {
    return fromPromise(response.arrayBuffer(), error => error as DOMException | TypeError | RangeError);
}
