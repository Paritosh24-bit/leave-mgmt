/**
 * Utility to export JSON arrays to downloadable CSV files in browser
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  mappings: Array<{ label: string; key: keyof T | ((row: T) => string) }>
) {
  const csvRows: string[] = [];
  
  // Header Row
  const headers = mappings.map(m => `"${m.label.replace(/"/g, '""')}"`);
  csvRows.push(headers.join(','));

  // Data Rows
  for (const row of data) {
    const values = mappings.map(m => {
      let val = '';
      if (typeof m.key === 'function') {
        val = m.key(row);
      } else {
        const raw = row[m.key];
        val = raw === null || raw === undefined ? '' : String(raw);
      }
      // Escape double quotes as per RFC 4180
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  // Generate and trigger download
  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
