import { describe, test, expect } from "vitest";
import { dedupeTree } from "@/utils/dedupe-tree";
import type { TreeNode } from "@/types/tree-node";

// ---------------------------------------------------------------------------
// dedupeTree(node):
//   - If `"$" in node` is false (a leaf), the SAME node reference is returned
//     untouched.
//   - Otherwise it recurses into every child FIRST (`node.$.map(dedupeTree)`),
//     then removes duplicates among the already-deduped children with
//     `lodash.uniqWith(deduped, lodash.isEqual)` (deep equality, first
//     occurrence wins, order preserved), and returns a NEW object
//     (`{ ...node, $: ... }`).
//
// Type helpers below mirror `TreeNode<T> = { $?: TreeNode<T>[] } & T`.
// ---------------------------------------------------------------------------

type Named = { name: string };
type Valued = { v: unknown };

function branch<T extends object>(fields: T, children: TreeNode<T>[]): TreeNode<T> {
    return { ...fields, $: children };
}

// ===========================================================================
describe("dedupe-tree", () => {
    // -----------------------------------------------------------------------
    describe("leaf nodes (no $ property)", () => {
        test("returns the leaf unchanged (deep equal)", () => {
            const node: TreeNode<Named> = { name: "leaf" };
            expect(dedupeTree(node)).toEqual({ name: "leaf" });
        });

        test("returns the SAME reference for a leaf (no copy is made)", () => {
            const node: TreeNode<Named> = { name: "leaf" };
            expect(dedupeTree(node)).toBe(node);
        });

        test("does not mutate the leaf", () => {
            const node: TreeNode<Named> = { name: "leaf" };
            dedupeTree(node);
            expect(node).toEqual({ name: "leaf" });
        });

        test("preserves all of T's fields on a leaf", () => {
            const node: TreeNode<{ a: number; b: string; c: boolean; d: null }> = {
                a: 1,
                b: "x",
                c: true,
                d: null,
            };
            expect(dedupeTree(node)).toEqual({ a: 1, b: "x", c: true, d: null });
        });

        test("a leaf with no own enumerable fields ({}) is returned as-is", () => {
            const node = {} as TreeNode<Record<string, never>>;
            expect(dedupeTree(node)).toBe(node);
        });

        // The guard is `"$" in node`, not `node.$ !== undefined`. An explicit
        // `$: undefined` makes the guard true, so `node.$.map` throws.
        test("a leaf with an explicit `$: undefined` crashes (TypeError) — '$' in node is true", () => {
            const node = { name: "leaf", $: undefined } as unknown as TreeNode<Named>;
            expect(() => dedupeTree(node)).toThrow(TypeError);
        });

        test("a node whose `$` is null also crashes (TypeError)", () => {
            const node = { name: "leaf", $: null } as unknown as TreeNode<Named>;
            expect(() => dedupeTree(node)).toThrow(TypeError);
        });
    });

    // -----------------------------------------------------------------------
    describe("branch nodes — return shape & immutability", () => {
        test("returns a NEW object (not the same reference) when `$` is present", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "a" }]);
            expect(dedupeTree(node)).not.toBe(node);
        });

        test("returns a NEW `$` array (uniqWith produces a fresh array)", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "a" }]);
            const result = dedupeTree(node);
            expect(result.$).not.toBe(node.$);
        });

        test("preserves the parent's own T fields via spread", () => {
            const node = branch<{ name: string; count: number }>({ name: "root", count: 7 }, [{ name: "a", count: 0 }]);
            const result = dedupeTree(node);
            expect(result.name).toBe("root");
            expect(result.count).toBe(7);
        });

        test("does not mutate the original node's `$` array", () => {
            const children: TreeNode<Named>[] = [{ name: "a" }, { name: "a" }];
            const node = branch<Named>({ name: "root" }, children);
            dedupeTree(node);
            expect(node.$).toHaveLength(2);
            expect(children).toHaveLength(2);
        });

        test("empty `$` array stays empty and is preserved", () => {
            const node = branch<Named>({ name: "root" }, []);
            const result = dedupeTree(node);
            expect(result.$).toEqual([]);
        });

        test("empty `$` still yields a new object distinct from the input", () => {
            const node = branch<Named>({ name: "root" }, []);
            expect(dedupeTree(node)).not.toBe(node);
            expect(dedupeTree(node)).toEqual({ name: "root", $: [] });
        });
    });

    // -----------------------------------------------------------------------
    describe("leaf children — reference handling", () => {
        test("kept leaf children retain their original reference (leaves are returned by ref)", () => {
            const a: TreeNode<Named> = { name: "a" };
            const b: TreeNode<Named> = { name: "b" };
            const node = branch<Named>({ name: "root" }, [a, b]);
            const result = dedupeTree(node);
            expect(result.$![0]).toBe(a);
            expect(result.$![1]).toBe(b);
        });

        test("for duplicate leaf children the FIRST occurrence reference is kept", () => {
            const first: TreeNode<Named> = { name: "dup" };
            const second: TreeNode<Named> = { name: "dup" };
            const node = branch<Named>({ name: "root" }, [first, second]);
            const result = dedupeTree(node);
            expect(result.$).toHaveLength(1);
            expect(result.$![0]).toBe(first);
            expect(result.$![0]).not.toBe(second);
        });
    });

    // -----------------------------------------------------------------------
    describe("single-level deduplication (leaf children)", () => {
        test("removes a single exact-duplicate child", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "a" }, { name: "a" }]);
            expect(dedupeTree(node).$).toEqual([{ name: "a" }]);
        });

        test("keeps distinct children untouched", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "a" }, { name: "b" }, { name: "c" }]);
            expect(dedupeTree(node).$!.map(n => n.name)).toEqual(["a", "b", "c"]);
        });

        test("collapses all-identical children down to one", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "x" }, { name: "x" }, { name: "x" }, { name: "x" }]);
            expect(dedupeTree(node).$).toEqual([{ name: "x" }]);
        });

        test("a single child is preserved", () => {
            const node = branch<Named>({ name: "root" }, [{ name: "only" }]);
            expect(dedupeTree(node).$).toEqual([{ name: "only" }]);
        });

        test("preserves first-occurrence order with interleaved duplicates", () => {
            const node = branch<Named>({ name: "root" }, [
                { name: "a" },
                { name: "b" },
                { name: "a" },
                { name: "c" },
                { name: "b" },
                { name: "a" },
            ]);
            expect(dedupeTree(node).$!.map(n => n.name)).toEqual(["a", "b", "c"]);
        });

        test("dedupes children that are deep-equal but different references", () => {
            const node = branch<{ id: number; tags: string[] }>({ id: 0, tags: [] }, [
                { id: 1, tags: ["x", "y"] },
                { id: 1, tags: ["x", "y"] },
            ]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });

        test("does NOT dedupe children differing only in nested array order (isEqual is order-sensitive for arrays)", () => {
            const node = branch<{ tags: string[] }>({ tags: [] }, [{ tags: ["a", "b"] }, { tags: ["b", "a"] }]);
            expect(dedupeTree(node).$).toHaveLength(2);
        });

        test("dedupes children with same keys in different insertion order (isEqual is key-order-insensitive)", () => {
            const node = branch<Record<string, number>>({ name: 0 } as unknown as Record<string, number>, [
                { a: 1, b: 2 } as TreeNode<Record<string, number>>,
                { b: 2, a: 1 } as TreeNode<Record<string, number>>,
            ]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("value-type semantics inherited from lodash.isEqual", () => {
        test("treats NaN as equal to NaN (deduped)", () => {
            const node = branch<Valued>({ v: "root" }, [{ v: NaN }, { v: NaN }]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });

        test("distinguishes numeric strings from numbers (kept separate)", () => {
            const node = branch<Valued>({ v: "root" }, [{ v: 1 }, { v: "1" }]);
            expect(dedupeTree(node).$).toHaveLength(2);
        });

        test("distinguishes null from undefined-valued field — null vs missing key (kept separate)", () => {
            const node = branch<Record<string, unknown>>({ v: "root" }, [
                { x: null } as TreeNode<Record<string, unknown>>,
                {} as TreeNode<Record<string, unknown>>,
            ]);
            expect(dedupeTree(node).$).toHaveLength(2);
        });

        test("dedupes Date children with the same timestamp", () => {
            const node = branch<{ d: Date }>({ d: new Date(0) }, [
                { d: new Date("2024-01-01T00:00:00Z") },
                { d: new Date("2024-01-01T00:00:00Z") },
            ]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });

        test("keeps Date children with different timestamps", () => {
            const node = branch<{ d: Date }>({ d: new Date(0) }, [
                { d: new Date("2024-01-01T00:00:00Z") },
                { d: new Date("2025-01-01T00:00:00Z") },
            ]);
            expect(dedupeTree(node).$).toHaveLength(2);
        });

        test("dedupes children holding deep-equal Maps", () => {
            const node = branch<{ m: Map<string, number> }>({ m: new Map() }, [
                { m: new Map([["a", 1]]) },
                { m: new Map([["a", 1]]) },
            ]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("`$` presence is significant in equality", () => {
        test("a leaf child and a branch child with empty `$` are NOT equal (one lacks the $ key)", () => {
            const node = branch<Named>({ name: "root" }, [
                { name: "x" }, // leaf, no $
                { name: "x", $: [] }, // branch with empty $
            ]);
            const result = dedupeTree(node);
            expect(result.$).toHaveLength(2);
        });

        test("two branch children with identical empty `$` are deduped", () => {
            const node = branch<Named>({ name: "root" }, [
                { name: "x", $: [] },
                { name: "x", $: [] },
            ]);
            expect(dedupeTree(node).$).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("recursion — children are deduped before the parent dedupes them", () => {
        test("dedupes grandchildren within a single child", () => {
            const node = branch<Named>({ name: "root" }, [
                branch<Named>({ name: "child" }, [{ name: "g" }, { name: "g" }, { name: "h" }]),
            ]);
            const result = dedupeTree(node);
            expect(result.$![0]!.$!.map(n => n.name)).toEqual(["g", "h"]);
        });

        test("two children that are equal ONLY AFTER their subtrees are deduped collapse into one", () => {
            // childA has a duplicated grandchild; childB does not. Pre-dedupe they
            // differ, but after recursive dedupe both become {id:"p", $:[{leaf:1},{leaf:2}]}.
            const childA = branch<{ id: string }>({ id: "p" }, [
                { leaf: 1 } as unknown as TreeNode<{ id: string }>,
                { leaf: 1 } as unknown as TreeNode<{ id: string }>,
                { leaf: 2 } as unknown as TreeNode<{ id: string }>,
            ]);
            const childB = branch<{ id: string }>({ id: "p" }, [
                { leaf: 1 } as unknown as TreeNode<{ id: string }>,
                { leaf: 2 } as unknown as TreeNode<{ id: string }>,
            ]);
            const node = branch<{ id: string }>({ id: "root" }, [childA, childB]);
            const result = dedupeTree(node);
            expect(result.$).toHaveLength(1);
            expect(result.$![0]!.$).toEqual([{ leaf: 1 }, { leaf: 2 }]);
        });

        test("children that remain distinct after subtree dedup are both kept", () => {
            const childA = branch<{ id: string }>({ id: "p" }, [{ leaf: 1 } as unknown as TreeNode<{ id: string }>]);
            const childB = branch<{ id: string }>({ id: "p" }, [{ leaf: 2 } as unknown as TreeNode<{ id: string }>]);
            const node = branch<{ id: string }>({ id: "root" }, [childA, childB]);
            expect(dedupeTree(node).$).toHaveLength(2);
        });

        test("branch children are reconstructed as NEW objects (not original refs)", () => {
            const child = branch<Named>({ name: "child" }, [{ name: "g" }]);
            const node = branch<Named>({ name: "root" }, [child]);
            const result = dedupeTree(node);
            expect(result.$![0]).not.toBe(child);
            expect(result.$![0]).toEqual({ name: "child", $: [{ name: "g" }] });
        });

        test("dedupes simultaneously at multiple depths", () => {
            const node = branch<Named>({ name: "root" }, [
                branch<Named>({ name: "a" }, [{ name: "x" }, { name: "x" }]),
                branch<Named>({ name: "a" }, [{ name: "x" }, { name: "x" }]),
                branch<Named>({ name: "b" }, [{ name: "y" }, { name: "z" }, { name: "y" }]),
            ]);
            const result = dedupeTree(node);
            // The two identical "a" branches collapse; "b" stays.
            expect(result.$!.map(n => n.name)).toEqual(["a", "b"]);
            expect(result.$![0]!.$!.map(n => n.name)).toEqual(["x"]);
            expect(result.$![1]!.$!.map(n => n.name)).toEqual(["y", "z"]);
        });

        test("handles deep linear nesting (4 levels) without dropping data", () => {
            const node = branch<Named>({ name: "L0" }, [
                branch<Named>({ name: "L1" }, [
                    branch<Named>({ name: "L2" }, [branch<Named>({ name: "L3" }, [{ name: "L4" }])]),
                ]),
            ]);
            const result = dedupeTree(node);
            expect(result).toEqual({
                name: "L0",
                $: [
                    {
                        name: "L1",
                        $: [{ name: "L2", $: [{ name: "L3", $: [{ name: "L4" }] }] }],
                    },
                ],
            });
        });

        test("deduplicates duplicated whole subtrees at the top level", () => {
            const makeSubtree = (): TreeNode<Named> =>
                branch<Named>({ name: "sub" }, [{ name: "x" }, branch<Named>({ name: "y" }, [{ name: "z" }])]);
            const node = branch<Named>({ name: "root" }, [makeSubtree(), makeSubtree(), makeSubtree()]);
            const result = dedupeTree(node);
            expect(result.$).toHaveLength(1);
            expect(result.$![0]).toEqual(makeSubtree());
        });

        test("a child crashing on an explicit `$: undefined` propagates the throw", () => {
            const badChild = { name: "bad", $: undefined } as unknown as TreeNode<Named>;
            const node = branch<Named>({ name: "root" }, [badChild]);
            expect(() => dedupeTree(node)).toThrow(TypeError);
        });
    });

    // -----------------------------------------------------------------------
    describe("non-`$` fields are never treated as child collections", () => {
        test("an array field NOT named `$` is left untouched (not recursed/deduped)", () => {
            const node = branch<{ items: { name: string }[] }>({ items: [{ name: "a" }, { name: "a" }] }, [
                { items: [] },
            ]);
            const result = dedupeTree(node);
            // The duplicate inside `items` is preserved — only `$` is processed.
            expect(result.items).toEqual([{ name: "a" }, { name: "a" }]);
        });

        test("an object field shaped like a node is not recursed into", () => {
            const node = branch<{ meta: { $: { name: string }[] } }>({ meta: { $: [{ name: "d" }, { name: "d" }] } }, [
                { meta: { $: [] } },
            ]);
            const result = dedupeTree(node);
            expect(result.meta).toEqual({ $: [{ name: "d" }, { name: "d" }] });
        });
    });

    // -----------------------------------------------------------------------
    describe("scale / wide trees", () => {
        test("dedupes a wide layer of many duplicates down to the distinct set", () => {
            const children: TreeNode<Valued>[] = [];
            for (let i = 0; i < 1000; i++) {
                children.push({ v: i % 5 });
            }
            const node = branch<Valued>({ v: "root" }, children);
            const result = dedupeTree(node);
            expect(result.$!.map(n => n.v)).toEqual([0, 1, 2, 3, 4]);
        });

        test("a fully distinct wide layer is preserved in order", () => {
            const children: TreeNode<Valued>[] = [];
            for (let i = 0; i < 200; i++) {
                children.push({ v: i });
            }
            const node = branch<Valued>({ v: "root" }, children);
            const result = dedupeTree(node);
            expect(result.$).toHaveLength(200);
            expect(result.$!.map(n => n.v)).toEqual(children.map(c => c.v));
        });
    });
});
