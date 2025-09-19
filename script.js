// jsQR library from CDN 

    // Elements
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.input-section');
    const drop = document.getElementById('drop');
    const fileInput = document.getElementById('fileInput');
    const chooseBtn = document.getElementById('chooseBtn');
    const scanBtn = document.getElementById('scanBtn');
    const previewImg = document.getElementById('previewImg');
    const canvas = document.getElementById('hiddenCanvas');
    const status = document.getElementById('status');
    const urlInput = document.getElementById('urlInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const urlStatus = document.getElementById('urlStatus');
    const resultBox = document.getElementById('resultBox');
    const cameraBtn = document.getElementById('cameraBtn');
    const stopCamBtn = document.getElementById('stopCamBtn');

    let stream = null;
    let camVideo = null;
    let camInterval = null;

    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-section').classList.add('active');
      });
    });

    function setStatus(element, text, type = 'small') {
      element.textContent = text || '';
      element.className = type;
    }

    function showLoading(message = 'Analyzing...') {
      resultBox.innerHTML = `<div class="loading"><div class="spinner"></div>${message}</div>`;
    }

    function showResult(content) {
      resultBox.innerHTML = content;
    }

    // QR Code functionality
    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handleFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(ev => {
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(ev => {
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) handleFiles(dt.files);
    });

    function handleFiles(files) {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        setStatus(status, 'Please provide an image file.', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewImg.style.display = 'block';
      setStatus(status, 'Image loaded. Click "Scan & Analyze" to decode and analyze.');
      previewImg.onload = () => URL.revokeObjectURL(url);
    }

    scanBtn.addEventListener('click', () => {
      if (previewImg.src) {
        decodeAndAnalyze(previewImg);
      } else {
        setStatus(status, 'No image to scan. Please choose or drop a file.', 'error');
      }
    });

    function decodeAndAnalyze(imgElement) {
      const w = imgElement.naturalWidth || imgElement.width;
      const h = imgElement.naturalHeight || imgElement.height;
      const maxDim = 1600;
      let scale = 1;
      if (Math.max(w, h) > maxDim) scale = maxDim / Math.max(w, h);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      setStatus(status, 'Scanning QR code...');
      showLoading('Scanning QR code...');
      
      try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          setStatus(status, 'QR code detected! Analyzing content...', 'success');
          analyzeContent(code.data);
        } else {
          setStatus(status, 'No QR code found. Try a clearer image.', 'error');
          showResult('<p class="error">No QR code detected in the image. Please try a clearer image or crop tighter around the QR code.</p>');
        }
      } catch (err) {
        console.error(err);
        setStatus(status, 'Error scanning image: ' + err.message, 'error');
        showResult('<p class="error">Error scanning image. Please try again.</p>');
      }
    }

    // URL Analysis functionality
    analyzeBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) {
        setStatus(urlStatus, 'Please enter a URL to analyze.', 'error');
        return;
      }
      analyzeContent(url);
    });

    clearBtn.addEventListener('click', () => {
      urlInput.value = '';
      setStatus(urlStatus, '');
      showResult('<p class="small" style="color:#94a3b8;text-align:center;margin:60px 0;">Enter a URL above to analyze a website for safety and content information.</p>');
    });

    async function analyzeContent(input) {
      showLoading('Analyzing website content and safety...');
      setStatus(urlStatus, 'Analyzing...', 'small');

      try {
        const trimmedInput = input.trim();

        // Check if input is a URL
        const isUrl = /^https?:\/\//i.test(trimmedInput) ||
                     /^www\./i.test(trimmedInput) ||
                     (trimmedInput.includes('.') && !trimmedInput.includes('@'));

        if (isUrl) {
          // Clean up the URL
          let url = trimmedInput;
          if (!/^https?:\/\//i.test(url)) {
            if (/^www\./i.test(url)) {
              url = 'https://' + url;
            } else if (url.includes('.')) {
              url = 'https://' + url;
            } else {
              throw new Error('Invalid URL format');
            }
          }

          // Call API for URL analysis
          const response = await fetch('http://localhost:3001/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });

          const data = await response.json();
          if (data.success) {
            displayAnalysis(data.analysis, url);
          } else {
            throw new Error(data.error || 'Analysis failed');
          }
        } else {
          // Call API for QR content analysis
          const response = await fetch('http://localhost:3001/analyze-qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: trimmedInput })
          });

          const data = await response.json();
          if (data.success) {
            displayAnalysis(data.analysis, trimmedInput);
          } else {
            throw new Error(data.error || 'Analysis failed');
          }
        }

        setStatus(urlStatus, 'Analysis complete!', 'success');

      } catch (error) {
        console.error('Analysis error:', error);
        showResult(`<p class="error">Unable to analyze the content: ${error.message}</p>`);
        setStatus(urlStatus, 'Analysis failed.', 'error');
      }
    }

    function generateMockAnalysis(url) {
      // Mock analysis - replace with real API calls
      const domain = new URL(url).hostname.toLowerCase();
      const isSafe = !domain.includes('suspicious') && !domain.includes('malicious');
      const isPopular = ['google.com', 'youtube.com', 'facebook.com', 'wikipedia.org'].some(d => domain.includes(d));
      
      return {
        title: isPopular ? 'Popular Website' : 'Website Analysis',
        description: `This appears to be a ${isPopular ? 'well-known' : 'standard'} website. The domain ${domain} ${isSafe ? 'shows no obvious red flags' : 'may require caution'}.`,
        type: isPopular ? 'Social Media/Search Engine' : 'General Website',
        safety: isSafe ? 'safe' : 'warning',
        warnings: isSafe ? [] : ['Domain contains suspicious keywords', 'Limited reputation data available']
      };
    }

    function displayAnalysis(analysis, url) {
      const safetyClass = analysis.safety === 'safe' ? 'safe' : analysis.safety === 'warning' ? 'unknown' : 'unsafe';
      const safetyText = analysis.safety === 'safe' ? 'Safe' : analysis.safety === 'warning' ? 'Caution' : 'Unsafe';
      
      let warningsHtml = '';
      if (analysis.warnings && analysis.warnings.length > 0) {
        warningsHtml = `<p><strong>Note:</strong> ${analysis.warnings.join('. ')}</p>`;
      }

      const resultHtml = `
        <div>
          <h3 style="margin:0 0 12px 0;color:#0f172a;">${analysis.title}</h3>
          <p style="margin-bottom:16px;line-height:1.6;">${analysis.description}</p>
          
          <p><strong>Website Type:</strong> ${analysis.type}</p>
          <p><strong>URL:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">${url}</code></p>
          
          <div style="margin:16px 0;">
            <span class="safety-badge ${safetyClass}">🛡️ ${safetyText}</span>
          </div>
          
          ${warningsHtml}
          
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
            <p class="small">Analysis includes content scanning and basic security checks. Always use caution when visiting unfamiliar websites.</p>
          </div>
        </div>
      `;
      
      showResult(resultHtml);
    }

    // Camera functionality
    cameraBtn.addEventListener('click', async () => {
      if (stream) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        camVideo = document.createElement('video');
        camVideo.autoplay = true;
        camVideo.playsInline = true;
        camVideo.srcObject = stream;
        previewImg.style.display = 'none';
        setStatus(status, 'Camera started — point at QR code.');
        stopCamBtn.style.display = 'inline-block';
        cameraBtn.style.display = 'none';
        
        camVideo.addEventListener('loadedmetadata', () => {
          camVideo.play();
          camInterval = setInterval(() => {
            try {
              canvas.width = camVideo.videoWidth;
              canvas.height = camVideo.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
              if (code && code.data) {
                setStatus(status, 'QR detected! Analyzing...', 'success');
                analyzeContent(code.data);
                stopCamera();
              }
            } catch (e) { console.warn('camera decode error', e); }
          }, 400);
        });
      } catch (e) {
        console.error(e);
        setStatus(status, 'Camera not available or permission denied.', 'error');
      }
    });

    stopCamBtn.addEventListener('click', stopCamera);

    function stopCamera() {
      if (camInterval) { clearInterval(camInterval); camInterval = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      camVideo = null;
      stopCamBtn.style.display = 'none';
      cameraBtn.style.display = 'inline-block';
      setStatus(status, 'Camera stopped.');
    }

    // Enter key shortcuts
    urlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') analyzeBtn.click();
    });

    // Paste image support
    window.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image')) {
          const file = item.getAsFile();
          handleFiles([file]);
          setStatus(status, 'Image pasted. Click "Scan & Analyze".');
          // Switch to QR tab
          document.querySelector('[data-tab="qr"]').click();
          break;
        }
      }
    });
  