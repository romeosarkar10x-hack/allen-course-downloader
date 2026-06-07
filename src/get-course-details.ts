import { ResultAsync } from "neverthrow";
import { getSubjectDetails } from "./get-subject-details";

export function getCourseDetails({
    name,
    subjects,
    batchIDs,
    selectedBatchList,
    selectedCourseID,
    stream,
    taxonomy,
    bearerToken,
}: {
    subjects: { name: string; id: string }[];
    name: string;
    stream: string;
    taxonomy: string;
    batchIDs: string[];
    selectedBatchList: string[];
    selectedCourseID: string;
    bearerToken: string;
}) {
    return ResultAsync.combine(
        subjects.map(({ name, id }) =>
            getSubjectDetails({
                subjectID: id,
                subjectName: name,
                batchIDs,
                selectedBatchList,
                selectedCourseID,
                stream,
                taxonomy,
                bearerToken,
            }),
        ),
    ).map($ => ({ $, name }));
}
