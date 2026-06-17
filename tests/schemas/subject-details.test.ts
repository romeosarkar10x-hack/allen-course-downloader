import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    CardContentSchema,
    CardSchema,
    CardWithContentSchema,
    ChapterSchema,
    AppGenericHeaderV2Schema,
    BreadCrumbsWidgetSchema,
    PolymorphicWidgetSchema,
    WidgetSchema,
    PageContentSchema,
    DataObjectSchema,
    SubjectDetailsResponseSchema,
} from "@/schemas/subject-details";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const fixtureRaw = readFileSync(join(import.meta.dirname, "../fixtures/subject-details.json"), "utf-8");
const fixture = JSON.parse(fixtureRaw);

function cloneFixture(): typeof fixture {
    return JSON.parse(fixtureRaw);
}

// ---------------------------------------------------------------------------
// Minimal builder helpers (smallest valid shape each schema accepts)
// ---------------------------------------------------------------------------

function makeCardContent(title: string, uri: string) {
    return { content_action: { data: { title, uri } } };
}

function makeCard(title: string, uri: string) {
    return { card_action: { data: { title, uri } } };
}

function makeCardWithContent(cardName: string, contents: Array<{ title: string; uri: string }>) {
    return {
        card_action: {
            data: {
                content: {
                    data: {
                        contents_list: contents.map(c => makeCardContent(c.title, c.uri)),
                    },
                },
            },
            tracking_params: { current: { card_name: cardName } },
        },
    };
}

function makeChapter(opts: { topicId: string; topicName: string; subjectId: string; uri?: string }) {
    return {
        action: {
            data: {
                query: { topic_id: opts.topicId },
                uri: opts.uri ?? "/topic-details",
            },
            tracking_params: {
                current: {
                    topic_name: opts.topicName,
                    subject_id: opts.subjectId,
                },
            },
        },
    };
}

function makePolymorphicWithChapters(title: string, chapters: unknown[]): Record<string, unknown> {
    return {
        type: "POLYMORPHIC_WIDGET",
        data: { data: { chapters_list: { chapters, title } } },
    };
}

function makePolymorphicWithCards(title: string, cards: unknown[]): Record<string, unknown> {
    return { type: "POLYMORPHIC_WIDGET", data: { data: { cards, title } } };
}

/** POLYMORPHIC_WIDGET whose `data.data` is an unknown shape (catch-all z.object()). */
function makePolymorphicUnknownData(): Record<string, unknown> {
    return { type: "POLYMORPHIC_WIDGET", data: { data: {} } };
}

function makeMinimalResponse(widgets: unknown[]) {
    return {
        status: 200,
        reason: "OK",
        data: { page_content: { widgets } },
    };
}

// ===========================================================================
describe("subject-details CardContentSchema", () => {
    test("parses valid content and maps title→name, uri→url", () => {
        const result = CardContentSchema.parse(makeCardContent("Doc Title", "https://example.com/doc.pdf"));
        expect(result).toEqual({ name: "Doc Title", url: "https://example.com/doc.pdf" });
    });

    test("output has exactly name and url keys", () => {
        const result = CardContentSchema.parse(makeCardContent("T", "https://example.com/f.pdf")) as Record<
            string,
            unknown
        >;
        expect(Object.keys(result).sort()).toEqual(["name", "url"].sort());
    });

    test("rejects non-url uri", () => {
        expect(CardContentSchema.safeParse(makeCardContent("X", "not-a-url")).success).toBe(false);
    });

    test("rejects missing content_action", () => {
        expect(CardContentSchema.safeParse({}).success).toBe(false);
    });

    test("rejects missing title", () => {
        expect(
            CardContentSchema.safeParse({
                content_action: { data: { uri: "https://x.com/" } },
            }).success,
        ).toBe(false);
    });

    test("rejects missing uri", () => {
        expect(CardContentSchema.safeParse({ content_action: { data: { title: "X" } } }).success).toBe(false);
    });

    test("rejects non-string title", () => {
        expect(
            CardContentSchema.safeParse({
                content_action: { data: { title: 123, uri: "https://x.com/" } },
            }).success,
        ).toBe(false);
    });
});

