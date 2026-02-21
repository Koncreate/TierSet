/**
 * Utility to clear all persistence data
 * Run in browser console: import('./lib/persistence/clearPersistence').then(m => m.clearAllPersistence())
 */

import { db } from "../storage/db";

/**
 * Clear all persisted store snapshots and settings
 */
export async function clearAllPersistence(): Promise<void> {
  console.log("[clearPersistence] Clearing all persistence data...");
  
  try {
    // Clear stores table
    await db.stores.clear();
    console.log("[clearPersistence] Cleared stores table");
    
    // Clear user settings table
    await db.userSettings.clear();
    console.log("[clearPersistence] Cleared user settings table");
    
    console.log("[clearPersistence] All persistence data cleared");
  } catch (error) {
    console.error("[clearPersistence] Failed to clear:", error);
  }
}

/**
 * Clear only appStore snapshot (room state)
 */
export async function clearAppStoreSnapshot(): Promise<void> {
  console.log("[clearPersistence] Clearing appStore snapshot...");
  await db.stores.delete("appStore");
  console.log("[clearPersistence] appStore snapshot cleared");
}
