import { CrudPage } from "./CrudPage";

export default function ProfileFieldsPage() {
  return (
    <CrudPage
      title="Custom profile fields"
      endpoint="/admin/profile-fields"
      fields={[
        { key: "key", label: "Key (snake_case)" },
        { key: "label", label: "Label" },
        { key: "type", label: "Type (text|number|date|select|textarea)" },
      ]}
      renderRow={(f) => (
        <span>
          {(f as { key: string; label: string; type: string }).key} — {(f as { label: string }).label} ({(f as { type: string }).type})
        </span>
      )}
    />
  );
}