// ===========================================================================
describe("subject-details CardSchema", () => {
    test("parses valid card and maps title→name, uri→url", () => {
        const result = CardSchema.parse(makeCard("Handbook", "https://example.com/hb.pdf"));
        expect(result).toEqual({ name: "Handbook", url: "https://example.com/hb.pdf" });
    });

    test("output has exactly name and url keys", () => {
        const result = CardSchema.parse(makeCard("T", "https://example.com/t.pdf")) as Record<string, unknown>;
        expect(Object.keys(result).sort()).toEqual(["name", "url"].sort());
    });

    test("rejects non-url uri", () => {
        expect(CardSchema.safeParse(makeCard("X", "nope")).success).toBe(false);
    });

    test("rejects missing card_action", () => {
        expect(CardSchema.safeParse({}).success).toBe(false);
    });

    test("rejects missing title", () => {
        expect(CardSchema.safeParse({ card_action: { data: { uri: "https://x.com/" } } }).success).toBe(false);
    });

    test("rejects missing uri", () => {
        expect(CardSchema.safeParse({ card_action: { data: { title: "X" } } }).success).toBe(false);
    });

    test("does not parse a CardWithContent shape", () => {
        expect(
            CardSchema.safeParse(makeCardWithContent("Booklet", [{ title: "D", uri: "https://x.com/d.pdf" }])).success,
        ).toBe(false);
    });
});

