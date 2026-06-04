import { fromPromise } from "neverthrow";
import z from "zod";

export function zodParseAsync<T extends z.ZodType>(schema: T) {
    return (value: unknown) =>
        fromPromise(schema.parseAsync(value), error => {
            return error as z.ZodError<z.output<T>>;
        });
}
