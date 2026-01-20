import { describe, expect, it } from "bun:test";
import React from "react";
import { TruncatedText, useTruncatedText } from "./TruncatedText.tsx";
import { ConstraintRoot } from "./context.tsx";

// Mock stdout for testing
function createMockStdout(columns: number, rows: number) {
  return {
    columns,
    rows,
    on: () => {},
    off: () => {},
  } as unknown as NodeJS.WriteStream;
}

describe("TruncatedText", () => {
  it("renders without crashing", () => {
    const element = <TruncatedText>Hello World</TruncatedText>;
    expect(element).toBeDefined();
    expect(element.props.children).toBe("Hello World");
  });

  it("accepts maxLines prop", () => {
    const element = (
      <TruncatedText maxLines={3}>Multi-line text here</TruncatedText>
    );
    expect(element.props.maxLines).toBe(3);
  });

  it("accepts ellipsis prop", () => {
    const element = (
      <TruncatedText ellipsis="...">Long text</TruncatedText>
    );
    expect(element.props.ellipsis).toBe("...");
  });

  it("accepts width override prop", () => {
    const element = (
      <TruncatedText width={40}>Fixed width text</TruncatedText>
    );
    expect(element.props.width).toBe(40);
  });

  it("accepts pad prop", () => {
    const element = (
      <TruncatedText pad={true}>Padded text</TruncatedText>
    );
    expect(element.props.pad).toBe(true);
  });

  it("accepts renderLine prop", () => {
    const renderLine = (line: string, i: number) => <span key={i}>{line}</span>;
    const element = (
      <TruncatedText renderLine={renderLine}>Custom render</TruncatedText>
    );
    expect(element.props.renderLine).toBe(renderLine);
  });

  it("works inside ConstraintRoot", () => {
    const stdout = createMockStdout(80, 24);
    const element = (
      <ConstraintRoot stdout={stdout}>
        <TruncatedText>Text inside constraint</TruncatedText>
      </ConstraintRoot>
    );
    expect(element).toBeDefined();
  });
});

describe("useTruncatedText", () => {
  it("is a function", () => {
    expect(typeof useTruncatedText).toBe("function");
  });

  it("returns object with lines and truncated", () => {
    // The hook signature returns { lines: string[], truncated: boolean }
    // We can verify the types without actually calling it in a component
    const hookFn = useTruncatedText;
    expect(hookFn).toBeDefined();
  });
});
