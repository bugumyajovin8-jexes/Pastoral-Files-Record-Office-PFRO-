import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing, components requiring Supabase will fail.');
}

// Keep a reference to the raw, unwrapped client
const rawSupabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export function getOriginalSupabase() {
  return rawSupabase;
}

// Generate secure identifier safely across all environments
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'local_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
}

// Detect connection or connection-related errors
function isNetworkError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    error.status === 0 ||
    error.code === 'PGRST102'
  );
}

// Local storage caching helpers
function cacheTableRecords(table: string, records: any[]) {
  if (!Array.isArray(records)) return;
  try {
    const cacheKey = `supabase_cache_${table}`;
    const existingStr = localStorage.getItem(cacheKey);
    let existing: any[] = [];
    if (existingStr) {
      try {
        existing = JSON.parse(existingStr);
        if (!Array.isArray(existing)) existing = [];
      } catch (e) {
        existing = [];
      }
    }
    
    const recordMap = new Map<string, any>();
    existing.forEach(r => {
      if (r && r.id) {
        recordMap.set(r.id, r);
      }
    });
    records.forEach(r => {
      if (r && r.id) {
        const old = recordMap.get(r.id) || {};
        recordMap.set(r.id, { ...old, ...r });
      }
    });
    
    const merged = Array.from(recordMap.values());
    localStorage.setItem(cacheKey, JSON.stringify(merged));
  } catch (e) {
    console.error(`Failed to cache ${table} records:`, e);
  }
}

function fetchFromLocalCache(
  table: string,
  filters: Array<{ type: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'in' | 'like' | 'ilike'; column: string; value: any }>,
  orderColumn: string | null,
  orderAscending: boolean,
  isSingle: boolean,
  limitCount: number | null
) {
  try {
    const cacheKey = `supabase_cache_${table}`;
    
    // Auto-seed licenses if queried and they don't exist or need mapping
    if (table === 'licenses') {
      const dbStr = localStorage.getItem('supabase_cache_licenses');
      let licenses: any[] = [];
      try {
        licenses = dbStr ? JSON.parse(dbStr) : [];
        if (!Array.isArray(licenses)) licenses = [];
      } catch (e) {
        licenses = [];
      }
      
      const chStr = localStorage.getItem('supabase_cache_churches');
      let churches: any[] = [];
      try {
        churches = chStr ? JSON.parse(chStr) : [];
        if (!Array.isArray(churches)) churches = [];
      } catch (e) {
        churches = [];
      }

      let updated = false;
      churches.forEach((ch: any) => {
        if (ch && ch.id && !licenses.some((l: any) => l.church_id === ch.id)) {
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
          licenses.push({
            id: generateUUID(),
            church_id: ch.id,
            church_name: ch.name,
            status: 'active',
            expires_at: thirtyDaysFromNow.toISOString(),
            updated_at: new Date().toISOString()
          });
          updated = true;
        }
      });
      if (updated || !dbStr) {
        localStorage.setItem('supabase_cache_licenses', JSON.stringify(licenses));
      }
    }

    const existingStr = localStorage.getItem(cacheKey);
    let list: any[] = [];
    if (existingStr) {
      try {
        list = JSON.parse(existingStr);
        if (!Array.isArray(list)) list = [];
      } catch (e) {
        list = [];
      }
    }

    let filtered = [...list];
    
    // Apply basic filters locally
    filters.forEach(f => {
      filtered = filtered.filter(item => {
        const val = item[f.column];
        if (f.type === 'eq') {
          return String(val) === String(f.value);
        } else if (f.type === 'neq') {
          return String(val) !== String(f.value);
        } else if (f.type === 'gte') {
          if (val === undefined || val === null) return false;
          return val >= f.value;
        } else if (f.type === 'lte') {
          if (val === undefined || val === null) return false;
          return val <= f.value;
        } else if (f.type === 'gt') {
          if (val === undefined || val === null) return false;
          return val > f.value;
        } else if (f.type === 'lt') {
          if (val === undefined || val === null) return false;
          return val < f.value;
        } else if (f.type === 'in') {
          if (val === undefined || val === null) return false;
          return Array.isArray(f.value) && f.value.map(String).includes(String(val));
        } else if (f.type === 'like') {
          if (val === undefined || val === null) return false;
          const searchPattern = String(f.value).replace(/%/g, '');
          return String(val).includes(searchPattern);
        } else if (f.type === 'ilike') {
          if (val === undefined || val === null) return false;
          const searchPattern = String(f.value).toLowerCase().replace(/%/g, '');
          return String(val).toLowerCase().includes(searchPattern);
        }
        return true;
      });
    });

    // Special case: Enrich contributions with congregant names offline
    if (table === 'contributions') {
      const congStr = localStorage.getItem('supabase_cache_congregants');
      if (congStr) {
        try {
          const congregants = JSON.parse(congStr);
          if (Array.isArray(congregants)) {
            const congrMap = new Map(congregants.map(c => [c.id, c]));
            filtered = filtered.map(item => {
              if (item && item.congregant_id) {
                const cong = congrMap.get(item.congregant_id);
                if (cong) {
                  return {
                    ...item,
                    congregants: {
                      full_name: cong.full_name
                    }
                  };
                }
              }
              return item;
            });
          }
        } catch (e) {
          // safe bypass
        }
      }
    }

    // Apply sorting locally
    if (orderColumn) {
      filtered.sort((a, b) => {
        const valA = a[orderColumn];
        const valB = b[orderColumn];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (typeof valA === 'string') {
          return orderAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return orderAscending ? (valA - valB) : (valB - valA);
        }
      });
    }

    // Apply limit locally
    if (limitCount !== null) {
      filtered = filtered.slice(0, limitCount);
    }

    if (isSingle) {
      return { data: filtered[0] || null, error: null };
    }

    return { data: filtered, error: null };
  } catch (e) {
    console.error(`Error loading offline ${table} data:`, e);
    return { data: isSingle ? null : [], error: e };
  }
}

