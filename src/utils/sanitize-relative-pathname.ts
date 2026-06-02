/**
 * Sanitizes pathname for windows, linux, etc.
 */
export function sanitizeRelativePathname(pathname: string) {
    let sanitized = "";

    for (let i = 0; i < pathname.length; i++) {
        const char = pathname[i]!;

        if (!'<>:"*?|\\/'.includes(char) && (char.charCodeAt(0) <= " ".charCodeAt(0) || char.charCodeAt(0) <= 127)) {
            sanitized += char;
        }
    }

    return sanitized;
}
