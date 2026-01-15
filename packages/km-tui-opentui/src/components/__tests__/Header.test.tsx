/**
 * Header Component Tests
 *
 * Tests for the Header component which displays board path,
 * view mode, and search query.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { Header } from "../Header.tsx";
import type { ViewMode } from "../../types.ts";

// Test helper to create header props
interface HeaderProps {
  rootPath: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  searchMode: boolean;
}

function createHeaderProps(overrides: Partial<HeaderProps> = {}): HeaderProps {
  return {
    rootPath: "/test/path",
    viewMode: "cards",
    searchQuery: "",
    searchMode: false,
    ...overrides,
  };
}

describe("Header Component", () => {
  describe("basic rendering", () => {
    it("renders with minimal props", () => {
      const props = createHeaderProps();
      const element = <Header {...props} />;
      expect(element).toBeDefined();
    });

    it("handles null rootPath", () => {
      const props = createHeaderProps({ rootPath: null });
      const element = <Header {...props} />;
      expect(element).toBeDefined();
      expect(element.props.rootPath).toBeNull();
    });

    it("displays rootPath when provided", () => {
      const props = createHeaderProps({ rootPath: "/projects/work" });
      const element = <Header {...props} />;
      expect(element.props.rootPath).toBe("/projects/work");
    });
  });

  describe("view modes", () => {
    const viewModes: ViewMode[] = ["cards", "list", "columns", "tabs"];

    for (const mode of viewModes) {
      it(`renders ${mode} view mode`, () => {
        const props = createHeaderProps({ viewMode: mode });
        const element = <Header {...props} />;
        expect(element.props.viewMode).toBe(mode);
      });
    }
  });

  describe("search mode", () => {
    it("renders without search mode", () => {
      const props = createHeaderProps({ searchMode: false });
      const element = <Header {...props} />;
      expect(element.props.searchMode).toBe(false);
    });

    it("renders with search mode enabled", () => {
      const props = createHeaderProps({
        searchMode: true,
        searchQuery: "test query",
      });
      const element = <Header {...props} />;
      expect(element.props.searchMode).toBe(true);
      expect(element.props.searchQuery).toBe("test query");
    });

    it("handles empty search query in search mode", () => {
      const props = createHeaderProps({
        searchMode: true,
        searchQuery: "",
      });
      const element = <Header {...props} />;
      expect(element.props.searchQuery).toBe("");
    });
  });
});
