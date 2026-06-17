import z from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import type { TreeNode } from "./types/tree-node";
import { objectSerializer } from "./utils/object-serializer";
import { PersistentState } from "./utils/persistent-state";
import { zodObjectDeserializerFactory } from "./utils/zod-object-deserializer-factory";
import { sanitizeFileName } from "./utils/sanitize-file-name";
import { outputDirectoryResultAsync } from "./lib/output-dir";
import { downloadContentTask } from "./download-content-task";
import { PP } from "./lib/pp";

type DownloadableTreeNode = TreeNode<{ name: string }, { name: string; url: string; id: string }>;

const DownloadSchema = z.record(
    z.string(),
    z.object({
        id: z.uuidv4(),
        // sizeBytes: z.number(),
        // sha256: z.hex().length(64),
    }),
);

const downloadsResultAsync = outputDirectoryResultAsync.map(
    pathname =>
        new PersistentState<z.infer<typeof DownloadSchema>>(
            path.join(pathname, ".downloaded.json"),
            objectSerializer,
            zodObjectDeserializerFactory(DownloadSchema),
            {},
        ),
);

export async function downloadTree(root: DownloadableTreeNode) {
    const downloadedStateResult = await downloadsResultAsync;

    if (downloadedStateResult.isErr()) {
        throw downloadedStateResult.error;
    }

    const outputDirResult = await outputDirectoryResultAsync;

    if (outputDirResult.isErr()) {
        throw outputDirResult.error;
    }

    const downloads = downloadedStateResult.value;
    const outputDirectory = outputDirResult.value;

    async function downloadRecursive(node: DownloadableTreeNode, relativePathname: string) {
        if ("$" in node) {
            const dirName = sanitizeFileName(node.name);
            const dirPathname = path.join(relativePathname, dirName);

            await fs.mkdir(dirPathname, { recursive: true });

            node.$.forEach(child => downloadRecursive(child, dirPathname));
            return;
        }

        const fileName = sanitizeFileName(node.name);
        const filePathname = path.join(relativePathname, fileName);

        const downloaded = await downloads.getState();

        if (filePathname in downloaded) {
            console.log(`Skipped ${filePathname}`);
            return;
        }

        const task = downloadContentTask(node.url, filePathname);
        PP.schedule(task, { filePathname }).promise.then(() => {
            downloads.setState(state => ({ ...state, [filePathname]: { id: node.id } }));
        });
    }

    return downloadRecursive(root, outputDirectory);
}
