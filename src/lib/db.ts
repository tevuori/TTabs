// Shared IndexedDB connection for TTabs.
// Both storage.ts and auth.ts import this to avoid version conflicts.

import { openDB, IDBPDatabase } from "idb";

export const DB_NAME = "ttabs";
export const DB_VERSION = 4; // v4: add userId index to songs/states/setlists

export const SONGS_STORE = "songs";
export const STATE_STORE = "songStates";
export const SETLISTS_STORE = "setlists";
export const USERS_STORE = "users";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(SONGS_STORE)) {
            const store = db.createObjectStore(SONGS_STORE, { keyPath: "key" });
            store.createIndex("savedAt", "savedAt");
            store.createIndex("artistName", "artistName");
            store.createIndex("userId", "userId");
          }
          if (!db.objectStoreNames.contains(STATE_STORE)) {
            const store = db.createObjectStore(STATE_STORE, { keyPath: "key" });
            store.createIndex("userId", "userId");
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(SETLISTS_STORE)) {
            const store = db.createObjectStore(SETLISTS_STORE, { keyPath: "id" });
            store.createIndex("userId", "userId");
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(USERS_STORE)) {
            const store = db.createObjectStore(USERS_STORE, { keyPath: "id" });
            store.createIndex("username", "username", { unique: true });
          }
        }
        if (oldVersion < 4) {
          // v4: migrate songs store to use composite "key" (userId:id) and
          // add userId index. If the store already exists with keyPath "id",
          // we need to recreate it.
          if (db.objectStoreNames.contains(SONGS_STORE)) {
            db.deleteObjectStore(SONGS_STORE);
          }
          const songsStore = db.createObjectStore(SONGS_STORE, { keyPath: "key" });
          songsStore.createIndex("savedAt", "savedAt");
          songsStore.createIndex("artistName", "artistName");
          songsStore.createIndex("userId", "userId");

          if (db.objectStoreNames.contains(STATE_STORE)) {
            db.deleteObjectStore(STATE_STORE);
          }
          const stateStore = db.createObjectStore(STATE_STORE, { keyPath: "key" });
          stateStore.createIndex("userId", "userId");

          if (db.objectStoreNames.contains(SETLISTS_STORE)) {
            db.deleteObjectStore(SETLISTS_STORE);
          }
          const setlistsStore = db.createObjectStore(SETLISTS_STORE, { keyPath: "id" });
          setlistsStore.createIndex("userId", "userId");
        }
      },
    });
  }
  return dbPromise;
}
