import { ZodType } from "zod";

export function zodObjectDeserializerFactory<T extends ZodType>(zodSchema: T) {
    return (serialized: Uint8Array) => {
        const textDecoder = new TextDecoder("utf-8");
        const string = textDecoder.decode(serialized);
        const json = JSON.parse(string);
        return zodSchema.parseAsync(json);
    };
}
