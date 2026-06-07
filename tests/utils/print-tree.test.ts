import { describe, test, expect } from "vitest";
import { printTree, type PrintTreeSymbols } from "@/utils/print-tree";
import type { TreeNode } from "@/types/tree-node";

// ---------------------------------------------------------------------------
// Explicit symbols used by every test.
// Tests must NEVER rely on the library defaults — pass TEST_SYMBOLS instead.
// If you change these values the tests adapt automatically; if you change the
// library defaults nothing here breaks.
// ---------------------------------------------------------------------------
const S: PrintTreeSymbols = {
    indentAncestorContinuationLine: "│",
    lastChildCornerConnector: "└",
    midChildTeeConnector: "├",
    postConnectorHorizontalFill: "─",
    rootNodeHasChildrenCorner: "┌",
    rootLeafNodeTail: "─",
    innerNodeHasChildrenTee: "┬",
    innerLeafNodeTail: "─",
    nodeLabelArrow: "➤",
};

// Shorthand — every call goes through this so the symbol set is always explicit.
const pt = (node: TreeNode<{ name: string }>, overrides?: Partial<PrintTreeSymbols>) =>
    printTree(node, { ...S, ...overrides });

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const singleLeaf: TreeNode<{ name: string }> = { name: "Just a Leaf" };

const rootWithOneChild: TreeNode<{ name: string }> = {
    name: "Root",
    $: [{ name: "Only Child" }],
};

