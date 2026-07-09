import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { TokenRecord, DatabaseStats } from '../src/types.js';

// Load environment variables (dotenv is loaded in server.ts)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Create Supabase client if configured
const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    })
  : null;

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'tokens.json');

// Helper to generate a deterministic UUID based on seed
function generateDeterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

interface ManifestRow {
  number: number;
  id: string;
  qr_token: string;
  qr_url: string;
  qr_image: string;
}

const tokenToNumberMap = new Map<string, number>();
const idToNumberMap = new Map<string, number>();
const tokenToImageMap = new Map<string, string>();
const idToImageMap = new Map<string, string>();

let manifestLoaded = false;
let manifestRows: ManifestRow[] = [];

function loadAllManifestRows(): ManifestRow[] {
  if (manifestLoaded) return manifestRows;
  
  const csvPath = path.join(process.cwd(), 'data', 'extra_tokens_qr_manifest.csv');
  const rows: ManifestRow[] = [];
  
  if (fs.existsSync(csvPath)) {
    try {
      const fileContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = fileContent.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('...')) continue;
        const columns = line.split(',');
        if (columns.length >= 5) {
          const number = parseInt(columns[0]);
          if (isNaN(number)) continue;
          
          const rawQrImage = columns[4];
          const qr_image = path.basename(rawQrImage, path.extname(rawQrImage));

          rows.push({
            number,
            id: columns[1],
            qr_token: columns[2],
            qr_url: columns[3],
            qr_image,
          });
        }
      }
    } catch (err) {
      console.error('Error reading manifest CSV:', err);
    }
  }

  // Ensure we have exactly 5000 rows
  const existingNumbers = new Set(rows.map(r => r.number));
  for (let i = 1; i <= 5000; i++) {
    if (!existingNumbers.has(i)) {
      const id = generateDeterministicUUID(`id-seed-${i}`);
      const qr_token = generateDeterministicUUID(`token-seed-${i}`);
      const formattedNum = String(i).padStart(4, '0');
      rows.push({
        number: i,
        id,
        qr_token,
        qr_url: `https://fruishy-chicken-game.vercel.app/play?token=${qr_token}`,
        qr_image: `extra-token-${formattedNum}`
      });
    }
  }

  // Sort rows by number
  rows.sort((a, b) => a.number - b.number);
  
  // Populate the maps
  tokenToNumberMap.clear();
  idToNumberMap.clear();
  tokenToImageMap.clear();
  idToImageMap.clear();

  for (const r of rows) {
    tokenToNumberMap.set(r.qr_token, r.number);
    idToNumberMap.set(r.id, r.number);
    tokenToImageMap.set(r.qr_token, r.qr_image);
    idToImageMap.set(r.id, r.qr_image);
  }

  manifestRows = rows;
  manifestLoaded = true;
  return rows;
}

// Function to enrich TokenRecord with dynamic qr_image field
function enrichTokenRecord(record: TokenRecord): TokenRecord {
  if (!record) return record;
  loadAllManifestRows();
  
  let image = tokenToImageMap.get(record.token) || idToImageMap.get(record.id);
  
  if (!image) {
    const match = record.token.match(/\d+/);
    if (match) {
      const formattedNum = String(parseInt(match[0])).padStart(4, '0');
      image = `extra-token-${formattedNum}`;
    } else {
      image = record.token;
    }
  }
  
  return {
    ...record,
    qr_image: image
  };
}

function getRowNumberForToken(token: string): number {
  loadAllManifestRows();
  return tokenToNumberMap.get(token) || 999999;
}

// Function to seed local tokens
function seedLocalTokens(): TokenRecord[] {
  console.log('Seeding 5,000 local tokens based on manifest...');
  const rows = loadAllManifestRows();
  const tokensList: TokenRecord[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    tokensList.push({
      id: row.id,
      token: row.qr_token,
      name: null,
      phone_number: null,
      is_used: false,
      score: 0,
      used_at: null,
      created_at: now,
      occupied: false,
    });
  }

  saveLocalTokens(tokensList);
  console.log(`Successfully seeded 5,000 local tokens`);
  return tokensList;
}

// Ensure local database exists and has tokens
let inMemoryTokens: TokenRecord[] | null = null;

function getLocalTokens(): TokenRecord[] {
  if (inMemoryTokens) return inMemoryTokens;
  
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    return seedLocalTokens();
  }
  try {
    const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    const parsed = JSON.parse(data) as TokenRecord[];
    if (parsed.length === 0) {
      return seedLocalTokens();
    }
    inMemoryTokens = parsed;
    return parsed;
  } catch (error) {
    console.error('Error reading local tokens database, re-seeding:', error);
    return seedLocalTokens();
  }
}

