export function getCompanyCategories(
  categories: string[],
  companyId: number | null,
  storeId?: number | null
): string[] {
  if (!categories || categories.length === 0) return [];
  const targetCoId = companyId || 1;

  return categories.filter(c => {
    if (!c) return false;
    // Check if category is scoped to a company
    if (c.startsWith('co_')) {
      const prefix = `co_${targetCoId}:`;
      return c.startsWith(prefix);
    }
    // Check if category is scoped to a store
    if (c.startsWith('st_')) {
      if (!storeId) return false;
      return c.startsWith(`st_${storeId}:`);
    }
    // Backward compatibility for numeric store prefix e.g. "1:Electronics"
    if (/^\d+:/.test(c)) {
      if (!storeId) return true;
      return c.startsWith(`${storeId}:`);
    }
    // Plain legacy category names default to Company 1
    return targetCoId === 1;
  });
}

export function getStoreCategories(categories: string[], storeId: number | null): string[] {
  if (!categories || categories.length === 0) return [];
  if (!storeId) return categories;
  return categories.filter(c => {
    if (!c) return false;
    if (c.startsWith('st_')) return c.startsWith(`st_${storeId}:`);
    if (/^\d+:/.test(c)) return c.startsWith(`${storeId}:`);
    return true;
  });
}

export function cleanCategoryName(category: string): string {
  if (!category) return '';
  if (category.startsWith('co_')) {
    const parts = category.split(':');
    return parts.slice(1).join(':');
  }
  if (category.startsWith('st_')) {
    const parts = category.split(':');
    return parts.slice(1).join(':');
  }
  if (category.includes(':')) {
    return category.split(':').slice(1).join(':');
  }
  return category;
}

export function formatCompanyCategory(categoryName: string, companyId: number | null): string {
  const clean = cleanCategoryName(categoryName.trim());
  const coId = companyId || 1;
  return `co_${coId}:${clean}`;
}

