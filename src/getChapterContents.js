import { uri, headers, commonParams } from "./globals.js";
import { rateLimiter } from "./globals.js";

const CDN_HEADERS = {
    "Referer": "https://allen.in/",
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};

/**
 * Given a master.m3u8 URL, fetches it and returns the direct 720_video.mp4 URL
 * (or the highest quality available).
 */
async function resolveVideoUrl(masterM3u8Url) {
    const uuidMatch = masterM3u8Url.match(/content\.allen\.in\/([^/]+)\//);
    if (!uuidMatch) return null;

    const uuid = uuidMatch[1];
    const baseUrl = `https://content.allen.in/${uuid}/playlists/ALLEN/x264/`;

    const res = await fetch(masterM3u8Url, { headers: CDN_HEADERS });
    if (!res.ok) return null;

    const m3u8 = await res.text();
    const lines = m3u8.split("\n");

    let best720pStream = null;
    let highestBandwidthStream = null;
    let highestBandwidth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

        const streamPath = lines[i + 1]?.trim();
        if (!streamPath || !streamPath.startsWith("hdntl=")) continue;

        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const bw = bwMatch ? parseInt(bwMatch[1]) : 0;

        if (line.includes("RESOLUTION=1280x720")) {
            best720pStream = streamPath;
        }

        if (bw > highestBandwidth) {
            highestBandwidth = bw;
            highestBandwidthStream = streamPath;
        }
    }

    const chosenStream = best720pStream || highestBandwidthStream;
    if (!chosenStream) return null;

    // The stream path looks like: hdntl=exp=...~acl=...~hmac=.../stream_3.m3u8
    // Replace the stream filename with 720_video.mp4 to get the direct video file
    const videoPath = chosenStream.replace(/\/stream_\d+\.m3u8$/, "/720_video.mp4");
    return baseUrl + videoPath;
}

export default async function getChapterContents({ topicID, subjectID }) {
    const params = new URLSearchParams(commonParams);
    params.append("topic_id", topicID);
    params.append("subject_id", subjectID);

    const body = JSON.stringify({
        page_url: `/topic-details?${params.toString()}`,
    });

    const reqID = rateLimiter.request(uri, {
        headers,
        method: "POST",
        body,
    });

    const res = await rateLimiter.getResponse(reqID);
    const obj = JSON.parse(Buffer.concat(res.buffers).toString());

    // Collect all video items from all widgets that have a contents_list
    const widgets = obj.data.page_content.widgets;
    const videoItems = [];

    for (const widget of widgets) {
        const contentsList = widget.data?.data?.contents_list;
        if (!Array.isArray(contentsList)) continue;

        for (const item of contentsList) {
            const itemUri = item.content_action?.data?.uri;
            const title = item.content_action?.data?.title || item.content_title;

            // Only include video items — those with a playlists/m3u8 URI
            if (itemUri?.includes("/playlists/") && title) {
                videoItems.push({ title, masterM3u8Url: itemUri });
            }
        }
    }

    if (videoItems.length === 0) return [];

    // Resolve each master.m3u8 → 720_video.mp4 URL concurrently
    const results = await Promise.all(
        videoItems.map(async ({ title, masterM3u8Url }) => {
            try {
                const videoUrl = await resolveVideoUrl(masterM3u8Url);
                if (!videoUrl) return null;
                return { title, uri: videoUrl };
            } catch (err) {
                console.log(`Failed to resolve video URL for "${title}": ${err.message}`);
                return null;
            }
        }),
    );

    return results.filter(r => r != null);
}
