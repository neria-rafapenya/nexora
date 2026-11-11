import type { DateFieldProps } from "./DateField.types";
export function DateField({ label, value, min, onChange }: DateFieldProps) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "#203d33",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
      <input
        type="date"
        lang="es"
        aria-label={label}
        value={value}
        min={min}
        required
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* Browsers without showPicker keep their default date control. */
          }
        }}
        style={{
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          height: 48,
          border: "1px solid #e2e7df",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 13,
          fontFamily: "inherit",
          fontWeight: 400,
          color: "#203d33",
          background: "white",
          colorScheme: "light",
        }}
      />
    </label>
  );
}
