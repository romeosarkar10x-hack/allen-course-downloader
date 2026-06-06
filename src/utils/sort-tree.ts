import type { TreeNode } from "@/types/tree-node";

export function sortTree<T extends object>(root: TreeNode<T>, compareFn: (a: TreeNode<T>, b: TreeNode<T>) => number) {
    (function sortTreeRecursive(node: TreeNode<T>) {
        if ("$" in node) {
            const childNodes = node.$;
            childNodes.forEach(childNode => sortTreeRecursive(childNode));
            childNodes.sort(compareFn);
        }
    })(root);
}
