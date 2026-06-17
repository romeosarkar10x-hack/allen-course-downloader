import type { ContentTreeNodeType } from "@/types/node-types";
import z from "zod";

function toLocalDate(date: Date) {
    const d = String(date.getDate());
    const m = String(date.getMonth() + 1);
    const y = String(date.getFullYear());

    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export const CardContentSchema = z
    .object({
        content_action: z.object({
            data: z.object({
                title: z.string(),
                uri: z.url(),
                content_id: z.uuidv4(),
            }),
        }),
    })
    .transform(
        ({
            content_action: {
                data: { title, uri, content_id },
            },
        }) => ({ name: title, url: uri, id: content_id }),
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

export const GenericContentSchema = z
    .object({
        content_action: z.object({
            data: z.object({
                content_id: z.uuidv4(),
                title: z.string(),
                uri: z.url(),
            }),
        }),
    })
    .transform(
        ({
            content_action: {
                data: { title, uri, content_id },
            },
        }) => ({ name: title, url: uri, id: content_id }),
    );

export const LiveLectureVideosContentSchema = z
    .object({
        content_action: z.object({
            data: z.object({
                content_id: z.uuidv4(),
                title: z.string(),
                uri: z.url(),
            }),
        }),
        type: z.literal("LIVE_LECTURE_VIDEOS_CONTENT_TYPE"),
        subtitle: z.string().transform(s => toLocalDate(new Date(s))),
    })
    .transform(
        ({
            subtitle,
            content_action: {
                data: { title, uri, content_id },
            },
        }) => ({ name: `${subtitle} ${title}`, url: uri, id: content_id }),
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
                    contents_list: z.array(z.union([LiveLectureVideosContentSchema, GenericContentSchema])),
                    title: z.string(),
                }),
                z.object({
                    cards: z.array(CardWithContentSchema),
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

/* export const CardSchema = z
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
    ); */
