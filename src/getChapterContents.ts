import { uri, headers, commonParams } from "./globals.js";
import { rateLimiter } from "./globals.js";

export default async function getChapterContents({ topicID, subjectID }) {
    const params = new URLSearchParams(commonParams);
    params.append("topic_id", topicID);
    params.append("subject_id", subjectID);

    const body = JSON.stringify({
        page_url: `/topic-content?${params.toString()}`,
    });

    /*
    const res = await fetch(uri, {
        headers,
        method: "POST",
        body,
    });
    */

    const reqID = rateLimiter.request(uri, {
        headers,
        method: "POST",
        body,
    });

    // const obj = await res.json();

    const res = await rateLimiter.getResponse(reqID);
    const obj = JSON.parse(Buffer.concat(res.buffers).toString());

    const module = obj.data.tab_data[0].tab_info.page_data.page_content.widgets[0].data.cards;
    // const module = { title: widget.data.title, cards: widget.data.cards };

    if (module == null) {
        return [];
    }

    return module.map(card => {
        return {
            title: card.action.data.title,
            uri: card.action.data.uri,
        };
    });
    // console.log("module:", module);

    /*
    const chaptersFiltered = chapters.map(chapter =>
        chapter.cards.map    );

    console.log("widgetsFiltered:", widgetsFiltered);
    return widgetsFiltered;
    */
    // return module;
}
