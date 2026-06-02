// qr-manager.js - QR Code Handling
window.QRManager = {
  // Generate QR code as data URL
  generateQR: function(text, size = 200) {
    // Using QRCode library (assumed loaded)
    if (typeof QRCode === 'undefined') {
      console.warn('QRCode library not loaded');
      return null;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    
    try {
      QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, function(error) {
        if (error) console.error('QR generation error:', error);
      });
      return canvas.toDataURL();
    } catch(e) {
      console.error('QR fallback error:', e);
      return null;
    }
  },
  
  // Get Phase 1 player join URL
  getPhase1JoinURL: function(roomCode) {
    const base = window.location.origin;
    return `${base}/player.html?room=${roomCode}`;
  },
  
  // Get Phase 2 player join URL
  getPhase2JoinURL: function(roomCode) {
    const base = window.location.origin;
    return `${base}/finalroundplayer.html?room=${roomCode}`;
  },
  
  // Render QR to container
  renderQR: function(containerId, text, size = 180) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.maxWidth = `${size}px`;
    
    try {
      QRCode.toCanvas(canvas, text, { width: size, margin: 2 }, function(error) {
        if (error) {
          container.innerHTML = `<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">📱</div>
            <div style="font-size:12px;">${text}</div>
          </div>`;
        }
      });
      container.appendChild(canvas);
    } catch(e) {
      container.innerHTML = `<div style="background:#fff;padding:16px;border-radius:12px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">📱</div>
        <div style="font-size:12px;">${text}</div>
      </div>`;
    }
  },
  
  // Create downloadable QR image
  downloadQR: function(text, filename = 'quiz-qr.png') {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    
    QRCode.toCanvas(canvas, text, { width: 400, margin: 2 }, function() {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL();
      link.click();
    });
  }
};

console.log('QR Manager loaded');