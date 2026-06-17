import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
    ChapterDetailsResponseSchema,
    GenericContentSchema,
    LiveLectureVideosContentSchema,
    PolymorphicWidgetSchema,
    WidgetSchema,
} from "@/schemas/chapter-details";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const fixtureRaw = readFileSync(join(import.meta.dirname, "../fixtures/chapter-details.json"), "utf-8");
const fixture = JSON.parse(fixtureRaw);

function cloneFixture(): typeof fixture {
    return JSON.parse(fixtureRaw);
}

// ---------------------------------------------------------------------------
// Minimal builder helpers
// ---------------------------------------------------------------------------

/** Generic content item (matches GenericContentSchema). */
function makeContent(title: string, uri: string, id: string = randomUUID()) {
    return {
        content_action: { data: { content_id: id, title, uri } },
    };
}

/** Live-lecture content item (matches LiveLectureVideosContentSchema). */
function makeLiveLectureContent(title: string, uri: string, subtitle = "10 Mar, 2026", id: string = randomUUID()) {
    return {
        content_action: { data: { content_id: id, title, uri } },
        type: "LIVE_LECTURE_VIDEOS_CONTENT_TYPE",
        subtitle,
    };
}

function makeCardWithContent(cardName: string, contents: Array<{ title: string; uri: string; id?: string }>) {
    return {
        card_action: {
            data: {
                content: {
                    data: {
                        contents_list: contents.map(c => ({
                            content_action: { data: { content_id: c.id ?? randomUUID(), title: c.title, uri: c.uri } },
                        })),
                    },
                },
            },
            tracking_params: { current: { card_name: cardName } },
        },
    };
}

function makePolymorphicWithContentsList(title: string, contents: unknown[]): Record<string, unknown> {
    return {
        type: "POLYMORPHIC_WIDGET",
        data: { data: { contents_list: contents, title } },
    };
}

function makePolymorphicWithCards(title: string, cards: unknown[]): Record<string, unknown> {
    return { type: "POLYMORPHIC_WIDGET", data: { data: { cards, title } } };
}

/** POLYMORPHIC_WIDGET whose `data.data` is an unknown shape (catch-all branch). */
function makePolymorphicUnknownData(): Record<string, unknown> {
    return { type: "POLYMORPHIC_WIDGET", data: { data: {} } };
}

/** POLYMORPHIC_WIDGET with `data` present but `data.data` absent (exactOptional). */
function makePolymorphicNoData(): Record<string, unknown> {
    return { type: "POLYMORPHIC_WIDGET", data: {} };
}

function makeMinimalResponse(widgets: unknown[]) {
    return {
        status: 200,
        reason: "OK",
        data: { page_content: { widgets } },
    };
}

