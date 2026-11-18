import { openDB } from 'idb'

let dbPromise

export function getDB() {
  if (dbPromise) return dbPromise
  const opening = openDB('chendu', 1, {
    upgrade(db) {
      db.createObjectStore('packs', { keyPath: 'id' })
      db.createObjectStore('plans', { keyPath: 'id' })
      db.createObjectStore('pieces', { keyPath: 'id' })
      db.createObjectStore('audio') // key: path inside the pack
      db.createObjectStore('progress', { keyPath: 'subject' })
      db.createObjectStore('checkins', { keyPath: 'date' })
      const rec = db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true })
      rec.createIndex('date', 'date')
      db.createObjectStore('settings')
    },
    terminated() {
      dbPromise = undefined
    },
  })
  dbPromise = opening
  // A failed open must not stay cached, or every later call would fail too.
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = undefined
  })
  return opening
}

// Tests swap in a fresh fake indexedDB and need a new connection.
export function resetDB() {
  dbPromise = undefined
}
