// phase-manager.js - Phase Transition Logic
window.PhaseManager = {
  currentPhase: 1, // 1 = Elimination, 2 = Final Round
  phase1Session: null,
  phase2Session: null,
  
  // Initialize
  init: function() {
    this.currentPhase = parseInt(localStorage.getItem('paq_current_phase') || '1');
    this.phase1Session = PlayAQuizConfig.getPhase1Session();
    this.phase2Session = PlayAQuizConfig.getPhase2Session();
    
    window.addEventListener('storage', (e) => {
      if (e.key === 'paq_phase_transition') {
        const data = JSON.parse(e.newValue);
        if (data && data.phase === 2) {
          this.transitionToPhase2(data.topPlayers, data.roomCode);
        }
      }
    });
    
    return this;
  },
  
  // Called by Admin when Phase 1 ends
  endPhase1AndTransition: async function(topPlayers) {
    if (!topPlayers || topPlayers.length === 0) {
      console.error('No top players to transition');
      return false;
    }
    
    const result = await PlayAQuizConfig.migrateToPhase2(topPlayers);
    if (!result) return false;
    
    // Store transition in localStorage for other windows to detect
    localStorage.setItem('paq_phase_transition', JSON.stringify({
      phase: 2,
      topPlayers: topPlayers,
      roomCode: result.roomCode,
      timestamp: Date.now()
    }));
    
    // Also broadcast via Supabase
    const sb = PlayAQuizConfig.getSupabase();
    if (sb && this.phase1Session?.sessionId) {
      await sb.from('game_events').insert({
        session_id: this.phase1Session.sessionId,
        event_type: 'phase2_transition',
        payload: { topPlayers, roomCode: result.roomCode }
      });
    }
    
    this.currentPhase = 2;
    localStorage.setItem('paq_current_phase', '2');
    
    return result;
  },
  
  // Handle transition for FOH/Display screens
  transitionToPhase2: function(topPlayers, roomCode) {
    this.currentPhase = 2;
    this.phase2Session = { roomCode };
    localStorage.setItem('paq_current_phase', '2');
    sessionStorage.setItem(PlayAQuizConfig.PHASE2_SESSION_KEY, JSON.stringify({ roomCode }));
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('phase2started', { detail: { topPlayers, roomCode } }));
    
    return { topPlayers, roomCode };
  },
  
  // Get current phase status
  getStatus: function() {
    return {
      phase: this.currentPhase,
      phase1Session: this.phase1Session,
      phase2Session: this.phase2Session,
      isPhase1Active: this.currentPhase === 1 && this.phase1Session !== null,
      isPhase2Active: this.currentPhase === 2 && this.phase2Session !== null
    };
  },
  
  // Reset everything (new game)
  reset: function() {
    localStorage.removeItem('paq_current_phase');
    localStorage.removeItem('paq_phase_transition');
    localStorage.removeItem('paq_phase2_top_players');
    localStorage.removeItem('paq_phase2_room_code');
    sessionStorage.removeItem(PlayAQuizConfig.PHASE1_SESSION_KEY);
    sessionStorage.removeItem(PlayAQuizConfig.PHASE2_SESSION_KEY);
    this.currentPhase = 1;
    this.phase1Session = null;
    this.phase2Session = null;
    return true;
  }
};

// Auto-init
if (typeof window !== 'undefined') {
  window.PhaseManager = PhaseManager;
  window.PhaseManager.init();
}

console.log('Phase Manager loaded');