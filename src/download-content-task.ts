import fs from "node:fs/promises";
import { Parser } from "m3u8-parser";
import { safeFetch } from "./utils/safe-fetch";
import { parseResponseText } from "./utils/parse-response-text";
import { errAsync, fromPromise, okAsync, ResultAsync } from "neverthrow";
import { $ } from "zx";
import { parseResponseBuffer } from "./utils/parse-response-buffer";

export function downloadContentTask(url: string, filePathname: string) {
    return async function () {
        const resultAsync = (function () {
            if (new URL(url).pathname.endsWith("master.m3u8")) {
                return m3u8VideoDownload(url, filePathname);
            } else if (new URL(url).pathname.endsWith(".pdf")) {
                return contentDownload(url, filePathname + ".pdf");
            }

            throw new Error("Unknown content type");
        })();

        const result = await resultAsync;

        if (result.isErr()) {
            throw result.error;
        }
    };
}

function contentDownload(url: string, filePathname: string) {
    return safeFetch(url)
        .andThen(parseResponseBuffer)
        .andThen(responseBuffer =>
            fromPromise(fs.writeFile(filePathname, new Uint8Array(responseBuffer)), error => {
                return error as NodeJS.ErrnoException;
            }),
        );
}

function getAudioAndVideoURLs(masterURL: string) {
    return safeFetch(masterURL)
        .andThen(parseResponseText)
        .andThen(masterText => {
            const parser = new Parser();
            parser.push(masterText);
            parser.end();

            const playlists = parser.manifest.playlists;

            if (playlists === undefined || playlists.length === 0) {
                return errAsync(new Error("No playlists found in master"));
            }

            const sorted = playlists.sort((a, b) => (b.attributes.BANDWIDTH ?? 0) - (a.attributes.BANDWIDTH ?? 0));
            const bestQualityPlaylist = sorted[0]!;
            const bestQualityPlaylistURI = bestQualityPlaylist.uri;

            const audioGroups = parser.manifest.mediaGroups!["AUDIO"];

            if (audioGroups === undefined) {
                return errAsync(new Error("No audio groups found in master"));
            }

            const audioGroupID = bestQualityPlaylist.attributes.AUDIO;

            if (audioGroupID === undefined) {
                return errAsync(new Error("No audio group id found for best quality playlist"));
            }

            const tracks = audioGroups[audioGroupID];

            if (tracks === undefined || Object.values(tracks).length === 0) {
                return errAsync(new Error(`No audio tracks found for group id: ${audioGroupID}`));
            }

            const bestAudioTrack = Object.values(tracks)[0]!;
            const bestAudioTrackURI = bestAudioTrack.uri;

            if (bestAudioTrackURI === undefined) {
                return errAsync(
                    new Error(`No uri found for audio track: ${bestAudioTrack.language}, group id: ${audioGroupID}`),
                );
            }

            const audioPlaylistURL = new URL(bestAudioTrackURI, masterURL).href;
            const videoPlaylistURL = new URL(bestQualityPlaylistURI, masterURL).href;

            return okAsync({
                audioPlaylistURL,
                videoPlaylistURL,
            });
        });
}

function getMediaPlaylistURL(mediaPlaylistURL: string) {
    return safeFetch(mediaPlaylistURL)
        .andThen(parseResponseText)
        .andThen(manifest => {
            const parser = new Parser();
            parser.push(manifest);
            parser.end();

            const parsed = parser.manifest;

            const segment = parsed.segments[0];

            if (segment === undefined) {
                return errAsync(new Error("No segments found in playlist manifest"));
            }

            const url = new URL(segment.uri, mediaPlaylistURL);
            return okAsync(url);
        });
}

function downloadFile(url: string | URL, filePathname: string) {
    return safeFetch(url)
        .andThen(parseResponseBuffer)
        .andThen(buffer => {
            return fromPromise(fs.writeFile(filePathname, new Uint8Array(buffer)), error => {
                return new Error(`Failed to write response to file: ${filePathname}`, {
                    cause: error,
                });
            });
        });
}

function mergeAudioAndVideo(audioFilePathname: string, videoFilePathname: string, outputFilePathname: string) {
    return fromPromise(
        $`ffmpeg -i ${audioFilePathname} -i ${videoFilePathname} -c copy ${outputFilePathname} -y`,
        error => {
            return new Error(
                `Failed to run ffmpeg with audio file: ${audioFilePathname} and video file: ${videoFilePathname}`,
                {
                    cause: error,
                },
            );
        },
    ).map(() => {});
}

function m3u8VideoDownload(url: string, pathname: string) {
    const audioFilePathname = pathname + ".tmp.__audio__.mp4";
    const videoFilePathname = pathname + ".tmp.__video__.mp4";

    return getAudioAndVideoURLs(url)
        .andThen(({ audioPlaylistURL, videoPlaylistURL }) => {
            return ResultAsync.combine([
                getMediaPlaylistURL(audioPlaylistURL),
                getMediaPlaylistURL(videoPlaylistURL),
            ]).map(([audioURL, videoURL]) => ({ audioURL, videoURL }));
        })
        .andThen(({ audioURL, videoURL }) =>
            ResultAsync.combine([downloadFile(audioURL, audioFilePathname), downloadFile(videoURL, videoFilePathname)]),
        )
        .andThen(mergeAudioAndVideo.bind(null, audioFilePathname, videoFilePathname, pathname))
        .andThen(() => ResultAsync.combine([deleteFile(audioFilePathname), deleteFile(videoFilePathname)]));
}

function deleteFile(pathname: string) {
    async function unlink() {
        const MAX_RETRIES = 5;
        const TIMEOUT_MILLIS = 5000;

        let numRetries = 0;
        let e: unknown;

        while (numRetries <= MAX_RETRIES) {
            try {
                await fs.unlink(pathname);
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EBUSY") {
                    throw error;
                }

                e = error;
                numRetries++;
                await new Promise(r => setTimeout(r, TIMEOUT_MILLIS));
            }
        }

        if (numRetries > MAX_RETRIES) {
            throw new Error(`Failed to delete file: ${pathname}`, { cause: e });
        }
    }

    return fromPromise(unlink(), error => error as Error);
}
