import type { ContentTreeNodeType } from "@/types/node-types";
import z from "zod";

export const CardContentSchema = z
    .object({
        content_action: z.object({
            data: z.object({
                title: z.string(),
                uri: z.url(),
            }),
        }),
    })
    .transform(
        ({
            content_action: {
                data: { title, uri },
            },
        }) => ({ name: title, url: uri }),
    );

export const CardSchema = z
    .object({
        card_action: z.object({
            data: z.object({
                title: z.string(),
                uri: z.url(),
            }),
        }),
    })
    .transform(
        ({
            card_action: {
                data: { title, uri },
            },
        }) => ({ name: title, url: uri }),
    );

export const CardWithContentSchema = z
    .object({
        card_action: z.object({
            data: z.object({
                content: z.object({
                    data: z.object({
                        contents_list: z.array(CardContentSchema),
                    }),
                }),
            }),
            tracking_params: z.object({ current: z.object({ card_name: z.string() }) }),
        }),
    })
    .transform(
        ({
            card_action: {
                data: {
                    content: {
                        data: { contents_list },
                    },
                },
                tracking_params: {
                    current: { card_name },
                },
            },
        }) => ({ name: card_name, $: contents_list }),
    );

/*
const ChapterSchema = z
    .object({
        action: z.object({
            data: z.object({
                query: z.object({
                    topic_id: z.string(),
                }),
                uri: z.string(),
            }),
            tracking_params: z.object({
                current: z.object({
                    topic_name: z.string(),
                    subject_id: z.string(),
                }),
            }),
        }),
    })
    .transform(
        ({
            action: {
                data: {
                    query: { topic_id },
                },
                tracking_params: {
                    current: { topic_name, subject_id },
                },
            },
        }) => ({ id: topic_id, name: topic_name, subjectID: subject_id, $chapter: true }),
    );
    
    */

export const ContentSchema = z
    .object({
        content_action: z.object({
            data: z.object({
                title: z.string(),
                uri: z.url(),
            }),
        }),
    })
    .transform(
        ({
            content_action: {
                data: { title, uri },
            },
        }) => ({ name: title, url: uri }),
    );

export const SelectionCardSchema = z.object({
    type: z.literal("SELECTION_CARD"),
});

export const AppGenericHeaderV2Schema = z.object({
    type: z.literal("APP_GENERIC_HEADER_V2"),
});

export const BreadCrumbsWidgetSchema = z.object({
    type: z.literal("BREADCRUMBS"),
});

export const PolymorphicWidgetSchema = z.object({
    type: z.literal("POLYMORPHIC_WIDGET"),
    data: z.object({
        data: z
            .union([
                z.object({
                    contents_list: z.array(ContentSchema),
                    title: z.string(),
                }),
                z.object({
                    cards: z.array(z.union([CardSchema, CardWithContentSchema])),
                    title: z.string(),
                }),
                z.object(),
            ])
            .exactOptional(),
    }),
});

export const WidgetSchema = z.discriminatedUnion("type", [
    BreadCrumbsWidgetSchema,
    PolymorphicWidgetSchema,
    AppGenericHeaderV2Schema,
    SelectionCardSchema,
]);

export const PageContentSchema = z.object({
    widgets: z.array(WidgetSchema).transform(array =>
        array
            .filter(element => element.type === "POLYMORPHIC_WIDGET")
            .flatMap(element => ("data" in element.data ? [element.data.data] : []))
            .filter(element => "cards" in element || "contents_list" in element)
            .map(
                element =>
                    ({
                        $: "cards" in element ? element.cards : element.contents_list,
                        name: element.title,
                    }) satisfies ContentTreeNodeType,
            ),
    ),
});

export const DataObjectSchema = z
    .object({
        page_content: PageContentSchema,
    })
    .transform(data => ({
        pageContent: data.page_content,
    }));

export const ChapterDetailsResponseSchema = z
    .object({
        status: z.number(),
        reason: z.string(),
        data: DataObjectSchema,
    })
    .transform(
        ({
            data: {
                pageContent: { widgets },
            },
        }) => widgets,
    );
