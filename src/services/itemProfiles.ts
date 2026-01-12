import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { ItemProfile, ItemProfileFirestore } from '../types/itemProfile';

const ITEM_PROFILES_COLLECTION = 'itemProfiles';
const ITEM_STATS_COLLECTION = 'itemStats';

// Normalize item name to create a consistent document ID
export const normalizeItemName = (itemName: string): string => {
  return itemName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100); // Firestore doc IDs have limits
};

// Convert Firestore timestamps to JS Dates
const convertToItemProfile = (data: ItemProfileFirestore): ItemProfile => ({
  ...data,
  createdAt: data.createdAt?.toDate?.() || new Date(),
  updatedAt: data.updatedAt?.toDate?.() || new Date(),
});

// Fetch ebayItemId from itemStats collection (if available)
const fetchEbayItemIdFromStats = async (itemName: string): Promise<string | undefined> => {
  const statsId = normalizeItemName(itemName);
  const statsRef = doc(db, ITEM_STATS_COLLECTION, statsId);
  const statsSnap = await getDoc(statsRef);
  if (statsSnap.exists()) {
    const data = statsSnap.data();
    return data?.ebayItemId as string | undefined;
  }
  return undefined;
};

// Get item profile by item name (returns null if not exists)
export const getItemProfile = async (itemName: string): Promise<ItemProfile | null> => {
  const profileId = normalizeItemName(itemName);
  const docRef = doc(db, ITEM_PROFILES_COLLECTION, profileId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return convertToItemProfile(docSnap.data() as ItemProfileFirestore);
};

// Get or create item profile (for dialog opening)
export const getOrCreateItemProfile = async (
  itemName: string,
  itemId?: string,
  userEmail?: string
): Promise<ItemProfile> => {
  const profileId = normalizeItemName(itemName);
  const docRef = doc(db, ITEM_PROFILES_COLLECTION, profileId);
  const docSnap = await getDoc(docRef);

  let profile: ItemProfile;

  if (docSnap.exists()) {
    profile = convertToItemProfile(docSnap.data() as ItemProfileFirestore);
  } else {
    // Create new profile with empty fields
    const now = Timestamp.now();
    const newProfile: ItemProfileFirestore = {
      id: profileId,
      itemName: itemName,
      itemId: itemId || '',
      notes: '',
      ebayListingUrl: '',
      qualityNotes: '',
      vehicleFitment: '',
      createdAt: now,
      updatedAt: now,
      createdBy: userEmail || '',
      updatedBy: userEmail || '',
    };

    await setDoc(docRef, newProfile);
    profile = convertToItemProfile(newProfile);
  }

  // Fetch ebayItemId from itemStats (if available)
  const ebayItemId = await fetchEbayItemIdFromStats(itemName);
  if (ebayItemId) {
    profile.ebayItemId = ebayItemId;
  }

  return profile;
};

// Update item profile
export const updateItemProfile = async (
  profileId: string,
  data: Partial<Omit<ItemProfile, 'id' | 'itemName' | 'createdAt' | 'createdBy'>>,
  userEmail: string
): Promise<void> => {
  const docRef = doc(db, ITEM_PROFILES_COLLECTION, profileId);

  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
    updatedBy: userEmail,
  });
};
