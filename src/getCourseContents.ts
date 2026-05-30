import { subjects, selectedCourseID } from "./config.js";
import getSubjectContents from "./getSubjectContents.js";

export default async function getCourseContents() {
    // const subjects = [{ title: "Chemistry", subjectID: "2" }];

    const promises = [];

    subjects.forEach(subject => {
        promises.push(getSubjectContents(subject.subjectID));
        subject.cards = promises.length - 1;
    });

    const resolvedPromises = await Promise.all(promises);
    subjects.forEach(subject => (subject.cards = resolvedPromises[subject.cards]));

    return { title: selectedCourseID, cards: subjects };
}
