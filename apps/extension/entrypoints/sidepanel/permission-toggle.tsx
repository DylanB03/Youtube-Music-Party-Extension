type PermissionToggleProps = {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

export function PermissionToggle({
  checked,
  label,
  disabled,
  onChange,
}: PermissionToggleProps) {
  return (
    <label className={`toggle ${disabled ? "disabled" : ""}`}>
      <span className="toggle-label">{label}</span>
      <span className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-control" aria-hidden="true" />
      </span>
    </label>
  );
}
