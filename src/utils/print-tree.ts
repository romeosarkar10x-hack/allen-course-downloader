import type { TreeNode } from "@/types/tree-node";

const tabWidth = 4;

export type PrintTreeSymbols = {
    /** `│` — vertical line drawn in the indent column for an ancestor that still has more siblings below */
    indentAncestorContinuationLine: string;
    /** `└` — corner connector drawn when this node is the last child of its parent */
    lastChildCornerConnector: string;
    /** `├` — tee connector drawn when this node is a non-last child of its parent */
    midChildTeeConnector: string;
    /** `─` — horizontal fill repeated after the child connector (└─── or ├───) */
    postConnectorHorizontalFill: string;
    /** `┌` — suffix appended to the root node when it has children */
    rootNodeHasChildrenCorner: string;
    /** `─` — suffix appended to the root node when it is a leaf */
    rootLeafNodeTail: string;
    /** `┬` — suffix appended to an inner (non-root) node when it has children */
    innerNodeHasChildrenTee: string;
    /** `─` — suffix appended to an inner (non-root) node when it is a leaf */
    innerLeafNodeTail: string;
    /** `➤` — arrow printed immediately before the node label */
    nodeLabelArrow: string;
};

export function printTree(root: TreeNode<{ name: string }>, symbols?: Partial<PrintTreeSymbols>) {
    const INDENT_ANCESTOR_CONTINUATION_LINE = symbols?.indentAncestorContinuationLine ?? "│";
    const LAST_CHILD_CORNER_CONNECTOR = symbols?.lastChildCornerConnector ?? "└";
    const MID_CHILD_TEE_CONNECTOR = symbols?.midChildTeeConnector ?? "├";
    const POST_CONNECTOR_HORIZONTAL_FILL = symbols?.postConnectorHorizontalFill ?? "─";
    const ROOT_NODE_HAS_CHILDREN_CORNER = symbols?.rootNodeHasChildrenCorner ?? "┌";
    const ROOT_LEAF_NODE_TAIL = symbols?.rootLeafNodeTail ?? "─";
    const INNER_NODE_HAS_CHILDREN_TEE = symbols?.innerNodeHasChildrenTee ?? "┬";
    const INNER_LEAF_NODE_TAIL = symbols?.innerLeafNodeTail ?? "─";
    const NODE_LABEL_ARROW = symbols?.nodeLabelArrow ?? "➤";

    let stringified = "";

    (function printRecursive(node: TreeNode<{ name: string }>, level, root, arrayIsLastChild: boolean[]) {
        let prefix = "";

        for (let i = 0; i < level - 1; i++) {
            prefix += (arrayIsLastChild[i] ? " " : INDENT_ANCESTOR_CONTINUATION_LINE) + " ".repeat(tabWidth);
        }

        if (level != 0) {
            prefix +=
                (arrayIsLastChild[arrayIsLastChild.length - 1]
                    ? LAST_CHILD_CORNER_CONNECTOR
                    : MID_CHILD_TEE_CONNECTOR) + POST_CONNECTOR_HORIZONTAL_FILL.repeat(tabWidth);
        }

        if (root) {
            if ("$" in node) {
                prefix += ROOT_NODE_HAS_CHILDREN_CORNER;
            } else {
                prefix += ROOT_LEAF_NODE_TAIL;
            }
        } else if ("$" in node) {
            prefix += INNER_NODE_HAS_CHILDREN_TEE;
        } else {
            prefix += INNER_LEAF_NODE_TAIL;
        }

        prefix += `${NODE_LABEL_ARROW} ${node.name}\n`;
        stringified += prefix;

        if ("$" in node) {
            const childNodes = node.$;
            childNodes.forEach(
                (childNode, index) =>
                    (prefix += printRecursive(childNode, level + 1, false, [
                        ...arrayIsLastChild,
                        index == childNodes.length - 1,
                    ])),
            );
        }

        return prefix;
    })(root, 0, true, []);

    return stringified;
}
