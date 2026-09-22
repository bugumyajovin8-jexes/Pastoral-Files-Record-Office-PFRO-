import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing, components requiring Supabase will fail.');
}

/**
 * Trial length, for DISPLAY ONLY.
 *
 * The database is the authority: `licenses.expires_at` is set by a trigger on
 * church creation using the SERVER clock, and clients may not write it. This
 * constant exists so the UI can say "siku 60" without a round trip; it grants
 * nothing. If you change the trial length, change it in database/schema.sql
 * (grant_trial_licence) — this value only follows.
 */
export const TRIAL_LICENSE_DAYS = 60;

/**
 * Sync operations that the server rejected for a non-transient reason (a
 * constraint violation, an RLS denial). They are parked here rather than
 * dropped, so a failed write is recoverable instead of silently lost.
 */
export const SYNC_DEAD_LETTER_KEY = 'supabase_offline_sync_failed';

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

    // NOTE: this used to fabricate an *active* licence in localStorage for any
    // cached church that lacked one — minting entitlement on the client, which
    // is the one thing a licence check must never do. Going offline was enough
    // to grant yourself a fresh trial. Licences are now issued only by the
    // database (see the trigger in database/schema.sql) and this path reads
    // them like any other table: if the cache holds no licence, the answer is
    // "unknown", never "active".

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

// -----------------------------------------------------------------------------
// Read-only mode when a licence has lapsed
// -----------------------------------------------------------------------------
// Set by AuthContext whenever the selected church's licence is expired. The
// database refuses these writes anyway (see church_licence_active() in
// database/rls_policies.sql) — this layer exists so the refusal is immediate
// and legible in Swahili, rather than a policy violation surfacing halfway
// through a form.
//
// Blocking here also matters offline: without it, a write made on a lapsed
// licence would be queued locally, look like it succeeded, and then be rejected
// on sync — landing in the dead-letter queue long after the user moved on.
let licenceReadOnly = false;

export function setLicenceReadOnly(value: boolean) {
  licenceReadOnly = value;
}

export function isLicenceReadOnly() {
  return licenceReadOnly;
}

// Per-church blocking, which is what a PASTOR actually needs.
//
// A mhazini serves one church, so a single global flag describes their world
// exactly. A pastor does not: they may lead four churches, pick the target
// church separately on every form, and view "Makanisa Yote" on the dashboard.
// A global flag keyed to one "selected" church is wrong for them in both
// directions — it freezes churches that are paid up, and it leaves Save
// enabled for churches that will be refused.
//
// The database was already right: church_licence_active(church_id) is
// evaluated per row. This mirrors that per-row shape in the client so the
// refusal is immediate and names the church, instead of arriving as an opaque
// policy violation after the form is filled in.
let blockedChurchIds = new Set<string>();

export function setBlockedChurches(ids: Iterable<string>) {
  blockedChurchIds = new Set(ids);
}

export function isChurchBlocked(churchId?: string | null): boolean {
  return Boolean(churchId && blockedChurchIds.has(churchId));
}

export const LICENCE_READ_ONLY_MESSAGE =
  'Muda wa matumizi umeisha. Unaweza kusoma taarifa zilizopo, lakini huwezi kuongeza wala kubadilisha chochote mpaka leseni ihuishwe.';

export const CHURCH_LICENCE_MESSAGE =
  'Leseni ya kanisa hili imeisha. Huwezi kuongeza wala kubadilisha taarifa za kanisa hili mpaka leseni ihuishwe. Makanisa mengine yenye leseni yanaendelea kufanya kazi.';

/**
 * The church a write is aimed at, when the payload names one.
 *
 * For every table the church is `church_id`. For `churches` itself the row IS
 * the church, so its own `id` is the scope — and an INSERT there has no id yet,
 * which is correct: creating a NEW church must never be blocked by some OTHER
 * church's lapsed licence.
 */
function blockedTargetChurch(table: string, values: any): string | null {
  const rows = Array.isArray(values) ? values : [values];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const churchId = table === 'churches' ? row.id : row.church_id;
    if (isChurchBlocked(churchId)) return churchId;
  }
  return null;
}

// `profiles` is deliberately absent: a user's own name is account data, not
// church data, and locking someone out of their own profile serves no purpose.
const LICENCE_PROTECTED_TABLES = new Set([
  'churches',
  'congregants',
  'contributions',
  'contribution_types',
  'invitations',
  'user_churches',
  'licenses'
]);

