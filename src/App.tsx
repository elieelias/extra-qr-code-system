import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Search, 
  Copy, 
  Check, 
  Smartphone, 
  User, 
  Phone, 
  ExternalLink, 
  Layers, 
  Settings, 
  BookOpen, 
  HelpCircle,
  Sparkles,
  ChevronRight,
  ArrowRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TokenRecord, DatabaseStats } from './types';

export default function App() {
  // Navigation / Tabs within single-view layout
  const [activeTab, setActiveTab] = useState<'dispenser' | 'database' | 'setup'>('dispenser');

  // Token state
  const [currentToken, setCurrentToken] = useState<TokenRecord | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [markingToken, setMarkingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Customer details input
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Stats state
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Search & List state
  const [tokensList, setTokensList] = useState<TokenRecord[]>([]);
  const [listFilter, setListFilter] = useState<'all' | 'available' | 'occupied' | 'used'>('all');
  const [listPage, setListPage] = useState(1);
  const [listTotalCount, setListTotalCount] = useState(0);
  const [listSearch, setListSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  // Feedback notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Seeding states
  const [seedingSupabase, setSeedingSupabase] = useState(false);
  const [resettingLocal, setResettingLocal] = useState(false);

  // Supabase storage bucket config states
  const [bucketName, setBucketName] = useState(() => {
    const saved = localStorage.getItem('fc_bucket_name');
    return saved && saved !== 'qr-codes' ? saved : 'extra-token-qrs';
  });
  const [fileExtension, setFileExtension] = useState(() => localStorage.getItem('fc_file_ext') || 'png');
  const [imageError, setImageError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const useStorageBucket = true; // Forced: local SVG fallback disabled

  // Show toast notification helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Fetch stats from Express backend
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        console.error('Failed to fetch stats');
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Fetch a random token
  const fetchRandomToken = useCallback(async (silent = false) => {
    if (!silent) setLoadingToken(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/token/random');
      if (res.status === 444) {
        setCurrentToken(null);
        setTokenError('All tokens have been used or occupied! Reset the local database or seed more to continue.');
      } else if (res.ok) {
        const data = await res.json();
        setCurrentToken(data);
        // Clear customer inputs
        setCustomerName('');
        setCustomerPhone('');
      } else {
        setTokenError('Failed to load next token. Please check backend connection.');
      }
    } catch (err) {
      setTokenError('Network error loading token.');
      console.error(err);
    } finally {
      if (!silent) setLoadingToken(false);
    }
  }, []);

  // Mark token as occupied
  const handleMarkOccupied = async () => {
    if (!currentToken) return;
    setMarkingToken(true);
    try {
      // First, update details if specified, otherwise just mark occupied
      // (Optional client-side API logic: if name/phone is provided, we can log it on backend too. 
      //  To keep it clean, let's pass it to mark-occupied body which can be handled if needed, or we just save it)
      const res = await fetch('/api/token/mark-occupied', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: currentToken.id,
          name: customerName || null,
          phone_number: customerPhone || null,
        }),
      });

      if (res.ok) {
        showToast('Token marked as OCCUPIED successfully!');
        // Refresh stats
        fetchStats();
        // Load next random token
        await fetchRandomToken(true);
      } else {
        showToast('Failed to mark token as occupied.', 'error');
      }
    } catch (err) {
      showToast('Network error while updating token.', 'error');
      console.error(err);
    } finally {
      setMarkingToken(false);
    }
  };

  // Skip / Get another random token
  const handleSkipToken = () => {
    fetchRandomToken();
  };

  // Fetch tokens list for the list tab
  const fetchTokensList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({
        filter: listFilter,
        page: listPage.toString(),
        search: listSearch,
      });
      const res = await fetch(`/api/tokens?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTokensList(data.tokens);
        setListTotalCount(data.totalCount);
      }
    } catch (err) {
      console.error('Error fetching tokens list:', err);
    } finally {
      setLoadingList(false);
    }
  }, [listFilter, listPage, listSearch]);

  // Handle Seeding Supabase
  const handleSeedSupabase = async () => {
    if (!confirm('Are you sure you want to seed 5,000 tokens to Supabase? This will fail if the table already contains rows to prevent duplicate data.')) {
      return;
    }
    setSeedingSupabase(true);
    try {
      const res = await fetch('/api/supabase/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchStats();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Error connecting to seed API.', 'error');
    } finally {
      setSeedingSupabase(false);
    }
  };

  // Handle resetting local database
  const handleResetLocal = async () => {
    if (!confirm('Warning: This will regenerate all 5,000 local tokens and discard any occupation status or names recorded locally. Proceed?')) {
      return;
    }
    setResettingLocal(true);
    try {
      const res = await fetch('/api/local/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Local database reset successfully to 5,000 fresh tokens!');
        fetchStats();
        fetchRandomToken();
      } else {
        showToast('Failed to reset local database.', 'error');
      }
    } catch (err) {
      showToast('Error resetting database.', 'error');
    } finally {
      setResettingLocal(false);
    }
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(type);
    showToast(`Copied ${type === 'token' ? 'Token' : type === 'url' ? 'Game URL' : type} to clipboard!`);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Initial loads
  useEffect(() => {
    fetchStats();
    fetchRandomToken();
  }, [fetchStats, fetchRandomToken]);

  // Load tokens list when tab, filter, page or search changes
  useEffect(() => {
    if (activeTab === 'database') {
      fetchTokensList();
    }
  }, [activeTab, fetchTokensList]);

  // Reset image error state when token or config changes
  useEffect(() => {
    setImageError(false);
  }, [currentToken, useStorageBucket, bucketName, fileExtension]);

  // Custom play URL for current token
  const getPlayUrl = (tokenStr: string) => {
    return `https://fruishy-chicken-game.vercel.app/play?token=${tokenStr}`;
  };

  // Build the public URL for Supabase storage image
  const getBucketImageUrl = (tokenStr: string) => {
    if (!stats?.supabaseUrl) return '';
    let baseUrl = stats.supabaseUrl.replace(/\/$/, '');
    return `${baseUrl}/storage/v1/object/public/${bucketName}/${tokenStr}.${fileExtension}`;
  };

  return (
    <div className="min-h-screen bg-white text-[#2D3436] font-sans selection:bg-[#FF6B6B]/20 selection:text-[#FF6B6B] flex justify-center relative overflow-x-hidden p-0">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl shadow-[4px_4px_0_0_#2D3436] border-4 border-[#2D3436] flex items-center gap-3 max-w-sm w-[calc(100%-2rem)] ${
              notification.type === 'success' 
                ? 'bg-emerald-100 text-slate-900' 
                : notification.type === 'error'
                ? 'bg-[#FF6B6B] text-white'
                : 'bg-[#FFFBEB] text-slate-900'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
            {notification.type === 'error' && <XCircle className="w-4 h-4 shrink-0 text-white" />}
            {notification.type === 'info' && <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />}
            <span className="text-[11px] font-black uppercase tracking-wide">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container taking full height and width */}
      <div className="w-full max-w-xl bg-white flex flex-col min-h-screen relative">
        
        {/* Header Section */}
        <header className="bg-white text-[#2D3436] pt-8 pb-5 px-6 border-b-[6px] border-[#2D3436] shrink-0 text-center">
          <div className="flex flex-col items-center">

            <h1 className="text-3xl font-black text-[#2D3436] tracking-tight leading-none uppercase font-display">
              Fruishy Chicken
            </h1>

          </div>
        </header>
      

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto px-6 py-5 flex flex-col pb-24">
          
          {/* TAB 1: DISPENSER */}
          {activeTab === 'dispenser' && (
            <div className="flex-1 flex flex-col justify-between">
              
              {stats?.supabaseTableError && (
                <div id="supabase-error-alert" className="mb-6 bg-amber-50 border-4 border-[#2D3436] rounded-3xl p-5 shadow-[4px_4px_0_0_#2D3436] text-left">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-[#2D3436]">
                        Supabase Schema Cache Error
                      </h4>
                      <p className="text-[11px] text-slate-600 font-bold mt-1 leading-relaxed">
                        The `public.tokens` table could not be found or read in your connected Supabase project. We have safely fallen back to the local database, but you can fix this instantly by creating the table.
                      </p>
                      <div className="mt-2.5 bg-white/60 p-2.5 rounded-xl border-2 border-dashed border-slate-400 font-mono text-[9px] break-all text-slate-500">
                        Error: {stats.supabaseTableError}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* QR Preview Section */}
              <div className="flex flex-col items-center justify-center text-center py-4">
                {loadingToken ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-[#FF6B6B] animate-spin" />
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Retrieving Next Token...</p>
                  </div>
                ) : tokenError ? (
                  <div className="py-12 px-2 flex flex-col items-center gap-3">
                    <AlertCircle className="w-12 h-12 text-[#FF6B6B]" />
                    <h3 className="font-black text-[#2D3436] text-lg uppercase tracking-wide">Sold Out!</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold max-w-xs">{tokenError}</p>
                    <button
                      onClick={() => {
                        if (stats?.source === 'local') {
                          handleResetLocal();
                        } else {
                          setActiveTab('setup');
                        }
                      }}
                      className="mt-4 px-4 py-2.5 bg-[#FFD93D] hover:bg-[#ffe169] text-[#2D3436] border-3 border-[#2D3436] shadow-[3px_3px_0_0_#2D3436] font-black text-xs rounded-xl uppercase tracking-wide transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {stats?.source === 'local' ? 'Re-seed 5,000 Local' : 'Configure Database'}
                    </button>
                  </div>
                ) : currentToken ? (
                  <div className="w-full flex justify-center">
 
                    {/* QR Frame - Sized up */}
                    <div className="bg-[#FFFBEB] p-6 rounded-[32px] inline-block border-4 border-[#2D3436] shadow-[8px_8px_0_0_#2D3436] relative group">
                      {!stats?.supabaseUrl ? (
                        <div className="w-[280px] h-[280px] bg-white rounded-xl flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#2D3436]">
                          <AlertCircle className="w-12 h-12 text-[#FF6B6B] mb-2" />
                          <p className="text-[11px] font-black uppercase tracking-wide text-slate-800">Supabase Not Connected</p>
                          <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-normal">
                            Configure your Supabase connection strings to enable Storage QR retrieval.
                          </p>
                        </div>
                      ) : imageError ? (
                        <div className="w-[280px] h-[280px] bg-white rounded-xl flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#FF6B6B]">
                          <XCircle className="w-12 h-12 text-[#FF6B6B] mb-2" />
                          <p className="text-[11px] font-black uppercase tracking-wide text-red-600">Image Load Failed</p>
                          <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-normal">
                            Could not find <span className="font-mono bg-slate-100 p-0.5 rounded text-slate-700">{currentToken.qr_image || currentToken.token}.{fileExtension}</span> inside bucket <span className="font-mono bg-slate-100 p-0.5 rounded text-slate-700">'{bucketName}'</span>.
                          </p>
                          <p className="text-[9px] text-amber-600 font-bold mt-2 leading-tight uppercase">
                            ⚠ Local fallback is disabled.
                          </p>
                        </div>
                      ) : (
                        <div className="relative">
                          <img
                            src={getBucketImageUrl(currentToken.qr_image || currentToken.token)}
                            alt={`QR Code ${currentToken.qr_image || currentToken.token}`}
                            style={{ width: '280px', height: '280px', objectFit: 'contain' }}
                            className="mx-auto block bg-white rounded-xl"
                            onError={() => {
                              setImageError(true);
                              showToast('Pre-rendered QR image failed to load from Supabase Storage.', 'error');
                            }}
                          />
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-emerald-400 text-[#2D3436] border-2 border-[#2D3436] text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-[2px_2px_0_0_#2D3436] whitespace-nowrap">
                            Supabase Storage
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
 
              {/* Action Buttons */}
              <div className="mt-6 space-y-4">
                <button
                  onClick={handleMarkOccupied}
                  disabled={!currentToken || markingToken || loadingToken}
                  className="w-full bg-[#FF6B6B] hover:bg-[#ff5252] text-white font-black py-4 px-4 rounded-2xl border-4 border-[#2D3436] shadow-[0_6px_0_0_#2D3436] active:shadow-none active:translate-y-1.5 transition-all text-lg uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {markingToken ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      MARKING...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      MARK AS OCCUPIED
                    </>
                  )}
                </button>

                <button
                  onClick={handleSkipToken}
                  disabled={loadingToken || markingToken}
                  className="w-full bg-white hover:bg-[#FFFBEB] text-[#2D3436] border-4 border-[#2D3436] shadow-[0_6px_0_0_#2D3436] active:shadow-none active:translate-y-1.5 transition-all font-black py-4 px-4 rounded-2xl uppercase tracking-wide flex items-center justify-center gap-2 text-lg disabled:opacity-50"
                >
                  <RefreshCw className="w-5 h-5 text-[#FF6B6B]" />
                  SKIP / RANDOMIZE
                </button>
              </div>

              
 
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
