// phase-config.js - Shared Configuration
window.PlayAQuizConfig = {
  SUPABASE_URL: 'https://efgirqbaayfjwswnwbop.supabase.co',
  SUPABASE_ANON: 'sb_publishable_UUGSZcCX0KVuT6h69OMoHQ_14UjDZ-e',
  
  // Phase keys for localStorage/sessionStorage
  PHASE1_SESSION_KEY: 'paq_phase1_session',
  PHASE1_PLAYER_KEY: 'paq_phase1_player',
  PHASE2_SESSION_KEY: 'paq_phase2_session',
  
  // QR Code endpoints
  QR_BASE_URL: window.location.origin,
  PHASE1_PLAYER_URL: '/player.html',
  PHASE2_PLAYER_URL: '/finalroundplayer.html',
  
  // Game defaults
  DEFAULT_TIMER: 20,
  DEFAULT_POINTS: 100,
  
  // Helper: Generate unique ID
  generateId: () => Date.now() + '_' + Math.random().toString(36).substring(2, 10),
  
  // Helper: Get Supabase client (lazy)
  _sb: null,
  getSupabase: function() {
    if (!this._sb && window.supabase) {
      this._sb = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON);
    }
    return this._sb;
  },
  
  // Phase management
  setPhase: function(phase, sessionId, roomCode) {
    localStorage.setItem('paq_current_phase', phase);
    if (phase === 1) {
      sessionStorage.setItem(this.PHASE1_SESSION_KEY, JSON.stringify({ sessionId, roomCode }));
    } else if (phase === 2) {
      sessionStorage.setItem(this.PHASE2_SESSION_KEY, JSON.stringify({ sessionId, roomCode }));
    }
  },
  
  getPhase1Session: function() {
    try {
      return JSON.parse(sessionStorage.getItem(this.PHASE1_SESSION_KEY) || 'null');
    } catch(e) { return null; }
  },
  
  getPhase2Session: function() {
    try {
      return JSON.parse(sessionStorage.getItem(this.PHASE2_SESSION_KEY) || 'null');
    } catch(e) { return null; }
  },
  
  // Create Phase 2 room from Phase 1 top players
  migrateToPhase2: async function(topPlayers) {
    const sb = this.getSupabase();
    if (!sb) return null;
    
    // Generate Phase 2 room code
    const roomCode = 'FR' + Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Register in game_rooms table
    const { data, error } = await sb
      .from('game_rooms')
      .upsert({
        room_code: roomCode,
        is_active: true,
        control_id: 'ctrl_' + this.generateId(),
        created_at: new Date(),
        player_count: topPlayers.length
      }, { onConflict: 'room_code' });
    
    if (error) {
      console.error('Failed to create Phase 2 room:', error);
      return null;
    }
    
    // Store top players for Phase 2 auto-join
    localStorage.setItem('paq_phase2_top_players', JSON.stringify(topPlayers));
    localStorage.setItem('paq_phase2_room_code', roomCode);
    
    return { roomCode, topPlayers };
  }
};

console.log('PlayAQuiz Config loaded');