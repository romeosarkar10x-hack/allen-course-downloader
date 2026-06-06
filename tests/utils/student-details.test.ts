import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    StudentDetailsObjectSchema,
    CourseDetailsSchema,
    DataObjectSchema,
    StudentDetailsSchema,
} from "@/schemas/student-details";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const fixtureRaw = readFileSync(join(import.meta.dirname, "../fixtures/student-details.json"), "utf-8");
const fixture = JSON.parse(fixtureRaw);

function cloneFixture(): typeof fixture {
    return JSON.parse(fixtureRaw);
}

// ---------------------------------------------------------------------------
// Minimal builder helpers (smallest valid shape each schema accepts)
// ---------------------------------------------------------------------------

function makeStudentDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        email: "student@example.com",
        phone: "1234567890",
        first_name: "Jane",
        last_name: "Doe",
        dob: "01-01-2000",
        gender: "FEMALE",
        stream: "STREAM_JEE_MAIN_ADVANCED",
        stream_display_name: "JEE Advanced",
        current_class: "CLASS_12",
        ...overrides,
    };
}

function makeCourseDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        course_id: "cr_1",
        course_name: "Course One",
        enrolled_batches: ["bt_a", "bt_b"],
        unenrolled_batches: ["bt_c"],
        start_date: "01-01-2024",
        end_date: "31-12-2024",
        session: "04-2024 - 03-2025",
        ...overrides,
    };
}

function makeDataObject(
    studentOverrides: Record<string, unknown> = {},
    courses: unknown[] = [makeCourseDetail()],
): Record<string, unknown> {
    return {
        student_detail: makeStudentDetail(studentOverrides),
        course_details: courses,
    };
}

function makeResponse(data: unknown = makeDataObject()): Record<string, unknown> {
    return {
        status: 200,
        reason: "OK",
        data,
    };
}

