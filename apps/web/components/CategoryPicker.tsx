import { categories } from '@/lib/constants/categories';

export function CategoryPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
} = {}) {
  return (
    <label className="field">
      <span>Category</span>
      <select
        name="category"
        required
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
      <span className="helper">Choose the public asset most directly affected.</span>
    </label>
  );
}
