import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Database Manager
 * Handles the "Single Row Per User" requirement and IndexedDB syncing.
 */

const DB_NAME = 'CozyBuilderDB';
const DB_VERSION = 1;
const STORE_NAME = 'userData';

// Initialize IndexedDB
async function initLocalDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
}

export class DataManager {
    constructor() {
        this.room = new WebsimSocket();
        this.user = null;
        this.localDB = null;
        this.rowId = null; // The ID of the single row in Websim DB
        this.data = this.getEmptyState();
    }

    getEmptyState() {
        return {
            id: 'local_user', // Fixed ID for local storage singleton
            assets_json: { updated_at: 0, items: [] }, // Column 1
            settings_json: { updated_at: 0, theme: 'default' }, // Column 2
            col3_json: {}, col4_json: {}, col5_json: {}, // Columns 3-10
            col6_json: {}, col7_json: {}, col8_json: {},
            col9_json: {}, col10_json: {}
        };
    }

    async init() {
        this.user = await window.websim.getCurrentUser();
        this.localDB = await initLocalDB();
        
        // 1. Get Local Data
        let localData = await this.localDB.get(STORE_NAME, 'local_user');
        if (!localData) {
            localData = this.getEmptyState();
            await this.localDB.put(STORE_NAME, localData);
        }

        // 2. Get Remote Data (The Single Row)
        // We use a collection called 'user_slots_v1'
        const collection = this.room.collection('user_slots_v1');
        const records = await collection.filter({ username: this.user.username }).getList();
        
        let remoteData = null;
        
        if (records.length === 0) {
            // Create the single row if it doesn't exist
            const newRow = {
                assets_json: localData.assets_json,
                settings_json: localData.settings_json,
                // Initialize empty columns
                col3_json: {}, col4_json: {}, col5_json: {},
                col6_json: {}, col7_json: {}, col8_json: {},
                col9_json: {}, col10_json: {}
            };
            const created = await collection.create(newRow);
            this.rowId = created.id;
            remoteData = newRow;
        } else {
            this.rowId = records[0].id;
            remoteData = records[0];
        }

        // 3. Sync Logic (Compare Timestamps)
        await this.sync(localData, remoteData);
        
        return this.data;
    }

    async sync(local, remote) {
        let needsRemoteUpdate = false;
        let needsLocalUpdate = false;
        const merged = { ...local }; // Start with local structure

        // Helper to compare json columns
        const compareAndMerge = (key) => {
            const localTime = local[key]?.updated_at || 0;
            const remoteTime = remote[key]?.updated_at || 0;

            if (remoteTime > localTime) {
                merged[key] = remote[key];
                needsLocalUpdate = true;
            } else if (localTime > remoteTime) {
                // Local is newer, keep local in merged, but flag remote update
                merged[key] = local[key];
                needsRemoteUpdate = true;
            }
            // If equal, do nothing (they are in sync)
        };

        compareAndMerge('assets_json');
        compareAndMerge('settings_json');
        // Add others if used later

        this.data = merged;

        if (needsLocalUpdate) {
            await this.localDB.put(STORE_NAME, merged);
            console.log("Synced: Updated Local from Remote");
        }

        if (needsRemoteUpdate) {
            // Update the single row
            await this.room.collection('user_slots_v1').update(this.rowId, {
                assets_json: merged.assets_json,
                settings_json: merged.settings_json
            });
            console.log("Synced: Updated Remote from Local");
        }
    }

    // --- Asset Operations ---

    async addAsset(assetData) {
        // 1. Update State
        const now = Date.now();
        const newAsset = { ...assetData, id: uuidv4(), created_at: now };
        
        const updatedAssetsJson = {
            updated_at: now,
            items: [newAsset, ...this.data.assets_json.items]
        };

        this.data.assets_json = updatedAssetsJson;

        // 2. Write to Local
        await this.localDB.put(STORE_NAME, this.data);

        // 3. Write to Remote (Optimistic)
        try {
            await this.room.collection('user_slots_v1').update(this.rowId, {
                assets_json: updatedAssetsJson
            });
        } catch (e) {
            console.error("Failed to push to remote, will sync later", e);
        }

        return newAsset;
    }
    
    getAssets() {
        return this.data.assets_json.items || [];
    }
}

