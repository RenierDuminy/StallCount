// Reads that must not lose rows.
//
// Supabase (PostgREST `max_rows`) returns at most 1000 rows per request and
// says nothing when it cuts a result short: the page simply shows less than
// the database holds. A long `.in("col", ids)` list has the opposite problem:
// every id goes into the request URL, and around 200 uuids the URL is too long
// and the request fails. These helpers page through results and split id lists
// so neither can happen.
//
// Both return `{ data, error }` like a supabase-js query, so a call site keeps
// its own error handling:
//
//   const { data, error } = await selectAllRows(() =>
//     supabase.from("player").select("id, name").order("name").order("id"),
//   );
//
// `buildQuery` must return a NEW query each call (it is called once per page)
// and must end in an `.order()` that is unique overall, usually by adding
// `.order("id")` last. Without a unique order, rows can repeat or go missing
// between pages.

export const SUPABASE_MAX_ROWS = 1000;
// ~3.7 KB of uuids per request, well inside URL limits.
export const ID_CHUNK_SIZE = 100;

export async function selectAllRows(buildQuery, { pageSize = SUPABASE_MAX_ROWS } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

export function chunkIds(ids, size = ID_CHUNK_SIZE) {
  const unique = Array.from(new Set((ids || []).filter((id) => typeof id === "string" && id.length > 0)));
  const chunks = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

// `buildQuery(chunk)` gets one slice of `ids` (deduplicated) and returns a
// query that filters on it; every chunk is read in full (paged) and the rows
// are concatenated. An empty `ids` returns no rows without a request.
export async function selectAllRowsForIds(ids, buildQuery, options = {}) {
  const rows = [];
  for (const chunk of chunkIds(ids, options.chunkSize)) {
    const { data, error } = await selectAllRows(() => buildQuery(chunk), options);
    if (error) return { data: null, error };
    rows.push(...data);
  }
  return { data: rows, error: null };
}
