export function parseCatalogCsv(source: string): string[][] {
  if (new TextEncoder().encode(source).byteLength > 256 * 1024) throw new Error('CSV_TOO_LARGE');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closedQuote = false;
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let index = 0; index <= text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (!quoted && field) throw new Error('INVALID_CSV_QUOTE');
      else { quoted = !quoted; closedQuote = !quoted; }
    } else if ((character === ',' || character === '\n' || character === undefined) && !quoted) {
      row.push(field.trim()); field = ''; closedQuote = false;
      if (character !== ',') {
        if (row.some(value => value)) rows.push(row);
        row = [];
        if (rows.length > 201) throw new Error('CSV_ROW_LIMIT');
      }
    } else if (character !== undefined) {
      if (closedQuote && !/\s/.test(character)) throw new Error('INVALID_CSV_QUOTE');
      if (!closedQuote) field += character;
    }
  }
  if (quoted) throw new Error('INVALID_CSV_QUOTE');
  if (!rows.length) throw new Error('EMPTY_CSV');
  return rows;
}

export const CATALOG_IMPORT_COLUMNS = ['vendor_id', 'category_id', 'name_bn', 'name_en', 'public_sku',
  'variant_bn', 'variant_en', 'supplier_cost_bdt', 'supplier_profit_bdt', 'sale_price_bdt', 'weight_grams'] as const;