function saveLocalTokens(tokens: TokenRecord[]): void {
  inMemoryTokens = tokens;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Could not write to local filesystem (expected on serverless environments like Vercel). Using in-memory state.');
  }
}

// Database Actions Interface
export const db = {
  isSupabase: () => isSupabaseConfigured,
  getSupabaseUrl: () => SUPABASE_URL,

  async getStats(): Promise<DatabaseStats> {
    if (isSupabaseConfigured && supabase) {
      try {
        // Query counts from Supabase
        // Note: For large tables we could use precise filter. limit(0) with count option is efficient.
        const { count: totalCount, error: err1 } = await supabase
          .from('tokens')
          .select('*', { count: 'exact', head: true });

        if (err1) throw err1;

        const { count: usedCount, error: err2 } = await supabase
          .from('tokens')
          .select('*', { count: 'exact', head: true })
          .eq('is_used', true);

        if (err2) throw err2;

        const { count: occupiedCount, error: err3 } = await supabase
          .from('tokens')
          .select('*', { count: 'exact', head: true })
          .eq('occupied', true);

        if (err3) throw err3;

        const total = totalCount || 0;
        const used = usedCount || 0;
        const occupied = occupiedCount || 0;
        
        // Unoccupied and unused are "available"
        const { count: availableCount, error: err4 } = await supabase
          .from('tokens')
          .select('*', { count: 'exact', head: true })
          .eq('is_used', false)
          .eq('occupied', false);
        
        if (err4) throw err4;
        
        const available = availableCount || 0;

        return {
          total,
          available,
          occupied,
          used,
          source: 'supabase',
          supabaseConnected: true,
          supabaseUrl: SUPABASE_URL,
        };
      } catch (e: any) {
        console.warn('Supabase query info (falling back to local stats):', e.message);
        
        // Fallback to local stats if Supabase fails (e.g. table doesn't exist yet)
        const tokens = getLocalTokens();
        const total = tokens.length;
        const used = tokens.filter(t => t.is_used).length;
        const occupied = tokens.filter(t => t.occupied).length;
        const available = tokens.filter(t => !t.is_used && !t.occupied).length;

        return {
          total,
          available,
          occupied,
          used,
          source: 'local',
          supabaseConnected: isSupabaseConfigured,
          supabaseUrl: SUPABASE_URL,
          supabaseTableError: e.message,
        };
      }
    }

    // Local Stats
    const tokens = getLocalTokens();
    const total = tokens.length;
    const used = tokens.filter(t => t.is_used).length;
    const occupied = tokens.filter(t => t.occupied).length;
    const available = tokens.filter(t => !t.is_used && !t.occupied).length;

    return {
      total,
      available,
      occupied,
      used,
      source: 'local',
      supabaseConnected: isSupabaseConfigured,
      supabaseUrl: SUPABASE_URL,
    };
  },

  async getRandomAvailableToken(): Promise<TokenRecord | null> {
    if (isSupabaseConfigured && supabase) {
      try {
        // Fetch up to 100 available tokens to ensure we get the next one sequentially
        const { data, error } = await supabase
          .from('tokens')
          .select('*')
          .eq('is_used', false)
          .eq('occupied', false)
          .limit(100);

        if (error) throw error;
        if (data && data.length > 0) {
          const enriched = data.map(t => enrichTokenRecord(t as TokenRecord));
          // Sort sequentially by manifest row number
          enriched.sort((a, b) => {
            const numA = getRowNumberForToken(a.token);
            const numB = getRowNumberForToken(b.token);
            return numA - numB;
          });
          return enriched[0];
        }
        return null;
      } catch (e: any) {
        console.warn('Supabase info (getting random token, falling back):', e.message);
      }
    }

    // Local
    const tokens = getLocalTokens();
    const available = tokens.filter(t => !t.is_used && !t.occupied);
    if (available.length === 0) return null;

    const enriched = available.map(t => enrichTokenRecord(t));
    enriched.sort((a, b) => {
      const numA = getRowNumberForToken(a.token);
      const numB = getRowNumberForToken(b.token);
      return numA - numB;
    });
    return enriched[0];
  },

  async markOccupied(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('tokens')
          .update({ occupied: true })
          .eq('id', id)
          .select();

        if (error) throw error;
        return data && data.length > 0;
      } catch (e: any) {
        console.warn('Supabase info (marking occupied, falling back):', e.message);
      }
    }

    // Local
    const tokens = getLocalTokens();
    const index = tokens.findIndex(t => t.id === id);
    if (index !== -1) {
      tokens[index].occupied = true;
      saveLocalTokens(tokens);
      return true;
    }
    return false;
  },

  async markUsed(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('tokens')
          .update({ is_used: true, used_at: new Date().toISOString() })
          .eq('id', id)
          .select();

        if (error) throw error;
        return data && data.length > 0;
      } catch (e: any) {
        console.warn('Supabase info (marking used, falling back):', e.message);
      }
    }

    // Local
    const tokens = getLocalTokens();
    const index = tokens.findIndex(t => t.id === id);
    if (index !== -1) {
      tokens[index].is_used = true;
      tokens[index].used_at = new Date().toISOString();
      saveLocalTokens(tokens);
      return true;
    }
    return false;
  },

  async getTokensList(filter: 'all' | 'available' | 'occupied' | 'used', page: number = 1, search: string = ''): Promise<{ tokens: TokenRecord[], totalCount: number }> {
    const limit = 50;
    const offset = (page - 1) * limit;

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('tokens').select('*', { count: 'exact' });

        if (filter === 'available') {
          query = query.eq('is_used', false).eq('occupied', false);
        } else if (filter === 'occupied') {
          query = query.eq('occupied', true);
        } else if (filter === 'used') {
          query = query.eq('is_used', true);
        }

        if (search) {
          query = query.ilike('token', `%${search}%`);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
          tokens: (data || []).map(t => enrichTokenRecord(t as TokenRecord)),
          totalCount: count || 0,
        };
      } catch (e: any) {
        console.warn('Supabase info (fetching tokens list, falling back):', e.message);
      }
    }

    // Local
    let tokens = getLocalTokens();
    
    if (filter === 'available') {
      tokens = tokens.filter(t => !t.is_used && !t.occupied);
    } else if (filter === 'occupied') {
      tokens = tokens.filter(t => t.occupied);
    } else if (filter === 'used') {
      tokens = tokens.filter(t => t.is_used);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      tokens = tokens.filter(t => t.token.toLowerCase().includes(searchLower));
    }

    const totalCount = tokens.length;
    const paginated = tokens.slice(offset, offset + limit).map(t => enrichTokenRecord(t));

    return {
      tokens: paginated,
      totalCount,
    };
  },

  async seedSupabase(): Promise<{ success: boolean; count: number; message: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, count: 0, message: 'Supabase is not configured in environment variables.' };
    }

    try {
      // First, check if the table has any tokens already
      const { count, error: countErr } = await supabase
        .from('tokens')
        .select('*', { count: 'exact', head: true });

      if (countErr) {
        return {
          success: false,
          count: 0,
          message: `Could not reach 'tokens' table. Please make sure the table exists with the correct columns. Error: ${countErr.message}`,
        };
      }

      if (count && count > 0) {
        return {
          success: false,
          count: Number(count),
          message: `The 'tokens' table already contains ${count} rows. To avoid duplication, seeding has been cancelled.`,
        };
      }

      // Generate 5000 records based on manifest
      console.log('Generating 5,000 tokens based on manifest for Supabase...');
      const rows = loadAllManifestRows();
      const records = [];
      const now = new Date().toISOString();
      for (const row of rows) {
        records.push({
          id: row.id,
          token: row.qr_token,
          name: null,
          phone_number: null,
          is_used: false,
          score: 0,
          used_at: null,
          created_at: now,
          occupied: false,
        });
      }

      // Insert in chunks of 1000 due to payload size limits
      const chunkSize = 1000;
      let insertedCount = 0;

      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error: insertErr } = await supabase.from('tokens').insert(chunk);
        if (insertErr) {
          throw new Error(`Failed inserting chunk ${i / chunkSize + 1}: ${insertErr.message}`);
        }
        insertedCount += chunk.length;
        console.log(`Inserted ${insertedCount}/5000 tokens into Supabase...`);
      }

      return {
        success: true,
        count: insertedCount,
        message: `Successfully seeded ${insertedCount} unique tokens into your Supabase database table!`,
      };
    } catch (e: any) {
      console.error('Error seeding Supabase:', e);
      return {
        success: false,
        count: 0,
        message: `Error during seeding: ${e.message}`,
      };
    }
  },

  async resetAllLocal(): Promise<void> {
    seedLocalTokens();
  }
};
