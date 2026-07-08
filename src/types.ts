export interface TokenRecord {
  id: string;
  token: string;
  name: string | null;
  phone_number: string | null;
  is_used: boolean;
  score: number;
  used_at: string | null;
  created_at: string;
  occupied: boolean;
  qr_image?: string;
}

export interface DatabaseStats {
  total: number;
  available: number;
  occupied: number;
  used: number;
  source: 'local' | 'supabase';
  supabaseConnected: boolean;
  supabaseUrl?: string;
  supabaseTableError?: string;
}