const linearTree: TreeNode<{ name: string }> = {
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

const binaryTree: TreeNode<{ name: string }> = {
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

const wideTree: TreeNode<{ name: string }> = {
    name: "Root",
    $: Array.from({ length: 15 }, (_, i) => ({ name: `Child ${i + 1}` })),
};

const mixedDepthTree: TreeNode<{ name: string }> = {
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

function buildDeepTree(depth: number): TreeNode<{ name: string }> {
    if (depth === 0) return { name: "Level 10 Deep Leaf" };
    return { name: `Level ${10 - depth}`, $: [buildDeepTree(depth - 1)] };
}
const deepTree = buildDeepTree(10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split output into lines, strip trailing empty string from the final \n */
function lines(output: string): string[] {
    return output.split("\n").slice(0, -1);
}

// Derived single-character aliases for readable assertions.
const {
    indentAncestorContinuationLine: CONT,
    lastChildCornerConnector: LAST,
    midChildTeeConnector: MID,
    postConnectorHorizontalFill: FILL,
    rootNodeHasChildrenCorner: ROOT_CORNER,
    rootLeafNodeTail: ROOT_TAIL,
    innerNodeHasChildrenTee: INNER_TEE,
    innerLeafNodeTail: INNER_TAIL,
    nodeLabelArrow: ARROW,
} = S;

const tabWidth = 4;
const FILLS = FILL.repeat(tabWidth); // "────"
const INDENT = CONT + " ".repeat(tabWidth); // "│    "
const SPACE_INDENT = " ".repeat(tabWidth + 1); // "     "

// ===========================================================================
describe("print-tree", () => {
    // -----------------------------------------------------------------------
    describe("single leaf node (root is a leaf)", () => {
        test("returns a single line ending with a newline", () => {
            const output = pt(singleLeaf);
            expect(output.endsWith("\n")).toBe(true);
            expect(lines(output)).toHaveLength(1);
        });

        test("uses rootLeafNodeTail symbol before the arrow", () => {
            const output = pt(singleLeaf);
            expect(output).toBe(`${ROOT_TAIL}${ARROW} Just a Leaf\n`);
        });

        test("no indent prefix — root at level 0 has no connector", () => {
            const [line] = lines(pt(singleLeaf));
            expect(line).not.toContain(LAST);
            expect(line).not.toContain(MID);
            expect(line).not.toContain(CONT);
        });
    });

    // -----------------------------------------------------------------------
    describe("root with children", () => {
        test("root line uses rootNodeHasChildrenCorner symbol", () => {
            const [rootLine] = lines(pt(rootWithOneChild));
            expect(rootLine).toBe(`${ROOT_CORNER}${ARROW} Root`);
        });

        test("single child that is a leaf uses lastChildCornerConnector + innerLeafNodeTail", () => {
            const [, childLine] = lines(pt(rootWithOneChild));
            expect(childLine).toBe(`${LAST}${FILLS}${INNER_TAIL}${ARROW} Only Child`);
        });

        test("output has exactly root + child count lines for a flat tree", () => {
            expect(lines(pt(wideTree))).toHaveLength(16);
        });

        test("all 15 sibling leaves use midChildTeeConnector except the last which uses lastChildCornerConnector", () => {
            const allLines = lines(pt(wideTree));
            const childLines = allLines.slice(1);
            const midChildren = childLines.slice(0, -1);
            const lastChild = childLines[childLines.length - 1]!;

            midChildren.forEach(l => expect(l.startsWith(MID)).toBe(true));
            expect(lastChild.startsWith(LAST)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("prefix construction — connector and horizontal fill", () => {
        test("child connector is followed by exactly tabWidth horizontal fill chars", () => {
            const childLine = lines(pt(rootWithOneChild))[1]!;
            expect(childLine.startsWith(`${LAST}${FILLS}`)).toBe(true);
        });

        test("non-last child starts with midChildTeeConnector + fills", () => {
            const leftBranchLine = lines(pt(binaryTree))[1]!;
            expect(leftBranchLine.startsWith(`${MID}${FILLS}`)).toBe(true);
        });

        test("last child at level 1 starts with lastChildCornerConnector + fills", () => {
            const rightBranchLine = lines(pt(binaryTree)).find(l => l.includes("Right Branch"))!;
            expect(rightBranchLine).toBeDefined();
            expect(rightBranchLine.startsWith(`${LAST}${FILLS}`)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("inner node suffixes", () => {
        test("inner node with children uses innerNodeHasChildrenTee", () => {
            expect(pt(binaryTree)).toContain(`${INNER_TEE}${ARROW} Left Branch`);
        });

        test("inner leaf node uses innerLeafNodeTail", () => {
            expect(pt(binaryTree)).toContain(`${INNER_TAIL}${ARROW} Left-Left Leaf`);
        });
    });

    // -----------------------------------------------------------------------
    describe("indent column — ancestor continuation lines", () => {
        test("a non-last ancestor contributes indentAncestorContinuationLine in the indent column", () => {
            const leftLeftLeaf = lines(pt(binaryTree)).find(l => l.includes("Left-Left Leaf"))!;
            expect(leftLeftLeaf).toBeDefined();
            expect(leftLeftLeaf.startsWith(CONT)).toBe(true);
        });

        test("a last ancestor contributes spaces (not continuation line) in the indent column", () => {
            const rightLeftLeaf = lines(pt(binaryTree)).find(l => l.includes("Right-Left Leaf"))!;
            expect(rightLeftLeaf).toBeDefined();
            expect(rightLeftLeaf.startsWith(" ")).toBe(true);
            expect(rightLeftLeaf.startsWith(CONT)).toBe(false);
        });

        test("indent width for each level is tabWidth+1 chars (1 continuation + tabWidth spaces)", () => {
            const leftLeftLeaf = lines(pt(binaryTree)).find(l => l.includes("Left-Left Leaf"))!;
            // Full line: CONT + "    " + LAST + FILLS + INNER_TAIL + ARROW + " Left-Left Leaf"
            expect(leftLeftLeaf.slice(0, tabWidth + 1)).toBe(INDENT);
        });
    });

    // -----------------------------------------------------------------------
    describe("linear (chain) tree", () => {
        test("all nodes except root appear with a connector prefix", () => {
            lines(pt(linearTree))
                .slice(1)
                .forEach(l => {
                    expect(l).toMatch(new RegExp(`^[${CONT} ]*[${LAST}${MID}]`));
                });
        });

        test("only child at each level uses lastChildCornerConnector", () => {
            lines(pt(linearTree))
                .slice(1)
                .forEach(l => {
                    const connectorChar = l.replace(new RegExp(`^[${CONT} ]*`), "")[0];
                    expect(connectorChar).toBe(LAST);
                });
        });

        test("Level 3 Leaf is a leaf — uses innerLeafNodeTail suffix", () => {
            expect(pt(linearTree)).toContain(`${INNER_TAIL}${ARROW} Level 3 Leaf`);
        });

        test("Level 2 has children — uses innerNodeHasChildrenTee suffix", () => {
            expect(pt(linearTree)).toContain(`${INNER_TEE}${ARROW} Level 2`);
        });
    });

    // -----------------------------------------------------------------------
    describe("deep tree (10 levels)", () => {
        test("output has exactly 11 lines (root + 10 descendants)", () => {
            expect(lines(pt(deepTree))).toHaveLength(11);
        });

        test("deepest leaf label appears in the output", () => {
            expect(pt(deepTree)).toContain("Level 10 Deep Leaf");
        });

        test("deepest leaf line has correct indentation depth (9 ancestor segments)", () => {
            const allLines = lines(pt(deepTree));
            const leafLine = allLines[allLines.length - 1]!;
            // Each single-child ancestor is the last child → indent = SPACE_INDENT per level.
            // Deepest leaf is at level 10, so 9 ancestor indent segments.
            const indent = leafLine.match(/^[ │|]*/)?.[0] ?? "";
            expect(indent.length).toBe(9 * (tabWidth + 1));
        });

        test("all inner ancestors that are only/last children use lastChildCornerConnector", () => {
            lines(pt(deepTree))
                .slice(1)
                .forEach(l => {
                    const afterIndent = l.replace(/^[ │|]*/, "");
                    expect(afterIndent[0]).toBe(LAST);
                });
        });
    });

    // -----------------------------------------------------------------------
    describe("mixed-depth tree", () => {
        test("total line count equals total number of nodes", () => {
            // Project, Quick Task, Medium Task, Subtask A, Subtask B,
            // Complex Task, Phase 1, Research, Planning, Analysis,
            // Data Collection, Data Processing, Report Generation,
            // Phase 2, Implementation, Testing → 16 nodes
            expect(lines(pt(mixedDepthTree))).toHaveLength(16);
        });

        test("Quick Task (first child of root, non-last) uses midChildTeeConnector", () => {
            const quickTaskLine = lines(pt(mixedDepthTree)).find(l => l.includes("Quick Task"))!;
            expect(quickTaskLine.startsWith(MID)).toBe(true);
        });

        test("Complex Task (last child of root) uses lastChildCornerConnector", () => {
            const complexTaskLine = lines(pt(mixedDepthTree)).find(l => l.includes("Complex Task"))!;
            expect(complexTaskLine.startsWith(LAST)).toBe(true);
        });

        test("Report Generation line has the correct structured prefix", () => {
            // Complex Task is last child of root → SPACE_INDENT
            // Phase 1 is non-last child         → INDENT
            // Analysis is last child of Phase 1 → SPACE_INDENT
            // Report Generation is last child of Analysis → LAST connector
            const rgLine = lines(pt(mixedDepthTree)).find(l => l.includes("Report Generation"))!;
            expect(rgLine).toBeDefined();
            const expectedPrefix =
                SPACE_INDENT + INDENT + SPACE_INDENT + `${LAST}${FILLS}${INNER_TAIL}${ARROW} Report Generation`;
            expect(rgLine).toBe(expectedPrefix);
        });

        test("Subtask B is last child of Medium Task — uses lastChildCornerConnector with continuation line ancestor", () => {
            const subtaskBLine = lines(pt(mixedDepthTree)).find(l => l.includes("Subtask B"))!;
            expect(subtaskBLine).toBeDefined();
            // Medium Task is non-last child of root → indent starts with CONT
            expect(subtaskBLine.startsWith(CONT)).toBe(true);
            const afterIndent = subtaskBLine.replace(/^[ │|]*/, "");
            expect(afterIndent[0]).toBe(LAST);
        });
    });

    // -----------------------------------------------------------------------
    describe("return value and output format", () => {
        test("returns a string", () => {
            expect(typeof pt(singleLeaf)).toBe("string");
        });

        test("every line ends with exactly one newline (no blank lines mid-output)", () => {
            const output = pt(binaryTree);
            const parts = output.split("\n");
            expect(parts[parts.length - 1]).toBe("");
            parts.slice(0, -1).forEach(l => expect(l.length).toBeGreaterThan(0));
        });

        test("node labels appear verbatim in the output", () => {
            const root: TreeNode<{ name: string }> = { name: "My Root", $: [{ name: "Child Node" }] };
            const output = pt(root);
            expect(output).toContain("My Root");
            expect(output).toContain("Child Node");
        });

        test("nodeLabelArrow precedes every node label", () => {
            lines(pt(binaryTree)).forEach(l => expect(l).toContain(`${ARROW} `));
        });

        test("every line contains exactly one arrow", () => {
            lines(pt(mixedDepthTree)).forEach(l => {
                const count = (l.match(new RegExp(ARROW.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
                expect(count).toBe(1);
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("symbol overrides", () => {
        test("overriding nodeLabelArrow changes the arrow character", () => {
            const output = pt(singleLeaf, { nodeLabelArrow: "→" });
            expect(output).toContain("→ Just a Leaf");
            expect(output).not.toContain(ARROW);
        });

        test("overriding rootLeafNodeTail changes the root leaf suffix", () => {
            const output = pt(singleLeaf, { rootLeafNodeTail: "*" });
            expect(output).toMatch(new RegExp(`^\\*${ARROW} Just a Leaf\n$`));
        });

        test("overriding rootNodeHasChildrenCorner changes the root-with-children suffix", () => {
            const [rootLine] = lines(pt(rootWithOneChild, { rootNodeHasChildrenCorner: "T" }));
            expect(rootLine).toMatch(new RegExp(`^T${ARROW} Root$`));
        });

        test("overriding lastChildCornerConnector changes to the custom character", () => {
            const [, childLine] = lines(pt(rootWithOneChild, { lastChildCornerConnector: "L" }));
            expect(childLine!.startsWith("L")).toBe(true);
        });

        test("overriding midChildTeeConnector changes to the custom character", () => {
            const leftBranchLine = lines(pt(binaryTree, { midChildTeeConnector: "T" })).find(l =>
                l.includes("Left Branch"),
            )!;
            expect(leftBranchLine.startsWith("T")).toBe(true);
        });

        test("overriding postConnectorHorizontalFill changes the fill chars", () => {
            const [, childLine] = lines(pt(rootWithOneChild, { postConnectorHorizontalFill: "=" }));
            expect(childLine).toContain("====");
            expect(childLine).not.toContain(FILLS);
        });

        test("overriding indentAncestorContinuationLine changes the continuation character", () => {
            const leftLeftLeaf = lines(pt(binaryTree, { indentAncestorContinuationLine: "|" })).find(l =>
                l.includes("Left-Left Leaf"),
            )!;
            expect(leftLeftLeaf.startsWith("|")).toBe(true);
        });

        test("overriding innerNodeHasChildrenTee changes inner parent nodes", () => {
            const output = pt(binaryTree, { innerNodeHasChildrenTee: "+" });
            expect(output).toContain(`+${ARROW} Left Branch`);
            expect(output).toContain(`+${ARROW} Right Branch`);
        });

        test("overriding innerLeafNodeTail changes the suffix on inner leaf nodes", () => {
            const output = pt(binaryTree, { innerLeafNodeTail: "." });
            expect(output).toContain(`.${ARROW} Left-Left Leaf`);
            expect(output).toContain(`.${ARROW} Left-Right Leaf`);
            expect(output).toContain(`.${ARROW} Right-Left Leaf`);
            expect(output).toContain(`.${ARROW} Right-Right Leaf`);
        });

        test("overriding all symbols at once produces fully custom output", () => {
            const custom: PrintTreeSymbols = {
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
            const allLines = lines(printTree(binaryTree, custom));
            // Structure: connector + fills(4) + suffix + arrow + " " + label
            expect(allLines[0]).toBe("R> Root");
            expect(allLines[1]).toBe("M----+> Left Branch");
            expect(allLines[2]).toBe("|    M----.> Left-Left Leaf");
            expect(allLines[3]).toBe("|    L----.> Left-Right Leaf");
            expect(allLines[4]).toBe("L----+> Right Branch");
            expect(allLines[5]).toBe("     M----.> Right-Left Leaf");
            expect(allLines[6]).toBe("     L----.> Right-Right Leaf");
        });

        test("partial override: only nodeLabelArrow, rest remain as the S symbols", () => {
            const output = pt(binaryTree, { nodeLabelArrow: "»" });
            expect(output).toContain(`${ROOT_CORNER}»`);
            expect(output).toContain(`${MID}${FILLS}`);
            expect(output).toContain(`${LAST}${FILLS}`);
            expect(output).toContain(`${INNER_TEE}»`);
            expect(output).toContain(`${INNER_TAIL}»`);
        });

        test("empty override object falls back to S symbols", () => {
            expect(pt(binaryTree, {})).toBe(pt(binaryTree));
        });

        test("undefined symbols parameter — printTree uses its own defaults (independent of S)", () => {
            // This verifies the library itself is consistent, not that it matches S.
            const a = printTree(binaryTree, undefined);
            const b = printTree(binaryTree);
            expect(a).toBe(b);
        });
    });

    // -----------------------------------------------------------------------
    describe("exact snapshot tests — golden output built from S symbols", () => {
        test("single leaf exact output", () => {
            expect(pt(singleLeaf)).toBe(`${ROOT_TAIL}${ARROW} Just a Leaf\n`);
        });

        test("root with one child exact output", () => {
            const expected = [
                `${ROOT_CORNER}${ARROW} Root`,
                `${LAST}${FILLS}${INNER_TAIL}${ARROW} Only Child`,
                "",
            ].join("\n");
            expect(pt(rootWithOneChild)).toBe(expected);
        });

        test("binary tree exact output", () => {
            const expected = [
                `${ROOT_CORNER}${ARROW} Root`,
                `${MID}${FILLS}${INNER_TEE}${ARROW} Left Branch`,
                `${INDENT}${MID}${FILLS}${INNER_TAIL}${ARROW} Left-Left Leaf`,
                `${INDENT}${LAST}${FILLS}${INNER_TAIL}${ARROW} Left-Right Leaf`,
                `${LAST}${FILLS}${INNER_TEE}${ARROW} Right Branch`,
                `${SPACE_INDENT}${MID}${FILLS}${INNER_TAIL}${ARROW} Right-Left Leaf`,
                `${SPACE_INDENT}${LAST}${FILLS}${INNER_TAIL}${ARROW} Right-Right Leaf`,
                "",
            ].join("\n");
            expect(pt(binaryTree)).toBe(expected);
        });

        test("linear tree (chain) exact output", () => {
            const expected = [
                `${ROOT_CORNER}${ARROW} Root`,
                `${LAST}${FILLS}${INNER_TEE}${ARROW} Level 1`,
                `${SPACE_INDENT}${LAST}${FILLS}${INNER_TEE}${ARROW} Level 2`,
                `${SPACE_INDENT}${SPACE_INDENT}${LAST}${FILLS}${INNER_TAIL}${ARROW} Level 3 Leaf`,
                "",
            ].join("\n");
            expect(pt(linearTree)).toBe(expected);
        });

        test("wide tree first and last child lines", () => {
            const allLines = lines(pt(wideTree));
            expect(allLines[0]).toBe(`${ROOT_CORNER}${ARROW} Root`);
            expect(allLines[1]).toBe(`${MID}${FILLS}${INNER_TAIL}${ARROW} Child 1`);
            expect(allLines[15]).toBe(`${LAST}${FILLS}${INNER_TAIL}${ARROW} Child 15`);
        });
    });

    // -----------------------------------------------------------------------
    describe("edge cases", () => {
        test("node with an empty string name renders the arrow with empty label", () => {
            const node: TreeNode<{ name: string }> = { name: "" };
            expect(pt(node)).toBe(`${ROOT_TAIL}${ARROW} \n`);
        });

        test("node name containing special characters is rendered verbatim", () => {
            const node: TreeNode<{ name: string }> = { name: "Hello │ World ├ ─ └ ┌" };
            expect(pt(node)).toContain("Hello │ World ├ ─ └ ┌");
        });

        test("root with empty children array ($ = []) — uses rootNodeHasChildrenCorner but no children printed", () => {
            const node: TreeNode<{ name: string }> = { name: "Empty Parent", $: [] };
            expect(pt(node)).toBe(`${ROOT_CORNER}${ARROW} Empty Parent\n`);
        });

        test("wide tree — exactly child count + 1 lines", () => {
            expect(lines(pt(wideTree))).toHaveLength(16);
        });
    });
});
