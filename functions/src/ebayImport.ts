import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import cheerio from "cheerio";

const db = admin.firestore();

interface EbayListing {
  title: string;
  views30Day: number;
  watchers: number;
  quantity: number;
  listingPrice: number;
  itemId?: string;
}

/**
 * Import eBay Seller Hub data from HTML
 * Parses the "Manage active listings" page HTML and updates itemStats
 */
export const importEbayData = onCall(
  {cors: true, timeoutSeconds: 120, memory: "512MiB"},
  async (request) => {
    const {htmlContent} = request.data;

    if (!htmlContent) {
      throw new HttpsError("invalid-argument", "htmlContent is required");
    }

    logger.info("Starting eBay data import");

    try {
      const listings = parseEbayHtml(htmlContent);
      logger.info(`Parsed ${listings.length} eBay listings`);

      if (listings.length === 0) {
        return {
          success: false,
          imported: 0,
          error: "No listings found in HTML. Make sure this is the eBay Seller Hub 'Manage active listings' page.",
        };
      }

      // Match listings to itemStats and update
      const itemStatsSnapshot = await db.collection("itemStats").get();
      const itemStatsMap = new Map<string, FirebaseFirestore.DocumentReference>();

      itemStatsSnapshot.forEach((doc) => {
        const data = doc.data();
        const normalizedName = normalizeForMatching(data.itemName || "");
        itemStatsMap.set(normalizedName, doc.ref);
      });

      let matchedCount = 0;
      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();

      for (const listing of listings) {
        const normalizedTitle = normalizeForMatching(listing.title);

        // Try exact match first
        let matchedRef = itemStatsMap.get(normalizedTitle);

        // If no exact match, try partial matching
        if (!matchedRef) {
          for (const [name, ref] of itemStatsMap) {
            // Check if listing title contains the item name or vice versa
            if (normalizedTitle.includes(name) || name.includes(normalizedTitle)) {
              matchedRef = ref;
              break;
            }

            // Check similarity score
            const similarity = calculateSimilarity(normalizedTitle, name);
            if (similarity > 0.7) {
              matchedRef = ref;
              break;
            }
          }
        }

        if (matchedRef) {
          batch.update(matchedRef, {
            ebayMetrics: {
              views30Day: listing.views30Day,
              watchers: listing.watchers,
              quantity: listing.quantity,
              listingPrice: listing.listingPrice,
              lastUpdated: now,
            },
            updatedAt: now,
          });
          matchedCount++;
        }

        // Commit in batches
        if (matchedCount > 0 && matchedCount % 500 === 0) {
          await batch.commit();
        }
      }

      if (matchedCount % 500 !== 0) {
        await batch.commit();
      }

      logger.info(`eBay import completed: ${matchedCount} items matched and updated`);

      return {
        success: true,
        imported: matchedCount,
        totalParsed: listings.length,
        unmatchedCount: listings.length - matchedCount,
      };
    } catch (error) {
      logger.error("Error importing eBay data:", error);
      return {
        success: false,
        imported: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

function parseEbayHtml(html: string): EbayListing[] {
  const $ = cheerio.load(html);
  const listings: EbayListing[] = [];

  // Try to find listing data in various formats

  // Method 1: Look for JSON data embedded in scripts
  $("script").each((_, script) => {
    const content = $(script).html() || "";

    // Look for listing data patterns
    if (content.includes("listings") && content.includes("title")) {
      try {
        // Try to extract JSON data
        const jsonMatch = content.match(/\{[\s\S]*"listings"[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          if (data.listings && Array.isArray(data.listings)) {
            for (const item of data.listings) {
              listings.push({
                title: item.title || "",
                views30Day: parseInt(item.views30Days || item.views || "0", 10),
                watchers: parseInt(item.watchers || item.watchCount || "0", 10),
                quantity: parseInt(item.quantity || item.availableQuantity || "0", 10),
                listingPrice: parseFloat(item.price || item.currentPrice || "0"),
                itemId: item.itemId || item.listingId,
              });
            }
          }
        }
      } catch {
        // JSON parsing failed, try other methods
      }
    }
  });

  // Method 2: Parse HTML table structure
  if (listings.length === 0) {
    // Look for listing rows in tables
    $("table tr, div[data-listing-id], [class*='listing-row']").each((_, row) => {
      const $row = $(row);

      // Try to extract title
      const title = $row.find("[class*='title'], a[href*='itm/']").first().text().trim() ||
        $row.find("td").first().text().trim();

      if (!title || title.length < 10) return;

      // Try to extract views
      let views = 0;
      const viewsText = $row.find("[class*='view'], [data-views]").text();
      const viewsMatch = viewsText.match(/(\d+)\s*views?/i);
      if (viewsMatch) views = parseInt(viewsMatch[1], 10);

      // Try to extract watchers
      let watchers = 0;
      const watchersText = $row.find("[class*='watch'], [data-watchers]").text();
      const watchersMatch = watchersText.match(/(\d+)\s*watch/i);
      if (watchersMatch) watchers = parseInt(watchersMatch[1], 10);

      // Try to extract quantity
      let quantity = 0;
      const qtyText = $row.find("[class*='quantity'], [data-quantity]").text();
      const qtyMatch = qtyText.match(/(\d+)/);
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);

      // Try to extract price
      let price = 0;
      const priceText = $row.find("[class*='price']").text();
      const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(",", ""));

      if (title) {
        listings.push({
          title,
          views30Day: views,
          watchers,
          quantity,
          listingPrice: price,
        });
      }
    });
  }

  // Method 3: Look for any text patterns with views/watchers
  if (listings.length === 0) {
    // This is a fallback for complex HTML structures
    const fullText = $("body").text() || "";
    const lines = fullText.split("\n").filter((l: string) => l.trim().length > 0);

    let currentTitle = "";

    for (const line of lines) {
      // Long lines might be titles
      if (line.length > 30 && !line.match(/^\d+/) && !line.includes("$")) {
        currentTitle = line.trim();
      }

      // Look for view counts
      if (currentTitle && line.match(/(\d+)\s*views?/i)) {
        const viewsMatch = line.match(/(\d+)\s*views?/i);
        const watchersMatch = line.match(/(\d+)\s*watch/i);

        listings.push({
          title: currentTitle,
          views30Day: viewsMatch ? parseInt(viewsMatch[1], 10) : 0,
          watchers: watchersMatch ? parseInt(watchersMatch[1], 10) : 0,
          quantity: 0,
          listingPrice: 0,
        });

        currentTitle = "";
      }
    }
  }

  return listings;
}

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(" "));
  const words2 = new Set(str2.split(" "));

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union : 0;
}
