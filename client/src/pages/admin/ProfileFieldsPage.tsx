import { CrudPage } from "./CrudPage";

export default function ProfileFieldsPage() {
  return (
    <CrudPage<{ id: string; key: string; label: string; type: string }>
      title="Custom profile fields"
      endpoint="/admin/profile-fields"
      fields={[
        { key: "key", label: "Key (snake_case)" },
        { key: "label", label: "Label" },
        { key: "type", label: "Type (text|number|date|select|textarea)" },
      ]}
      renderRow={(f) => (
        <span>
          {(f.key)} — {(f.label)} ({(f.type)})
        </span>
      )}
    />
  );
}
