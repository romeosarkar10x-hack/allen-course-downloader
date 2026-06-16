import { fromPromise } from "neverthrow";

export function parseResponseText(response: Response) {
    return fromPromise(response.text(), error => error as DOMException | TypeError);
}
