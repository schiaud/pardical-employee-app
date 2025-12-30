import { Timestamp } from 'firebase/firestore';

export interface PricingData {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  totalListings: number;
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
