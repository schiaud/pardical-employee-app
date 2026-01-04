import { Timestamp } from 'firebase/firestore';

export interface PricingData {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  totalListings: number;
  totalPages?: number;
  lastUpdated: Date;
}

export interface EbayMetrics {
  views30Day: number;
  watchers: number;
  quantity: number;
  listingPrice: number;
  lastUpdated: Date;
}

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  part: string;
  variantValue?: string;
  variantLabel?: string;
}

export interface ItemStats {
  id: string;
  itemName: string;
  itemId?: string;
  totalSold: number;
  lastSaleDate: Date;
  firstSaleDate: Date;
  salesLast30Days: number;
  salesLast90Days: number;
  daysSinceLastSale: number;
  salesVelocity: number;
  isStale: boolean;
  staleThresholdDays: number;
  pricingData?: PricingData;
  ebayMetrics?: EbayMetrics;
  vehicleInfo?: VehicleInfo;
  // Profit aggregates
  totalRevenue?: number;
  totalCost?: number;
  totalProfit?: number;
  avgProfitMargin?: number;
  // Price history (last 10 checks)
  priceHistory?: PriceHistoryEntry[];
  // Sales by period for trends
  salesByWeek?: Record<string, number>;
  salesByMonth?: Record<string, number>;
  // eBay listing flag (for filtering)
  inEbayListings?: boolean;
  ebayListingUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemStatsFirestore {
  id: string;
  itemName: string;
  itemId?: string;
  totalSold: number;
  lastSaleDate: Timestamp;
  firstSaleDate: Timestamp;
  salesLast30Days: number;
  salesLast90Days: number;
  daysSinceLastSale: number;
  salesVelocity: number;
  isStale: boolean;
  staleThresholdDays: number;
  pricingData?: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    stdDev: number;
    totalListings: number;
    totalPages?: number;
    lastUpdated: Timestamp;
  };
  ebayMetrics?: {
    views30Day: number;
    watchers: number;
    quantity: number;
    listingPrice: number;
    lastUpdated: Timestamp;
  };
  vehicleInfo?: VehicleInfo;
  // Profit aggregates
  totalRevenue?: number;
  totalCost?: number;
  totalProfit?: number;
  avgProfitMargin?: number;
  // Price history (last 10 checks)
  priceHistory?: PriceHistoryEntryFirestore[];
  // Sales by period for trends
  salesByWeek?: Record<string, number>;
  salesByMonth?: Record<string, number>;
  // eBay listing flag
  inEbayListings?: boolean;
  ebayListingUpdatedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StaleItemsSummary {
  totalItems: number;
  staleItems: number;
  avgDaysSinceLastSale: number;
  itemsWithPricing: number;
  itemsWithEbayData: number;
}

export type StaleThreshold = 30 | 60 | 90;

export interface CarPartVariant {
  label: string;
  value: string;
}

export interface CarPartPricingRequest {
  year: string;
  make: string;
  model: string;
  part: string;
  variantValue?: string;
  postalCode?: string;
}

export interface CarPartPricingResponse {
  success: boolean;
  metrics?: PricingData;
  variants?: CarPartVariant[];
  error?: string;
}

// NEW: Individual sale record (stored in subcollection)
export interface SaleRecord {
  id: string;
  orderRef: string;
  orderNumber?: string;
  salePrice: number;
  purchaseCost?: number;
  shipCost?: number;
  profit?: number;
  profitMargin?: number;
  marketPriceAtSale?: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    totalListings: number;
    fetchedAt: Date;
  };
  saleDate: Date;
  sku?: string;
  createdAt: Date;
}

export interface SaleRecordFirestore {
  id: string;
  orderRef: string;
  orderNumber?: string;
  salePrice: number;
  purchaseCost?: number;
  shipCost?: number;
  profit?: number;
  profitMargin?: number;
  marketPriceAtSale?: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    totalListings: number;
    fetchedAt: Timestamp;
  };
  saleDate: Timestamp;
  sku?: string;
  createdAt: Timestamp;
}

// NEW: Price history entry
export interface PriceHistoryEntry {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalListings: number;
  checkedAt: Date;
  // eBay views at this point in time (null if no eBay data)
  views30Day?: number | null;
  // Source of this entry: carpart price check, ebay import, or both
  source?: 'carpart' | 'ebay' | 'both';
}

export interface PriceHistoryEntryFirestore {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalListings: number;
  checkedAt: Timestamp;
  views30Day?: number | null;
  source?: 'carpart' | 'ebay' | 'both';
}
