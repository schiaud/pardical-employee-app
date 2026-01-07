import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebase';
import {
  ItemStats,
  ItemStatsFirestore,
  StaleItemsSummary,
  CarPartPricingRequest,
  CarPartPricingResponse,
  StaleThreshold,
  SaleRecord,
  SaleRecordFirestore,
  PriceHistoryEntry,
  PriceHistoryEntryFirestore,
  EbayMetricsEntry,
  EbayMetricsEntryFirestore,
  PricingData,
  EbayMetrics,
} from '../types/staleItems';

const ITEM_STATS_COLLECTION = 'itemStats';

// Convert Firestore timestamps to JS Dates
const convertToItemStats = (data: ItemStatsFirestore): ItemStats => ({
  ...data,
  lastSaleDate: data.lastSaleDate?.toDate?.() || new Date(),
  firstSaleDate: data.firstSaleDate?.toDate?.() || new Date(),
  createdAt: data.createdAt?.toDate?.() || new Date(),
  updatedAt: data.updatedAt?.toDate?.() || new Date(),
  pricingData: data.pricingData
    ? {
        ...data.pricingData,
        lastUpdated: data.pricingData.lastUpdated?.toDate?.() || new Date(),
      }
    : undefined,
  ebayMetrics: data.ebayMetrics
    ? {
        ...data.ebayMetrics,
        lastUpdated: data.ebayMetrics.lastUpdated?.toDate?.() || new Date(),
      }
    : undefined,
  priceHistory: data.priceHistory?.map((entry: PriceHistoryEntryFirestore) => ({
    ...entry,
    checkedAt: entry.checkedAt?.toDate?.() || new Date(),
  })),
  ebayListingUpdatedAt: data.ebayListingUpdatedAt?.toDate?.(),
  reviewedAt: data.reviewedAt?.toDate?.(),
});

// Convert sale record from Firestore
const convertToSaleRecord = (data: SaleRecordFirestore): SaleRecord => ({
  ...data,
  saleDate: data.saleDate?.toDate?.() || new Date(),
  createdAt: data.createdAt?.toDate?.() || new Date(),
  marketPriceAtSale: data.marketPriceAtSale
    ? {
        ...data.marketPriceAtSale,
        fetchedAt: data.marketPriceAtSale.fetchedAt?.toDate?.() || new Date(),
      }
    : undefined,
});

// Get all item stats with optional filtering
export const getItemStats = async (options?: {
  staleOnly?: boolean;
  threshold?: StaleThreshold;
  limitCount?: number;
}): Promise<ItemStats[]> => {
  const { staleOnly = false, threshold, limitCount } = options || {};

  try {
    let q = query(
      collection(db, ITEM_STATS_COLLECTION),
      orderBy('daysSinceLastSale', 'desc')
    );

    if (staleOnly) {
      q = query(
        collection(db, ITEM_STATS_COLLECTION),
        where('isStale', '==', true),
        orderBy('daysSinceLastSale', 'desc')
      );
    }

    if (limitCount) {
      q = query(q, limit(limitCount));
    }

    const snapshot = await getDocs(q);
    const items: ItemStats[] = [];

    snapshot.forEach((docSnap) => {
      try {
        const data = docSnap.data() as ItemStatsFirestore;
        const item = convertToItemStats(data);

        // Apply threshold filter client-side if needed
        if (threshold && item.daysSinceLastSale < threshold) {
          return;
        }

        items.push(item);
      } catch (err) {
        console.error('Error converting item stats:', err);
      }
    });

    return items;
  } catch (error) {
    console.error('Error fetching item stats:', error);
    return [];
  }
};

