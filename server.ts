import dotenv from 'dotenv';
// Load environment variables immediately
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', supabaseConfigured: db.isSupabase() });
  });

  // Get current database status and stats
  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await db.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a random available token for scanning/marking
  app.get('/api/token/random', async (req, res) => {
    try {
      const tokenRecord = await db.getRandomAvailableToken();
      if (!tokenRecord) {
        return res.status(444).json({ error: 'No available tokens left' });
      }
      res.json(tokenRecord);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark token as occupied
  app.post('/api/token/mark-occupied', async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const success = await db.markOccupied(id);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark token as used
  app.post('/api/token/mark-used', async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const success = await db.markUsed(id);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get paginated/filtered list of all tokens
  app.get('/api/tokens', async (req, res) => {
    try {
      const filter = (req.query.filter as 'all' | 'available' | 'occupied' | 'used') || 'all';
      const page = parseInt(req.query.page as string) || 1;
      const search = (req.query.search as string) || '';

      const data = await db.getTokensList(filter, page, search);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Seed Supabase with 5,000 tokens
  app.post('/api/supabase/seed', async (req, res) => {
    try {
      const result = await db.seedSupabase();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset local dataset (re-seed local tokens)
  app.post('/api/local/reset', async (req, res) => {
    try {
      await db.resetAllLocal();
      res.json({ success: true, message: 'Local dataset reset to 5,000 fresh tokens!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
