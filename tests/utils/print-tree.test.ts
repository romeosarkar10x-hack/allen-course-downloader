import { describe, test, expect } from "vitest";
import { printTree, type PrintTreeSymbols } from "@/utils/print-tree";
import type { TreeNode } from "@/types/tree-node";

// ---------------------------------------------------------------------------
// Shared fixtures (mirror the shapes in src/recurse.ts)
// ---------------------------------------------------------------------------

/** A bare leaf node — no `$` property. */
const singleLeaf: TreeNode = { name: "Just a Leaf" };

/** A root with exactly one child (which is itself a leaf). */
const rootWithOneChild: TreeNode = {
    name: "Root",
    $: [{ name: "Only Child" }],
};

/** Linear chain: Root → Level1 → Level2 → Level3Leaf */
const linearTree: TreeNode = {
    name: "Root",
    $: [
        {
            name: "Level 1",
            $: [
                {
                    name: "Level 2",
                    $: [{ name: "Level 3 Leaf" }],
                },
            ],
        },
    ],
};

/** Symmetric binary-like structure — 2 branches, each with 2 leaf children. */
const binaryTree: TreeNode = {
    name: "Root",
    $: [
        {
            name: "Left Branch",
            $: [{ name: "Left-Left Leaf" }, { name: "Left-Right Leaf" }],
        },
        {
            name: "Right Branch",
            $: [{ name: "Right-Left Leaf" }, { name: "Right-Right Leaf" }],
        },
    ],
};

/** Wide root: 15 leaf children. */
const wideTree: TreeNode = {
    name: "Root",
    $: Array.from({ length: 15 }, (_, i) => ({ name: `Child ${i + 1}` })),
};

/** Mixed-depth tree taken directly from src/recurse.ts */
const mixedDepthTree: TreeNode = {
    name: "Project",
    $: [
        { name: "Quick Task" },
        {
            name: "Medium Task",
            $: [{ name: "Subtask A" }, { name: "Subtask B" }],
        },
        {
            name: "Complex Task",
            $: [
                {
                    name: "Phase 1",
                    $: [
                        { name: "Research" },
                        { name: "Planning" },
                        {
                            name: "Analysis",
                            $: [
                                { name: "Data Collection" },
                                { name: "Data Processing" },
                                { name: "Report Generation" },
                            ],
                        },
                    ],
                },
                {
                    name: "Phase 2",
                    $: [{ name: "Implementation" }, { name: "Testing" }],
                },
            ],
        },
    ],
};