// Get single item stats by ID
export const getItemStatsById = async (id: string): Promise<ItemStats | null> => {
  const docRef = doc(db, ITEM_STATS_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return convertToItemStats(docSnap.data() as ItemStatsFirestore);
};

// Subscribe to stale items for real-time updates (for dashboard widget)
export const subscribeToStaleItems = (
  onUpdate: (items: ItemStats[]) => void,
  limitCount: number = 5
): Unsubscribe => {
  const q = query(
    collection(db, ITEM_STATS_COLLECTION),
    where('isStale', '==', true),
    orderBy('daysSinceLastSale', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ItemStats[] = [];
      snapshot.forEach((docSnap) => {
        try {
          items.push(convertToItemStats(docSnap.data() as ItemStatsFirestore));
        } catch (err) {
          console.error('Error converting item:', err);
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Error subscribing to stale items:', error);
      onUpdate([]);
    }
  );
};

// Get summary statistics
export const getStaleItemsSummary = async (): Promise<StaleItemsSummary> => {
  const allItems = await getItemStats();

  const staleItems = allItems.filter((item) => item.isStale);
  const totalDays = allItems.reduce((sum, item) => sum + item.daysSinceLastSale, 0);
  const itemsWithPricing = allItems.filter((item) => item.pricingData).length;
  const itemsWithEbayData = allItems.filter((item) => item.ebayMetrics).length;

  return {
    totalItems: allItems.length,
    staleItems: staleItems.length,
    avgDaysSinceLastSale: allItems.length > 0 ? Math.round(totalDays / allItems.length) : 0,
    itemsWithPricing,
    itemsWithEbayData,
  };
};

// Update item threshold
export const updateItemThreshold = async (
  itemId: string,
  threshold: StaleThreshold
): Promise<void> => {
  const docRef = doc(db, ITEM_STATS_COLLECTION, itemId);
  await updateDoc(docRef, {
    staleThresholdDays: threshold,
    updatedAt: Timestamp.now(),
  });
};

// Mark item as reviewed
export const markItemReviewed = async (itemId: string): Promise<void> => {
  const docRef = doc(db, ITEM_STATS_COLLECTION, itemId);
  await updateDoc(docRef, {
    reviewedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
};

// Save vehicle info for an item (for future automatic price checks)
export const saveVehicleInfo = async (
  itemId: string,
  vehicleInfo: {
    year: string;
    make: string;
    model: string;
    part: string;
    variantValue?: string;
    variantLabel?: string;
  }
): Promise<void> => {
  const docRef = doc(db, ITEM_STATS_COLLECTION, itemId);
  await updateDoc(docRef, {
    vehicleInfo,
    updatedAt: Timestamp.now(),
  });
};

// Save price check result to history subcollection ONLY (no field)
export const savePriceCheck = async (
  itemId: string,
  data: {
    vehicleInfo: {
      year: string;
      make: string;
      model: string;
      part: string;
      variantValue?: string;
      variantLabel?: string;
    };
    pricingData: {
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      stdDev: number;
      totalListings: number;
      totalPages?: number;
    };
  }
): Promise<void> => {
  const itemRef = doc(db, ITEM_STATS_COLLECTION, itemId);
  const historyRef = collection(itemRef, 'priceHistory');

  const now = Timestamp.now();

  // Update main document with vehicle info only (no pricingData field)
  await updateDoc(itemRef, {
    vehicleInfo: data.vehicleInfo,
    updatedAt: now,
  });

  // Add to price history subcollection
  await addDoc(historyRef, {
    avgPrice: data.pricingData.avgPrice,
    minPrice: data.pricingData.minPrice,
    maxPrice: data.pricingData.maxPrice,
    stdDev: data.pricingData.stdDev,
    totalListings: data.pricingData.totalListings,
    totalPages: data.pricingData.totalPages || null,
    checkedAt: now,
    source: 'carpart',
  });
};

// Check car-part.com pricing via Cloud Function
export const checkCarPartPricing = async (
  request: CarPartPricingRequest
): Promise<CarPartPricingResponse> => {
  try {
    const functions = getFunctions();
    const fetchPricing = httpsCallable<CarPartPricingRequest, CarPartPricingResponse>(
      functions,
      'fetchCarPartPricing'
    );
    const result = await fetchPricing(request);
    return result.data;
  } catch (error) {
    console.error('Error fetching car-part pricing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Check variants for a vehicle/part combo
export const checkCarPartVariants = async (
  request: Omit<CarPartPricingRequest, 'variantValue'>
): Promise<CarPartPricingResponse> => {
  try {
    const functions = getFunctions();
    const checkVariants = httpsCallable<
      Omit<CarPartPricingRequest, 'variantValue'>,
      CarPartPricingResponse
    >(functions, 'checkCarPartVariants');
    const result = await checkVariants(request);
    return result.data;
  } catch (error) {
    console.error('Error checking car-part variants:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Import eBay data via Cloud Function (supports HTML or JSON)
export const importEbayData = async (
  data: string,
  format: 'html' | 'json' = 'html'
): Promise<{ success: boolean; imported: number; totalParsed?: number; error?: string }> => {
  try {
    const functions = getFunctions();
    const importData = httpsCallable<
      { htmlContent?: string; jsonData?: string },
      { success: boolean; imported: number; totalParsed?: number; error?: string }
    >(functions, 'importEbayData');

    const payload = format === 'json' ? { jsonData: data } : { htmlContent: data };
    const result = await importData(payload);
    return result.data;
  } catch (error) {
    console.error('Error importing eBay data:', error);
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Utility: Get stale status color
export const getStaleStatusColor = (
  daysSinceLastSale: number
): 'success' | 'warning' | 'error' | 'info' => {
  if (daysSinceLastSale < 30) return 'success';
  if (daysSinceLastSale < 60) return 'warning';
  if (daysSinceLastSale < 90) return 'info';
  return 'error';
};

// Utility: Format days since sale
export const formatDaysSinceLastSale = (days: number): string => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

// Run migration to populate itemStats from existing orders
export const runMigration = async (): Promise<{
  success: boolean;
  itemsCreated?: number;
  salesCreated?: number;
  ordersProcessed?: number;
  ordersSkipped?: number;
  error?: string;
}> => {
  try {
    const functions = getFunctions();
    const migrate = httpsCallable<
      object,
      {
        success: boolean;
        itemsCreated: number;
        salesCreated: number;
        ordersProcessed: number;
        ordersSkipped: number;
      }
    >(functions, 'migrateOrdersToItemStats');
    const result = await migrate({});
    return result.data;
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Get items that are currently in eBay listings
export const getEbayListedItems = async (): Promise<ItemStats[]> => {
  try {
    const q = query(
      collection(db, ITEM_STATS_COLLECTION),
      where('inEbayListings', '==', true),
      orderBy('daysSinceLastSale', 'desc')
    );

    const snapshot = await getDocs(q);
    const items: ItemStats[] = [];

    snapshot.forEach((docSnap) => {
      try {
        const data = docSnap.data() as ItemStatsFirestore;
        items.push(convertToItemStats(data));
      } catch (err) {
        console.error('Error converting item stats:', err);
      }
    });

    return items;
  } catch (error) {
    console.error('Error fetching eBay listed items:', error);
    return [];
  }
};

// Get sales records for a specific item
export const getSalesForItem = async (itemId: string): Promise<SaleRecord[]> => {
  try {
    const salesRef = collection(db, ITEM_STATS_COLLECTION, itemId, 'sales');
    const q = query(salesRef, orderBy('saleDate', 'desc'));
    const snapshot = await getDocs(q);

    const sales: SaleRecord[] = [];
    snapshot.forEach((docSnap) => {
      try {
        const data = docSnap.data() as SaleRecordFirestore;
        sales.push(convertToSaleRecord(data));
      } catch (err) {
        console.error('Error converting sale record:', err);
      }
    });

    return sales;
  } catch (error) {
    console.error('Error fetching sales for item:', error);
    return [];
  }
};

// Get price history for a specific item from subcollection
export const getPriceHistory = async (itemId: string): Promise<PriceHistoryEntry[]> => {
  try {
    const itemRef = doc(db, ITEM_STATS_COLLECTION, itemId);
    const historyRef = collection(itemRef, 'priceHistory');
    const q = query(historyRef, orderBy('checkedAt', 'desc'), limit(20));
    const snapshot = await getDocs(q);

    const history: PriceHistoryEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as PriceHistoryEntryFirestore;
      history.push({
        ...data,
        checkedAt: data.checkedAt?.toDate?.() || new Date(),
      });
    });

    // Return in chronological order (oldest first)
    return history.reverse();
  } catch (error) {
    console.error('Error fetching price history:', error);
    return [];
  }
};

// Get eBay metrics history for a specific item from subcollection
export const getEbayMetricsHistory = async (itemId: string): Promise<EbayMetricsEntry[]> => {
  try {
    const itemRef = doc(db, ITEM_STATS_COLLECTION, itemId);
    const metricsRef = collection(itemRef, 'ebayMetrics');
    const q = query(metricsRef, orderBy('recordedAt', 'desc'), limit(20));
    const snapshot = await getDocs(q);

    const history: EbayMetricsEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as EbayMetricsEntryFirestore;
      history.push({
        ...data,
        recordedAt: data.recordedAt?.toDate?.() || new Date(),
      });
    });

    // Return in chronological order (oldest first)
    return history.reverse();
  } catch (error) {
    console.error('Error fetching eBay metrics history:', error);
    return [];
  }
};

// Format currency
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

// Format profit margin
export const formatProfitMargin = (margin: number): string => {
  return `${margin.toFixed(1)}%`;
};

// Get latest pricing data from subcollection (most recent entry)
export const getLatestPricingData = async (itemId: string): Promise<PriceHistoryEntry | null> => {
  try {
    const itemRef = doc(db, ITEM_STATS_COLLECTION, itemId);
    const historyRef = collection(itemRef, 'priceHistory');
    const q = query(historyRef, orderBy('checkedAt', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data() as PriceHistoryEntryFirestore;
    return {
      ...data,
      checkedAt: data.checkedAt?.toDate?.() || new Date(),
    };
  } catch (error) {
    console.error('Error fetching latest pricing data:', error);
    return null;
  }
};

// Get latest eBay metrics from subcollection (most recent entry)
export const getLatestEbayMetrics = async (itemId: string): Promise<EbayMetricsEntry | null> => {
  try {
    const itemRef = doc(db, ITEM_STATS_COLLECTION, itemId);
    const metricsRef = collection(itemRef, 'ebayMetrics');
    const q = query(metricsRef, orderBy('recordedAt', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data() as EbayMetricsEntryFirestore;
    return {
      ...data,
      recordedAt: data.recordedAt?.toDate?.() || new Date(),
    };
  } catch (error) {
    console.error('Error fetching latest eBay metrics:', error);
    return null;
  }
};

// Backfill sales subcollection for a specific item
export const backfillSalesForItem = async (
  itemId: string,
  itemName: string
): Promise<{
  success: boolean;
  salesCreated?: number;
  totalRevenue?: number;
  totalProfit?: number;
  error?: string;
}> => {
  try {
    const functions = getFunctions();
    const backfill = httpsCallable<
      { itemId: string; itemName: string },
      { success: boolean; salesCreated: number; totalRevenue: number; totalProfit: number }
    >(functions, 'backfillSalesForItem');
    const result = await backfill({ itemId, itemName });
    return result.data;
  } catch (error) {
    console.error('Error backfilling sales:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Populate test sales data (temporary for testing)
export const populateTestSales = async (itemName?: string): Promise<{
  success: boolean;
  salesCreated?: number;
  totalProfit?: number;
  error?: string;
}> => {
  try {
    const functions = getFunctions();
    const populate = httpsCallable<
      { itemName?: string },
      { success: boolean; salesCreated: number; totalProfit: number }
    >(functions, 'populateTestSales');
    const result = await populate({ itemName });
    return result.data;
  } catch (error) {
    console.error('Error populating test sales:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