function deleteLocalCache(table: string, filters: Array<{ column: string; value: any }>) {
  try {
    const cacheKey = `supabase_cache_${table}`;
    const existingStr = localStorage.getItem(cacheKey);
    if (!existingStr) return;
    let existing = JSON.parse(existingStr);
    if (!Array.isArray(existing)) return;

    existing = existing.filter(item => {
      const matchesAll = filters.every(f => String(item[f.column]) === String(f.value));
      return !matchesAll;
    });

    localStorage.setItem(cacheKey, JSON.stringify(existing));
  } catch (e) {
    console.error(`Failed to delete cache on ${table}:`, e);
  }
}

// Queue functions for background synchronization
function queueOfflineSync(table: string, rows: any[], action: 'insert' | 'upsert' = 'insert') {
  try {
    const queueKey = 'supabase_offline_sync_queue';
    const queueStr = localStorage.getItem(queueKey) || '[]';
    let queue: any[] = [];
    try {
      queue = JSON.parse(queueStr);
      if (!Array.isArray(queue)) queue = [];
    } catch (e) {
      queue = [];
    }

    rows.forEach(row => {
      queue.push({
        id: generateUUID(),
        action,
        table,
        row,
        timestamp: Date.now()
      });
    });

    localStorage.setItem(queueKey, JSON.stringify(queue));
    cacheTableRecords(table, rows);

    window.dispatchEvent(new CustomEvent('supabase-offline-activity'));
  } catch (e) {
    console.error('Failed to queue offline sync:', e);
  }
}

