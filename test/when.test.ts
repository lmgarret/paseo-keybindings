import { describe, expect, it } from "vitest";
import { compileWhen } from "../client/when";

describe("compileWhen", () => {
  it("matches when the clause is missing or empty", () => {
    expect(compileWhen(undefined)({})).toBe(true);
    expect(compileWhen("  ")({})).toBe(true);
  });

  it("treats unknown identifiers as false", () => {
    expect(compileWhen("terminalFocus")({})).toBe(false);
    expect(compileWhen("!terminalFocus")({})).toBe(true);
  });

  it("evaluates the default copy clause", () => {
    const when = compileWhen("!terminalFocus && hasSelection");
    expect(when({ terminalFocus: false, hasSelection: true })).toBe(true);
    expect(when({ terminalFocus: true, hasSelection: true })).toBe(false);
    expect(when({ terminalFocus: false, hasSelection: false })).toBe(false);
  });

  it("gives ! over && over || precedence", () => {
    const when = compileWhen("a || b && !c");
    expect(when({ a: true })).toBe(true);
    expect(when({ b: true })).toBe(true);
    expect(when({ b: true, c: true })).toBe(false);
  });

  it("supports parentheses, double negation and literals", () => {
    expect(compileWhen("(a || b) && c")({ a: true })).toBe(false);
    expect(compileWhen("(a || b) && c")({ a: true, c: true })).toBe(true);
    expect(compileWhen("!!a")({ a: true })).toBe(true);
    expect(compileWhen("true && !false")({})).toBe(true);
  });

  it("accepts dotted identifiers", () => {
    expect(compileWhen("config.foo")({ "config.foo": true })).toBe(true);
  });

  it("rejects malformed clauses", () => {
    expect(() => compileWhen("a &&")).toThrow();
    expect(() => compileWhen("(a")).toThrow(/Missing \)/);
    expect(() => compileWhen("a b")).toThrow(/trailing/);
    expect(() => compileWhen("a & b")).toThrow(/Unexpected/);
    expect(() => compileWhen("a == b")).toThrow();
  });
});
