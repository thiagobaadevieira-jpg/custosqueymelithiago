import * as db from './db';
import type { User, Expense } from '../types';
import type { Category } from './db';

// ─── Fila de gastos pendentes (IndexedDB — suporta blobs de foto) ─────────────

const DB_NAME = 'controle-gastos-offline-v2';
const STORE = 'pending-expenses';

export type QueuedExpense = {
  tempId: string;
  data: Omit<Expense, 'id' | 'createdAt' | 'attachmentUrls' | 'pending'>;
  photoBlobs: Blob[];
  createdAt: string;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'tempId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueExpense(
  data: QueuedExpense['data'],
  photoBlobs: Blob[] = []
): Promise<string> {
  const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idb = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      tempId,
      data,
      photoBlobs,
      createdAt: new Date().toISOString(),
    } satisfies QueuedExpense);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return tempId;
}

export async function getQueued(): Promise<QueuedExpense[]> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedExpense[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(tempId: string): Promise<void> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(tempId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Envia todos os gastos pendentes ao Supabase.
 * Foto (se houver) é enviada antes do registro.
 * Erro de rede interrompe — os restantes ficam para a próxima tentativa.
 * Retorna quantos itens foram sincronizados.
 */
export async function flushQueue(userId: string): Promise<number> {
  const queued = await getQueued();
  let synced = 0;
  for (const item of queued) {
    try {
      const attachmentUrls: string[] = [];
      const blobs = item.photoBlobs ?? [];
      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];
        const file = new File([blob], `comprovante-${i + 1}.jpg`, {
          type: blob.type || 'image/jpeg',
        });
        const url = await db.uploadReceipt(file, userId);
        attachmentUrls.push(url);
      }
      await db.createExpense({ ...item.data, userId, attachmentUrls });
      await removeQueued(item.tempId);
      synced++;
    } catch {
      break; // sem rede — tenta de novo no próximo evento 'online'
    }
  }
  return synced;
}

/** Itens da fila convertidos para Expense exibível (badge "Pendente"). */
export async function getQueuedAsExpenses(): Promise<Expense[]> {
  try {
    const queued = await getQueued();
    return queued.map((q) => ({
      ...q.data,
      id: q.tempId,
      createdAt: q.createdAt,
      attachmentUrls: [],
      pending: true,
    }));
  } catch {
    return [];
  }
}

// ─── Snapshot de leitura (localStorage — sem blobs) ───────────────────────────

const SNAPSHOT_KEY = 'offline_snapshot_v2';

type Snapshot = {
  expenses: Expense[];
  categories: Category[];
  users: User[];
  savedAt: string;
};

export function saveSnapshot(expenses: Expense[], categories: Category[], users: User[]): void {
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ expenses, categories, users, savedAt: new Date().toISOString() } satisfies Snapshot)
    );
  } catch {
    // localStorage cheio — snapshot é melhor-esforço, não bloqueia o app
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    // Normaliza caches antigos: garante attachmentUrls como array
    snap.expenses = (snap.expenses ?? []).map(e => ({
      ...e,
      attachmentUrls: Array.isArray(e.attachmentUrls) ? e.attachmentUrls : [],
    }));
    return snap;
  } catch {
    return null;
  }
}

// ─── Cache do perfil do usuário (abre o app sem esperar a rede) ───────────────

const PROFILE_KEY = 'cached_profile_v1';

export function saveCachedProfile(user: User): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  } catch {
    // melhor-esforço
  }
}

export function loadCachedProfile(): User | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
