// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  getSeriesEditorItems,
  defaultHalfYear,
  formatTime,
  WEEKDAY_ABBR,
  GradePickerField,
} from "./seriesEditorItems.tsx";

afterEach(cleanup);

describe("seriesEditorItems", () => {
  describe("defaultHalfYear", () => {
    it("returns 1 for August (school H1)", () => {
      expect(defaultHalfYear("2026-08-15")).toBe(1);
    });

    it("returns 1 for January (school H1)", () => {
      expect(defaultHalfYear("2027-01-15")).toBe(1);
    });

    it("returns 2 for March (school H2)", () => {
      expect(defaultHalfYear("2027-03-15")).toBe(2);
    });

    it("returns 2 for July (school H2)", () => {
      expect(defaultHalfYear("2027-07-01")).toBe(2);
    });

    it("returns 1 for December", () => {
      expect(defaultHalfYear("2026-12-15")).toBe(1);
    });

    it("returns 2 for February (boundary month)", () => {
      expect(defaultHalfYear("2027-02-01")).toBe(2);
    });
  });

  describe("formatTime", () => {
    it("formats morning time with zero-padding", () => {
      expect(formatTime(new Date(2026, 8, 7, 8, 5))).toBe("08:05");
    });

    it("formats afternoon time", () => {
      expect(formatTime(new Date(2026, 8, 7, 14, 30))).toBe("14:30");
    });
  });

  describe("WEEKDAY_ABBR", () => {
    it("maps Sunday=0 through Saturday=6", () => {
      expect(WEEKDAY_ABBR[0]).toBe("Sun");
      expect(WEEKDAY_ABBR[1]).toBe("Mon");
      expect(WEEKDAY_ABBR[5]).toBe("Fri");
      expect(WEEKDAY_ABBR[6]).toBe("Sat");
    });
  });

  describe("getSeriesEditorItems", () => {
    it("returns items with correct keys for SVAR Editor", () => {
      const items = getSeriesEditorItems({
        classes: [{ id: "grade-7", label: "Grade 7" }],
        formState: {},
        baseUrl: "http://localhost:1",
      });
      const keys = items.map((i) => i.key);
      expect(keys).toContain("seriesClassName");
      expect(keys).toContain("seriesDay");
      expect(keys).toContain("seriesStart");
      expect(keys).toContain("seriesEnd");
      expect(keys).toContain("seriesHalfYear");
      expect(keys).toContain("seriesRecurring");
      expect(keys).toContain("_seriesPreview");
    });

    it("passes classes to grade-picker item", () => {
      const classes = [
        { id: "g5", label: "Grade 5" },
        { id: "g7", label: "Grade 7" },
      ];
      const items = getSeriesEditorItems({
        classes,
        formState: {},
        baseUrl: "http://localhost:1",
      });
      const gradePicker = items.find((i) => i.key === "seriesClassName");
      expect((gradePicker as Record<string, unknown>).classes).toBe(classes);
    });

    it("marks the grade-picker disabled when editingExisting is true, so the edit flow can't reassign a series to a different class", () => {
      const items = getSeriesEditorItems({
        classes: [{ id: "g7", label: "Grade 7" }],
        formState: {},
        baseUrl: "http://localhost:1",
        editingExisting: true,
      });
      const gradePicker = items.find((i) => i.key === "seriesClassName");
      expect((gradePicker as Record<string, unknown>).disabled).toBe(true);
    });

    it("leaves the grade-picker enabled (disabled undefined) for the create-new-series flow", () => {
      const items = getSeriesEditorItems({
        classes: [{ id: "g7", label: "Grade 7" }],
        formState: {},
        baseUrl: "http://localhost:1",
      });
      const gradePicker = items.find((i) => i.key === "seriesClassName");
      expect((gradePicker as Record<string, unknown>).disabled).toBeUndefined();
    });

    it("passes formState and baseUrl to preview item", () => {
      const formState = { seriesDay: "Mon" };
      const items = getSeriesEditorItems({
        classes: [],
        formState,
        baseUrl: "http://x:1",
      });
      const preview = items.find((i) => i.key === "_seriesPreview");
      expect((preview as Record<string, unknown>).formState).toBe(formState);
      expect((preview as Record<string, unknown>).baseUrl).toBe("http://x:1");
    });
  });
});

describe("GradePickerField", () => {
  const classes = [
    { id: "grade-5-2026", label: "Grade 5" },
    { id: "grade-7-realschule-2026", label: "Grade 7 (realschulabschluss)" },
  ];

  it("auto-selects the first class when value is empty and not disabled (create-new-series flow)", () => {
    const onChange = vi.fn();
    render(
      <GradePickerField value="" onChange={onChange} classes={classes} />,
    );
    expect(onChange).toHaveBeenCalledWith({ value: "grade-5-2026" });
  });

  it("does NOT auto-select when disabled, even if value reads empty on this render -- editing an existing series must never silently swap its class", () => {
    const onChange = vi.fn();
    render(
      <GradePickerField value="" onChange={onChange} classes={classes} disabled />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not overwrite an already-set value even when not disabled", () => {
    const onChange = vi.fn();
    render(
      <GradePickerField
        value="grade-7-realschule-2026"
        onChange={onChange}
        classes={classes}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
