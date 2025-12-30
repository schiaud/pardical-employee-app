// Run migration via Firebase Admin SDK
const admin = require('firebase-admin');

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or ADC)
admin.initializeApp({
  projectId: 'pardical-web-app'
});

const db = admin.firestore();

async function runMigration() {
  console.log('Starting migration...');

  // First, check current count
  const existingSnapshot = await db.collection('itemStats').limit(1).get();
  console.log(`Existing itemStats docs: ${existingSnapshot.size > 0 ? 'some exist' : 'none'}`);

  // Get all orders
  const ordersSnapshot = await db.collection('orders').get();
  console.log(`Total orders: ${ordersSnapshot.size}`);

  const itemMap = new Map();

  ordersSnapshot.forEach((doc) => {
    const data = doc.data();
    const itemName = data.item;
    if (!itemName) return;

    const normalizedId = itemName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

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

  console.log(`Unique items: ${itemMap.size}`);

  // Write in batches
  const now = admin.firestore.Timestamp.now();
  let count = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const [id, stats] of itemMap) {
    const daysSinceLastSale = Math.floor((new Date() - stats.lastSaleDate) / (1000 * 60 * 60 * 24));
    const daysSinceFirst = Math.max(1, Math.floor((new Date() - stats.firstSaleDate) / (1000 * 60 * 60 * 24)));
    const weeksActive = Math.max(1, daysSinceFirst / 7);
    const salesVelocity = stats.totalSold / weeksActive;

    const ref = db.collection('itemStats').doc(id);
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
      createdAt: now,
      updatedAt: now,
    });

    count++;
    batchCount++;

    if (batchCount === 500) {
      await batch.commit();
      console.log(`Committed batch: ${count} items total`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch: ${count} items total`);
  }

  console.log(`Migration completed: ${count} unique items created`);
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
