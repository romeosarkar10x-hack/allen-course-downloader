export function objectSerializer<T>(o: T): Uint8Array {
    const string = JSON.stringify(o);
    const textEncoder = new TextEncoder();
    return textEncoder.encode(string);
}
