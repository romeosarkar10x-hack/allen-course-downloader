import type { TreeNode } from "@/types/tree-node";
import lodash from "lodash";

export function dedupeTree<T extends object>(node: TreeNode<T>): TreeNode<T> {
    if (!("$" in node)) {
        return node;
    }

    const deduped = node.$.map(dedupeTree);
    return { ...node, $: lodash.uniqWith(deduped, lodash.isEqual) };
}
