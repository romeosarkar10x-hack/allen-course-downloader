import type { TreeNode } from "@/types/tree-node";

export function sortTree(root: TreeNode, compareFn?: (a: TreeNode, b: TreeNode) => number) {
    (function sortTreeRecursive(node: TreeNode) {
        if ("$" in node) {
            const childNodes = node.$;
            childNodes.forEach(childNode => sortTreeRecursive(childNode));
            childNodes.sort(compareFn ?? ((a, b) => a.name.localeCompare(b.name)));
        }
    })(root);
}