/** 10-level deep chain taken from src/recurse.ts */
function buildDeepTree(depth: number): TreeNode {
    if (depth === 0) return { name: "Level 10 Deep Leaf" };
    return { name: `Level ${10 - depth}`, $: [buildDeepTree(depth - 1)] };
}
const deepTree = buildDeepTree(10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split output into lines, strip the trailing empty string from the final \n */
function lines(output: string): string[] {
    return output.split("\n").slice(0, -1);
}

// ===========================================================================
describe("print-tree", () => {
    // -----------------------------------------------------------------------
    describe("single leaf node (root is a leaf)", () => {
        test("returns a single line ending with a newline", () => {
            const output = printTree(singleLeaf);
            expect(output.endsWith("\n")).toBe(true);
            expect(lines(output)).toHaveLength(1);
        });

        test("uses ROOT_LEAF_NODE_TAIL symbol (─) before the arrow", () => {
            const output = printTree(singleLeaf);
            expect(output).toBe("─➤ Just a Leaf\n");
        });

        test("no indent prefix — root at level 0 has no connector", () => {
            const [line] = lines(printTree(singleLeaf));
            // The line must NOT contain corner / tee connectors
            expect(line).not.toContain("└");
            expect(line).not.toContain("├");
            expect(line).not.toContain("│");
        });
    });

    // -----------------------------------------------------------------------
    describe("root with children", () => {
        test("root line uses ROOT_NODE_HAS_CHILDREN_CORNER symbol (┌)", () => {
            const [rootLine] = lines(printTree(rootWithOneChild));
            expect(rootLine).toBe("┌➤ Root");
        });

        test("single child that is a leaf uses LAST_CHILD_CORNER_CONNECTOR (└) + INNER_LEAF_NODE_TAIL (─)", () => {
            const [, childLine] = lines(printTree(rootWithOneChild));
            // └─────➤ Only Child   (tabWidth=4 so ────)
            expect(childLine).toBe("└─────➤ Only Child");
        });

        test("output has exactly root + child count lines for a flat tree", () => {
            const output = printTree(wideTree);
            // root + 15 children
            expect(lines(output)).toHaveLength(16);
        });

        test("all 15 sibling leaves use MID_CHILD_TEE_CONNECTOR (├) except the last which uses LAST_CHILD_CORNER_CONNECTOR (└)", () => {
            const allLines = lines(printTree(wideTree));
            const childLines = allLines.slice(1); // remove root
            const midChildren = childLines.slice(0, -1);
            const lastChild = childLines[childLines.length - 1]!;

            midChildren.forEach(l => expect(l).toMatch(/^├/));
            expect(lastChild).toMatch(/^└/);
        });
    });

    // -----------------------------------------------------------------------
    describe("prefix construction — connector and horizontal fill", () => {
        test("child connector is followed by exactly 4 horizontal fill chars (────)", () => {
            const allLines = lines(printTree(rootWithOneChild));
            const childLine = allLines[1]!;
            // └─────➤ Only Child  → after └ there are 4 ─ then the suffix ─ then ➤
            expect(childLine.startsWith("└────")).toBe(true);
        });

        test("non-last child starts with ├────", () => {
            const allLines = lines(printTree(binaryTree));
            // Left Branch is the first child (non-last)
            const leftBranchLine = allLines[1]!;
            expect(leftBranchLine.startsWith("├────")).toBe(true);
        });

        test("last child at level 1 starts with └────", () => {
            const allLines = lines(printTree(binaryTree));
            // Right Branch is the last child of root
            const rightBranchLine = allLines.find(l => l.includes("Right Branch"))!;
            expect(rightBranchLine).toBeDefined();
            expect(rightBranchLine.startsWith("└────")).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("inner node suffixes", () => {
        test("inner node with children uses INNER_NODE_HAS_CHILDREN_TEE (┬)", () => {
            // Left Branch has children → should end with ┬➤ Left Branch
            const output = printTree(binaryTree);
            expect(output).toContain("┬➤ Left Branch");
        });

        test("inner leaf node uses INNER_LEAF_NODE_TAIL (─)", () => {
            // Left-Left Leaf is an inner leaf
            const output = printTree(binaryTree);
            expect(output).toContain("─➤ Left-Left Leaf");
        });
    });

    // -----------------------------------------------------------------------
    describe("indent column — ancestor continuation lines", () => {
        test("a non-last ancestor contributes │ in the indent column", () => {
            // In binaryTree, Left Branch is non-last.
            // Its children are indented and should have │ in their indent prefix.
            const allLines = lines(printTree(binaryTree));
            const leftLeftLeaf = allLines.find(l => l.includes("Left-Left Leaf"))!;
            expect(leftLeftLeaf).toBeDefined();
            expect(leftLeftLeaf.startsWith("│")).toBe(true);
        });

        test("a last ancestor contributes spaces (not │) in the indent column", () => {
            // In binaryTree, Right Branch is the last child of root.
            // Its children indent column should be spaces, not │.
            const allLines = lines(printTree(binaryTree));
            const rightLeftLeaf = allLines.find(l => l.includes("Right-Left Leaf"))!;
            expect(rightLeftLeaf).toBeDefined();
            expect(rightLeftLeaf.startsWith(" ")).toBe(true);
            expect(rightLeftLeaf.startsWith("│")).toBe(false);
        });

        test("indent width for each level is 5 chars (1 continuation + 4 spaces)", () => {
            // At level 2, the indent before the connector should be 5 chars per ancestor level
            const allLines = lines(printTree(binaryTree));
            const leftLeftLeaf = allLines.find(l => l.includes("Left-Left Leaf"))!;
            // Full line: │    └─────➤ Left-Left Leaf
            // indent = "│    " (5 chars), then └─────➤ ...
            expect(leftLeftLeaf.slice(0, 5)).toBe("│    ");
        });
    });

    // -----------------------------------------------------------------------
    describe("linear (chain) tree", () => {
        test("all nodes except root appear with a connector prefix", () => {
            const allLines = lines(printTree(linearTree));
            // Root has no connector, the rest do
            allLines.slice(1).forEach(l => {
                expect(l).toMatch(/^[│ ]*[└├]/);
            });
        });

        test("only child at each level uses └ (last-child connector)", () => {
            // In a linear tree every child is the only child → last child
            const allLines = lines(printTree(linearTree));
            allLines.slice(1).forEach(l => {
                // The connector character (right after the indent) should be └
                const connectorChar = l.replace(/^[│ ]*/, "")[0];
                expect(connectorChar).toBe("└");
            });
        });

        test("Level 3 Leaf is a leaf — uses INNER_LEAF_NODE_TAIL (─) suffix", () => {
            const output = printTree(linearTree);
            expect(output).toContain("─➤ Level 3 Leaf");
        });

        test("Level 2 has children — uses INNER_NODE_HAS_CHILDREN_TEE (┬) suffix", () => {
            const output = printTree(linearTree);
            expect(output).toContain("┬➤ Level 2");
        });
    });

    // -----------------------------------------------------------------------
    describe("deep tree (10 levels)", () => {
        test("output has exactly 11 lines (root + 10 descendants)", () => {
            expect(lines(printTree(deepTree))).toHaveLength(11);
        });

        test("deepest leaf label appears in the output", () => {
            expect(printTree(deepTree)).toContain("Level 10 Deep Leaf");
        });

        test("deepest leaf line has correct indentation depth (10 ancestor segments)", () => {
            const allLines = lines(printTree(deepTree));
            const leafLine = allLines[allLines.length - 1]!;
            // Each single-child ancestor contributes 5 chars of indent (1 + 4 spaces).
            // The deepest leaf is at level 10, so 9 ancestor indent segments.
            // All ancestors are last children → indent segments are "     " (5 spaces each).
            const indent = leafLine.match(/^[ │]*/)?.[0] ?? "";
            expect(indent.length).toBe(9 * 5); // 45
        });

        test("all inner ancestors that are only/last children use └ connectors", () => {
            const allLines = lines(printTree(deepTree));
            allLines.slice(1).forEach(l => {
                const afterIndent = l.replace(/^[│ ]*/, "");
                expect(afterIndent[0]).toBe("└");
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("mixed-depth tree", () => {
        test("total line count equals total number of nodes", () => {
            // Count all nodes in mixedDepthTree manually:
            // Project, Quick Task, Medium Task, Subtask A, Subtask B,
            // Complex Task, Phase 1, Research, Planning, Analysis,
            //   Data Collection, Data Processing, Report Generation,
            // Phase 2, Implementation, Testing   → 16 nodes
            expect(lines(printTree(mixedDepthTree))).toHaveLength(16);
        });

        test("Quick Task (first child of root, non-last) uses ├ connector", () => {
            const output = printTree(mixedDepthTree);
            const allLines = lines(output);
            const quickTaskLine = allLines.find(l => l.includes("Quick Task"))!;
            expect(quickTaskLine).toMatch(/^├/);
        });

        test("Complex Task (last child of root) uses └ connector", () => {
            const output = printTree(mixedDepthTree);
            const allLines = lines(output);
            const complexTaskLine = allLines.find(l => l.includes("Complex Task"))!;
            expect(complexTaskLine).toMatch(/^└/);
        });

        test("Report Generation is last child under Analysis which is last under Phase 1 which is non-last under Complex Task", () => {
            // Complex Task is last child of root → its indent contributes spaces.
            // Phase 1 is non-last child → its indent contributes │.
            // Analysis is last child of Phase 1 → connector └, indent spaces after.
            // Report Generation is last child of Analysis → connector └.
            const allLines = lines(printTree(mixedDepthTree));
            const rgLine = allLines.find(l => l.includes("Report Generation"))!;
            expect(rgLine).toBeDefined();
            // Start: "     " (Complex Task, last → 5 spaces)
            //        "│    " (Phase 1, non-last → │ + 4 spaces)
            //        "     " (Analysis, last → 5 spaces)
            //        "└─────➤ Report Generation"
            expect(rgLine.startsWith("     │         └─────➤ Report Generation")).toBe(true);
        });

        test("Subtask B is last child of Medium Task — uses └ connector", () => {
            const allLines = lines(printTree(mixedDepthTree));
            const subtaskBLine = allLines.find(l => l.includes("Subtask B"))!;
            expect(subtaskBLine).toBeDefined();
            // Medium Task is non-last child of root → indent starts with │
            expect(subtaskBLine.startsWith("│")).toBe(true);
            const afterIndent = subtaskBLine.replace(/^[│ ]*/, "");
            expect(afterIndent[0]).toBe("└");
        });
    });

    // -----------------------------------------------------------------------
    describe("return value and output format", () => {
        test("returns a string", () => {
            expect(typeof printTree(singleLeaf)).toBe("string");
        });

        test("every line ends with exactly one newline (no blank lines mid-output)", () => {
            const output = printTree(binaryTree);
            // Split on newlines; only the very last element should be empty
            const parts = output.split("\n");
            expect(parts[parts.length - 1]).toBe("");
            parts.slice(0, -1).forEach(l => expect(l.length).toBeGreaterThan(0));
        });

        test("node labels appear verbatim in the output", () => {
            const root: TreeNode = { name: "My Root", $: [{ name: "Child Node" }] };
            const output = printTree(root);
            expect(output).toContain("My Root");
            expect(output).toContain("Child Node");
        });

        test("NODE_LABEL_ARROW (➤) precedes every node label", () => {
            const output = printTree(binaryTree);
            const allLines = lines(output);
            allLines.forEach(l => expect(l).toContain("➤ "));
        });

        test("every line contains exactly one ➤", () => {
            const output = printTree(mixedDepthTree);
            lines(output).forEach(l => {
                const count = (l.match(/➤/g) ?? []).length;
                expect(count).toBe(1);
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("symbol overrides (Partial<PrintTreeSymbols>)", () => {
        test("overriding nodeLabelArrow changes the arrow character", () => {
            const output = printTree(singleLeaf, { nodeLabelArrow: "→" });
            expect(output).toContain("→ Just a Leaf");
            expect(output).not.toContain("➤");
        });

        test("overriding rootLeafNodeTail changes the root leaf suffix", () => {
            const output = printTree(singleLeaf, { rootLeafNodeTail: "*" });
            expect(output).toMatch(/^\*➤ Just a Leaf\n$/);
        });

        test("overriding rootNodeHasChildrenCorner changes the root-with-children suffix", () => {
            const output = printTree(rootWithOneChild, { rootNodeHasChildrenCorner: "T" });
            const [rootLine] = lines(output);
            expect(rootLine).toMatch(/^T➤ Root$/);
        });

        test("overriding lastChildCornerConnector changes └ to the custom character", () => {
            const output = printTree(rootWithOneChild, { lastChildCornerConnector: "L" });
            const [, childLine] = lines(output);
            expect(childLine).toMatch(/^L/);
        });

        test("overriding midChildTeeConnector changes ├ to the custom character", () => {
            const output = printTree(binaryTree, { midChildTeeConnector: "T" });
            const allLines = lines(output);
            // Left Branch is a non-last child → should now use "T"
            const leftBranchLine = allLines.find(l => l.includes("Left Branch"))!;
            expect(leftBranchLine).toMatch(/^T/);
        });

        test("overriding postConnectorHorizontalFill changes the fill chars", () => {
            const output = printTree(rootWithOneChild, { postConnectorHorizontalFill: "=" });
            const [, childLine] = lines(output);
            // tabWidth=4 → should have 4 "="
            expect(childLine).toContain("====");
            expect(childLine).not.toContain("────");
        });

        test("overriding indentAncestorContinuationLine changes │ in indent column", () => {
            // Left Branch children inherit │ from Left Branch (non-last ancestor)
            const output = printTree(binaryTree, { indentAncestorContinuationLine: "|" });
            const allLines = lines(output);
            const leftLeftLeaf = allLines.find(l => l.includes("Left-Left Leaf"))!;
            expect(leftLeftLeaf.startsWith("|")).toBe(true);
        });

        test("overriding innerNodeHasChildrenTee changes ┬ on inner parent nodes", () => {
            const output = printTree(binaryTree, { innerNodeHasChildrenTee: "+" });
            expect(output).toContain("+➤ Left Branch");
            expect(output).toContain("+➤ Right Branch");
        });

        test("overriding innerLeafNodeTail changes ─ suffix on inner leaf nodes", () => {
            const output = printTree(binaryTree, { innerLeafNodeTail: "." });
            expect(output).toContain(".➤ Left-Left Leaf");
            expect(output).toContain(".➤ Left-Right Leaf");
            expect(output).toContain(".➤ Right-Left Leaf");
            expect(output).toContain(".➤ Right-Right Leaf");
        });

        test("overriding all symbols at once produces fully custom output", () => {
            const customSymbols: PrintTreeSymbols = {
                indentAncestorContinuationLine: "|",
                lastChildCornerConnector: "L",
                midChildTeeConnector: "M",
                postConnectorHorizontalFill: "-",
                rootNodeHasChildrenCorner: "R",
                rootLeafNodeTail: "r",
                innerNodeHasChildrenTee: "+",
                innerLeafNodeTail: ".",
                nodeLabelArrow: ">",
            };
            const output = printTree(binaryTree, customSymbols);
            // Root line
            expect(output).toContain("R> Root");
            // First child (non-last) with children
            expect(output).toContain("M----+> Left Branch");
            // Last child with children
            expect(output).toContain("L----+> Right Branch");
            // Leaf under non-last ancestor (│ becomes |)
            expect(output).toContain("|    L----.> Left-Right Leaf");
        });

        test("partial override: only nodeLabelArrow, all other symbols remain default", () => {
            const output = printTree(binaryTree, { nodeLabelArrow: "»" });
            // Default connectors still present
            expect(output).toContain("┌»");
            expect(output).toContain("├────");
            expect(output).toContain("└────");
            expect(output).toContain("┬»");
            expect(output).toContain("─»");
        });

        test("empty override object uses all defaults", () => {
            const withDefaults = printTree(binaryTree, {});
            const withoutOverride = printTree(binaryTree);
            expect(withDefaults).toBe(withoutOverride);
        });

        test("undefined symbols parameter uses all defaults", () => {
            const withUndefined = printTree(binaryTree, undefined);
            const withoutOverride = printTree(binaryTree);
            expect(withUndefined).toBe(withoutOverride);
        });
    });

    // -----------------------------------------------------------------------
    describe("exact snapshot tests — golden output", () => {
        test("single leaf exact output", () => {
            expect(printTree(singleLeaf)).toBe("─➤ Just a Leaf\n");
        });

        test("root with one child exact output", () => {
            const expected = [
                "┌➤ Root",
                "└─────➤ Only Child",
                "",
            ].join("\n");
            expect(printTree(rootWithOneChild)).toBe(expected);
        });

        test("binary tree exact output", () => {
            const expected = [
                "┌➤ Root",
                "├────┬➤ Left Branch",
                "│    ├─────➤ Left-Left Leaf",
                "│    └─────➤ Left-Right Leaf",
                "└────┬➤ Right Branch",
                "     ├─────➤ Right-Left Leaf",
                "     └─────➤ Right-Right Leaf",
                "",
            ].join("\n");
            expect(printTree(binaryTree)).toBe(expected);
        });

        test("linear tree (chain) exact output", () => {
            const expected = [
                "┌➤ Root",
                "└────┬➤ Level 1",
                "     └────┬➤ Level 2",
                "          └─────➤ Level 3 Leaf",
                "",
            ].join("\n");
            expect(printTree(linearTree)).toBe(expected);
        });

        test("wide tree first and last child lines", () => {
            const allLines = lines(printTree(wideTree));
            expect(allLines[0]).toBe("┌➤ Root");
            expect(allLines[1]).toBe("├─────➤ Child 1");
            expect(allLines[15]).toBe("└─────➤ Child 15");
        });
    });

    // -----------------------------------------------------------------------
    describe("edge cases", () => {
        test("node with an empty string name renders the arrow with empty label", () => {
            const node: TreeNode = { name: "" };
            const output = printTree(node);
            expect(output).toBe("─➤ \n");
        });

        test("node name containing special characters is rendered verbatim", () => {
            const node: TreeNode = { name: "Hello │ World ├ ─ └ ┌" };
            const output = printTree(node);
            expect(output).toContain("Hello │ World ├ ─ └ ┌");
        });

        test("root with empty children array ($ = []) — $ key present but no children printed", () => {
            // `$` exists but is empty → `"$" in node` is true → uses ┌ root corner
            // but the forEach loop iterates over nothing
            const node: TreeNode = { name: "Empty Parent", $: [] };
            const output = printTree(node);
            expect(output).toBe("┌➤ Empty Parent\n");
        });

        test("wide tree — exactly child count + 1 lines", () => {
            const N = 15;
            const output = printTree(wideTree);
            expect(lines(output)).toHaveLength(N + 1);
        });
    });
});
