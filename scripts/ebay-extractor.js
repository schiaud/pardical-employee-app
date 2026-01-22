/**
 * eBay Seller Hub Data Extractor v4
 *
 * Extracts: title, customLabel (SKU), ebayItemId, views, watchers, soldQty, availableQty, price
 *
 * HOW TO USE:
 * 1. Go to https://www.ebay.com/sh/lst/active
 * 2. Open DevTools (F12 or Cmd+Option+I)
 * 3. Click on the PAGE first (not DevTools) to focus it
 * 4. Go to Console tab, paste this script, press Enter
 * 5. Paste the copied JSON into your app's import field
 *
 * NOTE: This extracts ONE PAGE at a time. Run on each page if you have multiple pages.
 */

(function extractEbayListings() {
  const listings = [];
  const table = document.querySelector('table');
  if (!table) { console.log('No table found!'); return; }

  const rows = table.querySelectorAll('tbody tr');
  console.log(`Processing ${rows.length} rows...`);

  // Helper: get leading number from text like "21Link. Views 21..."
  const getLeadingNum = (text) => {
    const match = (text || '').match(/^(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  // Helper: get price from text like "$189.31Buy It Now"
  const getPrice = (text) => {
    const match = (text || '').match(/\$([\d,]+\.?\d*)/);
    return match ? parseFloat(match[1].replace(',', '')) : 0;
  };

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 10) return;

    // Cell 2: Item info (title + "Buy It Now · itemId")
    const itemText = cells[2]?.textContent.trim() || '';
    const title = itemText.replace(/Buy It Now.*$/i, '').trim();
    if (!title || title.length < 5) return;

    // Get eBay item ID from link URL
    const itmLink = row.querySelector('a[href*="/itm/"]');
    const ebayItemId = itmLink?.href.match(/\/itm\/(\d+)/)?.[1] || '';

    // Cell 9: Custom Label (SKU)
    const customLabel = cells[9]?.textContent.trim() || '';

    // Cell 3: Price, Cell 4: Watchers, Cell 5: Sold, Cell 6: Available, Cell 7: Views
    listings.push({
      title,
      customLabel,
      ebayItemId,
      price: getPrice(cells[3]?.textContent),
      watchers: getLeadingNum(cells[4]?.textContent),
      soldQty: getLeadingNum(cells[5]?.textContent),
      availableQty: getLeadingNum(cells[6]?.textContent),
      views: getLeadingNum(cells[7]?.textContent),
    });
  });

  const json = JSON.stringify(listings, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    console.log('%c SUCCESS! ', 'background:green;color:white;font-size:14px');
    console.log(`Copied ${listings.length} listings to clipboard`);
    console.table(listings.slice(0, 5));
  }).catch(() => {
    console.log('%c Clipboard failed - copy manually: ', 'background:orange;color:black;');
    console.log(json);
  });

  return listings;
})();
