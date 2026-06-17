import type { TreeNode } from "./tree-node";

export type ContentLeafNodeType = {
    name: string;
    url: string;
};

export type ChapterLeafNodeType = {
    id: string;
    name: string;
    $chapter: true;
    subjectID: string;
};

export type ChapterContentTreeNodeType = TreeNode<{ name: string }, ContentLeafNodeType | ChapterLeafNodeType>;
export type ContentTreeNodeType = TreeNode<{ name: string }, { name: string; url: string; id: string }>;
