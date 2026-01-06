import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import axios from "axios";
// Fixed cheerio import for Firebase Functions compatibility
import {load as cheerioLoad} from "cheerio";

const db = admin.firestore();

interface PricingResult {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  totalListings: number;
  totalPages: number;
}

interface CarPartListing {
  title: string;
  price: number;
  source: string;
  location: string;
  grade: string;
}

interface VariantOption {
  label: string;
  value: string;
}

interface ScrapeRequest {
  year: string;
  make: string;
  model: string;
  part: string;
  variantValue?: string;
  postalCode?: string;
}

interface ScrapeResponse {
  success: boolean;
  metrics?: PricingResult;
  error?: string;
}

/**
 * Internal function to scrape car-part.com pricing
 * Used by scheduled functions and can be called directly
 */
export async function scrapeCarPartPricing(
  request: ScrapeRequest
): Promise<ScrapeResponse> {
  const {year, make, model, part, variantValue, postalCode = "60018"} = request;
  const makeModel = `${make} ${model}`;

  try {
    const {listings, totalPages} = await searchCarPartCom(
      year,
      makeModel,
      part,
      postalCode,
      variantValue
    );

    if (listings.length === 0) {
      return {
        success: true,
        metrics: undefined,
        error: "No listings found",
      };
    }

    const metrics = calculateMetrics(listings, totalPages);

    return {
      success: true,
      metrics: {
        avgPrice: metrics.avgPrice,
        minPrice: metrics.minPrice,
        maxPrice: metrics.maxPrice,
        stdDev: metrics.stdDev,
        totalListings: metrics.totalListings,
        totalPages: metrics.totalPages,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check available variants for a vehicle/part combination
 */
export const checkCarPartVariants = onCall(
  {cors: true, timeoutSeconds: 60},
  async (request) => {
    const {year, make, model, part, postalCode = "60018"} = request.data;

    if (!year || !make || !model || !part) {
      throw new HttpsError(
        "invalid-argument",
        "year, make, model, and part are required"
      );
    }

    const makeModel = `${make} ${model}`;

    try {
      const variants = await fetchVariants(year, makeModel, part, postalCode);

      return {
        success: true,
        variants,
      };
    } catch (error) {
      logger.error("Error checking variants:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        variants: [],
      };
    }
  }
);

/**
 * Fetch pricing from car-part.com
 */
export const fetchCarPartPricing = onCall(
  {cors: true, timeoutSeconds: 120},
  async (request) => {
    const {
      year,
      make,
      model,
      part,
      variantValue,
      postalCode = "60018",
    } = request.data;

    if (!year || !make || !model || !part) {
      throw new HttpsError(
        "invalid-argument",
        "year, make, model, and part are required"
      );
    }

    const makeModel = `${make} ${model}`;

    try {
      logger.info("Fetching car-part pricing", {year, makeModel, part});

      const {listings, totalPages} = await searchCarPartCom(
        year,
        makeModel,
        part,
        postalCode,
        variantValue
      );

      if (listings.length === 0) {
        return {
          success: true,
          metrics: null,
          error: "No listings found",
        };
      }

      const metrics = calculateMetrics(listings, totalPages);

      return {
        success: true,
        metrics: {
          avgPrice: metrics.avgPrice,
          minPrice: metrics.minPrice,
          maxPrice: metrics.maxPrice,
          stdDev: metrics.stdDev,
          totalListings: metrics.totalListings,
          totalPages: metrics.totalPages,
          lastUpdated: admin.firestore.Timestamp.now(),
        },
      };
    } catch (error) {
      logger.error("Error fetching car-part pricing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

async function fetchVariants(
  year: string,
  makeModel: string,
  part: string,
  postalCode: string
): Promise<VariantOption[]> {
  const formData = new URLSearchParams({
    userDate: year,
    userModel: makeModel,
    userPart: part,
    userLocation: "USA",
    userPreference: "price",
    userZip: postalCode,
    userPage: "1",
    userInterchange: "None",
    userDate2: "Ending Year",
    userSearch: "int",
  });

  const response = await axios.post(
    "https://www.car-part.com/cgi-bin/search.cgi",
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
      // car-part.com has SSL issues
      httpsAgent: new (require("https").Agent)({rejectUnauthorized: false}),
    }
  );

  if (!response.data) {
    throw new Error("No response from car-part.com");
  }

  logger.info("fetchVariants: cheerioLoad type:", typeof cheerioLoad);
  logger.info("fetchVariants: response.data length:", response.data?.length);

  const $ = cheerioLoad(response.data);
  const variants: VariantOption[] = [];

  // Find radio inputs for variants
  $("input[type='radio'][name='dummyVar']").each((_, el) => {
    const value = $(el).attr("value") || "";

    // Get the label text - it's the text node directly after the radio button
    // The HTML structure is: <input type="radio">Label Text<br>
    let label = "";

    // Use cheerio to get the next sibling and extract text
    const $el = $(el);

    // Method 1: Get text from next sibling nodes until we hit a <br> or another input
    const parent = $el.parent();
    const html = parent.html() || "";

    // Find the position of this input in the HTML and extract text after it
    const inputHtml = $.html(el);
    const inputIndex = html.indexOf(inputHtml);
    if (inputIndex !== -1) {
      // Get content after this input
      const afterInput = html.substring(inputIndex + inputHtml.length);
      // Extract text until next <br>, <input>, or end
      const match = afterInput.match(/^([^<]*)/);
      if (match && match[1]) {
        label = match[1].trim();
      }
    }

    // Fallback: try to find associated label element
    if (!label) {
      const id = $el.attr("id");
      if (id) {
        label = $(`label[for="${id}"]`).text().trim();
      }
    }

    // Final fallback: use the value
    if (!label) {
      label = value;
    }

    if (value && label) {
      variants.push({label, value});
    }
  });

  return variants;
}

async function searchCarPartCom(
  year: string,
  makeModel: string,
  part: string,
  postalCode: string,
  variantValue?: string
): Promise<{listings: CarPartListing[]; totalPages: number}> {
  const httpsAgent = new (require("https").Agent)({rejectUnauthorized: false});

  // Initial search (page 1) to detect total pages and handle variants
  let formData = new URLSearchParams({
    userDate: year,
    userModel: makeModel,
    userPart: part,
    userLocation: "USA",
    userPreference: "price",
    userZip: postalCode,
    userPage: "1",
    userInterchange: variantValue || "None",
    userDate2: variantValue ? year : "Ending Year",
    userSearch: "int",
  });

  if (variantValue) {
    formData.append("dbModel", "9.36.1.1");
    formData.append("vinSearch", "");
    formData.append("dummyVar", variantValue);
  }

  const response = await axios.post(
    "https://www.car-part.com/cgi-bin/search.cgi",
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
      httpsAgent,
    }
  );

  if (!response.data) {
    throw new Error("No response from car-part.com");
  }

  let $ = cheerioLoad(response.data);
  let resolvedVariant = variantValue;

  // Check if we got redirected to variant selection
  const radioInputs = $("input[type='radio'][name='dummyVar']");

  if (radioInputs.length > 0 && !variantValue) {
    // Use first variant by default
    const firstVariant = radioInputs.first().attr("value") || "";
    resolvedVariant = firstVariant;

    formData = new URLSearchParams({
      userDate: year,
      userModel: makeModel,
      userPart: part,
      userLocation: "USA",
      userPreference: "price",
      userZip: postalCode,
      userPage: "1",
      userInterchange: firstVariant,
      userDate2: year,
      userSearch: "int",
      dbModel: "9.36.1.1",
      vinSearch: "",
      dummyVar: firstVariant,
    });

    const response2 = await axios.post(
      "https://www.car-part.com/cgi-bin/search.cgi",
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 15000,
        httpsAgent,
      }
    );

    if (!response2.data) {
      throw new Error("No response from car-part.com");
    }

    $ = cheerioLoad(response2.data);
  }

  // Detect total pages from page 1 response
  const totalPages = detectTotalPages($);
  logger.info(`Detected ${totalPages} total pages for search`);

  // Parse page 1 results (we already have this response)
  const page1Listings = parseResultRows($);
  logger.info(`Page 1: ${page1Listings.length} listings`);

  // If only 1 page, just return page 1 results
  if (totalPages <= 1) {
    return {
      listings: page1Listings,
      totalPages: 1,
    };
  }

  // Determine which additional pages to fetch (page 1 already fetched)
  const pagesToFetch = selectPagesToFetch(totalPages);
  logger.info(`Fetching additional pages: ${pagesToFetch.join(", ")}`);

  // Collect all listings, starting with page 1 results
  const allListings: CarPartListing[] = [...page1Listings];

  for (const pageNum of pagesToFetch) {
    // Rate limiting: 1 second delay between requests
    await sleep(1000);

    try {
      const pageListings = await fetchSinglePage(
        year,
        makeModel,
        part,
        postalCode,
        pageNum,
        resolvedVariant
      );
      allListings.push(...pageListings);
      logger.info(`Page ${pageNum}: fetched ${pageListings.length} listings`);
    } catch (err) {
      logger.warn(`Failed to fetch page ${pageNum}:`, err);
      // Continue with other pages even if one fails
    }
  }

  return {
    listings: allListings,
    totalPages,
  };
}

function parseResultRows($: cheerio.Root): CarPartListing[] {
  const listings: CarPartListing[] = [];

  // Find result table rows
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const titleCell = cells.eq(0);
    const title = titleCell.text().trim();

    // Skip header rows
    if (!title || title.toLowerCase().includes("description")) return;

    // Extract price
    let priceText = "";
    cells.each((i, cell) => {
      const text = $(cell).text();
      if (text.includes("$")) {
        priceText = text;
      }
    });

    if (!priceText) return;

    const priceMatch = priceText.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (!priceMatch) return;

    const price = parseFloat(priceMatch[1].replace(",", ""));
    if (isNaN(price) || price === 0) return;

    // Extract source/dealer
    let source = "";
    let location = "";

    cells.each((_, cell) => {
      const text = $(cell).text().trim();
      // Look for location pattern (City, ST)
      const locMatch = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
      if (locMatch) {
        location = `${locMatch[1].trim()}, ${locMatch[2]}`;
      }
    });

    // Try to get dealer name from link or text
    const dealerLink = cells.find("a").first();
    source = dealerLink.text().trim() || "Unknown Dealer";

    // Get grade if available
    let grade = "";
    cells.each((_, cell) => {
      const text = $(cell).text().trim();
      if (/^[A-D]$/.test(text)) {
        grade = text;
      }
    });

    listings.push({
      title,
      price,
      source,
      location,
      grade,
    });
  });

  return listings;
}

/**
 * Detect total number of pages from car-part.com HTML
 */
function detectTotalPages($: cheerio.Root): number {
  // Look for "Page X of Y" pattern in page text
  const pageText = $("body").text();
  const pageMatch = pageText.match(/Page\s*\d+\s*of\s*(\d+)/i);
  if (pageMatch) {
    return parseInt(pageMatch[1], 10);
  }

  // Fallback 1: look for pagination links with userPage parameter
  let maxPage = 1;
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/userPage=(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
  });

  if (maxPage > 1) {
    return maxPage;
  }

  // Fallback 2: look for numbered links to search.cgi (car-part.com pagination)
  // These appear as links with text "2", "3", "4", etc. linking to /cgi-bin/search.cgi
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    // Check if link text is a number and href points to search.cgi
    if (/^\d+$/.test(text) && href.includes("search.cgi")) {
      const pageNum = parseInt(text, 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
  });

  return maxPage;
}

/**
 * Select which pages to fetch based on total page count
 * Page 1 is already fetched from initial request, so this returns ADDITIONAL pages
 * For 1-3 pages: fetch all remaining pages [2, 3]
 * For 4-10 pages: skip last page (lowest prices)
 * For 11+ pages: sample 2nd highest, 2 middle, 2nd and 3rd lowest
 */
function selectPagesToFetch(totalPages: number): number[] {
  if (totalPages <= 1) {
    return []; // Page 1 already fetched
  }

  // For 2-3 pages: fetch ALL remaining pages (page 1 already fetched)
  if (totalPages <= 3) {
    const pages: number[] = [];
    for (let i = 2; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  if (totalPages >= 11) {
    // 2nd highest (page 2), 2 middle (ceiling), 2nd and 3rd lowest
    const middle = Math.ceil(totalPages / 2);
    return [2, middle, middle + 1, totalPages - 2, totalPages - 1];
  }

  // 4-10 pages: skip last page (lowest price outliers)
  const pages: number[] = [];
  for (let i = 2; i < totalPages; i++) {
    pages.push(i);
  }
  return pages;
}

/**
 * Fetch a single page from car-part.com
 */
async function fetchSinglePage(
  year: string,
  makeModel: string,
  part: string,
  postalCode: string,
  pageNumber: number,
  variantValue?: string
): Promise<CarPartListing[]> {
  const httpsAgent = new (require("https").Agent)({rejectUnauthorized: false});

  const formData = new URLSearchParams({
    userDate: year,
    userModel: makeModel,
    userPart: part,
    userLocation: "USA",
    userPreference: "price",
    userZip: postalCode,
    userPage: pageNumber.toString(),
    userInterchange: variantValue || "None",
    userDate2: variantValue ? year : "Ending Year",
    userSearch: "int",
  });

  if (variantValue) {
    formData.append("dbModel", "9.36.1.1");
    formData.append("vinSearch", "");
    formData.append("dummyVar", variantValue);
  }

  const response = await axios.post(
    "https://www.car-part.com/cgi-bin/search.cgi",
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
      httpsAgent,
    }
  );

  if (!response.data) {
    return [];
  }

  const $ = cheerioLoad(response.data);
  return parseResultRows($);
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateMetrics(listings: CarPartListing[], totalPages: number): PricingResult {
  const prices = listings.map((l) => l.price).filter((p) => p > 0);

  if (prices.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      stdDev: 0,
      totalListings: 0,
      totalPages,
    };
  }

  const sum = prices.reduce((a, b) => a + b, 0);
  const avgPrice = sum / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Calculate standard deviation
  const squareDiffs = prices.map((p) => Math.pow(p - avgPrice, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(avgSquareDiff);

  return {
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    totalListings: listings.length,
    totalPages,
  };
}

/**
 * Update itemStats with pricing data - writes to priceHistory SUBCOLLECTION only
 */
export const updateItemPricing = onCall(
  {cors: true},
  async (request) => {
    const {itemId, pricingData, vehicleInfo} = request.data;

    if (!itemId) {
      throw new HttpsError("invalid-argument", "itemId is required");
    }

    try {
      const itemRef = db.collection("itemStats").doc(itemId);
      const now = admin.firestore.Timestamp.now();

      // Write pricing to subcollection only (no field)
      if (pricingData) {
        const priceHistoryRef = itemRef.collection("priceHistory");
        await priceHistoryRef.add({
          avgPrice: pricingData.avgPrice,
          minPrice: pricingData.minPrice,
          maxPrice: pricingData.maxPrice,
          stdDev: pricingData.stdDev || 0,
          totalListings: pricingData.totalListings,
          totalPages: pricingData.totalPages || 0,
          checkedAt: now,
          source: "carpart",
        });
      }

      // Update vehicle info and timestamp on main document
      const updateData: Record<string, unknown> = {
        updatedAt: now,
      };

      if (vehicleInfo) {
        updateData.vehicleInfo = vehicleInfo;
      }

      await itemRef.update(updateData);

      return {success: true};
    } catch (error) {
      logger.error("Error updating item pricing:", error);
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);
