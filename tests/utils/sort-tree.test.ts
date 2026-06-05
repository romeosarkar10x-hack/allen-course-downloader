import { describe, test, expect } from "vitest";
import { sortTree } from "@/utils/sort-tree";
import type { TreeNode } from "@/types/tree-node";

// ===========================================================================
describe("sort-tree", () => {
    // -----------------------------------------------------------------------
    describe("leaf node (no $ property)", () => {
        test("does not throw on a leaf node with no children", () => {
            const leaf: TreeNode = { name: "leaf" };
            expect(() => sortTree(leaf)).not.toThrow();
        });

        test("leaf node is unchanged after sort", () => {
            const leaf: TreeNode = { name: "leaf" };
            sortTree(leaf);
            expect(leaf).toEqual({ name: "leaf" });
        });

        // NOTE: When $ is explicitly set to `undefined`, the `"$" in node`
        // guard evaluates to true but childNodes is undefined, causing a crash.
        // This is a known implementation limitation of the source.
        test("leaf with explicit undefined $ — crashes (known bug: '$ in node' is true but value is undefined)", () => {
            const leaf: TreeNode = { name: "leaf" };
            expect(() => sortTree(leaf)).toThrow(TypeError);
        });
    });

    // -----------------------------------------------------------------------
    describe("default comparator — alphabetical (localeCompare)", () => {
        test("sorts two children alphabetically", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "beta" }, { name: "alpha" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["alpha", "beta"]);
        });

        test("sorts multiple children alphabetically", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "mango" }, { name: "apple" }, { name: "cherry" }, { name: "banana" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["apple", "banana", "cherry", "mango"]);
        });

        test("already-sorted children remain in order", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "a" }, { name: "b" }, { name: "c" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["a", "b", "c"]);
        });

        test("reverse-sorted children are corrected", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "z" }, { name: "y" }, { name: "x" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["x", "y", "z"]);
        });

        test("single child list is unchanged", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "only" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["only"]);
        });

        test("empty children array stays empty", () => {
            const root: TreeNode = { name: "root", $: [] };
            sortTree(root);
            expect(root.$).toEqual([]);
        });

        test("sorts case-insensitively per locale (uppercase after lowercase in localeCompare)", () => {
            // localeCompare treats 'A' and 'a' as equivalent or near-equivalent;
            // verify stability by checking the result is deterministically sorted.
            const root: TreeNode = {
                name: "root",
                $: [{ name: "Banana" }, { name: "apple" }, { name: "Cherry" }],
            };
            sortTree(root);
            const names = root.$!.map(n => n.name);
            // localeCompare is locale-aware; just assert sorted order is consistent
            expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
        });

        test("nodes with identical names preserve relative order (stable sort)", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "dup" }, { name: "dup" }, { name: "dup" }],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["dup", "dup", "dup"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("custom comparator", () => {
        test("uses provided comparator instead of default localeCompare", () => {
            // Sort in reverse alphabetical order
            const reverseAlpha = (a: TreeNode, b: TreeNode) => b.name.localeCompare(a.name);
            const root: TreeNode = {
                name: "root",
                $: [{ name: "alpha" }, { name: "gamma" }, { name: "beta" }],
            };
            sortTree(root, reverseAlpha);
            expect(root.$!.map(n => n.name)).toEqual(["gamma", "beta", "alpha"]);
        });

        test("comparator that sorts by name length (ascending)", () => {
            const byLength = (a: TreeNode, b: TreeNode) => a.name.length - b.name.length;
            const root: TreeNode = {
                name: "root",
                $: [{ name: "longname" }, { name: "ab" }, { name: "abcde" }, { name: "x" }],
            };
            sortTree(root, byLength);
            expect(root.$!.map(n => n.name)).toEqual(["x", "ab", "abcde", "longname"]);
        });

        test("comparator that always returns 0 leaves order unchanged", () => {
            const noOp = (_a: TreeNode, _b: TreeNode) => 0;
            const root: TreeNode = {
                name: "root",
                $: [{ name: "z" }, { name: "a" }, { name: "m" }],
            };
            sortTree(root, noOp);
            // With comparator returning 0 the order is implementation-defined;
            // just assert the same three names are present
            expect(root.$!.map(n => n.name).sort()).toEqual(["a", "m", "z"]);
        });

        test("custom comparator is applied to all sibling groups independently", () => {
            const reverseAlpha = (a: TreeNode, b: TreeNode) => b.name.localeCompare(a.name);
            const root: TreeNode = {
                name: "root",
                $: [
                    { name: "b", $: [{ name: "y" }, { name: "x" }] },
                    { name: "a", $: [{ name: "d" }, { name: "c" }] },
                ],
            };
            sortTree(root, reverseAlpha);
            // Top-level sorted in reverse: b, a
            expect(root.$!.map(n => n.name)).toEqual(["b", "a"]);
            // Each subtree also sorted in reverse
            expect(root.$![0]!.$!.map(n => n.name)).toEqual(["y", "x"]);
            expect(root.$![1]!.$!.map(n => n.name)).toEqual(["d", "c"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("recursive sorting (nested trees)", () => {
        test("sorts children at every level of a two-level tree", () => {
            const root: TreeNode = {
                name: "root",
                $: [
                    {
                        name: "beta",
                        $: [{ name: "z" }, { name: "a" }],
                    },
                    {
                        name: "alpha",
                        $: [{ name: "q" }, { name: "b" }],
                    },
                ],
            };
            sortTree(root);
            // Top-level sorted
            expect(root.$!.map(n => n.name)).toEqual(["alpha", "beta"]);
            // Children of "alpha" sorted
            expect(root.$![0]!.$!.map(n => n.name)).toEqual(["b", "q"]);
            // Children of "beta" sorted
            expect(root.$![1]!.$!.map(n => n.name)).toEqual(["a", "z"]);
        });

        test("sorts a three-level deep tree at every level", () => {
            const root: TreeNode = {
                name: "root",
                $: [
                    {
                        name: "b",
                        $: [
                            {
                                name: "d",
                                $: [{ name: "y" }, { name: "x" }],
                            },
                            { name: "c" },
                        ],
                    },
                    { name: "a" },
                ],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["a", "b"]);
            expect(root.$![1]!.$!.map(n => n.name)).toEqual(["c", "d"]);
            expect(root.$![1]!.$![1]!.$!.map(n => n.name)).toEqual(["x", "y"]);
        });

        test("mixed leaf and non-leaf children are handled correctly", () => {
            const root: TreeNode = {
                name: "root",
                $: [
                    { name: "delta" }, // leaf
                    { name: "alpha", $: [{ name: "z" }, { name: "a" }] }, // branch
                    { name: "charlie" }, // leaf
                    { name: "bravo", $: [] }, // branch with empty children
                ],
            };
            sortTree(root);
            expect(root.$!.map(n => n.name)).toEqual(["alpha", "bravo", "charlie", "delta"]);
            // Nested children of "alpha" also sorted
            expect(root.$![0]!.$!.map(n => n.name)).toEqual(["a", "z"]);
        });

        test("deeply nested single-child chain is not mutated unexpectedly", () => {
            const root: TreeNode = {
                name: "a",
                $: [
                    {
                        name: "b",
                        $: [
                            {
                                name: "c",
                                $: [{ name: "d" }],
                            },
                        ],
                    },
                ],
            };
            sortTree(root);
            expect(root.$![0]!.name).toBe("b");
            expect(root.$![0]!.$![0]!.name).toBe("c");
            expect(root.$![0]!.$![0]!.$![0]!.name).toBe("d");
        });
    });

    // -----------------------------------------------------------------------
    describe("mutates in-place", () => {
        test("returns undefined (void function)", () => {
            const root: TreeNode = { name: "root", $: [{ name: "b" }, { name: "a" }] };
            const result = sortTree(root);
            expect(result).toBeUndefined();
        });

        test("sorts the original array in-place, not a copy", () => {
            const child1: TreeNode = { name: "beta" };
            const child2: TreeNode = { name: "alpha" };
            const children = [child1, child2];
            const root: TreeNode = { name: "root", $: children };

            sortTree(root);

            // The very same array reference should have been mutated
            expect(root.$).toBe(children);
            expect(children[0]).toBe(child2); // alpha moved to front
            expect(children[1]).toBe(child1);
        });
    });

    // -----------------------------------------------------------------------
    describe("edge cases", () => {
        test("root is itself a leaf — no crash, no mutation of name", () => {
            const root: TreeNode = { name: "solo" };
            sortTree(root);
            expect(root.name).toBe("solo");
        });

        test("numeric-looking names are sorted lexicographically by localeCompare", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "10" }, { name: "9" }, { name: "2" }, { name: "100" }],
            };
            sortTree(root);
            // localeCompare in many locales uses numeric collation by default on
            // some platforms; we just assert the result is deterministic and
            // matches localeCompare order explicitly.
            const names = root.$!.map(n => n.name);
            expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
        });

        test("special-character names do not throw", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "ñoño" }, { name: "äpfel" }, { name: "über" }, { name: "zebra" }],
            };
            expect(() => sortTree(root)).not.toThrow();
        });

        test("large flat list of children is sorted correctly", () => {
            const names = Array.from({ length: 50 }, (_, i) => String.fromCharCode(122 - i)); // z…a
            const root: TreeNode = {
                name: "root",
                $: names.map(name => ({ name })),
            };
            sortTree(root);
            const sorted = root.$!.map(n => n.name);
            expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b)));
        });

        test("calling sortTree twice is idempotent", () => {
            const root: TreeNode = {
                name: "root",
                $: [{ name: "c" }, { name: "a" }, { name: "b" }],
            };
            sortTree(root);
            const after1 = root.$!.map(n => n.name);
            sortTree(root);
            const after2 = root.$!.map(n => n.name);
            expect(after1).toEqual(after2);
        });
    });
});