// ===========================================================================
describe("student-details StudentDetailsObjectSchema", () => {
    test("parses a valid student detail", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail()).success).toBe(true);
    });

    test("renames first_name → firstName", () => {
        const result = StudentDetailsObjectSchema.parse(makeStudentDetail({ first_name: "Srija" })) as Record<
            string,
            unknown
        >;
        expect(result.firstName).toBe("Srija");
        expect("first_name" in result).toBe(false);
    });

    test("renames last_name → lastName", () => {
        const result = StudentDetailsObjectSchema.parse(makeStudentDetail({ last_name: "Sarkar" })) as Record<
            string,
            unknown
        >;
        expect(result.lastName).toBe("Sarkar");
        expect("last_name" in result).toBe(false);
    });

    test("renames stream_display_name → streamName", () => {
        const result = StudentDetailsObjectSchema.parse(
            makeStudentDetail({ stream_display_name: "JEE Advanced" }),
        ) as Record<string, unknown>;
        expect(result.streamName).toBe("JEE Advanced");
        expect("stream_display_name" in result).toBe(false);
    });

    test("renames current_class → class", () => {
        const result = StudentDetailsObjectSchema.parse(makeStudentDetail({ current_class: "CLASS_12" })) as Record<
            string,
            unknown
        >;
        expect(result.class).toBe("CLASS_12");
        expect("current_class" in result).toBe(false);
    });

    test("passes through email, phone, gender and stream unchanged", () => {
        const result = StudentDetailsObjectSchema.parse(
            makeStudentDetail({
                email: "keep@example.com",
                phone: "9998887776",
                gender: "MALE",
                stream: "STREAM_JEE_MAIN_ADVANCED",
            }),
        ) as Record<string, unknown>;
        expect(result.email).toBe("keep@example.com");
        expect(result.phone).toBe("9998887776");
        expect(result.gender).toBe("MALE");
        expect(result.stream).toBe("STREAM_JEE_MAIN_ADVANCED");
    });

    test("passes dob through unchanged in the output", () => {
        const result = StudentDetailsObjectSchema.parse(makeStudentDetail({ dob: "14-11-2007" })) as Record<
            string,
            unknown
        >;
        expect(result.dob).toBe("14-11-2007");
    });

    test("output has exactly the 9 expected keys (including dob)", () => {
        const result = StudentDetailsObjectSchema.parse(makeStudentDetail()) as Record<string, unknown>;
        expect(Object.keys(result).sort()).toEqual(
            ["firstName", "lastName", "streamName", "class", "email", "phone", "gender", "stream", "dob"].sort(),
        );
    });

    test("fully maps a complete student object", () => {
        const result = StudentDetailsObjectSchema.parse(
            makeStudentDetail({
                email: "a@b.com",
                phone: "111",
                first_name: "First",
                last_name: "Last",
                dob: "02-02-2002",
                gender: "FEMALE",
                stream: "S",
                stream_display_name: "Stream Display",
                current_class: "CLASS_11",
            }),
        );
        expect(result).toEqual({
            email: "a@b.com",
            phone: "111",
            firstName: "First",
            lastName: "Last",
            dob: "02-02-2002",
            gender: "FEMALE",
            stream: "S",
            streamName: "Stream Display",
            class: "CLASS_11",
        });
    });

    test("accepts gender MALE", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ gender: "MALE" })).success).toBe(true);
    });

    test("accepts gender FEMALE", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ gender: "FEMALE" })).success).toBe(true);
    });

    test("rejects gender GENDER_UNSPECIFIED (not in the enum)", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ gender: "GENDER_UNSPECIFIED" })).success).toBe(
            false,
        );
    });

    test("rejects an arbitrary gender value", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ gender: "OTHER" })).success).toBe(false);
    });

    test("rejects an invalid email", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ email: "not-an-email" })).success).toBe(false);
    });

    test("rejects an empty-string email", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ email: "" })).success).toBe(false);
    });

    test("accepts a well-formed email", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ email: "x.y+z@sub.domain.co" })).success).toBe(
            true,
        );
    });

    test("requires dob", () => {
        const input = makeStudentDetail();
        delete input.dob;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing email", () => {
        const input = makeStudentDetail();
        delete input.email;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing phone", () => {
        const input = makeStudentDetail();
        delete input.phone;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing first_name", () => {
        const input = makeStudentDetail();
        delete input.first_name;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing last_name", () => {
        const input = makeStudentDetail();
        delete input.last_name;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing gender", () => {
        const input = makeStudentDetail();
        delete input.gender;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing stream", () => {
        const input = makeStudentDetail();
        delete input.stream;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing stream_display_name", () => {
        const input = makeStudentDetail();
        delete input.stream_display_name;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing current_class", () => {
        const input = makeStudentDetail();
        delete input.current_class;
        expect(StudentDetailsObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects non-string phone", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ phone: 1234567890 })).success).toBe(false);
    });

    test("rejects non-string first_name", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ first_name: 5 })).success).toBe(false);
    });

    test("rejects non-string dob", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ dob: 20070101 })).success).toBe(false);
    });

    test("rejects non-string current_class", () => {
        expect(StudentDetailsObjectSchema.safeParse(makeStudentDetail({ current_class: 12 })).success).toBe(false);
    });

    test("strips unknown extra keys (zod default strip)", () => {
        const result = StudentDetailsObjectSchema.parse(
            makeStudentDetail({ middle_name: "X", blood_group: "B+", profile_photo_url: "https://x" }),
        ) as Record<string, unknown>;
        expect("middle_name" in result).toBe(false);
        expect("blood_group" in result).toBe(false);
        expect("profile_photo_url" in result).toBe(false);
    });

    test("rejects null", () => {
        expect(StudentDetailsObjectSchema.safeParse(null).success).toBe(false);
    });

    test("rejects empty object", () => {
        expect(StudentDetailsObjectSchema.safeParse({}).success).toBe(false);
    });

    test("parses the fixture's student_detail sub-object", () => {
        const result = StudentDetailsObjectSchema.parse(fixture.data.student_detail);
        expect(result).toEqual({
            email: "pampaghoshabc@gmail.com",
            phone: "7908746812",
            firstName: "Srija",
            lastName: "Sarkar",
            dob: "14-11-2007",
            gender: "FEMALE",
            stream: "STREAM_JEE_MAIN_ADVANCED",
            streamName: "JEE Advanced",
            class: "CLASS_12",
        });
    });
});

