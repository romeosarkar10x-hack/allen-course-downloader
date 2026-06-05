import type { TreeNode } from "@/types/tree-node";

const tabWidth = 4;

export function printTree(root: TreeNode) {
    let stringified = "";

    (function printRecursive(node: TreeNode, level, root, arrayIsLastChild: boolean[]) {
        let prefix = "";

        for (let i = 0; i < level - 1; i++) {
            prefix += (arrayIsLastChild[i] ? " " : "│") + " ".repeat(tabWidth);
        }

        if (level != 0) {
            prefix += (arrayIsLastChild[arrayIsLastChild.length - 1] ? "└" : "├") + "─".repeat(tabWidth);
        }

        if (root) {
            if ("$" in node) {
                prefix += "┌";
            } else {
                prefix += "─";
            }
        } else if ("$" in node) {
            prefix += "┬";
        } else {
            prefix += "─";
        }

        prefix += `➤ ${node.name}\n`;
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
