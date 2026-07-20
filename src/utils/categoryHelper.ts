export function getStoreCategories(categories: string[], storeId: number | null): string[] {
  if (!storeId) {
    // If no storeId is provided, fallback to categories that do not have a store prefix or all.
    return categories;
  }
  return categories.filter(c => {
    if (c.includes(':')) {
      return c.startsWith(`${storeId}:`);
    }
    // Backward compatibility for legacy categories (no colon)
    return true;
  });
}

export function cleanCategoryName(category: string): string {
  if (!category) return '';
  if (category.includes(':')) {
    return category.split(':').slice(1).join(':');
  }
  return category;
}
