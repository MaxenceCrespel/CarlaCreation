// Deep links from the homepage / service cards: /services?categorie=<id> and
// /booking?categorie=<id> open on that top-level category (falls back to the
// first one when the id is missing or unknown).
export function firstTopLevelCategoryId(categories) {
  return categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null;
}

export function initialCategoryId(categories, rawParam) {
  const wanted = Number(rawParam);
  const match = categories.find((c) => !c.parent_id && c.id === wanted);
  return match ? match.id : firstTopLevelCategoryId(categories);
}

// A service id (/booking?prestation=<id>) -> { category, subcategory } to display it.
export function categoriesForService(categories, service) {
  const own = categories.find((c) => c.id === service.category_id);
  if (!own) return { category: firstTopLevelCategoryId(categories), subcategory: null };
  return own.parent_id ? { category: own.parent_id, subcategory: own.id } : { category: own.id, subcategory: null };
}
