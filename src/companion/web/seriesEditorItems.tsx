import { useState, useEffect } from "react";
import { registerEditorItem } from "@svar-ui/react-calendar";
import { fetchSeriesPreview } from "./api.ts";
import type { SeriesPreviewResponse, ClassSummary } from "./api.ts";

// SVAR Editor passes these props to registered editor items:
//   fieldKey: string  — the `key` from the items array
//   value: T          — current value from the event data object
//   onChange: (update: { value: T }) => void  — callback to update the value
//   error?: object    — validation error if any
//   ...rest           — any extra props from the items config are spread through

interface SvarFieldProps<T = unknown> {
  fieldKey: string;
  value: T;
  onChange: (update: { value: T }) => void;
}

function GradePickerField({
  value,
  onChange,
  classes,
}: SvarFieldProps<string> & { classes?: ClassSummary[] }) {
  const items = classes ?? [];
  const selected = value || items[0]?.id || "";
  useEffect(() => {
    if (!value && items[0]) onChange({ value: items[0].id });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <select
      value={selected}
      onChange={(e) => onChange({ value: e.target.value })}
    >
      {items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function WeekdayField({ value, onChange }: SvarFieldProps<string>) {
  return (
    <select
      value={value || "Mon"}
      onChange={(e) => onChange({ value: e.target.value })}
    >
      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

function TimeField({ value, onChange }: SvarFieldProps<string>) {
  return (
    <input
      type="time"
      value={value || ""}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}

function HalfYearField({ value, onChange }: SvarFieldProps<number>) {
  return (
    <select
      value={Number(value) || 1}
      onChange={(e) => onChange({ value: Number(e.target.value) })}
    >
      <option value={1}>Half-year 1 (Aug – Jan)</option>
      <option value={2}>Half-year 2 (Feb – Jul)</option>
    </select>
  );
}

function RecurringField({ value, onChange }: SvarFieldProps<boolean>) {
  const checked = value === undefined ? true : Boolean(value);
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange({ value: e.target.checked })}
      />
      Create recurring weekly series
    </label>
  );
}

function SeriesPreviewField({
  formState,
  baseUrl,
}: SvarFieldProps & {
  formState?: Record<string, unknown>;
  baseUrl?: string;
}) {
  const [preview, setPreview] = useState<SeriesPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fv = formState;
  const className = fv?.seriesClassName as string | undefined;
  const day = fv?.seriesDay as string | undefined;
  const start = fv?.seriesStart as string | undefined;
  const end = fv?.seriesEnd as string | undefined;
  const halfYear = fv?.seriesHalfYear as 1 | 2 | undefined;
  const recurring = fv?.seriesRecurring as boolean | undefined;

  useEffect(() => {
    if (
      !recurring ||
      !className ||
      !day ||
      !start ||
      !end ||
      !halfYear ||
      !baseUrl
    ) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      let cancelled = false;
      fetchSeriesPreview({
        baseUrl,
        className,
        day,
        start,
        end,
        halfYear,
      }).then(
        (res) => {
          if (!cancelled) {
            setPreview(res);
            setLoading(false);
          }
        },
        (err) => {
          if (!cancelled) {
            setError((err as Error).message);
            setLoading(false);
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => {
      clearTimeout(timer);
      setLoading(false);
    };
  }, [className, day, start, end, halfYear, recurring, baseUrl]);

  if (recurring === false) {
    return (
      <p style={{ margin: "4px 0", opacity: 0.7 }}>
        Single schedule slot — same weekday, every week of the half-year.
      </p>
    );
  }
  if (loading)
    return <p style={{ margin: "4px 0", opacity: 0.7 }}>Loading preview…</p>;
  if (error)
    return (
      <p style={{ margin: "4px 0", color: "var(--wx-color-danger, #d9534f)" }}>
        {error}
      </p>
    );
  if (!preview) return null;
  if (preview.dates.length === 0)
    return (
      <p style={{ margin: "4px 0" }}>No valid dates found in this half-year.</p>
    );

  return (
    <div
      style={{ margin: "4px 0" }}
      aria-live="polite"
      data-testid="series-preview"
    >
      <p>
        <strong>{preview.dates.length}</strong> lesson
        {preview.dates.length === 1 ? "" : "s"} from {preview.dates[0]} to{" "}
        {preview.dates[preview.dates.length - 1]}
        {preview.skippedCount > 0 && (
          <>
            , {preview.skippedCount} week{preview.skippedCount === 1 ? "" : "s"}{" "}
            skipped (holidays)
          </>
        )}
      </p>
      {preview.conflicts.length > 0 && (
        <p style={{ color: "var(--wx-color-warning, #f0ad4e)" }}>
          ⚠ {preview.conflicts.length} date
          {preview.conflicts.length === 1 ? "" : "s"} conflict
          {preview.conflicts.length === 1 ? "s" : ""} with another grade at this
          time
        </p>
      )}
    </div>
  );
}

registerEditorItem("grade-picker", GradePickerField);
registerEditorItem("weekday-select", WeekdayField);
registerEditorItem("time-input", TimeField);
registerEditorItem("halfyear-select", HalfYearField);
registerEditorItem("recurring-toggle", RecurringField);
registerEditorItem("series-preview", SeriesPreviewField);

export type SeriesFormValues = {
  seriesClassName: string;
  seriesDay: string;
  seriesStart: string;
  seriesEnd: string;
  seriesHalfYear: 1 | 2;
  seriesRecurring: boolean;
};

export function getSeriesEditorItems(params: {
  classes: ClassSummary[];
  formState: Record<string, unknown>;
  baseUrl: string;
}) {
  return [
    {
      comp: "grade-picker",
      key: "seriesClassName",
      label: "Grade",
      classes: params.classes,
    },
    { comp: "weekday-select", key: "seriesDay", label: "Day" },
    { comp: "time-input", key: "seriesStart", label: "Start" },
    { comp: "time-input", key: "seriesEnd", label: "End" },
    { comp: "halfyear-select", key: "seriesHalfYear", label: "Half-year" },
    { comp: "recurring-toggle", key: "seriesRecurring", label: "" },
    {
      comp: "series-preview",
      key: "_seriesPreview",
      label: "Preview",
      formState: params.formState,
      baseUrl: params.baseUrl,
    },
  ];
}

export function defaultHalfYear(dateIso: string): 1 | 2 {
  const month = parseInt(dateIso.slice(5, 7), 10);
  return month >= 2 && month <= 7 ? 2 : 1;
}

export const WEEKDAY_ABBR = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
