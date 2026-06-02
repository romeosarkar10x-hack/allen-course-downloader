import { describe, test, expect } from "vitest";
import { sanitizeFileName } from "@/utils/sanitize-file-name";

describe("sanitize-relative-pathname", () => {
    test("preserves valid pathnames with no forbidden characters", () => {
        expect(sanitizeFileName("course-name")).toBe("course-name");
        expect(sanitizeFileName("lesson_1.mp4")).toBe("lesson_1.mp4");
        expect(sanitizeFileName("Folder 123")).toBe("Folder 123");
    });

    test("removes standard Windows/Linux forbidden characters individually", () => {
        expect(sanitizeFileName("file<name")).toBe("filename");
        expect(sanitizeFileName("file>name")).toBe("filename");
        expect(sanitizeFileName("file:name")).toBe("filename");
        expect(sanitizeFileName('file"name')).toBe("filename");
        expect(sanitizeFileName("file*name")).toBe("filename");
        expect(sanitizeFileName("file?name")).toBe("filename");
        expect(sanitizeFileName("file|name")).toBe("filename");
        expect(sanitizeFileName("file\\name")).toBe("filename");
        expect(sanitizeFileName("file/name")).toBe("filename");
    });

    test("removes multiple or consecutive forbidden characters", () => {
        expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
        expect(sanitizeFileName("///\\\\\\::???***")).toBe("");
        expect(sanitizeFileName(":::lessons:::")).toBe("lessons");
    });

    test("returns empty string when input is empty string", () => {
        expect(sanitizeFileName("")).toBe("");
    });

    test("returns empty string when input consists only of forbidden characters", () => {
        expect(sanitizeFileName('<>:"*?|\\/')).toBe("");
    });

    test("preserves other safe special characters", () => {
        const safeSpecialChars = "-_.!@#$%%^&()+= {}[]';,~`";
        expect(sanitizeFileName(safeSpecialChars)).toBe(safeSpecialChars);
    });

    test("removes non-ASCII characters (charCode > 127)", () => {
        // Bengali characters (charCode > 127) are stripped, leaving only the underscore
        expect(sanitizeFileName("বাংলা_কোর্স")).toBe("_");
        // 'ü' (charCode 252 > 127) is stripped
        expect(sanitizeFileName("münchen")).toBe("mnchen");
        // Emojis (charCode > 127) are stripped
        expect(sanitizeFileName("😊_emoji_👍")).toBe("_emoji_");
    });

    test("handles boundary charCodes correctly", () => {
        // charCode 0 (NUL character) is <= 127, so it is kept
        expect(sanitizeFileName("\u0000")).toBe("\u0000");
        // charCode 127 (DEL character) is <= 127, so it is kept
        expect(sanitizeFileName("\u007f")).toBe("\u007f");
        // charCode 128 (first non-ASCII) is > 127, so it is stripped
        expect(sanitizeFileName("\u0080")).toBe("");
        // Max UTF-16 code unit (65535) is > 127, so it is stripped
        expect(sanitizeFileName("\uffff")).toBe("");
    });

    test("handles different types of whitespace and control characters", () => {
        // Standard ASCII whitespace characters (charCodes <= 32) should be preserved
        expect(sanitizeFileName("\t")).toBe("\t"); // Tab (charCode 9)
        expect(sanitizeFileName("\n")).toBe("\n"); // Newline (charCode 10)
        expect(sanitizeFileName("\r")).toBe("\r"); // Carriage return (charCode 13)
        expect(sanitizeFileName("\u000b")).toBe("\u000b"); // Vertical tab (charCode 11)
        expect(sanitizeFileName("\u000c")).toBe("\u000c"); // Form feed (charCode 12)
        expect(sanitizeFileName(" ")).toBe(" "); // Space (charCode 32)

        // Non-ASCII/Unicode whitespace characters (charCodes > 127) should be stripped
        expect(sanitizeFileName("\u00a0")).toBe(""); // Non-breaking space (charCode 160)
        expect(sanitizeFileName("\u2003")).toBe(""); // Em space (charCode 8195)
    });

    test("correctly handles mixed strings with various transformations", () => {
        const input = "  hello < world > 😊 ! \n \u00a0 \u007f";
        // 'hello' and 'world' preserved
        // '<' and '>' (forbidden) stripped
        // '😊' (non-ASCII) stripped
        // '!' and '\n' and '\u007f' (safe ASCII) preserved
        // '\u00a0' (non-ASCII NBSP) stripped
        // spaces preserved
        const expected = "  hello  world   ! \n  \u007f";
        expect(sanitizeFileName(input)).toBe(expected);
    });

    test("handles long pathnames efficiently", () => {
        const longSegment = "a".repeat(1000);
        const longInput = longSegment + "/" + longSegment + "\\" + longSegment;
        const expected = longSegment.repeat(3);
        expect(sanitizeFileName(longInput)).toBe(expected);
    });

    test("handles single characters correctly", () => {
        // Safe chars
        expect(sanitizeFileName("a")).toBe("a");
        expect(sanitizeFileName("-")).toBe("-");

        // Forbidden chars
        expect(sanitizeFileName("/")).toBe("");
        expect(sanitizeFileName("\\")).toBe("");
        expect(sanitizeFileName(":")).toBe("");

        // Non-ASCII character
        expect(sanitizeFileName("ü")).toBe("");
    });
});