function queueOfflineDelete(table: string, filters: Array<{ column: string; value: any }>) {
  try {
    const queueKey = 'supabase_offline_sync_queue';
    const queueStr = localStorage.getItem(queueKey) || '[]';
    let queue: any[] = [];
    try {
      queue = JSON.parse(queueStr);
      if (!Array.isArray(queue)) queue = [];
    } catch (e) {
      queue = [];
    }

    queue.push({
      id: generateUUID(),
      action: 'delete',
      table,
      filters,
      timestamp: Date.now()
    });

    localStorage.setItem(queueKey, JSON.stringify(queue));
    deleteLocalCache(table, filters);

    window.dispatchEvent(new CustomEvent('supabase-offline-activity'));
  } catch (e) {
    console.error('Failed to queue offline delete:', e);
  }
}

// The Fluent Chain Builder representing Supabase's Postgrest client
class OfflineSupabaseBuilder {
  private table: string;
  private originalQuery: any;
  private filters: Array<{ type: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'in' | 'like' | 'ilike'; column: string; value: any }> = [];
  private orderColumn: string | null = null;
  private orderAscending: boolean = true;
  private isSingle: boolean = false;
  private limitCount: number | null = null;
  private isDelete: boolean = false;
  private deleteFilters: Array<{ column: string; value: any }> = [];

  constructor(table: string, originalQuery: any) {
    this.table = table;
    this.originalQuery = originalQuery;
  }

