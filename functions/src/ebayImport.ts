import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as cheerio from "cheerio";

const db = admin.firestore();

interface EbayListing {
  title: string;
  sku?: string;
  customLabel?: string;  // The "EC004:3.0L Upper" style SKU from eBay
  ebayItemId?: string;   // The numeric eBay item ID
  views30Day: number;
  watchers: number;
  quantity: number;
  soldQty?: number;
  listingPrice: number;
  itemId?: string;       // Legacy field, same as ebayItemId
}

/**
 * Import eBay Seller Hub data from HTML or JSON
 * Parses the "Manage active listings" page HTML or accepts JSON array directly
 */
export const importEbayData = onCall(
  {cors: true, timeoutSeconds: 300, memory: "1GiB"},
  async (request) => {
    const {htmlContent, jsonData} = request.data;

    if (!htmlContent && !jsonData) {
      throw new HttpsError("invalid-argument", "htmlContent or jsonData is required");
    }

    logger.info("Starting eBay data import");

    try {
      let listings: EbayListing[];

      // If JSON data is provided directly, use it
      if (jsonData) {
        logger.info("Parsing JSON data");
        listings = parseJsonData(jsonData);
      } else {
        // Otherwise parse HTML
        listings = parseEbayHtml(htmlContent);
      }

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
      const itemStatsByName = new Map<string, FirebaseFirestore.DocumentReference>();
      const itemStatsBySku = new Map<string, FirebaseFirestore.DocumentReference>();

      itemStatsSnapshot.forEach((doc) => {
        const data = doc.data();
        const normalizedName = normalizeForMatching(data.itemName || "");
        itemStatsByName.set(normalizedName, doc.ref);

        // Also index by various ID fields for matching
        if (data.ebayItemId) {
          itemStatsBySku.set(data.ebayItemId, doc.ref);
        }
        if (data.sku) {
          itemStatsBySku.set(data.sku, doc.ref);
        }
        if (data.customLabel) {
          itemStatsBySku.set(data.customLabel, doc.ref);
        }
      });

      let matchedCount = 0;
      let batch = db.batch();
      let batchCount = 0;
      const now = admin.firestore.Timestamp.now();
      const matchedRefs = new Set<string>();

      // Update matched items with eBay data
      for (const listing of listings) {
        let matchedRef: FirebaseFirestore.DocumentReference | undefined;

        // Try customLabel match first (e.g., "EC004:3.0L Upper")
        if (listing.customLabel) {
          matchedRef = itemStatsBySku.get(listing.customLabel);
        }

        // Try ebayItemId match (e.g., "325947368910")
        if (!matchedRef && listing.ebayItemId) {
          matchedRef = itemStatsBySku.get(listing.ebayItemId);
        }

        // Try SKU match (legacy)
        if (!matchedRef && listing.sku) {
          matchedRef = itemStatsBySku.get(listing.sku);
        }

        // Try item ID match (legacy)
        if (!matchedRef && listing.itemId) {
          matchedRef = itemStatsBySku.get(listing.itemId);
        }

        // Fall back to title matching
        if (!matchedRef) {
          const normalizedTitle = normalizeForMatching(listing.title);

          // Try exact name match
          matchedRef = itemStatsByName.get(normalizedTitle);

          // If no exact match, try partial matching
          if (!matchedRef) {
            for (const [name, ref] of itemStatsByName) {
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
        }

        if (matchedRef && !matchedRefs.has(matchedRef.id)) {
          matchedRefs.add(matchedRef.id);

          // Get existing doc for pricing data
          const docSnapshot = await matchedRef.get();
          const existingData = docSnapshot.data() || {};

          // Add views to priceHistory SUBCOLLECTION (not array field)
          const priceHistoryRef = matchedRef.collection("priceHistory");

          // Check if there's an entry from today (same day)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const todayEntries = await priceHistoryRef
            .where("checkedAt", ">=", admin.firestore.Timestamp.fromDate(today))
            .where("checkedAt", "<", admin.firestore.Timestamp.fromDate(tomorrow))
            .limit(1)
            .get();

          if (!todayEntries.empty) {
            // Update existing entry with views
            const existingEntry = todayEntries.docs[0];
            await existingEntry.ref.update({
              views30Day: listing.views30Day,
              watchers: listing.watchers,
              source: existingEntry.data().source === "carpart" ? "both" : "ebay",
            });
          } else {
            // Create new entry in subcollection with views data
            await priceHistoryRef.add({
              avgPrice: existingData.pricingData?.avgPrice || 0,
              minPrice: existingData.pricingData?.minPrice || 0,
              maxPrice: existingData.pricingData?.maxPrice || 0,
              totalListings: existingData.pricingData?.totalListings || 0,
              views30Day: listing.views30Day,
              watchers: listing.watchers,
              checkedAt: now,
              source: "ebay",
            });
          }

          // Update main document with ebayMetrics (no priceHistory array)
          batch.update(matchedRef, {
            ebayMetrics: {
              views30Day: listing.views30Day,
              watchers: listing.watchers,
              quantity: listing.quantity,
              soldQty: listing.soldQty || 0,
              listingPrice: listing.listingPrice,
              lastUpdated: now,
            },
            // Store IDs for future matching
            ...(listing.customLabel && {customLabel: listing.customLabel}),
            ...(listing.ebayItemId && {ebayItemId: listing.ebayItemId}),
            ...(listing.sku && !listing.ebayItemId && {ebayItemId: listing.sku}),
            inEbayListings: true,
            ebayListingUpdatedAt: now,
            updatedAt: now,
          });
          matchedCount++;
          batchCount++;
        }

        // Commit in batches
        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(`eBay import completed: ${matchedCount} items matched and updated`);

      return {
        success: true,
        imported: matchedCount,
        totalParsed: listings.length,
        unmatchedCount: listings.length - matchedCount,
        itemsInEbayListings: matchedCount,
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

/**
 * Parse JSON data from browser console extraction script
 */
function parseJsonData(jsonData: string | EbayListing[]): EbayListing[] {
  let data: unknown[];

  // If it's a string, try to parse it as JSON
  if (typeof jsonData === "string") {
    try {
      data = JSON.parse(jsonData);
    } catch {
      throw new Error("Invalid JSON format");
    }
  } else {
    data = jsonData;
  }

  if (!Array.isArray(data)) {
    throw new Error("JSON data must be an array");
  }

  const listings: EbayListing[] = [];

  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    const title = String(record.title || "").trim();

    if (!title || title.length < 5) continue;

    listings.push({
      title,
      sku: record.sku ? String(record.sku) : undefined,
      customLabel: record.customLabel ? String(record.customLabel) : undefined,
      ebayItemId: record.ebayItemId ? String(record.ebayItemId) : undefined,
      views30Day: parseInt(String(record.views || record.views30Day || "0"), 10),
      watchers: parseInt(String(record.watchers || "0"), 10),
      quantity: parseInt(String(record.quantity || record.availableQty || "1"), 10),
      soldQty: parseInt(String(record.soldQty || "0"), 10),
      listingPrice: parseFloat(String(record.price || record.listingPrice || "0")),
      itemId: record.itemId ? String(record.itemId) : undefined,
    });
  }

  return listings;
}
