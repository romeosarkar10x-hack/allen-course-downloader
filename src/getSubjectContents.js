import getChapterContents from "./getChapterContents.js";
import { uri, headers, commonParams } from "./globals.js";
import { rateLimiter } from "./globals.js";

export default async function getSubjectContents(subjectID) {
    const params = new URLSearchParams(commonParams);
    params.append("subject_id", subjectID);

    const body = JSON.stringify({
        page_url: `/subject-details?${params.toString()}`,
    });

    /* 
    const res = await fetch(uri, {
        headers,
        method: "POST",
        body,
    });
    */

    // Use rateLimiter
    const reqID = rateLimiter.request(uri, {
        headers,
        method: "POST",
        body,
    });

    // const obj = await res.json();

    const res = await rateLimiter.getResponse(reqID);
    const obj = JSON.parse(Buffer.concat(res.buffers).toString());

    // New API: chapters are in a flat list under widgets[1].data.data.chapters_list.chapters
    // Each chapter uses 'name' instead of 'title', and there are no module groups
    const chapters = obj.data.page_content.widgets[1].data.data.chapters_list.chapters;

    const chapterList = chapters.map(chapter => {
        return {
            title: chapter.name,
            topicID: chapter.action.data.query.topic_id,
            subjectID,
        };
    });

    const promises = [];

    chapterList.forEach(chapter => {
        promises.push(getChapterContents(chapter));
        chapter.cards = promises.length - 1;
    });

    const promisesResolved = await Promise.all(promises);
    chapterList.forEach(chapter => {
        chapter.cards = promisesResolved[chapter.cards];
    });

    // Return as a single module (flat structure — no module grouping in new API)
    return [{ title: "Chapters", cards: chapterList }];
}