  select(columns?: string, options?: any) {
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.select(columns, options);
    }
    return this;
  }

  insert(values: any, options?: any) {
    const rows = Array.isArray(values) ? values : [values];
    const tablesWithId = new Set(['profiles', 'churches', 'congregants', 'contribution_types', 'contributions', 'invitations', 'licenses']);
    const tablesWithCreatedAt = new Set(['profiles', 'user_churches', 'congregants', 'contributions', 'invitations']);

    const processedRows = rows.map(r => {
      const row: any = { ...r };
      if (tablesWithId.has(this.table) && !row.id) {
        row.id = r.id || generateUUID();
      }
      if (tablesWithCreatedAt.has(this.table) && !row.created_at) {
        row.created_at = r.created_at || new Date().toISOString();
      }
      return row;
    });

    let selectColumns: string | undefined = undefined;
    let isSingleCall = false;
    let isMaybeSingleCall = false;

    const executeInsert = async () => {
      const isOnline = navigator.onLine;
      if (isOnline && this.originalQuery) {
        try {
          // Construct the query sequentially starting from insert
          let query = this.originalQuery.insert(processedRows, options);
          if (selectColumns !== undefined) {
            query = query.select(selectColumns);
          }
          if (isSingleCall) {
            query = query.single();
          } else if (isMaybeSingleCall) {
            query = query.maybeSingle();
          }

          const result = await query;
          if (!result.error) {
            cacheTableRecords(this.table, processedRows);
            return result;
          } else {
            if (isNetworkError(result.error)) {
              queueOfflineSync(this.table, processedRows);
              return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
            }
            return result;
          }
        } catch (err) {
          console.error(`Offline insert fallback on ${this.table}:`, err);
          queueOfflineSync(this.table, processedRows);
          return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
        }
      } else {
        queueOfflineSync(this.table, processedRows);
        return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
      }
    };

    const chain: any = {
      select: (columns?: string, selectOptions?: any) => {
        selectColumns = columns || '*';
        return chain;
      },
      single: () => {
        isSingleCall = true;
        return chain;
      },
      maybeSingle: () => {
        isMaybeSingleCall = true;
        return chain;
      },
      then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => {
        return executeInsert().then(onfulfilled, onrejected);
      }
    };

    return chain;
  }

  upsert(values: any, options?: any) {
    const rows = Array.isArray(values) ? values : [values];
    const tablesWithId = new Set(['profiles', 'churches', 'congregants', 'contribution_types', 'contributions', 'invitations', 'licenses']);
    const tablesWithCreatedAt = new Set(['profiles', 'user_churches', 'congregants', 'contributions', 'invitations']);

    const processedRows = rows.map(r => {
      const row: any = { ...r };
      if (tablesWithId.has(this.table) && !row.id) {
        row.id = r.id || generateUUID();
      }
      if (tablesWithCreatedAt.has(this.table) && !row.created_at) {
        row.created_at = r.created_at || new Date().toISOString();
      }
      return row;
    });

    let selectColumns: string | undefined = undefined;
    let isSingleCall = false;
    let isMaybeSingleCall = false;

    const executeUpsert = async () => {
      const isOnline = navigator.onLine;
      if (isOnline && this.originalQuery) {
        try {
          let query = this.originalQuery.upsert(processedRows, options);
          if (selectColumns !== undefined) {
            query = query.select(selectColumns);
          }
          if (isSingleCall) {
            query = query.single();
          } else if (isMaybeSingleCall) {
            query = query.maybeSingle();
          }

          const result = await query;
          if (!result.error) {
            cacheTableRecords(this.table, processedRows);
            return result;
          } else {
            if (isNetworkError(result.error)) {
              queueOfflineSync(this.table, processedRows, 'upsert');
              return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
            }
            return result;
          }
        } catch (err) {
          console.error(`Offline upsert fallback on ${this.table}:`, err);
          queueOfflineSync(this.table, processedRows, 'upsert');
          return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
        }
      } else {
        queueOfflineSync(this.table, processedRows, 'upsert');
        return { data: Array.isArray(values) ? processedRows : processedRows[0], error: null };
      }
    };

    const chain: any = {
      select: (columns?: string, selectOptions?: any) => {
        selectColumns = columns || '*';
        return chain;
      },
      single: () => {
        isSingleCall = true;
        return chain;
      },
      maybeSingle: () => {
        isMaybeSingleCall = true;
        return chain;
      },
      then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => {
        return executeUpsert().then(onfulfilled, onrejected);
      }
    };

    return chain;
  }

  update(values: any, options?: any) {
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.update(values, options);
    }
    return this;
  }

  delete(options?: any) {
    this.isDelete = true;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.delete(options);
    }
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    if (this.isDelete) {
      this.deleteFilters.push({ column, value });
    }
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.eq(column, value);
    }
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: 'neq', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.neq(column, value);
    }
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.gte(column, value);
    }
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.lte(column, value);
    }
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ type: 'gt', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.gt(column, value);
    }
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ type: 'lt', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.lt(column, value);
    }
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ type: 'in', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.in(column, value);
    }
    return this;
  }

  like(column: string, value: string) {
    this.filters.push({ type: 'like', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.like(column, value);
    }
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ type: 'ilike', column, value });
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.ilike(column, value);
    }
    return this;
  }

  order(column: string, options?: any) {
    this.orderColumn = column;
    if (options && typeof options === 'object') {
      this.orderAscending = options.ascending !== false;
    }
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.order(column, options);
    }
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.limit(count);
    }
    return this;
  }

  single() {
    this.isSingle = true;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.single();
    }
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.maybeSingle();
    }
    return this;
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    const executeQuery = async () => {
      const isOnline = navigator.onLine;

      if (this.isDelete) {
        // Handle deletion proxy
        if (isOnline && this.originalQuery) {
          try {
            const result = await this.originalQuery;
            if (!result.error) {
              deleteLocalCache(this.table, this.deleteFilters);
              return result;
            } else {
              if (isNetworkError(result.error)) {
                queueOfflineDelete(this.table, this.deleteFilters);
                return { data: [], error: null };
              }
              return result;
            }
          } catch (e) {
            console.error(`Offline delete fallback on ${this.table}:`, e);
            queueOfflineDelete(this.table, this.deleteFilters);
            return { data: [], error: null };
          }
        } else {
          queueOfflineDelete(this.table, this.deleteFilters);
          return { data: [], error: null };
        }
      }

      // Handle standard gets (such as .select())
      if (isOnline && this.originalQuery) {
        try {
          const result = await this.originalQuery;
          if (!result.error) {
            if (result.data) {
              const items = Array.isArray(result.data) ? result.data : [result.data];
              cacheTableRecords(this.table, items);
            }
            return result;
          } else {
            if (isNetworkError(result.error)) {
              return fetchFromLocalCache(
                this.table,
                this.filters,
                this.orderColumn,
                this.orderAscending,
                this.isSingle,
                this.limitCount
              );
            }
            return result;
          }
        } catch (err) {
          console.error(`Query failed on ${this.table}, load offline cache:`, err);
          return fetchFromLocalCache(
            this.table,
            this.filters,
            this.orderColumn,
            this.orderAscending,
            this.isSingle,
            this.limitCount
          );
        }
      } else {
        return fetchFromLocalCache(
          this.table,
          this.filters,
          this.orderColumn,
          this.orderAscending,
          this.isSingle,
          this.limitCount
        );
      }
    };

    return executeQuery().then(onfulfilled, onrejected);
  }
}