// ===========================================================================
describe("LiveLectureVideosContentSchema", () => {
    test("parses valid content and maps to name (subtitle-prefixed), url, id", () => {
        const id = randomUUID();
        const result = LiveLectureVideosContentSchema.parse(
            makeLiveLectureContent("Video Title", "https://example.com/video.m3u8", "10 Mar, 2026", id),
        );
        expect(result).toEqual({ name: "2026-03-10 Video Title", url: "https://example.com/video.m3u8", id });
    });

    test("rejects non-url uri", () => {
        expect(LiveLectureVideosContentSchema.safeParse(makeLiveLectureContent("X", "not-a-url")).success).toBe(false);
    });

    test("rejects missing content_action", () => {
        expect(LiveLectureVideosContentSchema.safeParse({}).success).toBe(false);
    });

    test("rejects missing title", () => {
        const input = makeLiveLectureContent("X", "https://x.com/");
        delete (input.content_action.data as Record<string, unknown>).title;
        expect(LiveLectureVideosContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing uri", () => {
        const input = makeLiveLectureContent("X", "https://x.com/");
        delete (input.content_action.data as Record<string, unknown>).uri;
        expect(LiveLectureVideosContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing content_id", () => {
        const input = makeLiveLectureContent("X", "https://x.com/");
        delete (input.content_action.data as Record<string, unknown>).content_id;
        expect(LiveLectureVideosContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects non-uuid content_id", () => {
        expect(
            LiveLectureVideosContentSchema.safeParse(
                makeLiveLectureContent("X", "https://x.com/", "10 Mar, 2026", "not-a-uuid"),
            ).success,
        ).toBe(false);
    });

    test("rejects missing type literal", () => {
        const input = makeLiveLectureContent("X", "https://x.com/");
        delete (input as Record<string, unknown>).type;
        expect(LiveLectureVideosContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing subtitle", () => {
        const input = makeLiveLectureContent("X", "https://x.com/");
        delete (input as Record<string, unknown>).subtitle;
        expect(LiveLectureVideosContentSchema.safeParse(input).success).toBe(false);
    });

    test("output has exactly name, url and id keys", () => {
        const result = LiveLectureVideosContentSchema.parse(
            makeLiveLectureContent("T", "https://example.com/f.mp4"),
        ) as Record<string, unknown>;
        expect(Object.keys(result).sort()).toEqual(["id", "name", "url"].sort());
    });
});

// ===========================================================================
describe("GenericContentSchema", () => {
    test("parses valid content and maps title→name, uri→url, content_id→id", () => {
        const id = randomUUID();
        const result = GenericContentSchema.parse(makeContent("Doc Title", "https://example.com/doc.pdf", id));
        expect(result).toEqual({ name: "Doc Title", url: "https://example.com/doc.pdf", id });
    });

    test("rejects non-url uri", () => {
        expect(GenericContentSchema.safeParse(makeContent("X", "not-a-url")).success).toBe(false);
    });

    test("rejects missing content_id", () => {
        expect(
            GenericContentSchema.safeParse({ content_action: { data: { title: "X", uri: "https://x.com/" } } }).success,
        ).toBe(false);
    });

    test("output has exactly name, url and id keys", () => {
        const result = GenericContentSchema.parse(makeContent("T", "https://example.com/f.pdf")) as Record<
            string,
            unknown
        >;
        expect(Object.keys(result).sort()).toEqual(["id", "name", "url"].sort());
    });
});

// ===========================================================================
describe("PolymorphicWidgetSchema", () => {
    test("parses a widget with contents_list + title", () => {
        const widget = makePolymorphicWithContentsList("Live Videos", [
            makeContent("Vid A", "https://example.com/a.m3u8"),
        ]);
        expect(PolymorphicWidgetSchema.safeParse(widget).success).toBe(true);
    });

    test("parses a widget with cards + title", () => {
        const widget = makePolymorphicWithCards("Other Content", [
            makeCardWithContent("Handbook", [{ title: "Doc", uri: "https://example.com/hb.pdf" }]),
        ]);
        expect(PolymorphicWidgetSchema.safeParse(widget).success).toBe(true);
    });

    test("parses a widget with unknown data shape (catch-all z.object({}))", () => {
        expect(PolymorphicWidgetSchema.safeParse(makePolymorphicUnknownData()).success).toBe(true);
    });

    test("parses when data.data is absent (exactOptional)", () => {
        expect(PolymorphicWidgetSchema.safeParse(makePolymorphicNoData()).success).toBe(true);
    });

    test("rejects wrong type literal", () => {
        expect(PolymorphicWidgetSchema.safeParse({ type: "BREADCRUMBS", data: { data: {} } }).success).toBe(false);
    });

    test("rejects missing type field", () => {
        expect(PolymorphicWidgetSchema.safeParse({ data: { data: {} } }).success).toBe(false);
    });
});

// ===========================================================================
describe("WidgetSchema", () => {
    test("accepts BREADCRUMBS type", () => {
        expect(WidgetSchema.safeParse({ type: "BREADCRUMBS" }).success).toBe(true);
    });

    test("accepts APP_GENERIC_HEADER_V2 type", () => {
        expect(WidgetSchema.safeParse({ type: "APP_GENERIC_HEADER_V2" }).success).toBe(true);
    });

    test("accepts SELECTION_CARD type", () => {
        expect(WidgetSchema.safeParse({ type: "SELECTION_CARD" }).success).toBe(true);
    });

    test("accepts POLYMORPHIC_WIDGET type", () => {
        expect(WidgetSchema.safeParse(makePolymorphicNoData()).success).toBe(true);
    });

    test("rejects completely unknown type", () => {
        expect(WidgetSchema.safeParse({ type: "MYSTERY_WIDGET" }).success).toBe(false);
    });

    test("rejects missing type", () => {
        expect(WidgetSchema.safeParse({}).success).toBe(false);
    });
});

// ===========================================================================
describe("ChapterDetailsResponseSchema", () => {
    // -----------------------------------------------------------------------
    describe("real fixture — integration smoke test", () => {
        test("parses the full chapter-details.json fixture without errors", () => {
            expect(() => ChapterDetailsResponseSchema.parse(fixture)).not.toThrow();
        });

        test("returns an array", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture);
            expect(Array.isArray(result)).toBe(true);
        });

        test("result contains at least one section", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture);
            expect(result.length).toBeGreaterThan(0);
        });

        test("every entry has $ (array) and name (string)", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture) as Array<{
                $: unknown[];
                name: string;
            }>;
            for (const entry of result) {
                expect(Array.isArray(entry.$)).toBe(true);
                expect(typeof entry.name).toBe("string");
            }
        });

        test("known section 'Live Lecture Videos' appears in results", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture) as Array<{ name: string }>;
            expect(result.map(e => e.name)).toContain("Live Lecture Videos");
        });

        test("known section 'Concept Videos' appears in results", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture) as Array<{ name: string }>;
            expect(result.map(e => e.name)).toContain("Concept Videos");
        });

        test("content items in sections have name and url", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture) as Array<{
                $: Array<{ name: string; url: string }>;
                name: string;
            }>;
            const liveVideos = result.find(e => e.name === "Live Lecture Videos")!;
            expect(liveVideos).toBeDefined();
            expect(liveVideos.$.length).toBeGreaterThan(0);
            expect(typeof liveVideos.$[0]!.name).toBe("string");
            expect(typeof liveVideos.$[0]!.url).toBe("string");
        });

        test("first live lecture video name matches fixture data", () => {
            const result = ChapterDetailsResponseSchema.parse(fixture) as Array<{
                $: Array<{ name: string }>;
                name: string;
            }>;
            const liveVideos = result.find(e => e.name === "Live Lecture Videos")!;
            expect(liveVideos.$[0]!.name).toBe("2026-03-10 d & f Block elements");
        });

        test("safeParse on valid fixture returns success=true", () => {
            expect(ChapterDetailsResponseSchema.safeParse(fixture).success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("envelope validation", () => {
        test("rejects missing status", () => {
            const input = cloneFixture();
            delete input.status;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-number status", () => {
            const input = cloneFixture();
            input.status = "200";
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing reason", () => {
            const input = cloneFixture();
            delete input.reason;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-string reason", () => {
            const input = cloneFixture();
            input.reason = 200;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data", () => {
            const input = cloneFixture();
            delete input.data;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.page_content", () => {
            const input = cloneFixture();
            delete input.data.page_content;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.page_content.widgets", () => {
            const input = cloneFixture();
            delete input.data.page_content.widgets;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-array widgets", () => {
            const input = cloneFixture();
            input.data.page_content.widgets = "oops";
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("accepts any numeric status value", () => {
            const input = makeMinimalResponse([]);
            (input as Record<string, unknown>).status = 404;
            expect(ChapterDetailsResponseSchema.safeParse(input).success).toBe(true);
        });

        test("safeParse on null returns success=false", () => {
            expect(ChapterDetailsResponseSchema.safeParse(null).success).toBe(false);
        });

        test("safeParse on empty object returns success=false", () => {
            expect(ChapterDetailsResponseSchema.safeParse({}).success).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("widget filtering — only POLYMORPHIC_WIDGET with contents_list or cards passes through", () => {
        test("empty widgets array → empty result", () => {
            expect(ChapterDetailsResponseSchema.parse(makeMinimalResponse([]))).toEqual([]);
        });

        test("only BREADCRUMBS → empty result", () => {
            expect(ChapterDetailsResponseSchema.parse(makeMinimalResponse([{ type: "BREADCRUMBS" }]))).toEqual([]);
        });

        test("only APP_GENERIC_HEADER_V2 → empty result", () => {
            expect(
                ChapterDetailsResponseSchema.parse(makeMinimalResponse([{ type: "APP_GENERIC_HEADER_V2" }])),
            ).toEqual([]);
        });

        test("only SELECTION_CARD → empty result", () => {
            expect(ChapterDetailsResponseSchema.parse(makeMinimalResponse([{ type: "SELECTION_CARD" }]))).toEqual([]);
        });

        test("POLYMORPHIC_WIDGET with unknown data shape → filtered out", () => {
            expect(ChapterDetailsResponseSchema.parse(makeMinimalResponse([makePolymorphicUnknownData()]))).toEqual([]);
        });

        test("POLYMORPHIC_WIDGET without data.data (exactOptional) → filtered out", () => {
            expect(ChapterDetailsResponseSchema.parse(makeMinimalResponse([makePolymorphicNoData()]))).toEqual([]);
        });

        test("POLYMORPHIC_WIDGET with contents_list survives filter", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Videos", [makeContent("V1", "https://example.com/v1.m3u8")]),
            ]);
            expect(ChapterDetailsResponseSchema.parse(input).length).toBe(1);
        });

        test("POLYMORPHIC_WIDGET with cards survives filter", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Other", [
                    makeCardWithContent("Handbook", [{ title: "Doc", uri: "https://example.com/hb.pdf" }]),
                ]),
            ]);
            expect(ChapterDetailsResponseSchema.parse(input).length).toBe(1);
        });

        test("mix of all filtered types → empty result", () => {
            const input = makeMinimalResponse([
                { type: "BREADCRUMBS" },
                { type: "APP_GENERIC_HEADER_V2" },
                { type: "SELECTION_CARD" },
                makePolymorphicUnknownData(),
            ]);
            expect(ChapterDetailsResponseSchema.parse(input)).toEqual([]);
        });

        test("unknown widget type is rejected outright", () => {
            expect(
                ChapterDetailsResponseSchema.safeParse(makeMinimalResponse([{ type: "UNKNOWN_TYPE" }])).success,
            ).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("contents_list branch — LiveLectureVideosContentSchema transformation", () => {
        test("section name comes from widget title", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Live Lecture Videos", [
                    makeContent("Vid A", "https://example.com/a.m3u8"),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ name: string }];
            expect(entry.name).toBe("Live Lecture Videos");
        });

        test("content item maps title → name", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Section", [makeContent("My Video", "https://example.com/v.m3u8")]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: Array<{ name: string }> }];
            expect(entry.$[0]!.name).toBe("My Video");
        });

        test("content item maps uri → url", () => {
            const uri = "https://content.allen.in/abc/master.m3u8";
            const input = makeMinimalResponse([makePolymorphicWithContentsList("Section", [makeContent("V", uri)])]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: Array<{ url: string }> }];
            expect(entry.$[0]!.url).toBe(uri);
        });

        test("multiple content items in one section are all mapped", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Section", [
                    makeContent("A", "https://example.com/a.m3u8"),
                    makeContent("B", "https://example.com/b.m3u8"),
                    makeContent("C", "https://example.com/c.m3u8"),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: unknown[] }];
            expect(entry.$.length).toBe(3);
        });

        test("empty contents_list produces entry with empty $", () => {
            const input = makeMinimalResponse([makePolymorphicWithContentsList("Empty", [])]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: unknown[] }];
            expect(entry.$).toEqual([]);
        });

        test("content item output has exactly name, url and id keys", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("S", [makeContent("T", "https://example.com/t.m3u8")]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<Record<string, unknown>> },
            ];
            expect(Object.keys(entry.$[0]!).sort()).toEqual(["id", "name", "url"].sort());
        });

        test("two sections with contents_list produce two entries in order", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("First", [makeContent("V1", "https://example.com/v1.m3u8")]),
                makePolymorphicWithContentsList("Second", [makeContent("V2", "https://example.com/v2.m3u8")]),
            ]);
            const result = ChapterDetailsResponseSchema.parse(input) as Array<{ name: string }>;
            expect(result[0]!.name).toBe("First");
            expect(result[1]!.name).toBe("Second");
        });
    });

    // -----------------------------------------------------------------------
    describe("cards branch — CardWithContentSchema transformation", () => {
        test("CardWithContent section name comes from widget title", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Booklets", [
                    makeCardWithContent("Chemistry Notes", [{ title: "Doc A", uri: "https://example.com/a.pdf" }]),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ name: string }];
            expect(entry.name).toBe("Booklets");
        });

        test("CardWithContent maps card_name → name on the card item", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Section", [
                    makeCardWithContent("My Sub-section", [{ title: "Doc", uri: "https://example.com/doc.pdf" }]),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: Array<{ name: string }> }];
            expect(entry.$[0]!.name).toBe("My Sub-section");
        });

        test("CardWithContent contents_list items mapped to $", () => {
            const idA = randomUUID();
            const idB = randomUUID();
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Section", [
                    makeCardWithContent("Notes", [
                        { title: "File A", uri: "https://example.com/a.pdf", id: idA },
                        { title: "File B", uri: "https://example.com/b.pdf", id: idB },
                    ]),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<{ $: Array<{ name: string; url: string; id: string }> }> },
            ];
            expect(entry.$[0]!.$).toHaveLength(2);
            expect(entry.$[0]!.$[0]).toEqual({ name: "File A", url: "https://example.com/a.pdf", id: idA });
            expect(entry.$[0]!.$[1]).toEqual({ name: "File B", url: "https://example.com/b.pdf", id: idB });
        });

        test("CardWithContent with empty contents_list produces $ = []", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Section", [makeCardWithContent("Empty", [])]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: Array<{ $: unknown[] }> }];
            expect(entry.$[0]!.$).toEqual([]);
        });

        test("CardWithContent item output has exactly name and $ keys", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("S", [
                    makeCardWithContent("Card", [{ title: "F", uri: "https://example.com/f.pdf" }]),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<Record<string, unknown>> },
            ];
            expect(Object.keys(entry.$[0]!).sort()).toEqual(["$", "name"].sort());
        });

        test("CardContent sub-items have exactly name, url and id keys", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("S", [
                    makeCardWithContent("C", [{ title: "Doc", uri: "https://example.com/doc.pdf" }]),
                ]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<{ $: Array<Record<string, unknown>> }> },
            ];
            expect(Object.keys(entry.$[0]!.$[0]!).sort()).toEqual(["id", "name", "url"].sort());
        });
    });

    // -----------------------------------------------------------------------
    describe("mixed widget types in a single response", () => {
        test("non-polymorphic widgets are ignored; polymorphic ones preserved in order", () => {
            const input = makeMinimalResponse([
                { type: "BREADCRUMBS" },
                { type: "APP_GENERIC_HEADER_V2" },
                makePolymorphicWithContentsList("Videos", [makeContent("V1", "https://example.com/v1.m3u8")]),
                { type: "SELECTION_CARD" },
                makePolymorphicWithCards("Handbooks", [
                    makeCardWithContent("HB", [{ title: "Doc", uri: "https://example.com/hb.pdf" }]),
                ]),
            ]);
            const result = ChapterDetailsResponseSchema.parse(input) as Array<{ name: string }>;
            expect(result.length).toBe(2);
            expect(result[0]!.name).toBe("Videos");
            expect(result[1]!.name).toBe("Handbooks");
        });

        test("unknown-data POLYMORPHIC is skipped; valid ones remain", () => {
            const input = makeMinimalResponse([
                makePolymorphicUnknownData(),
                makePolymorphicWithContentsList("Kept", [makeContent("V", "https://example.com/v.m3u8")]),
                makePolymorphicNoData(),
            ]);
            const result = ChapterDetailsResponseSchema.parse(input) as Array<{ name: string }>;
            expect(result.length).toBe(1);
            expect(result[0]!.name).toBe("Kept");
        });

        test("contents_list section followed by cards section preserves both names", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Live Videos", [makeContent("V", "https://example.com/v.m3u8")]),
                makePolymorphicWithCards("Other Content", [
                    makeCardWithContent("HB", [{ title: "Doc", uri: "https://example.com/hb.pdf" }]),
                ]),
            ]);
            const result = ChapterDetailsResponseSchema.parse(input) as Array<{ name: string; $: unknown[] }>;
            expect(result[0]!.name).toBe("Live Videos");
            expect(result[1]!.name).toBe("Other Content");
        });

        test("three contents_list sections produce three entries in order", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("A", [makeContent("V", "https://example.com/v.m3u8")]),
                makePolymorphicWithContentsList("B", [makeContent("V", "https://example.com/v.m3u8")]),
                makePolymorphicWithContentsList("C", [makeContent("V", "https://example.com/v.m3u8")]),
            ]);
            const result = ChapterDetailsResponseSchema.parse(input) as Array<{ name: string }>;
            expect(result.map(e => e.name)).toEqual(["A", "B", "C"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("output shape invariants", () => {
        test("each result entry has exactly $ and name keys", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("Videos", [makeContent("V", "https://example.com/v.m3u8")]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [Record<string, unknown>];
            expect(Object.keys(entry).sort()).toEqual(["$", "name"].sort());
        });

        test("$ is always an array", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("S", [makeContent("V", "https://example.com/v.m3u8")]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ $: unknown }];
            expect(Array.isArray(entry.$)).toBe(true);
        });

        test("name is always a string", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithContentsList("My Section", [makeContent("V", "https://example.com/v.m3u8")]),
            ]);
            const [entry] = ChapterDetailsResponseSchema.parse(input) as unknown as [{ name: unknown }];
            expect(typeof entry.name).toBe("string");
        });
    });

    // -----------------------------------------------------------------------
    describe("safeParse error reporting", () => {
        test("safeParse on string returns success=false with issues", () => {
            const result = ChapterDetailsResponseSchema.safeParse("bad");
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.issues.length).toBeGreaterThan(0);
        });

        test("safeParse on array returns success=false", () => {
            expect(ChapterDetailsResponseSchema.safeParse([]).success).toBe(false);
        });
    });
});