// ===========================================================================
describe("student-details CourseDetailsSchema", () => {
    test("parses a valid course detail", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail()).success).toBe(true);
    });

    test("renames course_id → courseID", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail({ course_id: "cr_xyz" })) as Record<string, unknown>;
        expect(result.courseID).toBe("cr_xyz");
        expect("course_id" in result).toBe(false);
    });

    test("renames course_name → courseName", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail({ course_name: "My Course" })) as Record<
            string,
            unknown
        >;
        expect(result.courseName).toBe("My Course");
        expect("course_name" in result).toBe(false);
    });

    test("renames enrolled_batches → enrolledBatches", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail({ enrolled_batches: ["a", "b"] })) as Record<
            string,
            unknown
        >;
        expect(result.enrolledBatches).toEqual(["a", "b"]);
        expect("enrolled_batches" in result).toBe(false);
    });

    test("renames unenrolled_batches → unenrolledBatches", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail({ unenrolled_batches: ["c"] })) as Record<
            string,
            unknown
        >;
        expect(result.unenrolledBatches).toEqual(["c"]);
        expect("unenrolled_batches" in result).toBe(false);
    });

    test("renames start_date → startDate and end_date → endDate", () => {
        const result = CourseDetailsSchema.parse(
            makeCourseDetail({ start_date: "01-01-2024", end_date: "31-12-2024" }),
        ) as Record<string, unknown>;
        expect(result.startDate).toBe("01-01-2024");
        expect(result.endDate).toBe("31-12-2024");
        expect("start_date" in result).toBe(false);
        expect("end_date" in result).toBe(false);
    });

    test("passes session through unchanged in the output", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail({ session: "04-2024 - 03-2025" })) as Record<
            string,
            unknown
        >;
        expect(result.session).toBe("04-2024 - 03-2025");
    });

    test("output has exactly the 7 expected keys (including session)", () => {
        const result = CourseDetailsSchema.parse(makeCourseDetail()) as Record<string, unknown>;
        expect(Object.keys(result).sort()).toEqual(
            ["courseID", "courseName", "enrolledBatches", "unenrolledBatches", "startDate", "endDate", "session"].sort(),
        );
    });

    test("fully maps a complete course object", () => {
        const result = CourseDetailsSchema.parse(
            makeCourseDetail({
                course_id: "cr_1",
                course_name: "Name",
                enrolled_batches: ["e1", "e2"],
                unenrolled_batches: ["u1"],
                start_date: "S",
                end_date: "E",
                session: "04-2024 - 03-2025",
            }),
        );
        expect(result).toEqual({
            courseID: "cr_1",
            courseName: "Name",
            enrolledBatches: ["e1", "e2"],
            unenrolledBatches: ["u1"],
            startDate: "S",
            endDate: "E",
            session: "04-2024 - 03-2025",
        });
    });

    test("accepts empty enrolled_batches and unenrolled_batches arrays", () => {
        const result = CourseDetailsSchema.parse(
            makeCourseDetail({ enrolled_batches: [], unenrolled_batches: [] }),
        ) as Record<string, unknown>;
        expect(result.enrolledBatches).toEqual([]);
        expect(result.unenrolledBatches).toEqual([]);
    });

    test("requires session", () => {
        const input = makeCourseDetail();
        delete input.session;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing course_id", () => {
        const input = makeCourseDetail();
        delete input.course_id;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing course_name", () => {
        const input = makeCourseDetail();
        delete input.course_name;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing enrolled_batches", () => {
        const input = makeCourseDetail();
        delete input.enrolled_batches;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing unenrolled_batches", () => {
        const input = makeCourseDetail();
        delete input.unenrolled_batches;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing start_date", () => {
        const input = makeCourseDetail();
        delete input.start_date;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing end_date", () => {
        const input = makeCourseDetail();
        delete input.end_date;
        expect(CourseDetailsSchema.safeParse(input).success).toBe(false);
    });

    test("rejects enrolled_batches that is not an array", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail({ enrolled_batches: "bt_a" })).success).toBe(false);
    });

    test("rejects enrolled_batches with non-string elements", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail({ enrolled_batches: [1, 2] })).success).toBe(false);
    });

    test("rejects unenrolled_batches with non-string elements", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail({ unenrolled_batches: [null] })).success).toBe(false);
    });

    test("rejects non-string course_id", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail({ course_id: 1 })).success).toBe(false);
    });

    test("rejects non-string session", () => {
        expect(CourseDetailsSchema.safeParse(makeCourseDetail({ session: 12345 })).success).toBe(false);
    });

    test("strips unknown extra keys (stream, class, sequence, course_type, …)", () => {
        const result = CourseDetailsSchema.parse(
            makeCourseDetail({ stream: "JEE Adv.", class: "12th", sequence: 1, course_type: 2 }),
        ) as Record<string, unknown>;
        expect("stream" in result).toBe(false);
        expect("class" in result).toBe(false);
        expect("sequence" in result).toBe(false);
        expect("course_type" in result).toBe(false);
    });

    test("rejects null", () => {
        expect(CourseDetailsSchema.safeParse(null).success).toBe(false);
    });

    test("rejects empty object", () => {
        expect(CourseDetailsSchema.safeParse({}).success).toBe(false);
    });

    test("parses the fixture's first course_details entry", () => {
        const result = CourseDetailsSchema.parse(fixture.data.course_details[0]);
        expect(result).toEqual({
            courseID: "cr_ifsxXemTSLnySt6Duju9v",
            courseName: "JEE(M+A)_12_JEE Enthusiast Online Course: Target 2026_Live_Hindi + English",
            enrolledBatches: [
                "bt_ORA8IvlO0uJrgUzCpqDD2",
                "bt_6iTAx9qGKWOtlHNKHXtAy",
                "bt_4lsHiXc2Q4n7ixreMiqFf",
                "bt_6LlBjESE33kt0khvPQdgu",
                "bt_n5tA1oHiHB5X1y1XOkkZc",
                "bt_3scoa5ObDiRg5C7BgcasI",
                "bt_lgugkrexGcdNFoMB5B7T9",
                "bt_fvy9VMozVEbyFtR6axQhi",
                "bt_r1sCnVh70lmgIDWLjoPZT",
                "bt_hC1SBV6mmRPc2HsHzTAbd",
                "bt_GdnoJEv5jveY2NP6CKaUU",
            ],
            unenrolledBatches: [
                "bt_Eu5fNGJVdWnOsYx0Gln0c",
                "bt_1q5nGW30RrJUQGMVBzP6e",
                "bt_2ZtJAkCb30rjG3BtWTjki",
                "bt_nYFmT9pVTYBEsEit4Pcnv",
                "bt_NuEXZHxrL8iq6cbuXzX2c",
                "bt_9ZcSWPclJdOZLlV0j1b4y",
                "bt_ZRcfokhD8PuAGgCo0r6Ig",
            ],
            startDate: "23-12-2024",
            endDate: "31-05-2026",
            session: "04-2025 - 03-2026",
        });
    });
});

