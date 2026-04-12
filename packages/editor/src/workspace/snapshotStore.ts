/**
 * SnapshotStore — PM Phase 4 (version history, MVP).
 *
 * IDB-backed store for project Y.Doc snapshots. One shared database
 * keyed by `${projectId}:${snapshotId}` — each value is a serialized
 * Y.Doc update (Uint8Array) captured via Y.encodeStateAsUpdate.
 *
 * MVP scope: manual save only, no auto-snapshot. Restore replaces the
 * current doc state by constructing a fresh Y.Doc from the snapshot
 * bytes and transferring its file-map contents into the active doc.
 */

import * as Y from 'yjs'
import { getActiveDoc } from './projectDoc'

const DB_NAME = 'stave-snapshots'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'

export interface SnapshotMeta {
  readonly id: string
  readonly projectId: string
  readonly label: string
  readonly createdAt: number
}

export interface StoredSnapshot extends SnapshotMeta {
  readonly bytes: Uint8Array
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('byProject', 'projectId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Capture the active Y.Doc as a snapshot tied to the given project.
 * Returns the saved metadata.
 */
export async function saveSnapshot(
  projectId: string,
  label: string,
): Promise<SnapshotMeta> {
  const doc = getActiveDoc()
  const bytes = Y.encodeStateAsUpdate(doc)
  const meta: SnapshotMeta = {
    id: crypto.randomUUID(),
    projectId,
    label: label.trim() || 'Untitled snapshot',
    createdAt: Date.now(),
  }
  const record: StoredSnapshot = { ...meta, bytes }
  const db = await openDb()
  await wrap(
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record),
  )
  db.close()
  return meta
}

/**
 * List all snapshots for a project, newest first. Bytes are omitted —
 * callers must call `loadSnapshot` to fetch the payload.
 */
export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const db = await openDb()
  const index = db
    .transaction(STORE_NAME, 'readonly')
    .objectStore(STORE_NAME)
    .index('byProject')
  const all = await wrap<StoredSnapshot[]>(index.getAll(projectId))
  db.close()
  return all
    .map(({ bytes: _bytes, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Delete a snapshot by id. No-op if the id doesn't exist.
 */
export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb()
  await wrap(
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id),
  )
  db.close()
}

/**
 * Restore a snapshot into the currently active Y.Doc. The snapshot's
 * file set REPLACES the current file set. Implementation: rehydrate a
 * temporary Y.Doc from bytes, then in one transaction on the active
 * doc (a) delete all existing files and (b) recreate each file from
 * the snapshot.
 *
 * Callers must refresh UI state via `resetFileStore()` after this
 * returns so cached snapshots re-sync with the new doc contents.
 */
export async function restoreSnapshot(id: string): Promise<void> {
  const db = await openDb()
  const stored = await wrap<StoredSnapshot | undefined>(
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id),
  )
  db.close()
  if (!stored) throw new Error(`snapshot ${id} not found`)

  const snapDoc = new Y.Doc()
  Y.applyUpdate(snapDoc, stored.bytes)
  const snapFiles = snapDoc.getMap('files') as Y.Map<Y.Map<unknown>>
  const snapOrder = snapDoc.getMap('fileOrder') as Y.Map<Y.Array<string>>
  const snapSubOrder = snapDoc.getMap('subfolderOrder') as Y.Map<Y.Array<string>>

  const activeDoc = getActiveDoc()
  const activeFiles = activeDoc.getMap('files') as Y.Map<Y.Map<unknown>>
  const activeOrder = activeDoc.getMap('fileOrder') as Y.Map<Y.Array<string>>
  const activeSubOrder = activeDoc.getMap('subfolderOrder') as Y.Map<Y.Array<string>>

  activeDoc.transact(() => {
    // Clear existing files + order
    for (const key of Array.from(activeFiles.keys())) activeFiles.delete(key)
    for (const key of Array.from(activeOrder.keys())) activeOrder.delete(key)
    for (const key of Array.from(activeSubOrder.keys())) activeSubOrder.delete(key)

    // Copy files from snapshot
    for (const [fid, snapFile] of snapFiles.entries()) {
      const clone = new Y.Map<unknown>()
      clone.set('id', snapFile.get('id'))
      clone.set('path', snapFile.get('path'))
      clone.set('language', snapFile.get('language'))
      const meta = snapFile.get('meta')
      if (meta !== undefined) clone.set('meta', meta)
      const content = new Y.Text()
      const srcText = snapFile.get('content') as Y.Text
      content.insert(0, srcText.toString())
      clone.set('content', content)
      activeFiles.set(fid, clone)
    }

    // Copy order (files + subfolders)
    for (const [folder, arr] of snapOrder.entries()) {
      const next = new Y.Array<string>()
      next.push(arr.toArray())
      activeOrder.set(folder, next)
    }
    for (const [folder, arr] of snapSubOrder.entries()) {
      const next = new Y.Array<string>()
      next.push(arr.toArray())
      activeSubOrder.set(folder, next)
    }
  })

  snapDoc.destroy()
}
