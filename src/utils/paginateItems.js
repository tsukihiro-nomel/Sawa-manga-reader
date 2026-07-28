export function paginateItems(items = [], requestedPage = 0, requestedPageSize = 50) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { items: [], page: 0, totalPages: 0, start: 0, end: 0 };
  const pageSize = Math.max(1, Math.floor(Number(requestedPageSize) || 50));
  const totalPages = Math.ceil(list.length / pageSize);
  const page = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(requestedPage) || 0)));
  const start = page * pageSize;
  const end = Math.min(list.length, start + pageSize);
  return { items: list.slice(start, end), page, totalPages, start, end };
}
