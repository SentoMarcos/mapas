(function () {
  const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
  const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let prefersReducedMotion = !!(reduceMotionQuery && reduceMotionQuery.matches);
  if (reduceMotionQuery && typeof reduceMotionQuery.addEventListener === 'function') {
    reduceMotionQuery.addEventListener('change', (event) => {
      prefersReducedMotion = event.matches;
    });
  }
  const registry = [];

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.custom-audio').forEach((container) => {
      const instance = setupPlayer(container);
      if (instance) {
        registry.push(instance);
      }
    });
  });

  function setupPlayer(container) {
    const audio = container.querySelector('audio');
    const toggle = container.querySelector('.audio-toggle');
    const timeline = container.querySelector('.audio-timeline');
    const progress = container.querySelector('.audio-progress');
    const currentEl = container.querySelector('.audio-current');
    const durationEl = container.querySelector('.audio-duration');
    const canvas = container.querySelector('.audio-wave');
    if (!audio || !toggle || !timeline || !progress || !currentEl || !durationEl || !canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d');
    const trackName = container.dataset.track || 'audio';
    const accentStyles = getComputedStyle(container);
    const accentStart = accentStyles.getPropertyValue('--accent').trim() || '#38bdf8';
    const accentEnd = accentStyles.getPropertyValue('--accent-2').trim() || accentStart;
    timeline.setAttribute('aria-label', timeline.getAttribute('aria-label') || `Progreso ${trackName}`);

    let duration = 0;
    let rafId = null;
    let fallbackPhase = 0;
    let audioCtx;
    let analyser;
    let dataArray;
    let mediaSource;
    let visualizerDisabled = isFileProtocol;

    const resizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        return;
      }
      const scaledWidth = Math.floor(width * ratio);
      const scaledHeight = Math.floor(height * ratio);
      if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const formatTime = (value) => {
      if (!Number.isFinite(value) || value < 0) {
        value = 0;
      }
      const minutes = Math.floor(value / 60);
      const seconds = Math.floor(value % 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    audio.addEventListener('loadedmetadata', () => {
      duration = audio.duration;
      durationEl.textContent = formatTime(duration);
    });

    audio.addEventListener('timeupdate', () => {
      currentEl.textContent = formatTime(audio.currentTime);
      const percent = duration ? (audio.currentTime / duration) * 100 : 0;
      progress.style.width = `${percent}%`;
      timeline.setAttribute('aria-valuenow', percent.toFixed(1));
    });

    audio.addEventListener('ended', () => {
      audio.pause();
      audio.currentTime = 0;
    });

    toggle.addEventListener('click', () => {
      if (audio.paused) {
        ensureContext();
        audio.play();
      } else {
        audio.pause();
      }
    });

    timeline.addEventListener('click', (event) => {
      if (!duration) {
        return;
      }
      const rect = timeline.getBoundingClientRect();
      const offset = (event.clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(offset, 0), 1);
      audio.currentTime = clamped * duration;
    });

    timeline.addEventListener('keydown', (event) => {
      if (!duration) {
        return;
      }
      const step = event.shiftKey ? 10 : 5;
      if (event.key === 'ArrowRight') {
        audio.currentTime = Math.min(duration, audio.currentTime + step);
        event.preventDefault();
      } else if (event.key === 'ArrowLeft') {
        audio.currentTime = Math.max(0, audio.currentTime - step);
        event.preventDefault();
      }
    });

    audio.addEventListener('play', () => {
      pauseOthers(audio);
      toggle.classList.add('is-playing');
      toggle.setAttribute('aria-label', `Pausar ${trackName}`);
      startVisualizer();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    });

    audio.addEventListener('pause', () => {
      toggle.classList.remove('is-playing');
      toggle.setAttribute('aria-label', `Reproducir ${trackName}`);
      stopVisualizer();
    });

    const ensureContext = () => {
      if (visualizerDisabled || audioCtx || typeof window === 'undefined') {
        return;
      }
      const currentSrc = audio.currentSrc || audio.src || '';
      if (isFileProtocol || currentSrc.startsWith('file:')) {
        visualizerDisabled = true;
        console.info('El visualizador se desactiva al abrir los archivos directamente con file:// para evitar errores CORS.');
        return;
      }
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) {
        return;
      }
      try {
        audioCtx = new Context();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.85;
        dataArray = new Uint8Array(analyser.fftSize);
        mediaSource = audioCtx.createMediaElementSource(audio);
        mediaSource.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (error) {
        visualizerDisabled = true;
        if (audioCtx && typeof audioCtx.close === 'function') {
          audioCtx.close();
        }
        audioCtx = undefined;
        analyser = undefined;
        dataArray = undefined;
        mediaSource = undefined;
        console.warn('El visualizador se desactivó por restricciones del navegador/CORS.', error);
      }
    };

    const drawBaseline = () => {
      if (!ctx) {
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = buildGradient(width);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    const buildGradient = (width) => {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, accentStart);
      gradient.addColorStop(1, accentEnd);
      return gradient;
    };

    const renderFrame = () => {
      if (!ctx) {
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = buildGradient(width);
      ctx.beginPath();

      if (analyser && dataArray) {
        analyser.getByteTimeDomainData(dataArray);
        const slice = width / dataArray.length;
        for (let i = 0; i < dataArray.length; i += 1) {
          const value = dataArray[i] / 255;
          const y = value * (height - 4) + 2;
          const x = i * slice;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      } else {
        fallbackPhase += 0.04;
        const amplitude = height / 3;
        for (let x = 0; x <= width; x += 2) {
          const y = height / 2 + Math.sin((x / width) * Math.PI * 6 + fallbackPhase) * amplitude;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.stroke();
    };

    const startVisualizer = () => {
      if (!ctx) {
        return;
      }
      if (prefersReducedMotion) {
        drawBaseline();
        return;
      }
      cancelAnimationFrame(rafId);

      const loop = () => {
        renderFrame();
        if (!audio.paused) {
          rafId = requestAnimationFrame(loop);
        }
      };

      loop();
    };

    const stopVisualizer = () => {
      if (!ctx) {
        return;
      }
      cancelAnimationFrame(rafId);
      drawBaseline();
    };

    drawBaseline();

    return { audio };
  }

  function pauseOthers(currentAudio) {
    registry.forEach((instance) => {
      if (instance.audio !== currentAudio) {
        instance.audio.pause();
      }
    });
  }
})();
