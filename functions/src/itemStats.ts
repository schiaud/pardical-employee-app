import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onCall} from "firebase-functions/v2/https";

const db = admin.firestore();

// Helper to normalize item name for consistent matching
const normalizeItemName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
};

// Helper to calculate days between two dates
const daysBetween = (date1: Date, date2: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / oneDay);
};

// Helper to parse currency strings/numbers to numbers
const parseCurrency = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const num = parseFloat(value.replace(/[^\d.-]/g, ""));
  return isNaN(num) ? 0 : num;
};

// Helper to get week key (e.g., "2025-W01")
const getWeekKey = (date: Date): string => {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${week.toString().padStart(2, "0")}`;
};

// Helper to get month key (e.g., "2025-01")
const getMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
};

/**
 * Trigger automatic pricing fetch for items with vehicleInfo
 * Called asynchronously when new orders come in
 */
async function triggerAutoPricingFetch(itemId: string): Promise<void> {
  try {
    const itemDoc = await db.collection("itemStats").doc(itemId).get();
    if (!itemDoc.exists) return;

    const itemData = itemDoc.data();
    const vehicleInfo = itemData?.vehicleInfo;

    // Only fetch if vehicleInfo is complete
    if (!vehicleInfo?.year || !vehicleInfo?.make ||
        !vehicleInfo?.model || !vehicleInfo?.part) {
      return;
    }

    logger.info(`Auto-fetching pricing for item: ${itemId}`);

    // Dynamically import scraper to avoid circular dependencies
    const {scrapeCarPartPricing} = await import("./carPartScraper");

    const result = await scrapeCarPartPricing({
      year: vehicleInfo.year,
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      part: vehicleInfo.part,
      variantValue: vehicleInfo.variantValue,
    });

    if (result.success && result.metrics) {
      const now = admin.firestore.Timestamp.now();
      const itemRef = db.collection("itemStats").doc(itemId);

      // Write to priceHistory SUBCOLLECTION only (no field)
      const priceHistoryRef = itemRef.collection("priceHistory");
      await priceHistoryRef.add({
        avgPrice: result.metrics.avgPrice,
        minPrice: result.metrics.minPrice,
        maxPrice: result.metrics.maxPrice,
        stdDev: result.metrics.stdDev,
        totalListings: result.metrics.totalListings,
        totalPages: result.metrics.totalPages,
        checkedAt: now,
        source: "carpart",
      });

      // Update only the timestamp on main document
      await itemRef.update({
        updatedAt: now,
      });

      logger.info(`Auto-updated pricing for ${itemId}: $${result.metrics.avgPrice} (${result.metrics.totalPages} pages)`);
    }
  } catch (error) {
    logger.error(`Auto-pricing failed for ${itemId}:`, error);
  }
}

/**
 * Firestore Trigger: Update itemStats when orders are created/updated
 */
export const updateItemStatsOnOrder = onDocumentWritten(
  "orders/{orderId}",
  async (event) => {
    const orderId = event.params.orderId;
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();

    // Skip if no change to item or paidDate
    if (before?.item === after?.item && before?.paidDate === after?.paidDate) {
      return;
    }

    try {
      // Handle deletion or item change - decrement old item
      if (before?.item && (!after || before.item !== after?.item)) {
        await updateItemStatsDecrement(before.item, orderId);
      }

      // Handle creation or item change - increment new item
      if (after?.item && after?.paidDate) {
        await updateItemStatsIncrement(
          after.item,
          after.itemId,
          after.paidDate,
          orderId,
          after.orderNumber,
          after.earnings,
          after.buyPrice,
          after.shipPrice
        );

        // Trigger auto-pricing fetch asynchronously (don't block order processing)
        const normalizedId = normalizeItemName(after.item);
        triggerAutoPricingFetch(normalizedId).catch((err) => {
          logger.error("Auto-pricing trigger error:", err);
        });
      }
    } catch (error) {
      logger.error("Error updating item stats:", error);
    }
  }
);

async function updateItemStatsIncrement(
  itemName: string,
  itemId: string | undefined,
  paidDate: string | undefined,
  orderId: string,
  orderNumber: string | undefined,
  earnings: string | undefined,
  buyPrice: string | undefined,
  shipPrice: string | undefined
) {
  const normalizedId = normalizeItemName(itemName);
  const itemStatsRef = db.collection("itemStats").doc(normalizedId);

  // Parse financial data
  const salePrice = parseCurrency(earnings);
  const purchaseCost = parseCurrency(buyPrice);
  const shipCost = parseCurrency(shipPrice);
  const profit = salePrice - purchaseCost - shipCost;
  const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

  const now = admin.firestore.Timestamp.now();
  const saleDate = paidDate ? new Date(paidDate) : new Date();
  const saleTimestamp = admin.firestore.Timestamp.fromDate(saleDate);
  const weekKey = getWeekKey(saleDate);
  const monthKey = getMonthKey(saleDate);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(itemStatsRef);

    // Create sale record in subcollection
    const saleRef = itemStatsRef.collection("sales").doc(orderId);
    transaction.set(saleRef, {
      id: orderId,
      orderRef: `orders/${orderId}`,
      orderNumber: orderNumber || null,
      salePrice,
      purchaseCost: purchaseCost || null,
      shipCost: shipCost || null,
      profit,
      profitMargin: Math.round(profitMargin * 10) / 10,
      saleDate: saleTimestamp,
      createdAt: now,
    });

    if (!doc.exists) {
      // Create new item stats with profit tracking
      transaction.set(itemStatsRef, {
        id: normalizedId,
        itemName: itemName,
        itemId: itemId || null,
        totalSold: 1,
        lastSaleDate: saleTimestamp,
        firstSaleDate: saleTimestamp,
        salesLast30Days: 1,
        salesLast90Days: 1,
        daysSinceLastSale: 0,
        salesVelocity: 0,
        isStale: false,
        staleThresholdDays: 30,
        // Profit aggregates
        totalRevenue: salePrice,
        totalCost: purchaseCost + shipCost,
        totalProfit: profit,
        avgProfitMargin: Math.round(profitMargin * 10) / 10,
        // Sales by period
        salesByWeek: {[weekKey]: 1},
        salesByMonth: {[monthKey]: 1},
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update existing with profit data
      const data = doc.data()!;
      const currentLastSale = data.lastSaleDate?.toDate() || new Date(0);
      const newLastSale = saleDate > currentLastSale ? saleTimestamp :
        data.lastSaleDate;

      // Calculate new average margin
      const prevRevenue = data.totalRevenue || 0;
      const newTotalRevenue = prevRevenue + salePrice;
      const prevProfit = data.totalProfit || 0;
      const newTotalProfit = prevProfit + profit;
      const newAvgMargin = newTotalRevenue > 0 ?
        (newTotalProfit / newTotalRevenue) * 100 : 0;

      // Update sales by period
      const salesByWeek = data.salesByWeek || {};
      const salesByMonth = data.salesByMonth || {};
      salesByWeek[weekKey] = (salesByWeek[weekKey] || 0) + 1;
      salesByMonth[monthKey] = (salesByMonth[monthKey] || 0) + 1;

      transaction.update(itemStatsRef, {
        totalSold: admin.firestore.FieldValue.increment(1),
        lastSaleDate: newLastSale,
        salesLast30Days: admin.firestore.FieldValue.increment(1),
        salesLast90Days: admin.firestore.FieldValue.increment(1),
        daysSinceLastSale: 0,
        isStale: false,
        // Profit updates
        totalRevenue: admin.firestore.FieldValue.increment(salePrice),
        totalCost: admin.firestore.FieldValue.increment(purchaseCost + shipCost),
        totalProfit: admin.firestore.FieldValue.increment(profit),
        avgProfitMargin: Math.round(newAvgMargin * 10) / 10,
        // Period updates
        salesByWeek,
        salesByMonth,
        updatedAt: now,
      });
    }
  });
}

async function updateItemStatsDecrement(itemName: string, orderId: string) {
  const normalizedId = normalizeItemName(itemName);
  const itemStatsRef = db.collection("itemStats").doc(normalizedId);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(itemStatsRef);
    const saleRef = itemStatsRef.collection("sales").doc(orderId);
    const saleDoc = await transaction.get(saleRef);

    // Delete the sale record if it exists
    if (saleDoc.exists) {
      transaction.delete(saleRef);
    }

    if (doc.exists) {
      const data = doc.data()!;
      const newTotal = Math.max(0, (data.totalSold || 1) - 1);

      // Get sale data for reverting profit
      const saleData = saleDoc.data();
      const salePrice = saleData?.salePrice || 0;
      const saleCost = (saleData?.purchaseCost || 0) + (saleData?.shipCost || 0);
      const saleProfit = saleData?.profit || 0;

      if (newTotal === 0) {
        transaction.delete(itemStatsRef);
      } else {
        // Recalculate average margin
        const newRevenue = Math.max(0, (data.totalRevenue || 0) - salePrice);
        const newProfit = (data.totalProfit || 0) - saleProfit;
        const newAvgMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

        transaction.update(itemStatsRef, {
          totalSold: newTotal,
          salesLast30Days: Math.max(0, (data.salesLast30Days || 1) - 1),
          salesLast90Days: Math.max(0, (data.salesLast90Days || 1) - 1),
          totalRevenue: admin.firestore.FieldValue.increment(-salePrice),
          totalCost: admin.firestore.FieldValue.increment(-saleCost),
          totalProfit: admin.firestore.FieldValue.increment(-saleProfit),
          avgProfitMargin: Math.round(newAvgMargin * 10) / 10,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    }
  });
}

/**
 * Scheduled Function: Calculate daily stale metrics
 * Runs every day at 2 AM
 */
export const calculateDailyStaleMetrics = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "America/Chicago",
  },
  async () => {
    logger.info("Starting daily stale metrics calculation");

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const batch = db.batch();
    let updateCount = 0;

    try {
      const itemStatsSnapshot = await db.collection("itemStats").get();

      for (const doc of itemStatsSnapshot.docs) {
        const data = doc.data();
        const lastSaleDate = data.lastSaleDate?.toDate() || new Date(0);
        const firstSaleDate = data.firstSaleDate?.toDate() || lastSaleDate;
        const daysSinceLastSale = daysBetween(now, lastSaleDate);
        const threshold = data.staleThresholdDays || 30;
        const isStale = daysSinceLastSale >= threshold;

        // Calculate sales velocity (sales per week over last 90 days)
        const daysSinceFirst = Math.max(1, daysBetween(now, firstSaleDate));
        const weeksActive = Math.max(1, daysSinceFirst / 7);
        const salesVelocity = data.totalSold / weeksActive;

        // Count sales in rolling windows from sales subcollection
        const salesSnapshot = await doc.ref.collection("sales").get();
        let salesLast30Days = 0;
        let salesLast90Days = 0;

        for (const saleDoc of salesSnapshot.docs) {
          const saleData = saleDoc.data();
          const saleDate = saleData.saleDate?.toDate();
          if (saleDate) {
            if (saleDate >= thirtyDaysAgo) salesLast30Days++;
            if (saleDate >= ninetyDaysAgo) salesLast90Days++;
          }
        }

        batch.update(doc.ref, {
          daysSinceLastSale,
          isStale,
          salesVelocity: Math.round(salesVelocity * 10) / 10,
          salesLast30Days,
          salesLast90Days,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        updateCount++;

        // Commit in batches of 500
        if (updateCount % 500 === 0) {
          await batch.commit();
          logger.info(`Committed batch of ${updateCount} updates`);
        }
      }

      // Commit remaining
      if (updateCount % 500 !== 0) {
        await batch.commit();
      }

      logger.info(`Daily stale metrics completed: ${updateCount} items updated`);
    } catch (error) {
      logger.error("Error in daily stale metrics:", error);
      throw error;
    }
  }
);

/**
 * HTTP Callable: Migrate existing orders to itemStats
 * Creates itemStats with sales subcollections and profit tracking
 * Filters to last 6 months of orders
 */
export const migrateOrdersToItemStats = onCall(
  {cors: true, timeoutSeconds: 300, memory: "1GiB"},
  async () => {
    logger.info("Starting orders migration to itemStats (last 6 months)");

    // Calculate 6 months ago cutoff
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    logger.info(`Filtering orders from ${sixMonthsAgo.toISOString()}`);

    const ordersSnapshot = await db.collection("orders").get();

    // Structure to hold aggregated data
    interface OrderData {
      orderId: string;
      orderNumber?: string;
      saleDate: Date;
      salePrice: number;
      purchaseCost: number;
      shipCost: number;
      profit: number;
      profitMargin: number;
    }

    const itemMap = new Map<string, {
      itemName: string;
      itemId?: string;
      orders: OrderData[];
      totalSold: number;
      lastSaleDate: Date;
      firstSaleDate: Date;
      totalRevenue: number;
      totalCost: number;
      totalProfit: number;
      salesByWeek: Record<string, number>;
      salesByMonth: Record<string, number>;
    }>();

    let skippedOld = 0;
    let processed = 0;

    // Aggregate orders by item
    ordersSnapshot.forEach((doc) => {
      const data = doc.data();
      const itemName = data.item;
      if (!itemName || !data.paidDate) return;

      const saleDate = new Date(data.paidDate);

      // Skip orders older than 6 months
      if (saleDate < sixMonthsAgo) {
        skippedOld++;
        return;
      }

      processed++;
      const normalizedId = normalizeItemName(itemName);

      // Parse financial data
      const salePrice = parseCurrency(data.earnings);
      const purchaseCost = parseCurrency(data.buyPrice);
      const shipCost = parseCurrency(data.shipPrice);
      const profit = salePrice - purchaseCost - shipCost;
      const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

      const orderData: OrderData = {
        orderId: doc.id,
        orderNumber: data.orderNumber,
        saleDate,
        salePrice,
        purchaseCost,
        shipCost,
        profit,
        profitMargin,
      };

      const weekKey = getWeekKey(saleDate);
      const monthKey = getMonthKey(saleDate);

      const existing = itemMap.get(normalizedId);
      if (existing) {
        existing.orders.push(orderData);
        existing.totalSold++;
        existing.totalRevenue += salePrice;
        existing.totalCost += purchaseCost + shipCost;
        existing.totalProfit += profit;
        existing.salesByWeek[weekKey] = (existing.salesByWeek[weekKey] || 0) + 1;
        existing.salesByMonth[monthKey] =
          (existing.salesByMonth[monthKey] || 0) + 1;
        if (saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
        if (saleDate < existing.firstSaleDate) {
          existing.firstSaleDate = saleDate;
        }
      } else {
        itemMap.set(normalizedId, {
          itemName,
          itemId: data.itemId,
          orders: [orderData],
          totalSold: 1,
          lastSaleDate: saleDate,
          firstSaleDate: saleDate,
          totalRevenue: salePrice,
          totalCost: purchaseCost + shipCost,
          totalProfit: profit,
          salesByWeek: {[weekKey]: 1},
          salesByMonth: {[monthKey]: 1},
        });
      }
    });

    logger.info(`Processed ${processed} orders, skipped ${skippedOld} old orders`);
    logger.info(`Found ${itemMap.size} unique items`);

    // Write to itemStats in batches
    const now = admin.firestore.Timestamp.now();
    let itemCount = 0;
    let saleCount = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const [id, stats] of itemMap) {
      const daysSinceLastSale = daysBetween(new Date(), stats.lastSaleDate);
      const daysSinceFirst = Math.max(
        1,
        daysBetween(new Date(), stats.firstSaleDate)
      );
      const weeksActive = Math.max(1, daysSinceFirst / 7);
      const salesVelocity = stats.totalSold / weeksActive;
      const avgProfitMargin = stats.totalRevenue > 0 ?
        (stats.totalProfit / stats.totalRevenue) * 100 : 0;

      const ref = db.collection("itemStats").doc(id);
      batch.set(ref, {
        id,
        itemName: stats.itemName,
        itemId: stats.itemId || null,
        totalSold: stats.totalSold,
        lastSaleDate: admin.firestore.Timestamp.fromDate(stats.lastSaleDate),
        firstSaleDate: admin.firestore.Timestamp.fromDate(stats.firstSaleDate),
        salesLast30Days: stats.totalSold,
        salesLast90Days: stats.totalSold,
        daysSinceLastSale,
        salesVelocity: Math.round(salesVelocity * 10) / 10,
        isStale: daysSinceLastSale >= 30,
        staleThresholdDays: 30,
        // Profit aggregates
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
        totalCost: Math.round(stats.totalCost * 100) / 100,
        totalProfit: Math.round(stats.totalProfit * 100) / 100,
        avgProfitMargin: Math.round(avgProfitMargin * 10) / 10,
        // Sales by period
        salesByWeek: stats.salesByWeek,
        salesByMonth: stats.salesByMonth,
        createdAt: now,
        updatedAt: now,
      });

      batchCount++;
      itemCount++;

      // Create sale records in subcollection
      for (const order of stats.orders) {
        const saleRef = ref.collection("sales").doc(order.orderId);
        batch.set(saleRef, {
          id: order.orderId,
          orderRef: `orders/${order.orderId}`,
          orderNumber: order.orderNumber || null,
          salePrice: order.salePrice,
          purchaseCost: order.purchaseCost || null,
          shipCost: order.shipCost || null,
          profit: Math.round(order.profit * 100) / 100,
          profitMargin: Math.round(order.profitMargin * 10) / 10,
          saleDate: admin.firestore.Timestamp.fromDate(order.saleDate),
          createdAt: now,
        });
        batchCount++;
        saleCount++;

        // Commit batch if approaching limit
        if (batchCount >= 450) {
          await batch.commit();
          logger.info(`Committed batch: ${itemCount} items, ${saleCount} sales`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch: ${itemCount} items, ${saleCount} sales`);
    }

    logger.info(`Migration completed: ${itemCount} items, ${saleCount} sales`);
    return {
      success: true,
      itemsCreated: itemCount,
      salesCreated: saleCount,
      ordersProcessed: processed,
      ordersSkipped: skippedOld,
    };
  }
);

