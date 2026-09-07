/**
 * Just enough CSV to read a GTFS file.
 *
 * Rows are handed back in an array that is reused between them, because the largest file this
 * reads has hundreds of thousands of rows and allocating an object per row costs more than the
 * parsing does. Copy anything you mean to keep.
 */
export function parseCsv(
  text: string,
  columns: readonly string[],
  onRow: (values: readonly string[]) => void,
): void {
  const header: string[] = [];
  let at = readRow(text, 0, header);

  // A column the file does not have reads as empty, rather than shifting every other column along.
  const index = columns.map((name) => header.indexOf(name));
  const values = new Array<string>(columns.length);
  const fields: string[] = [];

  while (at < text.length) {
    fields.length = 0;
    at = readRow(text, at, fields);
    if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) continue;

    for (let i = 0; i < index.length; i++) {
      const from = index[i]!;
      values[i] = from < 0 ? '' : (fields[from] ?? '');
    }
    onRow(values);
  }
}

const COMMA = 44;
const QUOTE = 34;
const CR = 13;
const LF = 10;

/**
 * Read one record into `into` and return where the next one starts.
 *
 * Unquoted fields are sliced rather than built up a character at a time, which is the whole reason
 * this is worth having over a regular expression.
 */
function readRow(text: string, start: number, into: string[]): number {
  const end = text.length;
  let at = start;

  while (at <= end) {
    if (at === end) {
      into.push('');
      return end;
    }

    if (text.charCodeAt(at) === QUOTE) {
      at = readQuoted(text, at + 1, into);
    } else {
      let to = at;
      while (to < end) {
        const c = text.charCodeAt(to);
        if (c === COMMA || c === LF || c === CR) break;
        to++;
      }
      into.push(text.slice(at, to));
      at = to;
    }

    // Whatever ended the field: another field, the end of the record, or the end of the file.
    if (at < end && text.charCodeAt(at) === COMMA) {
      at++;
      continue;
    }
    if (at < end && text.charCodeAt(at) === CR) at++;
    if (at < end && text.charCodeAt(at) === LF) return at + 1;
    return at;
  }

  return end;
}

/** Read a quoted field, where `""` stands for one quote, and return where it ended. */
function readQuoted(text: string, start: number, into: string[]): number {
  let at = start;
  let value = '';

  for (;;) {
    const quote = text.indexOf('"', at);
    if (quote < 0) {
      into.push(value + text.slice(at));
      return text.length;
    }
    value += text.slice(at, quote);
    if (text.charCodeAt(quote + 1) === QUOTE) {
      value += '"';
      at = quote + 2;
      continue;
    }
    into.push(value);
    return quote + 1;
  }
}
