export type TreeNode<T extends object> = {
    $?: TreeNode<T>[];
} & T;
