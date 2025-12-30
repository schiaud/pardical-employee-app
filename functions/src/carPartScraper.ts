import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import axios from "axios";
import cheerio from "cheerio";

const db = admin.firestore();

interface PricingResult {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  totalListings: number;
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
    const listings = await searchCarPartCom(
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

    const metrics = calculateMetrics(listings);

    return {
      success: true,
      metrics: {
        avgPrice: metrics.avgPrice,
        minPrice: metrics.minPrice,
        maxPrice: metrics.maxPrice,
        stdDev: metrics.stdDev,
        totalListings: metrics.totalListings,
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

      const listings = await searchCarPartCom(
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

      const metrics = calculateMetrics(listings);

      return {
        success: true,
        metrics: {
          avgPrice: metrics.avgPrice,
          minPrice: metrics.minPrice,
          maxPrice: metrics.maxPrice,
          stdDev: metrics.stdDev,
          totalListings: metrics.totalListings,
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

  const $ = cheerio.load(response.data);
  const variants: VariantOption[] = [];

  // Find radio inputs for variants
  $("input[type='radio'][name='dummyVar']").each((_, el) => {
    const value = $(el).attr("value") || "";
    // Get the label text (usually next sibling or parent text)
    const label = $(el).parent().text().trim() ||
      $(el).next().text().trim() ||
      value;

    if (value) {
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
): Promise<CarPartListing[]> {
  const httpsAgent = new (require("https").Agent)({rejectUnauthorized: false});

  // Initial search
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

  const $ = cheerio.load(response.data);

  // Check if we got redirected to variant selection
  const radioInputs = $("input[type='radio'][name='dummyVar']");

  if (radioInputs.length > 0 && !variantValue) {
    // Use first variant by default
    const firstVariant = radioInputs.first().attr("value") || "";

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

    return parseResultRows(cheerio.load(response2.data));
  }

  return parseResultRows($);
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

function calculateMetrics(listings: CarPartListing[]): PricingResult {
  const prices = listings.map((l) => l.price).filter((p) => p > 0);

  if (prices.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      stdDev: 0,
      totalListings: 0,
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
  };
}

/**
 * Update itemStats with pricing data
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
      const updateData: Record<string, unknown> = {
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (pricingData) {
        updateData.pricingData = {
          ...pricingData,
          lastUpdated: admin.firestore.Timestamp.now(),
        };
      }

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
