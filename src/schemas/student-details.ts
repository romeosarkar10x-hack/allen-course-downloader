import z from "zod";

export const StudentDetailsObjectSchema = z
    .object({
        email: z.email(),
        phone: z.string(),
        first_name: z.string(),
        last_name: z.string(),
        dob: z.string(),
        gender: z.enum(["MALE", "FEMALE"]),
        stream: z.string(),
        stream_display_name: z.string(),
        current_class: z.string(),
    })
    .transform(({ first_name, last_name, stream_display_name, current_class, ...rest }) => ({
        firstName: first_name,
        lastName: last_name,
        streamName: stream_display_name,
        class: current_class,
        ...rest,
    }));

export const CourseDetailsSchema = z
    .object({
        course_id: z.string(),
        course_name: z.string(),
        enrolled_batches: z.array(z.string()),
        unenrolled_batches: z.array(z.string()),
        start_date: z.string(),
        end_date: z.string(),
        session: z.string(),
    })
    .transform(v => ({
        courseID: v.course_id,
        courseName: v.course_name,
        enrolledBatches: v.enrolled_batches,
        unenrolledBatches: v.unenrolled_batches,
        startDate: v.start_date,
        endDate: v.end_date,
        session: v.session,
    }));

export const DataObjectSchema = z
    .object({
        student_detail: StudentDetailsObjectSchema,
        course_details: z.array(CourseDetailsSchema),
    })
    .transform(({ student_detail, course_details }) => ({
        studentDetails: {
            ...student_detail,
            courses: course_details,
        },
    }));

export const StudentDetailsSchema = z
    .object({
        status: z.literal(200),
        reason: z.literal("OK"),
        data: DataObjectSchema,
    })
    .transform(({ data: { studentDetails } }) => studentDetails);
