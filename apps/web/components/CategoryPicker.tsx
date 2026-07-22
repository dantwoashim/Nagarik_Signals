import { categories } from '@/lib/constants/categories';

export function CategoryPicker() {
  return (
    <label className="field">
      <span>Category</span>
      <select name="category" required>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.label}</option>
        ))}
      </select>
      <span className="helper">Only public infrastructure categories are supported in the MVP.</span>
    </label>
  );
}
