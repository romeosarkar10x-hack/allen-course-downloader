
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

export type ContentNodeType =
    | {
          name: string;
          $?: ContentNodeType[];
      }
    | ContentLeafNodeType;

export type ChapterContentNodeType =
    | {
          name: string;
          $?: ChapterContentNodeType[];
      }
    | ContentLeafNodeType
    | ChapterLeafNodeType;
