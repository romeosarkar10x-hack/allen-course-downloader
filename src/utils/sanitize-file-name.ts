/**
 * Sanitizes file-name for windows, linux, etc.
 */
export function sanitizeFileName(fileName: string) {
    let sanitized = "";

    for (let i = 0; i < fileName.length; i++) {
        const char = fileName[i]!;

        if (!'<>:"*?|\\/'.includes(char) && (char.charCodeAt(0) <= " ".charCodeAt(0) || char.charCodeAt(0) <= 127)) {
            sanitized += char;
        }
    }

    return sanitized;
}
