// qr-display.js - Universal QR Display Module for All Files
window.QRDisplay = {
  // Generate QR visual representation
  generateQRVisual: function(roomCode, size = 180, phase = 1) {
    const joinUrl = phase === 1 
      ? `${window.location.origin}/player.html?room=${roomCode}`
      : `${window.location.origin}/finalroundplayer.html?room=${roomCode}`;
    
    const container = document.createElement('div');
    container.className = 'qr-visual-container';
    container.style.cssText = `
      background: linear-gradient(135deg, #1a1f2e, #0d1120);
      border: 2px solid ${phase === 1 ? 'rgba(59,130,246,0.4)' : 'rgba(245,200,66,0.4)'};
      border-radius: 20px;
      padding: 20px;
      text-align: center;
      width: ${size}px;
      margin: 0 auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    // QR Pattern (visual)
    const pattern = document.createElement('div');
    const patternSize = size - 80;
    pattern.style.cssText = `
      width: ${patternSize}px;
      height: ${patternSize}px;
      margin: 0 auto 12px;
      background: 
        linear-gradient(90deg, ${phase === 1 ? '#3b82f6' : '#f5c842'} 2px, transparent 2px) 0 0 / 16px 16px,
        linear-gradient(0deg, ${phase === 1 ? '#3b82f6' : '#f5c842'} 2px, transparent 2px) 0 0 / 16px 16px,
        #0a0c15;
      position: relative;
      border-radius: 8px;
    `;
    
    // Add corner markers
    const cornerSize = Math.floor(patternSize * 0.2);
    const corners = [
      { top: 5, left: 5, borderTop: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}`, borderLeft: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}` },
      { top: 5, right: 5, borderTop: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}`, borderRight: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}` },
      { bottom: 5, left: 5, borderBottom: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}`, borderLeft: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}` },
      { bottom: 5, right: 5, borderBottom: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}`, borderRight: `3px solid ${phase === 1 ? '#3b82f6' : '#f5c842'}` }
    ];
    
    corners.forEach(corner => {
      const marker = document.createElement('div');
      marker.style.cssText = `
        position: absolute;
        width: ${cornerSize}px;
        height: ${cornerSize}px;
        ${corner.top ? `top: ${corner.top}px;` : ''}
        ${corner.bottom ? `bottom: ${corner.bottom}px;` : ''}
        ${corner.left ? `left: ${corner.left}px;` : ''}
        ${corner.right ? `right: ${corner.right}px;` : ''}
        ${corner.borderTop || ''}
        ${corner.borderRight || ''}
        ${corner.borderBottom || ''}
        ${corner.borderLeft || ''}
      `;
      pattern.appendChild(marker);
    });
    
    container.appendChild(pattern);
    
    // Room code display
    const codeDisplay = document.createElement('div');
    codeDisplay.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 700;
      color: ${phase === 1 ? '#3b82f6' : '#f5c842'};
      letter-spacing: 4px;
      margin: 8px 0;
    `;
    codeDisplay.innerText = roomCode;
    container.appendChild(codeDisplay);
    
    // URL for manual entry
    const urlDisplay = document.createElement('div');
    urlDisplay.style.cssText = `
      font-family: monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.4);
      word-break: break-all;
      background: rgba(0,0,0,0.3);
      padding: 6px;
      border-radius: 6px;
      margin-top: 8px;
    `;
    urlDisplay.innerText = joinUrl;
    container.appendChild(urlDisplay);
    
    return container;
  },
  
  // Render QR to container
  renderToContainer: function(containerId, roomCode, phase = 1, size = 200) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found`);
      return false;
    }
    
    container.innerHTML = '';
    const qrElement = this.generateQRVisual(roomCode, size, phase);
    container.appendChild(qrElement);
    return true;
  },
  
  // Create floating QR modal (for control panels)
  showQRModal: function(roomCode, phase = 1) {
    // Remove existing modal
    const existingModal = document.getElementById('qrModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      backdrop-filter: blur(12px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: linear-gradient(135deg, #1a1f2e, #0d1120);
      border: 2px solid ${phase === 1 ? '#3b82f6' : '#f5c842'};
      border-radius: 32px;
      padding: 32px;
      text-align: center;
      max-width: 90vw;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = `
      font-size: 24px;
      margin-bottom: 16px;
      color: ${phase === 1 ? '#3b82f6' : '#f5c842'};
    `;
    title.innerText = phase === 1 ? '📱 JOIN PHASE 1' : '🏆 JOIN FINAL ROUND';
    content.appendChild(title);
    
    const qrContainer = document.createElement('div');
    qrContainer.id = 'qrModalContent';
    content.appendChild(qrContainer);
    
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      margin-top: 24px;
      padding: 10px 24px;
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 40px;
      color: white;
      cursor: pointer;
      font-size: 14px;
    `;
    closeBtn.innerText = 'Close';
    closeBtn.onclick = () => modal.remove();
    content.appendChild(closeBtn);
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    this.renderToContainer('qrModalContent', roomCode, phase, 250);
    
    // Add animation style if not exists
    if (!document.getElementById('qrModalStyle')) {
      const style = document.createElement('style');
      style.id = 'qrModalStyle';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
  }
};

console.log('QR Display Module loaded');