/**
 * HTTP Callable: Migrate ALL orders to itemStats (no date filter)
 * Creates itemStats with sales subcollections and profit tracking
 * Handles orders without paidDate by using createdAt or current date as fallback
 */
export const migrateAllOrdersToItemStats = onCall(
  {cors: true, timeoutSeconds: 540, memory: "1GiB"},
  async () => {
    logger.info("Starting FULL orders migration to itemStats (all time, no date filter)");

    const ordersSnapshot = await db.collection("orders").get();

    // Structure to hold aggregated data
    interface OrderData {
      orderId: string;
      orderNumber?: string;
      saleDate: Date;
      salePrice: number;
      purchaseCost: number;
      shipCost: number;
      profit: number;
      profitMargin: number;
    }

    const itemMap = new Map<string, {
      itemName: string;
      itemId?: string;
      orders: OrderData[];
      totalSold: number;
      lastSaleDate: Date;
      firstSaleDate: Date;
      totalRevenue: number;
      totalCost: number;
      totalProfit: number;
      salesByWeek: Record<string, number>;
      salesByMonth: Record<string, number>;
    }>();

    let skippedNoItem = 0;
    let processed = 0;
    let usedFallbackDate = 0;

    // Aggregate orders by item - NO DATE FILTER
    ordersSnapshot.forEach((doc) => {
      const data = doc.data();
      const itemName = data.item;

      // Skip orders without item name
      if (!itemName) {
        skippedNoItem++;
        return;
      }

      // Use paidDate if available, otherwise use createdAt or current date
      let saleDate: Date;
      if (data.paidDate) {
        saleDate = new Date(data.paidDate);
      } else if (data.createdAt?.toDate) {
        saleDate = data.createdAt.toDate();
        usedFallbackDate++;
      } else if (data.createdAt) {
        saleDate = new Date(data.createdAt);
        usedFallbackDate++;
      } else {
        saleDate = new Date();
        usedFallbackDate++;
      }

      processed++;
      const normalizedId = normalizeItemName(itemName);

      // Parse financial data
      const salePrice = parseCurrency(data.earnings);
      const purchaseCost = parseCurrency(data.buyPrice);
      const shipCost = parseCurrency(data.shipPrice);
      const profit = salePrice - purchaseCost - shipCost;
      const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

      const orderData: OrderData = {
        orderId: doc.id,
        orderNumber: data.orderNumber,
        saleDate,
        salePrice,
        purchaseCost,
        shipCost,
        profit,
        profitMargin,
      };

      const weekKey = getWeekKey(saleDate);
      const monthKey = getMonthKey(saleDate);

      const existing = itemMap.get(normalizedId);
      if (existing) {
        existing.orders.push(orderData);
        existing.totalSold++;
        existing.totalRevenue += salePrice;
        existing.totalCost += purchaseCost + shipCost;
        existing.totalProfit += profit;
        existing.salesByWeek[weekKey] = (existing.salesByWeek[weekKey] || 0) + 1;
        existing.salesByMonth[monthKey] =
          (existing.salesByMonth[monthKey] || 0) + 1;
        if (saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
        if (saleDate < existing.firstSaleDate) {
          existing.firstSaleDate = saleDate;
        }
      } else {
        itemMap.set(normalizedId, {
          itemName,
          itemId: data.itemId,
          orders: [orderData],
          totalSold: 1,
          lastSaleDate: saleDate,
          firstSaleDate: saleDate,
          totalRevenue: salePrice,
          totalCost: purchaseCost + shipCost,
          totalProfit: profit,
          salesByWeek: {[weekKey]: 1},
          salesByMonth: {[monthKey]: 1},
        });
      }
    });

    logger.info(`Processed ${processed} orders, skipped ${skippedNoItem} without item name`);
    logger.info(`Used fallback date for ${usedFallbackDate} orders without paidDate`);
    logger.info(`Found ${itemMap.size} unique items`);

    // Write to itemStats in batches
    const now = admin.firestore.Timestamp.now();
    let itemCount = 0;
    let saleCount = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const [id, stats] of itemMap) {
      const daysSinceLastSale = daysBetween(new Date(), stats.lastSaleDate);
      const daysSinceFirst = Math.max(
        1,
        daysBetween(new Date(), stats.firstSaleDate)
      );
      const weeksActive = Math.max(1, daysSinceFirst / 7);
      const salesVelocity = stats.totalSold / weeksActive;
      const avgProfitMargin = stats.totalRevenue > 0 ?
        (stats.totalProfit / stats.totalRevenue) * 100 : 0;

      const ref = db.collection("itemStats").doc(id);
      batch.set(ref, {
        id,
        itemName: stats.itemName,
        itemId: stats.itemId || null,
        totalSold: stats.totalSold,
        lastSaleDate: admin.firestore.Timestamp.fromDate(stats.lastSaleDate),
        firstSaleDate: admin.firestore.Timestamp.fromDate(stats.firstSaleDate),
        salesLast30Days: stats.totalSold,
        salesLast90Days: stats.totalSold,
        daysSinceLastSale,
        salesVelocity: Math.round(salesVelocity * 10) / 10,
        isStale: daysSinceLastSale >= 30,
        staleThresholdDays: 30,
        // Profit aggregates
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
        totalCost: Math.round(stats.totalCost * 100) / 100,
        totalProfit: Math.round(stats.totalProfit * 100) / 100,
        avgProfitMargin: Math.round(avgProfitMargin * 10) / 10,
        // Sales by period
        salesByWeek: stats.salesByWeek,
        salesByMonth: stats.salesByMonth,
        createdAt: now,
        updatedAt: now,
      });

      batchCount++;
      itemCount++;

      // Create sale records in subcollection
      for (const order of stats.orders) {
        const saleRef = ref.collection("sales").doc(order.orderId);
        batch.set(saleRef, {
          id: order.orderId,
          orderRef: `orders/${order.orderId}`,
          orderNumber: order.orderNumber || null,
          salePrice: order.salePrice,
          purchaseCost: order.purchaseCost || null,
          shipCost: order.shipCost || null,
          profit: Math.round(order.profit * 100) / 100,
          profitMargin: Math.round(order.profitMargin * 10) / 10,
          saleDate: admin.firestore.Timestamp.fromDate(order.saleDate),
          createdAt: now,
        });
        batchCount++;
        saleCount++;

        // Commit batch if approaching limit
        if (batchCount >= 450) {
          await batch.commit();
          logger.info(`Committed batch: ${itemCount} items, ${saleCount} sales`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch: ${itemCount} items, ${saleCount} sales`);
    }

    logger.info(`Full migration completed: ${itemCount} items, ${saleCount} sales`);
    return {
      success: true,
      itemsCreated: itemCount,
      salesCreated: saleCount,
      ordersProcessed: processed,
      ordersSkippedNoItem: skippedNoItem,
      ordersUsedFallbackDate: usedFallbackDate,
    };
  }
);

/**
 * HTTP Callable: Backfill sales subcollection for a specific item
 * Called when expanding an item that has sales but no subcollection data
 */
export const backfillSalesForItem = onCall(
  {cors: true, timeoutSeconds: 60},
  async (request) => {
    const {itemId, itemName} = request.data as {
      itemId: string;
      itemName: string;
    };

    if (!itemId || !itemName) {
      throw new Error("itemId and itemName are required");
    }

    logger.info(`Backfilling sales for item: ${itemName} (${itemId})`);

    // Query orders that match this exact item name
    const ordersSnapshot = await db
      .collection("orders")
      .where("item", "==", itemName)
      .get();

    if (ordersSnapshot.empty) {
      logger.info(`No orders found for item: ${itemName}`);
      return {success: true, salesCreated: 0, message: "No orders found"};
    }

    const itemStatsRef = db.collection("itemStats").doc(itemId);
    const now = admin.firestore.Timestamp.now();

    let batch = db.batch();
    let batchCount = 0;
    let salesCreated = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    for (const orderDoc of ordersSnapshot.docs) {
      const order = orderDoc.data();

      // Skip if no paidDate (not a completed sale)
      if (!order.paidDate) continue;

      const saleDate = new Date(order.paidDate);
      const salePrice = parseCurrency(order.earnings);
      const purchaseCost = parseCurrency(order.buyPrice);
      const shipCost = parseCurrency(order.shipPrice);
      const profit = salePrice - purchaseCost - shipCost;
      const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

      // Create sale record in subcollection
      const saleRef = itemStatsRef.collection("sales").doc(orderDoc.id);
      batch.set(saleRef, {
        id: orderDoc.id,
        orderRef: `orders/${orderDoc.id}`,
        orderNumber: order.orderNumber || null,
        salePrice,
        purchaseCost: purchaseCost || null,
        shipCost: shipCost || null,
        profit: Math.round(profit * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,
        saleDate: admin.firestore.Timestamp.fromDate(saleDate),
        sku: order.sku || null,
        createdAt: now,
      });

      totalRevenue += salePrice;
      totalCost += purchaseCost + shipCost;
      totalProfit += profit;
      salesCreated++;
      batchCount++;

      // Commit batch if approaching limit
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Update itemStats with recalculated profit data
    if (salesCreated > 0) {
      const avgMargin = totalRevenue > 0 ?
        (totalProfit / totalRevenue) * 100 : 0;

      batch.update(itemStatsRef, {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        avgProfitMargin: Math.round(avgMargin * 10) / 10,
        updatedAt: now,
      });
      batchCount++;
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(`Backfill completed: ${salesCreated} sales created for ${itemName}`);
    return {
      success: true,
      salesCreated,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
    };
  }
);

/**
 * Scheduled Function: Weekly price check for items with vehicleInfo
 * Runs every Sunday at 3 AM
 */
export const weeklyPriceCheck = onSchedule(
  {
    schedule: "0 3 * * 0", // Every Sunday at 3 AM
    timeZone: "America/Chicago",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    logger.info("Starting weekly price check");

    // Import the scraper function dynamically to avoid circular deps
    const {scrapeCarPartPricing} = await import("./carPartScraper");

    const itemsWithVehicleInfo = await db
      .collection("itemStats")
      .where("vehicleInfo", "!=", null)
      .get();

    logger.info(`Found ${itemsWithVehicleInfo.size} items with vehicleInfo`);

    let updated = 0;
    let errors = 0;

    for (const doc of itemsWithVehicleInfo.docs) {
      const data = doc.data();
      const vehicleInfo = data.vehicleInfo;

      if (!vehicleInfo?.year || !vehicleInfo?.make ||
          !vehicleInfo?.model || !vehicleInfo?.part) {
        continue;
      }

      try {
        // Fetch pricing from car-part.com
        const result = await scrapeCarPartPricing({
          year: vehicleInfo.year,
          make: vehicleInfo.make,
          model: vehicleInfo.model,
          part: vehicleInfo.part,
          variantValue: vehicleInfo.variantValue,
        });

        if (result.success && result.metrics) {
          const now = admin.firestore.Timestamp.now();

          // Write to priceHistory SUBCOLLECTION only (no field)
          const priceHistoryRef = doc.ref.collection("priceHistory");
          await priceHistoryRef.add({
            avgPrice: result.metrics.avgPrice,
            minPrice: result.metrics.minPrice,
            maxPrice: result.metrics.maxPrice,
            stdDev: result.metrics.stdDev,
            totalListings: result.metrics.totalListings,
            totalPages: result.metrics.totalPages,
            checkedAt: now,
            source: "carpart",
          });

          // Update only the timestamp on main document
          await doc.ref.update({
            updatedAt: now,
          });

          updated++;
        }
      } catch (error) {
        logger.error(`Error checking price for ${data.itemName}:`, error);
        errors++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info(`Weekly price check completed: ${updated} updated, ${errors} errors`);
  }
);

/**
 * Scheduled Function: Auto-unreview items that haven't sold since being reviewed
 * Items reviewed 60+ days ago with no sale since review get their reviewedAt cleared
 * Runs daily at 4 AM
 */
export const autoUnreviewStaleItems = onSchedule(
  {
    schedule: "0 4 * * *", // Every day at 4 AM
    timeZone: "America/Chicago",
  },
  async () => {
    logger.info("Starting auto-unreview check for stale reviewed items");

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sixtyDaysAgo);

    // Get all items that were reviewed more than 60 days ago
    const reviewedItemsSnapshot = await db
      .collection("itemStats")
      .where("reviewedAt", "<=", sixtyDaysAgoTimestamp)
      .get();

    logger.info(`Found ${reviewedItemsSnapshot.size} items reviewed 60+ days ago`);

    let batch = db.batch();
    let batchCount = 0;
    let unreviewedCount = 0;

    for (const doc of reviewedItemsSnapshot.docs) {
      const data = doc.data();
      const reviewedAt = data.reviewedAt?.toDate();
      const lastSaleDate = data.lastSaleDate?.toDate();

      // Only unreview if no sale has occurred since the review
      if (reviewedAt && lastSaleDate && lastSaleDate < reviewedAt) {
        batch.update(doc.ref, {
          reviewedAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        unreviewedCount++;
        batchCount++;

        // Commit batch if approaching limit
        if (batchCount >= 450) {
          await batch.commit();
          logger.info(`Committed batch: ${unreviewedCount} items unreviewed`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(`Auto-unreview completed: ${unreviewedCount} items unreviewed`);
  }
);
