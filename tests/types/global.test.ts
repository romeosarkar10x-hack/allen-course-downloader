/* eslint-disable @typescript-eslint/no-empty-object-type */
import { describe, test, expectTypeOf } from "vitest";
import type { KeyOfUnion, OmitFromUnion } from "@/types/global";

// ─── Helper types used across tests ───────────────────────────────────────────

type A = { a: number; shared: string };
type B = { b: boolean; shared: string };
type C = { c: string; shared: string; extra: number };

type X = { x: number; y: string };
type Y = { y: string; z: boolean };
type Z = { z: boolean; w: number[] };

type Empty = {};
type Single = { only: string };

type Deep = { nested: { deep: number }; top: string };
type Flat = { flat: number; top: string };

type WithOptional = { req: string; opt?: number };
type WithRequired = { req: string; other: boolean };

type ReadonlyType = { readonly ro: string; rw: number };
type MutableType = { rw: number; extra: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  KeyOfUnion<U>
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("KeyOfUnion", () => {
    // ── Single-member unions (trivial / baseline) ────────────────────────────

    describe("single-member unions", () => {
        test("single type returns its keys", () => {
            expectTypeOf<KeyOfUnion<A>>().toEqualTypeOf<"a" | "shared">();
        });

        test("empty object returns never", () => {
            expectTypeOf<KeyOfUnion<Empty>>().toEqualTypeOf<never>();
        });

        test("single-key object", () => {
            expectTypeOf<KeyOfUnion<Single>>().toEqualTypeOf<"only">();
        });
    });

    // ── Two-member unions ────────────────────────────────────────────────────

    describe("two-member unions", () => {
        test("A | B returns all keys from both members", () => {
            expectTypeOf<KeyOfUnion<A | B>>().toEqualTypeOf<"a" | "b" | "shared">();
        });

        test("X | Y returns all keys from both members", () => {
            expectTypeOf<KeyOfUnion<X | Y>>().toEqualTypeOf<"x" | "y" | "z">();
        });

        test("Y | Z returns all keys from both members", () => {
            expectTypeOf<KeyOfUnion<Y | Z>>().toEqualTypeOf<"y" | "z" | "w">();
        });

        test("disjoint types — no shared keys", () => {
            type D1 = { foo: number };
            type D2 = { bar: string };
            expectTypeOf<KeyOfUnion<D1 | D2>>().toEqualTypeOf<"foo" | "bar">();
        });

        test("identical types — same keys", () => {
            expectTypeOf<KeyOfUnion<A | A>>().toEqualTypeOf<"a" | "shared">();
        });

        test("one empty member — only other member's keys", () => {
            expectTypeOf<KeyOfUnion<A | Empty>>().toEqualTypeOf<"a" | "shared">();
        });

        test("both empty — never", () => {
            expectTypeOf<KeyOfUnion<Empty | Empty>>().toEqualTypeOf<never>();
        });
    });

    // ── Three-member unions ──────────────────────────────────────────────────

    describe("three-member unions", () => {
        test("A | B | C returns all keys", () => {
            expectTypeOf<KeyOfUnion<A | B | C>>().toEqualTypeOf<"a" | "b" | "c" | "shared" | "extra">();
        });

        test("X | Y | Z returns all keys", () => {
            expectTypeOf<KeyOfUnion<X | Y | Z>>().toEqualTypeOf<"x" | "y" | "z" | "w">();
        });

        test("two disjoint + one empty", () => {
            type D1 = { foo: number };
            type D2 = { bar: string };
            expectTypeOf<KeyOfUnion<D1 | D2 | Empty>>().toEqualTypeOf<"foo" | "bar">();
        });
    });

    // ── Contrast with plain keyof ────────────────────────────────────────────

    describe("contrast with plain keyof", () => {
        test("plain keyof on union gives only shared keys", () => {
            // keyof (A | B) = "shared"  (intersection)
            expectTypeOf<keyof (A | B)>().toEqualTypeOf<"shared">();
        });

        test("KeyOfUnion gives ALL keys (superset of plain keyof)", () => {
            expectTypeOf<KeyOfUnion<A | B>>().toEqualTypeOf<"a" | "b" | "shared">();
        });

        test("when all members share same keys, KeyOfUnion equals keyof", () => {
            type M1 = { k1: number; k2: string };
            type M2 = { k1: boolean; k2: number };
            expectTypeOf<KeyOfUnion<M1 | M2>>().toEqualTypeOf<keyof (M1 | M2)>();
        });

        test("disjoint union: keyof gives never, KeyOfUnion gives all", () => {
            type D1 = { foo: number };
            type D2 = { bar: string };
            expectTypeOf<keyof (D1 | D2)>().toEqualTypeOf<never>();
            expectTypeOf<KeyOfUnion<D1 | D2>>().toEqualTypeOf<"foo" | "bar">();
        });
    });

    // ── Edge cases with modifiers ────────────────────────────────────────────

    describe("modifier edge cases", () => {
        test("optional properties are included", () => {
            expectTypeOf<KeyOfUnion<WithOptional>>().toEqualTypeOf<"req" | "opt">();
        });

        test("union with optional and required", () => {
            expectTypeOf<KeyOfUnion<WithOptional | WithRequired>>().toEqualTypeOf<"req" | "opt" | "other">();
        });

        test("readonly properties are included", () => {
            expectTypeOf<KeyOfUnion<ReadonlyType>>().toEqualTypeOf<"ro" | "rw">();
        });

        test("union with readonly and mutable", () => {
            expectTypeOf<KeyOfUnion<ReadonlyType | MutableType>>().toEqualTypeOf<"ro" | "rw" | "extra">();
        });
    });

    // ── Complex value types ──────────────────────────────────────────────────

    describe("complex value types", () => {
        test("nested object values — keys still extracted", () => {
            expectTypeOf<KeyOfUnion<Deep | Flat>>().toEqualTypeOf<"nested" | "top" | "flat">();
        });

        test("function-valued properties", () => {
            type FnA = { run: () => void; name: string };
            type FnB = { exec: (x: number) => string; name: string };
            expectTypeOf<KeyOfUnion<FnA | FnB>>().toEqualTypeOf<"run" | "exec" | "name">();
        });

        test("array-valued properties", () => {
            type ArrA = { items: number[]; tag: string };
            type ArrB = { entries: string[]; tag: string };
            expectTypeOf<KeyOfUnion<ArrA | ArrB>>().toEqualTypeOf<"items" | "entries" | "tag">();
        });

        test("index-signature types", () => {
            type Indexed = { [k: string]: number };
            type Normal = { specific: string };
            expectTypeOf<KeyOfUnion<Indexed | Normal>>().toEqualTypeOf<string | number>();
        });
    });

    // ── Large unions ─────────────────────────────────────────────────────────

    describe("large unions", () => {
        test("four-member union", () => {
            type T1 = { a: 1 };
            type T2 = { b: 2 };
            type T3 = { c: 3 };
            type T4 = { d: 4 };
            expectTypeOf<KeyOfUnion<T1 | T2 | T3 | T4>>().toEqualTypeOf<"a" | "b" | "c" | "d">();
        });

        test("five-member union with overlap", () => {
            type T1 = { a: 1; s: 0 };
            type T2 = { b: 2; s: 0 };
            type T3 = { c: 3; s: 0 };
            type T4 = { d: 4; s: 0 };
            type T5 = { e: 5; s: 0 };
            expectTypeOf<KeyOfUnion<T1 | T2 | T3 | T4 | T5>>().toEqualTypeOf<"a" | "b" | "c" | "d" | "e" | "s">();
        });
    });

    // ── Discriminated unions ─────────────────────────────────────────────────

    describe("discriminated unions", () => {
        test("extracts discriminant and all variant keys", () => {
            type Circle = { kind: "circle"; radius: number };
            type Rect = { kind: "rect"; width: number; height: number };
            expectTypeOf<KeyOfUnion<Circle | Rect>>().toEqualTypeOf<"kind" | "radius" | "width" | "height">();
        });

        test("three-variant discriminated union", () => {
            type Loading = { status: "loading" };
            type Success = { status: "success"; data: string };
            type Error = { status: "error"; error: string; code: number };
            expectTypeOf<KeyOfUnion<Loading | Success | Error>>().toEqualTypeOf<"status" | "data" | "error" | "code">();
        });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  OmitFromUnion<U, K>
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OmitFromUnion", () => {
    // ── Single-member (behaves like plain Omit) ─────────────────────────────

    describe("single-member (mirrors Omit)", () => {
        test("omit one key", () => {
            expectTypeOf<OmitFromUnion<A, "a">>().toEqualTypeOf<{ shared: string }>();
        });

        test("omit shared key", () => {
            expectTypeOf<OmitFromUnion<A, "shared">>().toEqualTypeOf<{
                a: number;
            }>();
        });

        test("omit all keys", () => {
            expectTypeOf<OmitFromUnion<A, "a" | "shared">>().toEqualTypeOf<{}>();
        });

        test("omit non-existent key — no change", () => {
            expectTypeOf<OmitFromUnion<A, "nope">>().toEqualTypeOf<A>();
        });

        test("omit from empty — still empty", () => {
            expectTypeOf<OmitFromUnion<Empty, "whatever">>().toEqualTypeOf<Empty>();
        });

        test("omit from single-key object", () => {
            expectTypeOf<OmitFromUnion<Single, "only">>().toEqualTypeOf<{}>();
        });
    });

    // ── Two-member unions — omit shared key ─────────────────────────────────

    describe("two-member unions — omit shared key", () => {
        test("omit 'shared' from A | B", () => {
            type Result = OmitFromUnion<A | B, "shared">;
            expectTypeOf<Result>().toEqualTypeOf<Omit<A, "shared"> | Omit<B, "shared">>();
            // More explicitly:
            expectTypeOf<Result>().toEqualTypeOf<{ a: number } | { b: boolean }>();
        });

        test("omit 'top' from Deep | Flat", () => {
            type Result = OmitFromUnion<Deep | Flat, "top">;
            expectTypeOf<Result>().toEqualTypeOf<{ nested: { deep: number } } | { flat: number }>();
        });
    });

    // ── Two-member unions — omit member-specific key ────────────────────────

    describe("two-member unions — omit member-specific key", () => {
        test("omit 'a' from A | B — only affects A", () => {
            type Result = OmitFromUnion<A | B, "a">;
            expectTypeOf<Result>().toEqualTypeOf<{ shared: string } | { b: boolean; shared: string }>();
        });

        test("omit 'b' from A | B — only affects B", () => {
            type Result = OmitFromUnion<A | B, "b">;
            expectTypeOf<Result>().toEqualTypeOf<{ a: number; shared: string } | { shared: string }>();
        });

        test("omit 'x' from X | Y — only affects X", () => {
            type Result = OmitFromUnion<X | Y, "x">;
            expectTypeOf<Result>().toEqualTypeOf<{ y: string } | { y: string; z: boolean }>();
        });

        test("omit key present in neither — identity", () => {
            type Result = OmitFromUnion<A | B, "nonexistent">;
            expectTypeOf<Result>().toEqualTypeOf<A | B>();
        });
    });

    // ── Two-member unions — omit multiple keys ──────────────────────────────

    describe("two-member unions — omit multiple keys", () => {
        test("omit multiple shared keys", () => {
            type T1 = { a: 1; b: 2; c: 3 };
            type T2 = { a: 4; b: 5; d: 6 };
            type Result = OmitFromUnion<T1 | T2, "a" | "b">;
            expectTypeOf<Result>().toEqualTypeOf<{ c: 3 } | { d: 6 }>();
        });

        test("omit mix of shared and member-specific keys", () => {
            type Result = OmitFromUnion<A | B, "shared" | "a">;
            expectTypeOf<Result>().toEqualTypeOf<{} | { b: boolean }>();
        });

        test("omit all keys from both members", () => {
            type Result = OmitFromUnion<A | B, "a" | "b" | "shared">;
            expectTypeOf<Result>().toEqualTypeOf<{} | {}>();
        });
    });

    // ── Three-member unions ──────────────────────────────────────────────────

    describe("three-member unions", () => {
        test("omit shared key from A | B | C", () => {
            type Result = OmitFromUnion<A | B | C, "shared">;
            expectTypeOf<Result>().toEqualTypeOf<{ a: number } | { b: boolean } | { c: string; extra: number }>();
        });

        test("omit member-specific key from A | B | C", () => {
            type Result = OmitFromUnion<A | B | C, "extra">;
            expectTypeOf<Result>().toEqualTypeOf<A | B | { c: string; shared: string }>();
        });

        test("omit multiple keys from X | Y | Z", () => {
            type Result = OmitFromUnion<X | Y | Z, "y" | "z">;
            expectTypeOf<Result>().toEqualTypeOf<{ x: number } | {} | { w: number[] }>();
        });
    });

    // ── Contrast with plain Omit on union ────────────────────────────────────

    describe("contrast with plain Omit on union", () => {
        test("plain Omit on union only omits keys in keyof intersection", () => {
            // Omit<A | B, "a"> — "a" is NOT in keyof (A | B) = "shared"
            // so plain Omit<A | B, "a"> doesn't actually omit "a"
            // it just does Omit on the intersection keys
            type PlainResult = Omit<A | B, "a">;
            // Plain Omit<A|B, "a"> results in { shared: string } because
            // keyof (A|B) = "shared" and "a" is not in it, so nothing omitted
            expectTypeOf<PlainResult>().toEqualTypeOf<{ shared: string }>();
        });

        test("OmitFromUnion correctly distributes and omits 'a'", () => {
            type DistResult = OmitFromUnion<A | B, "a">;
            // { shared: string } | { b: boolean; shared: string }
            expectTypeOf<DistResult>().toEqualTypeOf<{ shared: string } | { b: boolean; shared: string }>();
        });

        test("plain Omit on shared key", () => {
            type PlainResult = Omit<A | B, "shared">;
            expectTypeOf<PlainResult>().toEqualTypeOf<{}>();
        });

        test("OmitFromUnion on shared key preserves member-specific keys", () => {
            type DistResult = OmitFromUnion<A | B, "shared">;
            expectTypeOf<DistResult>().toEqualTypeOf<{ a: number } | { b: boolean }>();
        });
    });

    // ── Modifier preservation ────────────────────────────────────────────────

    describe("modifier preservation", () => {
        test("optional property survives omit of other key", () => {
            type Result = OmitFromUnion<WithOptional, "req">;
            expectTypeOf<Result>().toEqualTypeOf<{ opt?: number }>();
        });

        test("readonly property survives omit of other key", () => {
            type Result = OmitFromUnion<ReadonlyType, "rw">;
            expectTypeOf<Result>().toEqualTypeOf<{ readonly ro: string }>();
        });

        test("omit optional key", () => {
            type Result = OmitFromUnion<WithOptional, "opt">;
            expectTypeOf<Result>().toEqualTypeOf<{ req: string }>();
        });

        test("omit readonly key", () => {
            type Result = OmitFromUnion<ReadonlyType, "ro">;
            expectTypeOf<Result>().toEqualTypeOf<{ rw: number }>();
        });

        test("union with mixed modifiers — omit shared", () => {
            type Result = OmitFromUnion<WithOptional | WithRequired, "req">;
            expectTypeOf<Result>().toEqualTypeOf<{ opt?: number } | { other: boolean }>();
        });

        test("union of readonly + mutable — omit shared", () => {
            type Result = OmitFromUnion<ReadonlyType | MutableType, "rw">;
            expectTypeOf<Result>().toEqualTypeOf<{ readonly ro: string } | { extra: string }>();
        });
    });

    // ── Discriminated unions ─────────────────────────────────────────────────

    describe("discriminated unions", () => {
        type Circle = { kind: "circle"; radius: number };
        type Rect = { kind: "rect"; width: number; height: number };
        type Shape = Circle | Rect;

        test("omit discriminant", () => {
            type Result = OmitFromUnion<Shape, "kind">;
            expectTypeOf<Result>().toEqualTypeOf<{ radius: number } | { width: number; height: number }>();
        });

        test("omit variant-specific key", () => {
            type Result = OmitFromUnion<Shape, "radius">;
            expectTypeOf<Result>().toEqualTypeOf<
                { kind: "circle" } | { kind: "rect"; width: number; height: number }
            >();
        });

        test("omit multiple variant-specific keys", () => {
            type Result = OmitFromUnion<Shape, "radius" | "width">;
            expectTypeOf<Result>().toEqualTypeOf<{ kind: "circle" } | { kind: "rect"; height: number }>();
        });

        test("omit discriminant + variant key", () => {
            type Result = OmitFromUnion<Shape, "kind" | "radius">;
            expectTypeOf<Result>().toEqualTypeOf<{} | { width: number; height: number }>();
        });
    });

    // ── Complex value types ──────────────────────────────────────────────────

    describe("complex value types", () => {
        test("function-valued properties preserved after omit", () => {
            type FnA = { run: () => void; name: string };
            type FnB = { exec: (x: number) => string; name: string };
            type Result = OmitFromUnion<FnA | FnB, "name">;
            expectTypeOf<Result>().toEqualTypeOf<{ run: () => void } | { exec: (x: number) => string }>();
        });

        test("nested objects preserved after omit", () => {
            type Result = OmitFromUnion<Deep | Flat, "top">;
            expectTypeOf<Result>().toEqualTypeOf<{ nested: { deep: number } } | { flat: number }>();
        });
    });

    // ── Interaction: OmitFromUnion uses KeyOfUnion in its constraint ─────────

    describe("KeyOfUnion used in K constraint", () => {
        test("K can be a key from only one member of the union", () => {
            // "a" is only in A, not B — but K extends KeyOfUnion<U> | string
            // so this is valid
            type Result = OmitFromUnion<A | B, "a">;
            expectTypeOf<Result>().toEqualTypeOf<{ shared: string } | { b: boolean; shared: string }>();
        });

        test("K can be a KeyOfUnion result", () => {
            type Keys = KeyOfUnion<A | B>; // "a" | "b" | "shared"
            type Result = OmitFromUnion<A | B, Keys>;
            expectTypeOf<Result>().toEqualTypeOf<{} | {}>();
        });
    });

    // ── Composability ────────────────────────────────────────────────────────

    describe("composability", () => {
        test("nested OmitFromUnion — omit in two steps", () => {
            type Step1 = OmitFromUnion<A | B | C, "shared">;
            type Step2 = OmitFromUnion<Step1, "extra">;
            expectTypeOf<Step2>().toEqualTypeOf<{ a: number } | { b: boolean } | { c: string }>();
        });

        test("KeyOfUnion of OmitFromUnion result", () => {
            type Omitted = OmitFromUnion<A | B, "shared">;
            type Keys = KeyOfUnion<Omitted>;
            expectTypeOf<Keys>().toEqualTypeOf<"a" | "b">();
        });

        test("OmitFromUnion then KeyOfUnion — multi-step", () => {
            type Step1 = OmitFromUnion<A | B | C, "shared">;
            type Keys = KeyOfUnion<Step1>;
            expectTypeOf<Keys>().toEqualTypeOf<"a" | "b" | "c" | "extra">();
        });
    });

    // ── Assignability checks ─────────────────────────────────────────────────

    describe("assignability", () => {
        test("OmitFromUnion result is assignable from original members (post-omit)", () => {
            type Result = OmitFromUnion<A | B, "shared">;
            // { a: number } should be assignable to Result
            expectTypeOf<{ a: number }>().toMatchTypeOf<Result>();
            // { b: boolean } should be assignable to Result
            expectTypeOf<{ b: boolean }>().toMatchTypeOf<Result>();
        });

        test("original union member NOT assignable to narrowed OmitFromUnion (missing omitted key is fine)", () => {
            type Result = OmitFromUnion<A | B, "a">;
            // A after omit = { shared: string }, B stays { b: boolean; shared: string }
            // A (with 'a') is still assignable because extra props are allowed
            expectTypeOf<A>().toMatchTypeOf<Result>();
        });

        test("KeyOfUnion result extends string", () => {
            expectTypeOf<KeyOfUnion<A | B>>().toMatchTypeOf<string>();
        });
    });

    // ── Identity / no-op cases ───────────────────────────────────────────────

    describe("identity / no-op", () => {
        test("omit never — identity", () => {
            type Result = OmitFromUnion<A | B, never>;
            expectTypeOf<Result>().toEqualTypeOf<A | B>();
        });

        test("KeyOfUnion of single empty object is never", () => {
            expectTypeOf<KeyOfUnion<{}>>().toEqualTypeOf<never>();
        });

        test("OmitFromUnion from single-member union same as Omit", () => {
            expectTypeOf<OmitFromUnion<A, "a">>().toEqualTypeOf<Omit<A, "a">>();
        });
    });

    // ── Literal types ────────────────────────────────────────────────────────

    describe("literal value types", () => {
        test("union of literal-keyed objects", () => {
            type L1 = { status: "ok"; data: string };
            type L2 = { status: "err"; code: number };
            expectTypeOf<KeyOfUnion<L1 | L2>>().toEqualTypeOf<"status" | "data" | "code">();
        });

        test("omit from literal-valued discriminant preserves literal type", () => {
            type L1 = { status: "ok"; data: string };
            type L2 = { status: "err"; code: number };
            type Result = OmitFromUnion<L1 | L2, "data" | "code">;
            expectTypeOf<Result>().toEqualTypeOf<{ status: "ok" } | { status: "err" }>();
        });
    });

    // ── Intersection members in union ────────────────────────────────────────

    describe("intersection members in union", () => {
        test("KeyOfUnion with intersection member", () => {
            type AB = A & B;
            type Result = KeyOfUnion<AB | C>;
            expectTypeOf<Result>().toEqualTypeOf<"a" | "b" | "shared" | "c" | "extra">();
        });

        test("OmitFromUnion with intersection member", () => {
            type AB = A & B;
            type Result = OmitFromUnion<AB | C, "shared">;
            expectTypeOf<Result>().toEqualTypeOf<{ a: number; b: boolean } | { c: string; extra: number }>();
        });
    });
});
