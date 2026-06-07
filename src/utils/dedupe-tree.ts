import type { TreeNode } from "@/types/tree-node";
import lodash from "lodash";

export function dedupeTree<
    InternalNode extends object & { $?: never },
    LeafNode extends object & { $?: never } = InternalNode,
>(node: TreeNode<InternalNode, LeafNode>): TreeNode<InternalNode, LeafNode> {
    if ("$" in node) {
        const deduped = node.$.map(dedupeTree);
        return { ...node, $: lodash.uniqWith(deduped, lodash.isEqual) };
    }

    return node;
}
