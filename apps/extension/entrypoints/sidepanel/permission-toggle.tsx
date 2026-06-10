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
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
