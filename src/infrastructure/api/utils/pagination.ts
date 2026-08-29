export type PaginationQuery = {
  limit: number;
  offset: number;
};

export type Pagination = PaginationQuery & {
  total: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function parsePagination(query: { limit?: unknown; offset?: unknown }): PaginationQuery {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

export function paginate<T>(
  items: T[],
  { limit, offset }: PaginationQuery,
): { items: T[]; pagination: Pagination } {
  const total = items.length;
  return {
    items: items.slice(offset, offset + limit),
    pagination: { limit, offset, total },
  };
}