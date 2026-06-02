// shared-utilities.js
// Common functions shared across unified HTML files

// ─── WebSocket/Realtime Setup ───────────────────────────────────────────────
let channel = null;
let supabase = null;

async function initializeSupabase() {
  // Initialize Supabase (assumes SUPABASE_URL and SUPABASE_KEY in env)
  const SUPABASE_URL = 'https://efgirqbaayfjwswnwbop.supabase.co';
const SUPABASE_ANON = 'sb_publishable_UUGSZcCX0KVuT6h69OMoHQ_14UjDZ-e';


  window.supabase = supabase = supabase || {
    from: () => ({ select: () => Promise.resolve({ data: [] }) }),
    channel: initChannel
  };
}

function initChannel(channelName, options = {}) {
  return {
    state: 'joined',
    send: (message) => console.log('Broadcasting:', message),
    on: (eventType, filter, handler) => {
      // Mock implementation
      return { unsubscribe: () => {} };
    },
    subscribe: () => Promise.resolve('ok'),
    retrieve: () => Promise.resolve(null),
    presence: {
      track: () => Promise.resolve(null),
      untrack: () => Promise.resolve(null)
    }
  };
}

// ─── Utility Functions ──────────────────────────────────────────────────────
function generateRoomCode() {
  return 'QUIZ' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showLoadingOverlay(message) {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="text-align: center; color: white;">
      <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid white; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
      <div style="font-size: 14px;">${message}</div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── Audio Functions ───────────────────────────────────────────────────────
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playTone(frequency = 440, duration = 100, type = 'sine') {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  osc.frequency.value = frequency;
  osc.type = type;
  
  gain.gain.setValueAtTime(0.1, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
  
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + duration / 1000);
}

function playBuzzerSound() {
  playTone(800, 150, 'sine');
  setTimeout(() => playTone(600, 150, 'sine'), 180);
}

function playSuccessSound() {
  playTone(523, 100); // C5
  setTimeout(() => playTone(659, 100), 120); // E5
  setTimeout(() => playTone(784, 200), 240); // G5
}

function playErrorSound() {
  playTone(300, 200, 'sine');
}

// ─── WakeLock Management ────────────────────────────────────────────────────
let wakeLockSentinel = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      console.log('✅ WakeLock acquired');
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return true;
    } catch (err) {
      console.warn('⚠️ WakeLock request failed:', err);
      return false;
    }
  }
  return false;
}

async function handleVisibilityChange() {
  if (!document.hidden && !wakeLockSentinel) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      console.log('✅ WakeLock re-acquired');
    } catch (err) {
      console.error('❌ WakeLock error:', err);
    }
  } else if (document.hidden && wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

// ─── DOM Manipulation Helpers ───────────────────────────────────────────────
function showSection(sectionId) {
  document.querySelectorAll('[data-section]').forEach(el => {
    el.style.display = 'none';
  });
  const section = document.getElementById(sectionId);
  if (section) section.style.display = 'block';
}

function toggleClass(element, className, force) {
  if (element) {
    if (force !== undefined) {
      element.classList.toggle(className, force);
    } else {
      element.classList.toggle(className);
    }
  }
}

function updateText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text;
}

// ─── State Management ───────────────────────────────────────────────────────
class StateManager {
  constructor() {
    this.state = {};
    this.listeners = [];
  }
  
  setState(updates) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }
  
  getState(key) {
    return this.state[key];
  }
  
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
  
  notifyListeners() {
    this.listeners.forEach(callback => callback(this.state));
  }
}

const appState = new StateManager();

// ─── Network Utilities ──────────────────────────────────────────────────────
async function checkConnection() {
  try {
    const response = await fetch('https://www.google.com/search?tbm=isch', {
      mode: 'no-cors'
    });
    return true;
  } catch (err) {
    return false;
  }
}

function throttle(func, delay) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func(...args);
    }
  };
}

function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// ─── Storage Helpers ───────────────────────────────────────────────────────
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('Storage save failed:', err);
    return false;
  }
}

function getFromStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (err) {
    console.warn('Storage read failed:', err);
    return defaultValue;
  }
}

function clearStorage(key) {
  localStorage.removeItem(key);
}

// ─── Analytics/Logging ─────────────────────────────────────────────────────
const eventLog = [];

function logEvent(event, data = {}) {
  const logEntry = {
    timestamp: Date.now(),
    event,
    data,
    userAgent: navigator.userAgent
  };
  eventLog.push(logEntry);
  
  // Keep only last 500 events
  if (eventLog.length > 500) {
    eventLog.shift();
  }
  
  console.log(`[${event}]`, data);
}

function exportEventLog() {
  return JSON.stringify(eventLog, null, 2);
}

// ─── Responsive Helpers ────────────────────────────────────────────────────
const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1440
};

function getDeviceType() {
  const width = window.innerWidth;
  if (width < breakpoints.tablet) return 'mobile';
  if (width < breakpoints.desktop) return 'tablet';
  if (width < breakpoints.wide) return 'desktop';
  return 'wide';
}

function onResize(callback) {
  window.addEventListener('resize', throttle(() => {
    callback(getDeviceType());
  }, 300));
}

// ─── Confetti Animation ────────────────────────────────────────────────────
function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// ─── Validation Helpers ────────────────────────────────────────────────────
function isValidRoomCode(code) {
  return /^[A-Z0-9]{4,10}$/.test(code);
}

function isValidName(name) {
  return name && name.trim().length > 0 && name.length <= 50;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Timer Utilities ───────────────────────────────────────────────────────
class GameTimer {
  constructor() {
    this.startTime = null;
    this.duration = 0;
    this.running = false;
    this.onTick = null;
    this.onComplete = null;
    this.intervalId = null;
  }
  
  start(durationSeconds, onTick, onComplete) {
    this.duration = durationSeconds * 1000;
    this.startTime = Date.now();
    this.running = true;
    this.onTick = onTick;
    this.onComplete = onComplete;
    
    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, Math.floor((this.duration - elapsed) / 1000));
      
      if (this.onTick) this.onTick(remaining);
      
      if (elapsed >= this.duration) {
        this.stop();
        if (this.onComplete) this.onComplete();
      }
    }, 100);
  }
  
  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }
  
  pause() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }
  
  resume() {
    if (!this.running) {
      this.start(Math.ceil((this.duration - (Date.now() - this.startTime)) / 1000));
    }
  }
  
  getRemainingSeconds() {
    if (!this.running) return 0;
    return Math.max(0, Math.floor((this.duration - (Date.now() - this.startTime)) / 1000));
  }
}

// ─── Export for use in HTML ────────────────────────────────────────────────
window.Utils = {
  generateRoomCode,
  formatTime,
  toast,
  showLoadingOverlay,
  hideLoadingOverlay,
  playBuzzerSound,
  playSuccessSound,
  playErrorSound,
  requestWakeLock,
  showSection,
  toggleClass,
  updateText,
  appState,
  checkConnection,
  throttle,
  debounce,
  saveToStorage,
  getFromStorage,
  clearStorage,
  logEvent,
  exportEventLog,
  getDeviceType,
  onResize,
  fireConfetti,
  isValidRoomCode,
  isValidName,
  validateEmail,
  GameTimer,
  initializeSupabase
};
