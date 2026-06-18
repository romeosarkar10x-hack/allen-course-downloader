import type { TreeNode } from "./tree-node";

export type ContentInternalNodeType = {
    name: string;
};

export type ContentLeafNodeType = {
    id: string;
    name: string;
    url: string;
};

export type ChapterLeafNodeType = {
    id: string;
    name: string;
    $chapter: true;
    subjectID: string;
};

export type SubjectContentTreeNodeType = TreeNode<ContentLeafNodeType>;

export type ChapterContentTreeNodeType = TreeNode<ContentInternalNodeType, ContentLeafNodeType | ChapterLeafNodeType>;
export type ContentTreeNodeType = TreeNode<ContentInternalNodeType, ContentLeafNodeType>;