// ===========================================================================
describe("student-details DataObjectSchema", () => {
    test("parses a valid data object", () => {
        expect(DataObjectSchema.safeParse(makeDataObject()).success).toBe(true);
    });

    test("wraps the result under a single studentDetails key", () => {
        const result = DataObjectSchema.parse(makeDataObject()) as Record<string, unknown>;
        expect(Object.keys(result)).toEqual(["studentDetails"]);
    });

    test("studentDetails spreads the transformed student_detail fields", () => {
        const result = DataObjectSchema.parse(
            makeDataObject({ first_name: "Srija", last_name: "Sarkar" }),
        ) as { studentDetails: Record<string, unknown> };
        expect(result.studentDetails.firstName).toBe("Srija");
        expect(result.studentDetails.lastName).toBe("Sarkar");
    });

    test("studentDetails carries a courses array built from course_details", () => {
        const result = DataObjectSchema.parse(
            makeDataObject({}, [makeCourseDetail({ course_id: "cr_a" }), makeCourseDetail({ course_id: "cr_b" })]),
        ) as { studentDetails: { courses: Array<{ courseID: string }> } };
        expect(result.studentDetails.courses.map(c => c.courseID)).toEqual(["cr_a", "cr_b"]);
    });

    test("course_details entries are transformed (renamed keys) inside courses", () => {
        const result = DataObjectSchema.parse(makeDataObject()) as {
            studentDetails: { courses: Array<Record<string, unknown>> };
        };
        expect(Object.keys(result.studentDetails.courses[0]!).sort()).toEqual(
            ["courseID", "courseName", "enrolledBatches", "unenrolledBatches", "startDate", "endDate", "session"].sort(),
        );
    });

    test("empty course_details produces an empty courses array", () => {
        const result = DataObjectSchema.parse(makeDataObject({}, [])) as {
            studentDetails: { courses: unknown[] };
        };
        expect(result.studentDetails.courses).toEqual([]);
    });

    test("studentDetails has exactly the student fields plus courses", () => {
        const result = DataObjectSchema.parse(makeDataObject()) as {
            studentDetails: Record<string, unknown>;
        };
        expect(Object.keys(result.studentDetails).sort()).toEqual(
            [
                "firstName",
                "lastName",
                "streamName",
                "class",
                "email",
                "phone",
                "dob",
                "gender",
                "stream",
                "courses",
            ].sort(),
        );
    });

    test("rejects missing student_detail", () => {
        const input = makeDataObject();
        delete input.student_detail;
        expect(DataObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing course_details", () => {
        const input = makeDataObject();
        delete input.course_details;
        expect(DataObjectSchema.safeParse(input).success).toBe(false);
    });

    test("rejects course_details that is not an array", () => {
        expect(
            DataObjectSchema.safeParse({ student_detail: makeStudentDetail(), course_details: "nope" }).success,
        ).toBe(false);
        expect(
            DataObjectSchema.safeParse({ student_detail: makeStudentDetail(), course_details: {} }).success,
        ).toBe(false);
    });

    test("rejects an invalid student_detail (bad gender)", () => {
        expect(DataObjectSchema.safeParse(makeDataObject({ gender: "UNKNOWN" })).success).toBe(false);
    });

    test("rejects when one course in the array is invalid", () => {
        const badCourse = makeCourseDetail();
        delete badCourse.session;
        expect(DataObjectSchema.safeParse(makeDataObject({}, [makeCourseDetail(), badCourse])).success).toBe(false);
    });

    test("strips extra sibling keys (parent_detail, student_batch_detail, otp_details)", () => {
        const input = {
            ...makeDataObject(),
            parent_detail: { email: "" },
            student_batch_detail: [],
            otp_details: {},
        };
        const result = DataObjectSchema.parse(input) as Record<string, unknown>;
        expect(Object.keys(result)).toEqual(["studentDetails"]);
    });

    test("rejects null", () => {
        expect(DataObjectSchema.safeParse(null).success).toBe(false);
    });

    test("rejects empty object", () => {
        expect(DataObjectSchema.safeParse({}).success).toBe(false);
    });

    test("parses the fixture's data object", () => {
        const result = DataObjectSchema.parse(fixture.data) as {
            studentDetails: { firstName: string; courses: unknown[] };
        };
        expect(result.studentDetails.firstName).toBe("Srija");
        expect(result.studentDetails.courses).toHaveLength(2);
    });
});

// ===========================================================================
describe("student-details StudentDetailsSchema", () => {
    // -----------------------------------------------------------------------
    describe("real fixture — integration", () => {
        test("parses the full student-details.json fixture without throwing", () => {
            expect(() => StudentDetailsSchema.parse(fixture)).not.toThrow();
        });

        test("safeParse on the valid fixture returns success=true", () => {
            expect(StudentDetailsSchema.safeParse(fixture).success).toBe(true);
        });

        test("unwraps the envelope and returns the studentDetails object directly", () => {
            const result = StudentDetailsSchema.parse(fixture) as Record<string, unknown>;
            // It is NOT wrapped: no `studentDetails`, no `data`, no `status`.
            expect("studentDetails" in result).toBe(false);
            expect("data" in result).toBe(false);
            expect("status" in result).toBe(false);
        });

        test("returns the fully transformed student fields from the fixture", () => {
            const result = StudentDetailsSchema.parse(fixture) as Record<string, unknown>;
            expect(result.email).toBe("pampaghoshabc@gmail.com");
            expect(result.phone).toBe("7908746812");
            expect(result.firstName).toBe("Srija");
            expect(result.lastName).toBe("Sarkar");
            expect(result.gender).toBe("FEMALE");
            expect(result.stream).toBe("STREAM_JEE_MAIN_ADVANCED");
            expect(result.streamName).toBe("JEE Advanced");
            expect(result.class).toBe("CLASS_12");
        });

        test("passes dob through in the fixture result", () => {
            const result = StudentDetailsSchema.parse(fixture) as Record<string, unknown>;
            expect(result.dob).toBe("14-11-2007");
        });

        test("the fixture result has exactly the student fields plus courses", () => {
            const result = StudentDetailsSchema.parse(fixture) as Record<string, unknown>;
            expect(Object.keys(result).sort()).toEqual(
                [
                    "firstName",
                    "lastName",
                    "streamName",
                    "class",
                    "email",
                    "phone",
                    "dob",
                    "gender",
                    "stream",
                    "courses",
                ].sort(),
            );
        });

        test("the fixture yields exactly 2 courses", () => {
            const result = StudentDetailsSchema.parse(fixture) as { courses: unknown[] };
            expect(result.courses).toHaveLength(2);
        });

        test("each fixture course is fully transformed with the expected keys", () => {
            const result = StudentDetailsSchema.parse(fixture) as {
                courses: Array<Record<string, unknown>>;
            };
            for (const course of result.courses) {
                expect(Object.keys(course).sort()).toEqual(
                    [
                        "courseID",
                        "courseName",
                        "enrolledBatches",
                        "unenrolledBatches",
                        "startDate",
                        "endDate",
                        "session",
                    ].sort(),
                );
                expect(typeof course.courseID).toBe("string");
                expect(typeof course.courseName).toBe("string");
                expect(Array.isArray(course.enrolledBatches)).toBe(true);
                expect(Array.isArray(course.unenrolledBatches)).toBe(true);
            }
        });

        test("the second fixture course is mapped correctly", () => {
            const result = StudentDetailsSchema.parse(fixture) as {
                courses: Array<Record<string, unknown>>;
            };
            expect(result.courses[1]).toEqual({
                courseID: "course_bxMhJk4o1MGkEp3CKKAad",
                courseName: "JEE Ultimate 11 Eng+Hin ",
                enrolledBatches: ["bt_B8pZxUP9RdEsaiKZNddiH", "bt_4lsHiXc2Q4n7ixreMiqFf"],
                unenrolledBatches: ["batch_Wof06nKjmmXk7m4Zth7aC", "bt_qYK0gEvwHUCL1roVofBoa"],
                startDate: "08-04-2024",
                endDate: "30-06-2025",
                session: "04-2024 - 03-2025",
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("synthetic minimal response", () => {
        test("parses a minimal valid response", () => {
            expect(StudentDetailsSchema.safeParse(makeResponse()).success).toBe(true);
        });

        test("returns the unwrapped studentDetails object", () => {
            const result = StudentDetailsSchema.parse(makeResponse()) as Record<string, unknown>;
            expect(result.firstName).toBe("Jane");
            expect(Array.isArray(result.courses)).toBe(true);
        });

        test("works with an empty courses list", () => {
            const result = StudentDetailsSchema.parse(makeResponse(makeDataObject({}, []))) as { courses: unknown[] };
            expect(result.courses).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    describe("envelope validation", () => {
        test("rejects missing status", () => {
            const input = cloneFixture();
            delete input.status;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects a status other than the literal 200", () => {
            const input = cloneFixture();
            input.status = 404;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects a string '200' status (literal is the number 200)", () => {
            const input = cloneFixture();
            input.status = "200";
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing reason", () => {
            const input = cloneFixture();
            delete input.reason;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects a reason other than the literal 'OK'", () => {
            const input = cloneFixture();
            input.reason = "FAIL";
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects a non-string reason", () => {
            const input = cloneFixture();
            input.reason = 200;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data", () => {
            const input = cloneFixture();
            delete input.data;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.student_detail", () => {
            const input = cloneFixture();
            delete input.data.student_detail;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects missing data.course_details", () => {
            const input = cloneFixture();
            delete input.data.course_details;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects an invalid student gender within the envelope", () => {
            const input = cloneFixture();
            input.data.student_detail.gender = "GENDER_UNSPECIFIED";
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects an invalid student email within the envelope", () => {
            const input = cloneFixture();
            input.data.student_detail.email = "broken";
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("rejects when a course is missing its session within the envelope", () => {
            const input = cloneFixture();
            delete input.data.course_details[0].session;
            expect(StudentDetailsSchema.safeParse(input).success).toBe(false);
        });

        test("strips extra envelope keys but still parses", () => {
            const input = cloneFixture();
            input.extra_top_level = "ignored";
            expect(StudentDetailsSchema.safeParse(input).success).toBe(true);
        });

        test("safeParse on null returns success=false", () => {
            expect(StudentDetailsSchema.safeParse(null).success).toBe(false);
        });

        test("safeParse on an empty object returns success=false", () => {
            expect(StudentDetailsSchema.safeParse({}).success).toBe(false);
        });

        test("safeParse on a string returns success=false with issues", () => {
            const result = StudentDetailsSchema.safeParse("bad");
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.issues.length).toBeGreaterThan(0);
        });

        test("safeParse on an array returns success=false", () => {
            expect(StudentDetailsSchema.safeParse([]).success).toBe(false);
        });
    });
});