// ===========================================================================
describe("subject-details CardWithContentSchema", () => {
    test("maps card_name→name and contents_list→$", () => {
        const result = CardWithContentSchema.parse(
            makeCardWithContent("Booklet", [
                { title: "Doc A", uri: "https://example.com/a.pdf" },
                { title: "Doc B", uri: "https://example.com/b.pdf" },
            ]),
        ) as { name: string; $: Array<{ name: string; url: string }> };
        expect(result.name).toBe("Booklet");
        expect(result.$).toEqual([
            { name: "Doc A", url: "https://example.com/a.pdf" },
            { name: "Doc B", url: "https://example.com/b.pdf" },
        ]);
    });

    test("output has exactly name and $ keys", () => {
        const result = CardWithContentSchema.parse(
            makeCardWithContent("C", [{ title: "F", uri: "https://example.com/f.pdf" }]),
        ) as Record<string, unknown>;
        expect(Object.keys(result).sort()).toEqual(["$", "name"].sort());
    });

    test("empty contents_list produces $ = []", () => {
        const result = CardWithContentSchema.parse(makeCardWithContent("Empty", [])) as { $: unknown[] };
        expect(result.$).toEqual([]);
    });

    test("rejects missing card_name", () => {
        const input = makeCardWithContent("X", [{ title: "F", uri: "https://example.com/f.pdf" }]);
        // @ts-expect-error intentionally remove required field
        delete input.card_action.tracking_params.current.card_name;
        expect(CardWithContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing contents_list", () => {
        const input = makeCardWithContent("X", [{ title: "F", uri: "https://example.com/f.pdf" }]);
        // @ts-expect-error intentionally remove required field
        delete input.card_action.data.content.data.contents_list;
        expect(CardWithContentSchema.safeParse(input).success).toBe(false);
    });

    test("rejects when a content item has a bad url", () => {
        expect(
            CardWithContentSchema.safeParse(makeCardWithContent("X", [{ title: "F", uri: "not-a-url" }])).success,
        ).toBe(false);
    });

    test("rejects missing tracking_params", () => {
        const input = makeCardWithContent("X", [{ title: "F", uri: "https://example.com/f.pdf" }]);
        // @ts-expect-error intentionally remove required field
        delete input.card_action.tracking_params;
        expect(CardWithContentSchema.safeParse(input).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details ChapterSchema", () => {
    test("maps fields to id/name/subjectID and sets $chapter true", () => {
        const result = ChapterSchema.parse(
            makeChapter({ topicId: "953", topicName: "Liquid Solutions", subjectId: "746" }),
        );
        expect(result).toEqual({
            id: "953",
            name: "Liquid Solutions",
            subjectID: "746",
            $chapter: true,
        });
    });

    test("output has exactly id, name, subjectID and $chapter keys", () => {
        const result = ChapterSchema.parse(makeChapter({ topicId: "1", topicName: "T", subjectId: "2" })) as Record<
            string,
            unknown
        >;
        expect(Object.keys(result).sort()).toEqual(["$chapter", "id", "name", "subjectID"].sort());
    });

    test("$chapter is always literally true", () => {
        const result = ChapterSchema.parse(makeChapter({ topicId: "1", topicName: "T", subjectId: "2" })) as {
            $chapter: boolean;
        };
        expect(result.$chapter).toBe(true);
    });

    test("requires uri even though it is not in the output", () => {
        const input = makeChapter({ topicId: "1", topicName: "T", subjectId: "2" });
        // @ts-expect-error intentionally remove required field
        delete input.action.data.uri;
        expect(ChapterSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing topic_id", () => {
        const input = makeChapter({ topicId: "1", topicName: "T", subjectId: "2" });
        // @ts-expect-error intentionally remove required field
        delete input.action.data.query.topic_id;
        expect(ChapterSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing topic_name", () => {
        const input = makeChapter({ topicId: "1", topicName: "T", subjectId: "2" });
        // @ts-expect-error intentionally remove required field
        delete input.action.tracking_params.current.topic_name;
        expect(ChapterSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing subject_id", () => {
        const input = makeChapter({ topicId: "1", topicName: "T", subjectId: "2" });
        // @ts-expect-error intentionally remove required field
        delete input.action.tracking_params.current.subject_id;
        expect(ChapterSchema.safeParse(input).success).toBe(false);
    });

    test("rejects non-string topic_id", () => {
        const input = makeChapter({ topicId: "1", topicName: "T", subjectId: "2" });
        // @ts-expect-error intentionally set wrong type
        input.action.data.query.topic_id = 953;
        expect(ChapterSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing action", () => {
        expect(ChapterSchema.safeParse({}).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details AppGenericHeaderV2Schema", () => {
    test("accepts the correct literal", () => {
        expect(AppGenericHeaderV2Schema.safeParse({ type: "APP_GENERIC_HEADER_V2" }).success).toBe(true);
    });

    test("ignores extra keys", () => {
        expect(AppGenericHeaderV2Schema.safeParse({ type: "APP_GENERIC_HEADER_V2", extra: 1 }).success).toBe(true);
    });

    test("rejects wrong literal", () => {
        expect(AppGenericHeaderV2Schema.safeParse({ type: "BREADCRUMBS" }).success).toBe(false);
    });

    test("rejects missing type", () => {
        expect(AppGenericHeaderV2Schema.safeParse({}).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details BreadCrumbsWidgetSchema", () => {
    test("accepts the correct literal", () => {
        expect(BreadCrumbsWidgetSchema.safeParse({ type: "BREADCRUMBS" }).success).toBe(true);
    });

    test("rejects wrong literal", () => {
        expect(BreadCrumbsWidgetSchema.safeParse({ type: "POLYMORPHIC_WIDGET" }).success).toBe(false);
    });

    test("rejects missing type", () => {
        expect(BreadCrumbsWidgetSchema.safeParse({}).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details PolymorphicWidgetSchema", () => {
    test("parses a widget with chapters_list + title (transformed)", () => {
        const widget = makePolymorphicWithChapters("All Chapters", [
            makeChapter({ topicId: "1", topicName: "Ch", subjectId: "2" }),
        ]);
        const result = PolymorphicWidgetSchema.parse(widget) as {
            data: { data: { title: string; chapters: unknown[] } };
        };
        expect(result.data.data.title).toBe("All Chapters");
        expect(result.data.data.chapters).toHaveLength(1);
    });

    test("chapters_list branch output exposes chapters + title (chapters_list key dropped)", () => {
        const widget = makePolymorphicWithChapters("Sec", [
            makeChapter({ topicId: "1", topicName: "Ch", subjectId: "2" }),
        ]);
        const result = PolymorphicWidgetSchema.parse(widget) as {
            data: { data: Record<string, unknown> };
        };
        expect(Object.keys(result.data.data).sort()).toEqual(["chapters", "title"].sort());
    });

    test("parses a widget with cards + title", () => {
        const widget = makePolymorphicWithCards("Other Content", [makeCard("Handbook", "https://example.com/hb.pdf")]);
        expect(PolymorphicWidgetSchema.safeParse(widget).success).toBe(true);
    });

    test("parses a widget with cards containing a CardWithContent", () => {
        const widget = makePolymorphicWithCards("Other Content", [
            makeCard("Handbook", "https://example.com/hb.pdf"),
            makeCardWithContent("Booklet", [{ title: "D", uri: "https://example.com/d.pdf" }]),
        ]);
        expect(PolymorphicWidgetSchema.safeParse(widget).success).toBe(true);
    });

    test("parses a widget with unknown data shape (catch-all z.object())", () => {
        expect(PolymorphicWidgetSchema.safeParse(makePolymorphicUnknownData()).success).toBe(true);
    });

    test("unknown data shape collapses to empty object via catch-all branch", () => {
        const result = PolymorphicWidgetSchema.parse({
            type: "POLYMORPHIC_WIDGET",
            data: { data: { something: "irrelevant" } },
        }) as { data: { data: Record<string, unknown> } };
        expect(result.data.data).toEqual({});
    });

    test("cards branch without title falls through to catch-all (no title)", () => {
        const result = PolymorphicWidgetSchema.parse({
            type: "POLYMORPHIC_WIDGET",
            data: { data: { cards: [makeCard("X", "https://example.com/x.pdf")] } },
        }) as { data: { data: Record<string, unknown> } };
        expect(result.data.data).toEqual({});
    });

    test("rejects wrong type literal", () => {
        expect(PolymorphicWidgetSchema.safeParse({ type: "BREADCRUMBS", data: { data: {} } }).success).toBe(false);
    });

    test("rejects missing type field", () => {
        expect(PolymorphicWidgetSchema.safeParse({ data: { data: {} } }).success).toBe(false);
    });

    test("rejects missing data.data (required, not optional)", () => {
        expect(PolymorphicWidgetSchema.safeParse({ type: "POLYMORPHIC_WIDGET", data: {} }).success).toBe(false);
    });

    test("rejects missing data entirely", () => {
        expect(PolymorphicWidgetSchema.safeParse({ type: "POLYMORPHIC_WIDGET" }).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details WidgetSchema", () => {
    test("accepts BREADCRUMBS type", () => {
        expect(WidgetSchema.safeParse({ type: "BREADCRUMBS" }).success).toBe(true);
    });

    test("accepts APP_GENERIC_HEADER_V2 type", () => {
        expect(WidgetSchema.safeParse({ type: "APP_GENERIC_HEADER_V2" }).success).toBe(true);
    });

    test("accepts POLYMORPHIC_WIDGET type", () => {
        expect(WidgetSchema.safeParse(makePolymorphicUnknownData()).success).toBe(true);
    });

    test("rejects SELECTION_CARD (not part of this union)", () => {
        expect(WidgetSchema.safeParse({ type: "SELECTION_CARD" }).success).toBe(false);
    });

    test("rejects completely unknown type", () => {
        expect(WidgetSchema.safeParse({ type: "MYSTERY_WIDGET" }).success).toBe(false);
    });

    test("rejects missing type", () => {
        expect(WidgetSchema.safeParse({}).success).toBe(false);
    });

    test("rejects a POLYMORPHIC_WIDGET that is missing data.data", () => {
        expect(WidgetSchema.safeParse({ type: "POLYMORPHIC_WIDGET", data: {} }).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details PageContentSchema", () => {
    // PageContentSchema transforms the `widgets` field, so it returns
    // `{ widgets: <transformed array> }` rather than the array itself.
    function parseWidgets(input: unknown): Array<{ name: string; $: unknown[] }> {
        return (PageContentSchema.parse(input) as { widgets: Array<{ name: string; $: unknown[] }> }).widgets;
    }

    test("filters down to POLYMORPHIC widgets that carry chapters or cards", () => {
        const result = parseWidgets({
            widgets: [
                { type: "BREADCRUMBS" },
                { type: "APP_GENERIC_HEADER_V2" },
                makePolymorphicUnknownData(),
                makePolymorphicWithChapters("Chapters", [
                    makeChapter({ topicId: "1", topicName: "Ch", subjectId: "2" }),
                ]),
                makePolymorphicWithCards("Cards", [makeCard("HB", "https://example.com/hb.pdf")]),
            ],
        });
        expect(result.map(e => e.name)).toEqual(["Chapters", "Cards"]);
    });

    test("empty widgets array → empty result", () => {
        expect(parseWidgets({ widgets: [] })).toEqual([]);
    });

    test("chapters section maps title→name and chapters→$", () => {
        const result = parseWidgets({
            widgets: [
                makePolymorphicWithChapters("All Chapters", [
                    makeChapter({ topicId: "953", topicName: "Liquid Solutions", subjectId: "746" }),
                ]),
            ],
        });
        expect(result[0]!.name).toBe("All Chapters");
        expect(result[0]!.$).toEqual([{ id: "953", name: "Liquid Solutions", subjectID: "746", $chapter: true }]);
    });

    test("cards section maps title→name and cards→$", () => {
        const result = parseWidgets({
            widgets: [makePolymorphicWithCards("Other Content", [makeCard("Handbook", "https://example.com/hb.pdf")])],
        });
        expect(result[0]!.name).toBe("Other Content");
        expect(result[0]!.$).toEqual([{ name: "Handbook", url: "https://example.com/hb.pdf" }]);
    });

    test("each entry has exactly name and $ keys", () => {
        const result = parseWidgets({
            widgets: [
                makePolymorphicWithChapters("S", [makeChapter({ topicId: "1", topicName: "C", subjectId: "2" })]),
            ],
        });
        expect(Object.keys(result[0]!).sort()).toEqual(["$", "name"].sort());
    });

    test("preserves widget order across chapter and card sections", () => {
        const result = parseWidgets({
            widgets: [
                makePolymorphicWithCards("First Cards", [makeCard("A", "https://example.com/a.pdf")]),
                makePolymorphicWithChapters("Then Chapters", [
                    makeChapter({ topicId: "1", topicName: "C", subjectId: "2" }),
                ]),
            ],
        });
        expect(result.map(e => e.name)).toEqual(["First Cards", "Then Chapters"]);
    });

    test("a cards widget whose array is empty still survives the filter", () => {
        const result = parseWidgets({
            widgets: [makePolymorphicWithCards("Empty Cards", [])],
        });
        expect(result).toHaveLength(1);
        expect(result[0]!.$).toEqual([]);
    });

    test("rejects non-array widgets", () => {
        expect(PageContentSchema.safeParse({ widgets: "oops" }).success).toBe(false);
    });

    test("rejects missing widgets", () => {
        expect(PageContentSchema.safeParse({}).success).toBe(false);
    });

    test("an unknown widget type makes the whole parse fail", () => {
        expect(PageContentSchema.safeParse({ widgets: [{ type: "NOPE" }] }).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details DataObjectSchema", () => {
    test("renames page_content → pageContent", () => {
        const result = DataObjectSchema.parse({
            page_content: {
                widgets: [
                    makePolymorphicWithChapters("S", [makeChapter({ topicId: "1", topicName: "C", subjectId: "2" })]),
                ],
            },
        }) as { pageContent: { widgets: Array<{ name: string }> } };
        expect(result.pageContent.widgets[0]!.name).toBe("S");
    });

    test("output has exactly the pageContent key", () => {
        const result = DataObjectSchema.parse({
            page_content: { widgets: [] },
        }) as Record<string, unknown>;
        expect(Object.keys(result)).toEqual(["pageContent"]);
    });

    test("rejects missing page_content", () => {
        expect(DataObjectSchema.safeParse({}).success).toBe(false);
    });
});

// ===========================================================================
describe("subject-details SubjectDetailsResponseSchema", () => {
    // -----------------------------------------------------------------------
    describe("real fixture — integration smoke test", () => {
        test("parses the full subject-details.json fixture without errors", () => {
            expect(() => SubjectDetailsResponseSchema.parse(fixture)).not.toThrow();
        });

        test("safeParse on valid fixture returns success=true", () => {
            expect(SubjectDetailsResponseSchema.safeParse(fixture).success).toBe(true);
        });

        test("returns an array", () => {
            expect(Array.isArray(SubjectDetailsResponseSchema.parse(fixture))).toBe(true);
        });

        test("returns exactly the 3 sections that carry chapters or cards", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{ name: string }>;
            expect(result).toHaveLength(3);
        });

        test("every entry has $ (array) and name (string)", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{
                $: unknown[];
                name: string;
            }>;
            for (const entry of result) {
                expect(Array.isArray(entry.$)).toBe(true);
                expect(typeof entry.name).toBe("string");
            }
        });

        test("section names match the fixture", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{ name: string }>;
            expect(result.map(e => e.name)).toEqual(["All Chapters", "All Chapters", "Other Content"]);
        });

        test("first 'All Chapters' section holds 24 chapter nodes", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{ $: unknown[] }>;
            expect(result[0]!.$).toHaveLength(24);
        });

        test("first chapter node is fully transformed", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{
                $: Array<Record<string, unknown>>;
            }>;
            expect(result[0]!.$[0]).toEqual({
                id: "953",
                name: "Liquid Solutions",
                subjectID: "746",
                $chapter: true,
            });
        });

        test("every chapter node carries $chapter:true and string id/name/subjectID", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{
                $: Array<{ id: string; name: string; subjectID: string; $chapter: boolean }>;
            }>;
            for (const chapter of result[0]!.$) {
                expect(chapter.$chapter).toBe(true);
                expect(typeof chapter.id).toBe("string");
                expect(typeof chapter.name).toBe("string");
                expect(typeof chapter.subjectID).toBe("string");
            }
        });

        test("'Other Content' section holds a plain card and a card-with-content", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{
                name: string;
                $: Array<Record<string, unknown>>;
            }>;
            const other = result.find(e => e.name === "Other Content")!;
            expect(other.$).toHaveLength(2);

            const plain = other.$[0] as { name: string; url: string };
            expect(plain.name).toBe("Chemistry Handbook");
            expect(typeof plain.url).toBe("string");

            const withContent = other.$[1] as { name: string; $: unknown[] };
            expect(withContent.name).toBe("Booklet");
            expect(withContent.$).toHaveLength(183);
        });

        test("card-with-content children are all {name,url} leaf nodes", () => {
            const result = SubjectDetailsResponseSchema.parse(fixture) as Array<{
                name: string;
                $: Array<{ name: string; $?: Array<{ name: string; url: string }> }>;
            }>;
            const other = result.find(e => e.name === "Other Content")!;
            const booklet = other.$[1];
            expect(booklet!.$![0]).toEqual({
                name: "The p-block elements_Question",
                url: expect.stringContaining("https://"),
            });
            for (const leaf of booklet!.$!) {
                expect(typeof leaf.name).toBe("string");
                expect(typeof leaf.url).toBe("string");
            }
        });
    });

    // -----------------------------------------------------------------------
    describe("envelope validation", () => {
        test("rejects missing status", () => {
            const input = cloneFixture();
            delete input.status;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-number status", () => {
            const input = cloneFixture();
            input.status = "200";
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("accepts any numeric status value", () => {
            const input = makeMinimalResponse([]);
            (input as Record<string, unknown>).status = 404;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(true);
        });

        test("rejects missing reason", () => {
            const input = cloneFixture();
            delete input.reason;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects a reason other than the literal 'OK'", () => {
            const input = cloneFixture();
            input.reason = "FAIL";
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-string reason", () => {
            const input = cloneFixture();
            input.reason = 200;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data", () => {
            const input = cloneFixture();
            delete input.data;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.page_content", () => {
            const input = cloneFixture();
            delete input.data.page_content;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.page_content.widgets", () => {
            const input = cloneFixture();
            delete input.data.page_content.widgets;
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("rejects non-array widgets", () => {
            const input = cloneFixture();
            input.data.page_content.widgets = "oops";
            expect(SubjectDetailsResponseSchema.safeParse(input).success).toBe(false);
        });

        test("safeParse on null returns success=false", () => {
            expect(SubjectDetailsResponseSchema.safeParse(null).success).toBe(false);
        });

        test("safeParse on empty object returns success=false", () => {
            expect(SubjectDetailsResponseSchema.safeParse({}).success).toBe(false);
        });

        test("safeParse on a string returns success=false with issues", () => {
            const result = SubjectDetailsResponseSchema.safeParse("bad");
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.issues.length).toBeGreaterThan(0);
        });

        test("safeParse on an array returns success=false", () => {
            expect(SubjectDetailsResponseSchema.safeParse([]).success).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("widget filtering — only chapters/cards POLYMORPHIC widgets survive", () => {
        test("empty widgets array → empty result", () => {
            expect(SubjectDetailsResponseSchema.parse(makeMinimalResponse([]))).toEqual([]);
        });

        test("only BREADCRUMBS → empty result", () => {
            expect(SubjectDetailsResponseSchema.parse(makeMinimalResponse([{ type: "BREADCRUMBS" }]))).toEqual([]);
        });

        test("only APP_GENERIC_HEADER_V2 → empty result", () => {
            expect(
                SubjectDetailsResponseSchema.parse(makeMinimalResponse([{ type: "APP_GENERIC_HEADER_V2" }])),
            ).toEqual([]);
        });

        test("POLYMORPHIC_WIDGET with unknown data shape → filtered out", () => {
            expect(SubjectDetailsResponseSchema.parse(makeMinimalResponse([makePolymorphicUnknownData()]))).toEqual([]);
        });

        test("cards widget without title → filtered out (collapses to {})", () => {
            const input = makeMinimalResponse([
                {
                    type: "POLYMORPHIC_WIDGET",
                    data: { data: { cards: [makeCard("X", "https://example.com/x.pdf")] } },
                },
            ]);
            expect(SubjectDetailsResponseSchema.parse(input)).toEqual([]);
        });

        test("mix of all non-qualifying widgets → empty result", () => {
            const input = makeMinimalResponse([
                { type: "BREADCRUMBS" },
                { type: "APP_GENERIC_HEADER_V2" },
                makePolymorphicUnknownData(),
            ]);
            expect(SubjectDetailsResponseSchema.parse(input)).toEqual([]);
        });

        test("unknown widget type is rejected outright", () => {
            expect(
                SubjectDetailsResponseSchema.safeParse(makeMinimalResponse([{ type: "UNKNOWN_TYPE" }])).success,
            ).toBe(false);
        });

        test("non-polymorphic widgets are ignored; polymorphic ones preserved in order", () => {
            const input = makeMinimalResponse([
                { type: "BREADCRUMBS" },
                makePolymorphicWithChapters("Chapters", [
                    makeChapter({ topicId: "1", topicName: "C", subjectId: "2" }),
                ]),
                { type: "APP_GENERIC_HEADER_V2" },
                makePolymorphicWithCards("Cards", [makeCard("HB", "https://example.com/hb.pdf")]),
            ]);
            const result = SubjectDetailsResponseSchema.parse(input) as Array<{ name: string }>;
            expect(result.map(e => e.name)).toEqual(["Chapters", "Cards"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("chapters branch — end-to-end transformation", () => {
        test("section name comes from chapters_list.title", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithChapters("Physics Chapters", [
                    makeChapter({ topicId: "10", topicName: "Kinematics", subjectId: "5" }),
                ]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [{ name: string }];
            expect(entry.name).toBe("Physics Chapters");
        });

        test("multiple chapters are all transformed and ordered", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithChapters("All", [
                    makeChapter({ topicId: "1", topicName: "A", subjectId: "9" }),
                    makeChapter({ topicId: "2", topicName: "B", subjectId: "9" }),
                    makeChapter({ topicId: "3", topicName: "C", subjectId: "9" }),
                ]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<{ id: string; name: string }> },
            ];
            expect(entry.$.map(c => [c.id, c.name])).toEqual([
                ["1", "A"],
                ["2", "B"],
                ["3", "C"],
            ]);
        });

        test("empty chapters list still produces a section with empty $", () => {
            const input = makeMinimalResponse([makePolymorphicWithChapters("Empty", [])]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [{ $: unknown[] }];
            expect(entry.$).toEqual([]);
        });

        test("a malformed chapter collapses the section via the catch-all and drops it", () => {
            // chapters_list branch fails on the bad chapter, the union falls through
            // to the empty z.object() catch-all → {} → filtered out (parse still succeeds).
            const badChapter = makeChapter({ topicId: "1", topicName: "A", subjectId: "9" });
            // @ts-expect-error intentionally break the chapter
            delete badChapter.action.data.query.topic_id;
            const input = makeMinimalResponse([makePolymorphicWithChapters("All", [badChapter])]);
            expect(SubjectDetailsResponseSchema.parse(input)).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    describe("cards branch — end-to-end transformation", () => {
        test("plain card maps title→name and uri→url", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Other", [makeCard("Chemistry Handbook", "https://example.com/hb.pdf")]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<{ name: string; url: string }> },
            ];
            expect(entry.$[0]).toEqual({
                name: "Chemistry Handbook",
                url: "https://example.com/hb.pdf",
            });
        });

        test("card-with-content maps card_name→name and nests contents under $", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Other", [
                    makeCardWithContent("Booklet", [
                        { title: "File A", uri: "https://example.com/a.pdf" },
                        { title: "File B", uri: "https://example.com/b.pdf" },
                    ]),
                ]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<{ name: string; $: Array<{ name: string; url: string }> }> },
            ];
            expect(entry.$[0]!.name).toBe("Booklet");
            expect(entry.$[0]!.$).toEqual([
                { name: "File A", url: "https://example.com/a.pdf" },
                { name: "File B", url: "https://example.com/b.pdf" },
            ]);
        });

        test("a section can mix plain cards and cards-with-content", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("Other", [
                    makeCard("Handbook", "https://example.com/hb.pdf"),
                    makeCardWithContent("Booklet", [{ title: "Doc", uri: "https://example.com/doc.pdf" }]),
                ]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [
                { $: Array<Record<string, unknown>> },
            ];
            expect(Object.keys(entry.$[0]!).sort()).toEqual(["name", "url"].sort());
            expect(Object.keys(entry.$[1]!).sort()).toEqual(["$", "name"].sort());
        });

        test("an invalid card makes the section collapse and be filtered out", () => {
            const input = makeMinimalResponse([makePolymorphicWithCards("Other", [{ card_action: { data: {} } }])]);
            // invalid cards array → cards branch fails → catch-all {} → filtered out
            expect(SubjectDetailsResponseSchema.parse(input)).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    describe("output shape invariants", () => {
        test("each result entry has exactly $ and name keys", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithChapters("S", [makeChapter({ topicId: "1", topicName: "C", subjectId: "2" })]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [Record<string, unknown>];
            expect(Object.keys(entry).sort()).toEqual(["$", "name"].sort());
        });

        test("$ is always an array and name always a string", () => {
            const input = makeMinimalResponse([
                makePolymorphicWithCards("My Section", [makeCard("C", "https://example.com/c.pdf")]),
            ]);
            const [entry] = SubjectDetailsResponseSchema.parse(input) as unknown as [{ $: unknown; name: unknown }];
            expect(Array.isArray(entry.$)).toBe(true);
            expect(typeof entry.name).toBe("string");
        });
    });
});
