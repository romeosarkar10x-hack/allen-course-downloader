import { fromPromise } from "neverthrow";

export function parseResponseJSON(response: Response) {
    return fromPromise(response.json(), error => error as DOMException | TypeError | SyntaxError);
}
