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

/**
 * Firestore Trigger: Update itemStats when orders are created/updated
 */
export const updateItemStatsOnOrder = onDocumentWritten(
  "orders/{orderId}",
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();

    // Skip if no change to item
    if (before?.item === after?.item && before?.paidDate === after?.paidDate) {
      return;
    }

    try {
      // Handle deletion or item change - decrement old item
      if (before?.item && (!after || before.item !== after?.item)) {
        await updateItemStatsDecrement(before.item);
      }

      // Handle creation or item change - increment new item
      if (after?.item) {
        await updateItemStatsIncrement(
          after.item,
          after.itemId,
          after.paidDate
        );
      }
    } catch (error) {
      logger.error("Error updating item stats:", error);
    }
  }
);

async function updateItemStatsIncrement(
  itemName: string,
  itemId: string | undefined,
  paidDate: string | undefined
) {
  const normalizedId = normalizeItemName(itemName);
  const itemStatsRef = db.collection("itemStats").doc(normalizedId);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(itemStatsRef);
    const now = admin.firestore.Timestamp.now();
    const saleDate = paidDate ? new Date(paidDate) : new Date();
    const saleTimestamp = admin.firestore.Timestamp.fromDate(saleDate);

    if (!doc.exists) {
      // Create new item stats
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
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update existing
      const data = doc.data()!;
      const currentLastSale = data.lastSaleDate?.toDate() || new Date(0);
      const newLastSale = saleDate > currentLastSale ? saleTimestamp :
        data.lastSaleDate;

      transaction.update(itemStatsRef, {
        totalSold: admin.firestore.FieldValue.increment(1),
        lastSaleDate: newLastSale,
        salesLast30Days: admin.firestore.FieldValue.increment(1),
        salesLast90Days: admin.firestore.FieldValue.increment(1),
        daysSinceLastSale: 0,
        isStale: false,
        updatedAt: now,
      });
    }
  });
}

async function updateItemStatsDecrement(itemName: string) {
  const normalizedId = normalizeItemName(itemName);
  const itemStatsRef = db.collection("itemStats").doc(normalizedId);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(itemStatsRef);

    if (doc.exists) {
      const data = doc.data()!;
      const newTotal = Math.max(0, (data.totalSold || 1) - 1);

      if (newTotal === 0) {
        transaction.delete(itemStatsRef);
      } else {
        transaction.update(itemStatsRef, {
          totalSold: newTotal,
          salesLast30Days: Math.max(0, (data.salesLast30Days || 1) - 1),
          salesLast90Days: Math.max(0, (data.salesLast90Days || 1) - 1),
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

        // Count sales in windows (simplified - actual would query orders)
        // Rolling counts are maintained by the trigger function

        batch.update(doc.ref, {
          daysSinceLastSale,
          isStale,
          salesVelocity: Math.round(salesVelocity * 10) / 10,
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
 * Run once to populate initial data
 */
export const migrateOrdersToItemStats = onCall(
  {cors: true},
  async (request) => {
    logger.info("Starting orders migration to itemStats");

    const ordersSnapshot = await db.collection("orders").get();
    const itemMap = new Map<string, {
      itemName: string;
      itemId?: string;
      totalSold: number;
      lastSaleDate: Date;
      firstSaleDate: Date;
    }>();

    // Aggregate orders by item
    ordersSnapshot.forEach((doc) => {
      const data = doc.data();
      const itemName = data.item;
      if (!itemName) return;

      const normalizedId = normalizeItemName(itemName);
      const saleDate = data.paidDate ? new Date(data.paidDate) : new Date();

      const existing = itemMap.get(normalizedId);
      if (existing) {
        existing.totalSold++;
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
          totalSold: 1,
          lastSaleDate: saleDate,
          firstSaleDate: saleDate,
        });
      }
    });

    // Write to itemStats in batches
    const now = admin.firestore.Timestamp.now();
    let count = 0;
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

      const ref = db.collection("itemStats").doc(id);
      batch.set(ref, {
        id,
        itemName: stats.itemName,
        itemId: stats.itemId || null,
        totalSold: stats.totalSold,
        lastSaleDate: admin.firestore.Timestamp.fromDate(stats.lastSaleDate),
        firstSaleDate: admin.firestore.Timestamp.fromDate(stats.firstSaleDate),
        salesLast30Days: stats.totalSold, // Approximation
        salesLast90Days: stats.totalSold, // Approximation
        daysSinceLastSale,
        salesVelocity: Math.round(salesVelocity * 10) / 10,
        isStale: daysSinceLastSale >= 30,
        staleThresholdDays: 30,
        createdAt: now,
        updatedAt: now,
      });

      count++;
      batchCount++;

      if (batchCount === 500) {
        await batch.commit();
        logger.info(`Committed batch: ${count} items total`);
        batch = db.batch(); // Create new batch
        batchCount = 0;
      }
    }

    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch: ${count} items total`);
    }

    logger.info(`Migration completed: ${count} unique items created`);
    return {success: true, itemsCreated: count};
  }
);