// Background Synchronization Worker
let isSyncing = false;

export async function runSyncQueue() {
  if (isSyncing) return;
  const isOnline = navigator.onLine;
  if (!isOnline) return;

  const queueKey = 'supabase_offline_sync_queue';
  const queueStr = localStorage.getItem(queueKey);
  if (!queueStr) return;

  let queue: any[] = [];
  try {
    queue = JSON.parse(queueStr);
    if (!Array.isArray(queue) || queue.length === 0) return;
  } catch (e) {
    return;
  }

  isSyncing = true;
  console.log(`Starting synchronization of ${queue.length} offline actions...`);

  const originalSupabase = getOriginalSupabase() as any;
  if (!originalSupabase) {
    isSyncing = false;
    return;
  }

  const failedItems: any[] = [];

  for (const item of queue) {
    try {
      if (item.action === 'delete') {
        let query = originalSupabase.from(item.table).delete();
        item.filters.forEach((f: any) => {
          query = query.eq(f.column, f.value);
        });
        const { error } = await query;
        if (error && isNetworkError(error)) {
          failedItems.push(item);
        } else if (error) {
          console.warn(`Permanent error syncing deletion in ${item.table}:`, error);
        }
      } else if (item.action === 'upsert') {
        // Upsert operation
        const { error } = await originalSupabase.from(item.table).upsert(item.row);
        if (error) {
          if (isNetworkError(error)) {
            failedItems.push(item);
          } else {
            console.warn(`Permanent error syncing upsert in ${item.table}:`, error);
          }
        }
      } else {
        // Insert operation
        const { error } = await originalSupabase.from(item.table).insert(item.row);
        if (error) {
          if (isNetworkError(error)) {
            failedItems.push(item);
          } else {
            console.warn(`Permanent error syncing insert in ${item.table}:`, error);
          }
        }
      }
    } catch (e) {
      console.error(`Exception during background sync inside ${item.table}:`, e);
      failedItems.push(item);
    }
  }

  localStorage.setItem(queueKey, JSON.stringify(failedItems));
  isSyncing = false;

  window.dispatchEvent(new CustomEvent('supabase-sync-complete'));
}

// Global window event triggers
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    runSyncQueue();
  });

  // Heartbeat background sync check every 15 seconds
  setInterval(() => {
    runSyncQueue();
  }, 15000);
}

// Export the proxy
export const supabase = rawSupabase ? new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (table: string) => {
        const originalQuery = target.from(table);
        return new OfflineSupabaseBuilder(table, originalQuery);
      };
    }
    return Reflect.get(target, prop, receiver);
  }
}) : {
  from: (table: string) => new OfflineSupabaseBuilder(table, null),
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ error: new Error('Supabase config missing') }),
    signUp: async () => ({ error: new Error('Supabase config missing') }),
    signOut: async () => {}
  }
} as any;