// Stands in for the whole fluent chain. Every method returns the chain again,
// so any call shape the screens use — .select().eq().single(), .delete().eq(),
// .update().eq().select() — resolves to the same refusal instead of throwing
// "is not a function" somewhere unpredictable.
function blockedWriteChain(table: string, churchId?: string | null) {
  const result = {
    data: null,
    error: {
      message: churchId ? CHURCH_LICENCE_MESSAGE : LICENCE_READ_ONLY_MESSAGE,
      code: churchId ? 'CHURCH_LICENCE_EXPIRED' : 'LICENCE_EXPIRED',
      details: churchId
        ? `Write to "${table}" refused locally: licence expired for church ${churchId}.`
        : `Write to "${table}" refused locally: licence expired.`,
      hint: ''
    }
  };

  const chain: any = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then') return (ok?: any, err?: any) => Promise.resolve(result).then(ok, err);
      if (prop === 'catch') return (fn: any) => Promise.resolve(result).catch(fn);
      if (prop === 'finally') return (fn: any) => Promise.resolve(result).finally(fn);
      return () => chain;
    }
  });

  return chain;
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
  /** True once update()/delete() is called — the rows are chosen by the filters
   *  that follow, so the church being written to is only known at execute time. */
  private isScopedWrite: boolean = false;
  private scopeChurchId: string | null = null;
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
    if (LICENCE_PROTECTED_TABLES.has(this.table)) {
      if (licenceReadOnly) return blockedWriteChain(this.table);
      const blocked = blockedTargetChurch(this.table, values);
      if (blocked) return blockedWriteChain(this.table, blocked);
    }
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
    if (LICENCE_PROTECTED_TABLES.has(this.table)) {
      if (licenceReadOnly) return blockedWriteChain(this.table);
      const blocked = blockedTargetChurch(this.table, values);
      if (blocked) return blockedWriteChain(this.table, blocked);
    }
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
    if (LICENCE_PROTECTED_TABLES.has(this.table)) {
      if (licenceReadOnly) return blockedWriteChain(this.table);
      // Catches moving a record INTO a church whose licence has lapsed. The
      // rows being changed are chosen by filters that arrive after this call —
      // eq() records that scope, and then() refuses before executing.
      const blocked = blockedTargetChurch(this.table, values);
      if (blocked) return blockedWriteChain(this.table, blocked);
    }
    this.isScopedWrite = true;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.update(values, options);
    }
    return this;
  }

  delete(options?: any) {
    if (licenceReadOnly && LICENCE_PROTECTED_TABLES.has(this.table)) {
      return blockedWriteChain(this.table);
    }
    this.isScopedWrite = true;
    this.isDelete = true;
    if (this.originalQuery) {
      this.originalQuery = this.originalQuery.delete(options);
    }
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    // Which church an update/delete is aimed at. For `churches` the row is the
    // church, so `id` is the scope; everywhere else it is `church_id`.
    if (this.isScopedWrite && typeof value === 'string') {
      if (column === 'church_id' || (this.table === 'churches' && column === 'id')) {
        this.scopeChurchId = value;
      }
    }
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
      // The filters are all in by now, so this is the first point at which an
      // update/delete's target church is actually known.
      if (
        this.isScopedWrite &&
        LICENCE_PROTECTED_TABLES.has(this.table) &&
        isChurchBlocked(this.scopeChurchId)
      ) {
        return {
          data: null,
          error: {
            message: CHURCH_LICENCE_MESSAGE,
            code: 'CHURCH_LICENCE_EXPIRED',
            details: `Write to "${this.table}" refused locally: licence expired for church ${this.scopeChurchId}.`,
            hint: ''
          }
        };
      }

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

  const retryItems: any[] = [];
  const rejectedItems: any[] = [];

  // A transient failure goes back on the queue; a rejection by the server is
  // parked in the dead-letter list so the record is never silently discarded.
  const handleResult = (item: any, error: any) => {
    if (!error) return;
    if (isNetworkError(error)) {
      retryItems.push(item);
      return;
    }
    console.warn(`Server rejected offline ${item.action} on ${item.table}:`, error);
    rejectedItems.push({
      ...item,
      failed_at: new Date().toISOString(),
      reason: error.message || String(error)
    });
  };

  for (const item of queue) {
    try {
      if (item.action === 'delete') {
        let query = originalSupabase.from(item.table).delete();
        item.filters.forEach((f: any) => {
          query = query.eq(f.column, f.value);
        });
        const { error } = await query;
        handleResult(item, error);
      } else if (item.action === 'upsert') {
        const { error } = await originalSupabase.from(item.table).upsert(item.row);
        handleResult(item, error);
      } else {
        const { error } = await originalSupabase.from(item.table).insert(item.row);
        handleResult(item, error);
      }
    } catch (e) {
      console.error(`Exception during background sync inside ${item.table}:`, e);
      retryItems.push(item);
    }
  }

  localStorage.setItem(queueKey, JSON.stringify(retryItems));

  if (rejectedItems.length > 0) {
    try {
      const existing = JSON.parse(localStorage.getItem(SYNC_DEAD_LETTER_KEY) || '[]');
      const merged = (Array.isArray(existing) ? existing : []).concat(rejectedItems);
      // Keep the list bounded so a persistent failure cannot fill up storage.
      localStorage.setItem(SYNC_DEAD_LETTER_KEY, JSON.stringify(merged.slice(-200)));
    } catch (e) {
      console.error('Failed to record rejected sync items:', e);
    }
  }

  isSyncing = false;

  window.dispatchEvent(new CustomEvent('supabase-sync-complete'));
}

/** Operations the server rejected. Surfaced in the UI so they are not invisible. */
export function getRejectedSyncItems(): any[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_DEAD_LETTER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Clears the dead-letter list after the pastor has reviewed it. */
export function clearRejectedSyncItems() {
  localStorage.removeItem(SYNC_DEAD_LETTER_KEY);
  window.dispatchEvent(new CustomEvent('supabase-offline-activity'));
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
