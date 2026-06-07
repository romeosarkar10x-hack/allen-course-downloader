import { errAsync } from "neverthrow";
import { subjects } from "./constants";
import { getCourseDetails } from "./get-course-details";
import { getStudentDetails } from "./get-student-details";
import { EnvResultAsync } from "./lib/env";

export function getCourse() {
    return EnvResultAsync.andThen(env => {
        return getStudentDetails({ bearerToken: env.BEARER_TOKEN }).andThen(studentDetails => {
            const courseID = env.SELECTED_COURSE_ID;

            const course = studentDetails.courses.find(({ courseID: id }) => id == courseID);

            if (course === undefined) {
                return errAsync(new Error(`Course with id '${courseID}' not found in student's profile`));
            }

            const batches = [...course.enrolledBatches, ...course.unenrolledBatches];

            return getCourseDetails({
                subjects,
                taxonomy: env.TAXONOMY,
                bearerToken: env.BEARER_TOKEN,
                batchIDs: batches,
                selectedBatchList: batches,
                name: course.courseName,
                selectedCourseID: courseID,
                stream: studentDetails.stream,
            });
        });
    });
}
