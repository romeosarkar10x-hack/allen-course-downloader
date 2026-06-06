import { ResultAsync } from "neverthrow";
import { getSubjectDetails } from "./get-subject-details";

export function getCourseDetails(subjects: { name: string; id: string }[]) {
    return ResultAsync.combine(subjects.map(getSubjectDetails));
}
