/**
 * eBay Debug Script - Run this first to see the page structure
 */
(function debugEbay() {
  console.log('=== eBay Page Structure Debug ===');

  // Find tables
  const tables = document.querySelectorAll('table');
  console.log(`Found ${tables.length} tables`);

  tables.forEach((table, ti) => {
    console.log(`\n--- Table ${ti} ---`);

    // Get headers
    const headers = table.querySelectorAll('th');
    console.log('Headers:', Array.from(headers).map(h => h.textContent.trim()));

    // Get first few data rows
    const rows = table.querySelectorAll('tbody tr');
    console.log(`${rows.length} rows`);

    if (rows.length > 0) {
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('td');
      console.log('First row cells:');
      cells.forEach((cell, ci) => {
        console.log(`  Cell ${ci}: "${cell.textContent.trim().substring(0, 50)}..."`);
      });
    }
  });

  // Also check for any data- attributes on rows
  const itemLinks = document.querySelectorAll('a[href*="/itm/"]');
  console.log(`\nFound ${itemLinks.length} item links`);

  if (itemLinks.length > 0) {
    const first = itemLinks[0];
    console.log('First item link:', first.href);
    console.log('Title:', first.textContent.trim());

    // Walk up to find the row
    let el = first.parentElement;
    for (let i = 0; i < 10 && el; i++) {
      if (el.tagName === 'TR') {
        console.log('Parent row:', el.outerHTML.substring(0, 500));
        break;
      }
      el = el.parentElement;
    }
  }
})();
