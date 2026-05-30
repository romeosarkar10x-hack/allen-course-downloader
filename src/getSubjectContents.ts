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

    const list = obj.data.tab_data[0].tab_info.page_data.page_content.widgets[1].data.list.map(e => {
        return { title: e.title, cards: e.cards };
    });

    const modules = list.map(chapters => {
        return {
            title: chapters.title,
            cards: chapters.cards.map(chapter => {
                return {
                    title: chapter.title,
                    topicID: chapter.action.data.query.topic_id,
                    subjectID,
                };
            }),
        };
    });

    // console.log(JSON.stringify(modules, null, 2));
    // console.log(list);

    const promises = [];

    modules.forEach(({ cards }) => {
        cards.forEach(chapter => {
            promises.push(getChapterContents(chapter));
            chapter.cards = promises.length - 1;
        });
    });

    const promisesResolved = await Promise.all(promises);
    modules.forEach(({ cards }) => {
        cards.forEach(chapter => {
            chapter.cards = promisesResolved[chapter.cards];
        });
    });

    return modules;
}
