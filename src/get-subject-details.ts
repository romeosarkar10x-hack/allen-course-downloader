import { fromPromise, okAsync, ResultAsync } from "neverthrow";
import { PP } from "@/lib/pp";
import { parseResponseJSON } from "./utils/parse-response-json";
import { zodParseAsync } from "./utils/zod-parse-async";
import { SubjectDetailsResponseSchema } from "./schemas/subject-details";
import type {
    ChapterContentTreeNodeType,
    ChapterLeafNodeType,
    ContentLeafNodeType,
    ContentTreeNodeType,
} from "./types/node-types";
import { getChapterDetails } from "./get-chapter-details";
import { commonHeaders } from "./constants";
import { dedupeTree } from "./utils/dedupe-tree";

type InferAsyncErrorType<T> = T extends ResultAsync<unknown, infer E> ? E : never;
type GetChapterDetailsFunctionErrorType = InferAsyncErrorType<ReturnType<typeof getChapterDetails>>;

export function getSubjectDetails({
    subjectID,
    subjectName,
    batchIDs,
    stream,
    selectedBatchList,
    selectedCourseID,
    taxonomy,
    bearerToken,
}: {
    subjectID: string;
    subjectName: string;
    stream: string;
    batchIDs: string[];
    selectedBatchList: string[];
    taxonomy: string;
    selectedCourseID: string;
    bearerToken: string;
}) {
    function appendChapterDetailsRecursively(
        content: ChapterContentTreeNodeType,
    ): ResultAsync<ContentTreeNodeType, GetChapterDetailsFunctionErrorType> {
        if ("$" in content) {
            return ResultAsync.combine(content.$.map(appendChapterDetailsRecursively)).map(result => ({
                name: content.name,
                $: result,
            }));
        }

        if ("$chapter" in content) {
            return getChapterDetails({
                subjectID: content.subjectID,
                topicID: content.id,
                topicName: content.name,
                batchIDs,
                selectedBatchList,
                selectedCourseID,
                bearerToken,
                taxonomy,
                stream,
            });
        }

        return okAsync(content);
    }

    const url = "https://api.allen-live.in/api/v1/pages/getPage";

    const searchParams = new URLSearchParams();
    searchParams.append("batch_id", batchIDs.join(","));
    searchParams.append("selected_batch_list", selectedBatchList.join(","));
    searchParams.append("selected_course_id", selectedCourseID);
    searchParams.append("stream", stream);
    searchParams.append("subject_id", subjectID);
    searchParams.append("taxonomy_id", taxonomy);

    const payload = {
        page_url: "/subject-details?" + searchParams.toString(),
    };

    const task = () =>
        fetch(url, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${bearerToken}`,
                ...commonHeaders,
            },
        });

    const taskMetadata = { fetch: { path: "/subject-details", subjectID, subjectName } };

    return fromPromise(PP.schedule(task, taskMetadata).promise, error => error as Error)
        .andThen(parseResponseJSON)
        .andThen(zodParseAsync(SubjectDetailsResponseSchema))
        .map($ => ({ $, name: subjectName }))
        .map(t => dedupeTree<{ name: string }, ChapterLeafNodeType | ContentLeafNodeType>(t))
        .andThen(appendChapterDetailsRecursively);
}
