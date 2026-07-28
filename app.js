(() => {
  'use strict';

  const API_BASE = window.API_BASE || (window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://zubcoder-games-tyna.fly.dev');
  const STORAGE_KEY = 'taynaZolotoyOrdyState';
  const HISTORY_KEY = 'taynaZolotoyOrdyHistory';
  const SETTINGS_KEY = 'taynaZolotoyOrdySettings';

  const LOCATIONS = [
    { id: 'start', name: 'Начало пути' },
    { id: 'kremlin', name: 'Казанский Кремль' },
    { id: 'kul_sharif', name: 'Мечеть Кул-Шариф' },
    { id: 'bazaar', name: 'Торговые ряды' },
    { id: 'bukhara_yard', name: 'Бухарский двор' },
    { id: 'library', name: 'Кремлёвская библиотека' },
    { id: 'kaban', name: 'Набережная озера Кабан' },
    { id: 'pier', name: 'Старая пристань' },
    { id: 'suyumbike', name: 'Башня Сююмбике' },
    { id: 'tavern', name: 'Казанская таверна' },
    { id: 'baumana', name: 'Улица Баумана' }
  ];

  const ETHNIC_SCALE = [165, 196, 220, 262, 294, 330, 392, 440]; // D minor pentatonic-ish

  const state = {
    session_id: '',
    inventory: [],
    flags: {
      chapter: 1,
      location: 'Начало пути',
      game_started: false,
      money: 0,
      health: 100,
      premium: false,
      hints: 0
    },
    history: [],
    quota: null,
    products: [],
    visitedLocations: new Set(),
    lastDuelCorrectIndex: undefined,
    lastDuelInsult: undefined,
    typingInterval: null
  };

  const settings = {
    audioEnabled: true,
    ttsEnabled: true,
    autoplay: true,
    typingSpeed: 22
  };

  const screens = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    about: document.getElementById('about-screen')
  };

  const els = {
    startBtn: document.getElementById('start-btn'),
    continueBtn: document.getElementById('continue-btn'),
    menuBtn: document.getElementById('menu-btn'),
    menu: document.getElementById('menu'),
    resetBtn: document.getElementById('reset-game'),
    backBtns: document.querySelectorAll('.back-btn'),
    menuItems: document.querySelectorAll('.menu-item[data-target]'),
    locationBar: document.getElementById('location-bar'),
    sceneImage: document.getElementById('scene-image'),
    sceneImageContainer: document.getElementById('scene-image-container'),
    loader: document.getElementById('loader'),
    sceneText: document.getElementById('scene-text'),
    choices: document.getElementById('choices'),
    inventoryToggle: document.getElementById('inventory-toggle'),
    inventoryPanel: document.getElementById('inventory-panel'),
    inventoryList: document.getElementById('inventory-list'),
    historyPanel: document.getElementById('history-panel'),
    historyList: document.getElementById('history-list'),
    toast: document.getElementById('error-toast'),
    statsBar: document.getElementById('stats-bar'),
    moneyStat: document.getElementById('money-stat'),
    healthStat: document.getElementById('health-stat'),
    quotaStat: document.getElementById('quota-stat'),
    commandInput: document.getElementById('command-input'),
    commandBtn: document.getElementById('command-btn'),
    duelPanel: document.getElementById('duel-panel'),
    duelInsult: document.getElementById('duel-insult'),
    ttsBtn: document.getElementById('tts-btn'),
    shareBtn: document.getElementById('share-btn'),
    audioBtn: document.getElementById('audio-btn'),
    purchaseStubBtn: document.getElementById('purchase-stub-btn'),
    purchaseModal: document.getElementById('purchase-modal'),
    purchaseList: document.getElementById('purchase-list'),
    purchaseMessage: document.getElementById('purchase-message'),
    closePurchase: document.getElementById('close-purchase'),
    mapPanel: document.getElementById('map-panel'),
    mapList: document.getElementById('map-list'),
    shareCanvas: document.getElementById('share-canvas'),
    bottomNav: document.querySelector('.bottom-nav'),
    parallaxBg: document.querySelector('.parallax-bg'),
    particlesCanvas: document.getElementById('particles-canvas')
  };

  // Audio engine
  let audioCtx = null;
  let ambientAudio = null;
  let currentTTS = null;
  let currentAudioUrl = '';
  let ttsGain = null;
  let ttsSource = null;
  let ttsPlaying = false;
  let sceneCount = 0;

  window.ttsDebug = {
    get currentAudioUrl() { return currentAudioUrl; },
    get ttsPlaying() { return ttsPlaying; },
    get audioCtxState() { return audioCtx ? audioCtx.state : 'none'; }
  };

  function initAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ttsGain = audioCtx.createGain();
      ttsGain.gain.value = 1.25;
      ttsGain.connect(audioCtx.destination);
    } catch (e) {
      console.error('Audio init failed', e);
    }
    return audioCtx;
  }

  async function resumeAudio() {
    const ctx = initAudio();
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  function playTone(freq, type, duration, volume, when) {
    if (!settings.audioEnabled || !audioCtx) return;
    const t = when || audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  async function playSfx(name) {
    await resumeAudio();
    if (!settings.audioEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    switch (name) {
      case 'click':
        playTone(880, 'sine', 0.08, 0.22, now);
        break;
      case 'coin':
        playTone(1760, 'sine', 0.12, 0.28, now);
        playTone(2637, 'sine', 0.18, 0.18, now + 0.06);
        break;
      case 'duel':
        playTone(120, 'sawtooth', 0.25, 0.18, now);
        break;
      case 'win':
        [330, 392, 494, 659].forEach((f, i) => playTone(f, 'triangle', 0.3, 0.18, now + i * 0.08));
        break;
      case 'lose':
        [392, 330, 247].forEach((f, i) => playTone(f, 'sawtooth', 0.3, 0.12, now + i * 0.12));
        break;
      case 'purchase':
        [523, 659, 784, 1047].forEach((f, i) => playTone(f, 'sine', 0.25, 0.2, now + i * 0.08));
        break;
      case 'type':
        playTone(1200 + Math.random() * 400, 'sine', 0.03, 0.05, now);
        break;
    }
  }

  function startAmbient() {
    if (!settings.audioEnabled) return;
    if (!ambientAudio) {
      ambientAudio = new Audio('assets/ambient.mp3');
      ambientAudio.loop = true;
      ambientAudio.volume = 0.35;
      ambientAudio.preload = 'auto';
    }
    ambientAudio.currentTime = 0;
    const p = ambientAudio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function stopAmbient() {
    if (ambientAudio) {
      try { ambientAudio.pause(); ambientAudio.currentTime = 0; } catch (e) {}
    }
  }

  function updateAudioBtn() {
    els.audioBtn.textContent = settings.audioEnabled ? '🔊' : '🔇';
    els.audioBtn.classList.toggle('active', settings.audioEnabled);
  }

  function updateTtsBtn() {
    els.ttsBtn.textContent = settings.ttsEnabled ? '🔊' : '🔇';
    els.ttsBtn.classList.toggle('active', settings.ttsEnabled);
  }

  function toggleAudio() {
    resumeAudio();
    settings.audioEnabled = !settings.audioEnabled;
    updateAudioBtn();
    if (settings.audioEnabled) {
      startAmbient();
    } else {
      stopAmbient();
    }
    saveSettings();
  }

  async function enableAudioByDefault() {
    await resumeAudio();
    settings.audioEnabled = true;
    settings.ttsEnabled = true;
    saveSettings();
    updateAudioBtn();
    updateTtsBtn();
    startAmbient();
  }

  // TTS via Web Audio so it can start from a running AudioContext
  // even after the original user gesture has finished.
  function stopTTS() {
    if (ttsSource) {
      try { ttsSource.stop(); } catch (e) {}
      try { ttsSource.disconnect(); } catch (e) {}
      ttsSource = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    ttsPlaying = false;
    currentTTS = null;
    els.ttsBtn.classList.remove('speaking');
  }

  async function playAudioUrl(url) {
    if (!settings.ttsEnabled || !url) return;
    stopTTS();
    const ctx = await resumeAudio();
    if (!ctx) return;
    console.log('[TTS] play', url, 'ctx state', ctx.state);
    currentAudioUrl = url;
    els.ttsBtn.classList.add('speaking');
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch audio failed');
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsGain || ctx.destination);
      source.onended = () => {
        ttsPlaying = false;
        ttsSource = null;
        currentTTS = null;
        els.ttsBtn.classList.remove('speaking');
      };
      ttsSource = source;
      currentTTS = source;
      ttsPlaying = true;
      source.start(0);
    } catch (e) {
      console.error('playAudioUrl error', url, e);
      ttsPlaying = false;
      els.ttsBtn.classList.remove('speaking');
    }
  }

  function speakBrowser(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ru-RU';
    utter.rate = 0.85;
    utter.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const ruMale = voices.find(v => v.lang && v.lang.startsWith('ru') && /male|мужской|yandex|filipp|dmitry/i.test(v.name));
    const ru = ruMale || voices.find(v => v.lang && v.lang.startsWith('ru'));
    if (ru) utter.voice = ru;
    utter.onstart = () => { ttsPlaying = true; els.ttsBtn.classList.add('speaking'); };
    utter.onend = () => { ttsPlaying = false; els.ttsBtn.classList.remove('speaking'); };
    window.speechSynthesis.speak(utter);
  }

  async function speakServer(text) {
    if (!text) return;
    stopTTS();
    try {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000) })
      });
      if (!res.ok) throw new Error('tts failed');
      const data = await res.json();
      currentAudioUrl = data.audio_url;
      await playAudioUrl(currentAudioUrl);
    } catch (e) {
      console.error('Server TTS error', e);
      speakBrowser(text);
    }
  }

  function speak(text) {
    if (!settings.ttsEnabled) return;
    if (!text) return;
    if (text.length > 5000) text = text.slice(0, 5000);
    currentAudioUrl = '';
    speakServer(text);
  }

  function playSceneAudio(url) {
    if (!settings.ttsEnabled || !url) return;
    currentAudioUrl = url;
    playAudioUrl(url);
  }

  async function toggleTTS() {
    await resumeAudio();
    if (ttsPlaying) {
      stopTTS();
      return;
    }
    if (!settings.ttsEnabled) {
      settings.ttsEnabled = true;
      updateTtsBtn();
      saveSettings();
    }
    if (currentAudioUrl) {
      playAudioUrl(currentAudioUrl);
    } else {
      const text = els.sceneText.textContent;
      if (text) speakServer(text);
    }
  }

  // Settings persistence
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // preserve new defaults if keys missing
        Object.assign(settings, parsed);
      } catch (e) {}
    }
    updateAudioBtn();
    updateTtsBtn();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      session_id: state.session_id,
      inventory: state.inventory,
      flags: state.flags,
      visitedLocations: Array.from(state.visitedLocations)
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        state.session_id = parsed.session_id || '';
        state.inventory = parsed.inventory || [];
        state.flags = Object.assign({ chapter: 1, location: 'Начало пути', game_started: false, money: 0, health: 100, premium: false, hints: 0 }, parsed.flags || {});
        state.visitedLocations = new Set(parsed.visitedLocations || []);
      } catch (e) {
        console.error(e);
      }
    }
    if (savedHistory) {
      try {
        state.history = JSON.parse(savedHistory);
      } catch (e) {
        state.history = [];
      }
    }
    els.continueBtn.disabled = !state.session_id || !state.flags.game_started;
  }

  function resetGame() {
    state.session_id = '';
    state.inventory = [];
    state.flags = { chapter: 1, location: 'Начало пути', game_started: false, money: 0, health: 100, premium: false, hints: 0 };
    state.history = [];
    state.quota = null;
    state.visitedLocations.clear();
    state.lastDuelCorrectIndex = undefined;
    state.lastDuelInsult = undefined;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    els.continueBtn.disabled = true;
    hidePanels();
    showScreen('start');
  }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
    els.menu.classList.add('hidden');
    if (name === 'game') {
      els.bottomNav.classList.remove('hidden');
    } else {
      els.bottomNav.classList.add('hidden');
    }
  }

  function hidePanels() {
    els.inventoryPanel.classList.add('hidden');
    els.mapPanel.classList.add('hidden');
    els.historyPanel.classList.add('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    setTimeout(() => els.toast.classList.add('hidden'), 4000);
  }

  function setLoading(isLoading) {
    if (isLoading) {
      els.loader.classList.remove('hidden');
      els.sceneImage.classList.add('hidden');
      els.sceneImage.classList.remove('visible');
    } else {
      els.loader.classList.add('hidden');
    }
  }

  function formatMoneyPrice(kopecks) {
    return (kopecks / 100).toFixed(0) + ' ₽';
  }

  function renderStats() {
    const money = state.flags.money || 0;
    const health = state.flags.health || 100;
    els.moneyStat.textContent = `💰 ${money}`;
    els.healthStat.textContent = `❤️ ${health}/100`;
    if (state.quota) {
      const rem = state.quota.total_remaining >= 900000 ? '∞' : state.quota.total_remaining;
      els.quotaStat.textContent = `🎫 ${rem}`;
    }
    els.statsBar.classList.remove('hidden');
  }

  function renderInventory() {
    els.inventoryList.innerHTML = '';
    if (state.inventory.length === 0) {
      els.inventoryList.innerHTML = '<li>пусто</li>';
    } else {
      state.inventory.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        els.inventoryList.appendChild(li);
      });
    }
  }

  function renderHistory() {
    els.historyList.innerHTML = '';
    if (state.history.length === 0) {
      els.historyList.innerHTML = '<li>История пуста</li>';
      return;
    }
    state.history.slice(-20).reverse().forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.location}: ${entry.action}`;
      els.historyList.appendChild(li);
    });
    els.historyPanel.classList.remove('hidden');
  }

  function renderMap() {
    els.mapList.innerHTML = '';
    const current = state.flags.location || 'Начало пути';
    LOCATIONS.forEach(loc => {
      const li = document.createElement('li');
      li.textContent = loc.name;
      if (state.visitedLocations.has(loc.name) || loc.name === current) li.classList.add('visited');
      if (loc.name === current) li.classList.add('current');
      els.mapList.appendChild(li);
    });
  }

  function renderChoices(choices, isDuel) {
    els.choices.innerHTML = '';
    if (!choices || choices.length === 0) {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerHTML = '<span class="num">1.</span> Начать заново';
      btn.onclick = () => startNewGame();
      els.choices.appendChild(btn);
      return;
    }
    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.style.animationDelay = `${index * 0.08}s`;
      const num = index + 1;
      const text = String(choice).replace(/^\d+\.\s*/, '');
      btn.innerHTML = `<span class="num">${num}.</span> ${escapeHtml(text)}`;
      btn.onclick = () => {
        playSfx('click');
        if (isDuel) {
          handleDuelChoice(index, text);
        } else {
          makeChoice(text);
        }
      };
      els.choices.appendChild(btn);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function handleDuelChoice(index, text) {
    const correctIndex = state.lastDuelCorrectIndex;
    const won = correctIndex !== undefined && index === correctIndex;
    state.flags.duel_won = won;
    state.flags.duel_answer = text;
    if (won) {
      playSfx('win');
      showToast('Отличный ответ!');
    } else {
      playSfx('lose');
      showToast('Промах!');
    }
    state.lastDuelCorrectIndex = undefined;
    state.lastDuelInsult = undefined;
    els.duelPanel.classList.add('hidden');
    callApi(`Ответить: ${text}`);
  }

  // Typing effect
  function typeText(element, text, speed) {
    if (state.typingInterval) {
      clearInterval(state.typingInterval);
      state.typingInterval = null;
    }
    stopTTS();
    element.textContent = '';
    element.classList.remove('typing');
    void element.offsetWidth; // reflow
    element.classList.add('typing', 'visible');
    let i = 0;
    const ms = speed || settings.typingSpeed;
    state.typingInterval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(state.typingInterval);
        state.typingInterval = null;
        element.classList.remove('typing');
        return;
      }
      const ch = text.charAt(i);
      element.textContent += ch;
      if (ch !== ' ' && ch !== '\n') playSfx('type');
      i++;
    }, ms);
  }

  async function callApi(action, retryCount = 1) {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: state.session_id,
          action: action,
          inventory: state.inventory,
          flags: state.flags,
          language: 'ru'
        })
      });
      if (response.status === 402) {
        const err = await response.json().catch(() => ({}));
        state.quota = err.detail?.quota || null;
        renderStats();
        openPurchaseModal(err.detail?.message || 'Лимит бесплатных сцен исчерпан.');
        setLoading(false);
        return;
      }
      if (response.status === 503 && retryCount > 0) {
        showToast('AI-модель перегружена, повторная попытка...');
        await new Promise(r => setTimeout(r, 2000));
        return callApi(action, retryCount - 1);
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Ошибка сервера: ${response.status}. ${errText.slice(0, 120)}`);
      }
      const data = await response.json();
      applyScene(data, action);
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить сцену. Проверьте соединение или подождите немного.');
      setLoading(false);
    }
  }

  function applyScene(data, action) {
    state.session_id = data.session_id || data.scene_id || state.session_id;
    state.flags.location = data.location || state.flags.location;
    state.flags.game_started = true;
    state.visitedLocations.add(state.flags.location);
    state.quota = data.quota || null;

    if (data.inventory_update && data.inventory_update.length) {
      data.inventory_update.forEach(item => {
        if (!state.inventory.includes(item)) {
          state.inventory.push(item);
        }
      });
    }
    if (data.flags_update) {
      Object.assign(state.flags, data.flags_update);
    }
    delete state.flags.duel_won;
    delete state.flags.duel_answer;

    state.history.push({ location: state.flags.location, action: action });

    els.locationBar.textContent = state.flags.location;

    els.sceneText.classList.remove('visible');
    if (data.scene_text) {
      typeText(els.sceneText, data.scene_text, settings.typingSpeed);
    } else {
      els.sceneText.textContent = '';
      els.sceneText.classList.add('visible');
    }

    if (data.image_url) {
      els.sceneImage.classList.add('hidden');
      els.sceneImage.classList.remove('visible');
      els.sceneImage.src = data.image_url;
      els.sceneImage.onload = () => {
        els.sceneImage.classList.remove('hidden');
        void els.sceneImage.offsetWidth;
        els.sceneImage.classList.add('visible');
        // Restart Ken Burns pan for every new scene
        els.sceneImage.style.animation = 'none';
        void els.sceneImage.offsetWidth;
        els.sceneImage.style.animation = '';
        setLoading(false);
      };
      els.sceneImage.onerror = () => {
        els.sceneImage.classList.add('hidden');
        els.sceneImage.classList.remove('visible');
        setLoading(false);
      };
    } else {
      setLoading(false);
    }

    sceneCount++;
    if (data.image_type) {
      const oddClass = sceneCount % 2 === 1 ? 'odd' : '';
      els.sceneImageContainer.className = `scene-image-container ${data.image_type} ${oddClass}`.trim();
    }

    if (data.duel_choices && data.duel_choices.length > 0) {
      state.lastDuelCorrectIndex = data.duel_correct_index;
      state.lastDuelInsult = data.duel_insult;
      els.duelInsult.textContent = data.duel_insult || 'Тебе бросили вызов!';
      els.duelPanel.classList.remove('hidden');
      renderChoices(data.duel_choices, true);
    } else {
      els.duelPanel.classList.add('hidden');
      renderChoices(data.choices, false);
    }

    renderStats();
    renderInventory();
    renderMap();
    saveState();
    renderHistory();
    showScreen('game');

    // Autoplay server-generated narration immediately while text types
    if (settings.autoplay && settings.ttsEnabled) {
      if (data.audio_url) {
        playSceneAudio(data.audio_url);
      } else if (data.scene_text) {
        speak(data.scene_text);
      }
    }
  }

  function startNewGame() {
    resetGame();
    enableAudioByDefault();
    callApi('начать игру');
  }

  function makeChoice(action) {
    callApi(action);
  }

  function handleCommand() {
    const text = els.commandInput.value.trim();
    if (!text) return;
    playSfx('click');
    if (/^\d+$/.test(text)) {
      const num = parseInt(text, 10);
      const buttons = els.choices.querySelectorAll('.choice-btn');
      if (buttons[num - 1]) {
        buttons[num - 1].click();
        els.commandInput.value = '';
        return;
      }
    }
    callApi(text);
    els.commandInput.value = '';
  }

  // Particles overlay
  function initParticles() {
    const canvas = els.particlesCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function createParticle() {
      const colors = ['#c9a227', '#f3e9d2', '#e8dcc0', '#b08d2b', '#8fa8a8'];
      return {
        x: Math.random() * width,
        y: height + Math.random() * 60,
        size: 0.8 + Math.random() * 3.2,
        speedY: 0.4 + Math.random() * 1.0,
        speedX: (Math.random() - 0.5) * 0.7,
        opacity: 0.2 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0
      };
    }

    for (let i = 0; i < 70; i++) particles.push(createParticle());

    function animate() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, i) => {
        p.y -= p.speedY;
        p.x += p.speedX + Math.sin(p.life * 0.02) * 0.2;
        p.life++;
        ctx.globalAlpha = p.opacity * (1 - p.life / 1200);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.y < -10 || p.life > 1200) {
          particles[i] = createParticle();
        }
      });
      requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener('resize', resize);
    animate();
  }

  // Share
  async function shareScene() {
    try {
      const text = els.sceneText.textContent.trim();
      const imageUrl = els.sceneImage.src;
      if (!text && !imageUrl) {
        showToast('Поделиться можно после генерации сцены.');
        return;
      }
      playSfx('click');
      const canvas = els.shareCanvas;
      const ctx = canvas.getContext('2d');
      canvas.width = 1080;
      canvas.height = 1920;

      ctx.fillStyle = '#0f0c08';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawImage = () => new Promise(resolve => {
        if (!imageUrl) { resolve(); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 1080, 720);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = imageUrl;
      });

      const drawQr = () => new Promise(resolve => {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 860, 1620, 180, 180);
          resolve();
        };
        qrImg.onerror = () => resolve();
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://zubcoder-games.ru')}`;
      });

      await drawImage();

      // Overlay
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, 'rgba(15,12,8,0.2)');
      grad.addColorStop(0.5, 'rgba(15,12,8,0.75)');
      grad.addColorStop(1, 'rgba(15,12,8,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      ctx.fillStyle = '#c9a227';
      ctx.font = 'bold 52px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Тайна Золотой Орды', 540, 840);

      ctx.fillStyle = '#f3e9d2';
      ctx.font = '36px Georgia, serif';
      ctx.textAlign = 'left';
      const words = text.split(' ');
      let line = '';
      let y = 940;
      words.forEach(word => {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 920 && line) {
          ctx.fillText(line, 80, y);
          line = word + ' ';
          y += 52;
        } else {
          line = testLine;
        }
      });
      ctx.fillText(line, 80, y);

      ctx.fillStyle = '#a89b85';
      ctx.font = '28px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('zubcoder-games.ru', 80, 1780);

      await drawQr();

      canvas.toBlob(async blob => {
        const file = new File([blob], 'tayna-zolotoy-ordy.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Тайна Золотой Орды',
              text: text.slice(0, 120) + '...',
              files: [file]
            });
            return;
          } catch (e) {}
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tayna-zolotoy-ordy.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Карточка сохранена.');
      });
    } catch (err) {
      console.error('share error', err);
      showToast('Не удалось создать карточку.');
    }
  }

  // Purchase
  async function fetchProducts() {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (res.ok) {
        const data = await res.json();
        state.products = data.products || [];
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openPurchaseModal(message) {
    els.purchaseMessage.textContent = message || 'Бесплатно доступно 20 сцен. После — выбери удобный вариант.';
    renderPurchaseList();
    els.purchaseModal.classList.remove('hidden');
  }

  function closePurchaseModal() {
    els.purchaseModal.classList.add('hidden');
  }

  function renderPurchaseList() {
    els.purchaseList.innerHTML = '';
    state.products.forEach(p => {
      const item = document.createElement('div');
      item.className = 'purchase-item';
      item.innerHTML = `
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="desc">${escapeHtml(p.description)}</div>
        <div class="price">${formatMoneyPrice(p.price)}</div>
      `;
      const btn = document.createElement('button');
      btn.className = 'buy-btn';
      btn.textContent = 'Купить (заглушка)';
      btn.onclick = () => buyProduct(p.product_id);
      item.appendChild(btn);
      els.purchaseList.appendChild(item);
    });
  }

  async function buyProduct(productId) {
    if (!state.session_id) {
      showToast('Начните игру, чтобы активировать покупку.');
      return;
    }
    playSfx('click');
    try {
      const res = await fetch(`${API_BASE}/api/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.session_id, product_id: productId, provider: 'stub', receipt: 'test' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.quota = data.quota;
        if (data.granted_flags) {
          Object.keys(data.granted_flags).forEach(k => {
            if (k === 'health') {
              state.flags.health = (state.flags.health || 0) + data.granted_flags[k];
            } else if (k === 'money') {
              state.flags.money = (state.flags.money || 0) + data.granted_flags[k];
            } else {
              state.flags[k] = (state.flags[k] || 0) + data.granted_flags[k];
            }
          });
        }
        saveState();
        renderStats();
        playSfx('purchase');
        showToast(data.message);
        closePurchaseModal();
      } else {
        showToast(data.detail || 'Ошибка покупки.');
      }
    } catch (e) {
      console.error(e);
      showToast('Ошибка соединения при покупке.');
    }
  }

  // Parallax
  function updateParallax(e) {
    if (!els.parallaxBg) return;
    const x = e ? (e.clientX / window.innerWidth - 0.5) * 2 : 0;
    const y = e ? (e.clientY / window.innerHeight - 0.5) * 2 : 0;
    els.parallaxBg.style.transform = `scale(1.1) translate(${-x * 12}px, ${-y * 8}px)`;
  }

  function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const active = document.getElementById(id);
    if (active) active.classList.add('active');
  }

  function togglePanel(name, navId) {
    const target = document.getElementById(name);
    const isHidden = target.classList.contains('hidden');
    hidePanels();
    if (isHidden) {
      target.classList.remove('hidden');
      setActiveNav(navId);
    } else {
      setActiveNav('nav-command');
    }
  }

  function init() {
    loadSettings();
    loadState();
    fetchProducts();
    initParticles();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(console.error);
    }

    els.startBtn.addEventListener('click', () => {
      startNewGame();
    });

    els.continueBtn.addEventListener('click', () => {
      enableAudioByDefault();
      if (state.session_id) {
        showScreen('game');
        renderStats();
        renderInventory();
        renderMap();
        renderHistory();
      }
    });

    els.menuBtn.addEventListener('click', () => {
      els.menu.classList.toggle('hidden');
    });

    els.resetBtn.addEventListener('click', resetGame);

    els.menuItems.forEach(item => {
      item.addEventListener('click', () => {
        showScreen(item.dataset.target.replace('-screen', ''));
      });
    });

    els.backBtns.forEach(btn => {
      btn.addEventListener('click', () => showScreen('start'));
    });

    els.commandBtn.addEventListener('click', handleCommand);
    els.commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleCommand();
    });

    els.audioBtn.addEventListener('click', toggleAudio);
    els.ttsBtn.addEventListener('click', toggleTTS);
    els.shareBtn.addEventListener('click', shareScene);
    els.purchaseStubBtn.addEventListener('click', () => openPurchaseModal());
    els.closePurchase.addEventListener('click', closePurchaseModal);

    document.getElementById('nav-command').addEventListener('click', () => {
      hidePanels();
      els.commandInput.focus();
    });
    document.getElementById('nav-inventory').addEventListener('click', () => togglePanel('inventory-panel', 'nav-inventory'));
    document.getElementById('nav-map').addEventListener('click', () => togglePanel('map-panel', 'nav-map'));
    document.getElementById('nav-menu').addEventListener('click', () => {
      hidePanels();
      showScreen('about');
    });

    document.addEventListener('keydown', (e) => {
      if (screens.game.classList.contains('hidden')) return;
      if (document.activeElement === els.commandInput) return;
      const key = parseInt(e.key, 10);
      if (key >= 1 && key <= 5) {
        const buttons = els.choices.querySelectorAll('.choice-btn');
        if (buttons[key - 1]) buttons[key - 1].click();
      }
      if (e.key === 'Enter') {
        els.commandInput.focus();
      }
    });

    document.addEventListener('mousemove', updateParallax);
    document.addEventListener('touchmove', (e) => {
      if (e.touches[0]) updateParallax(e.touches[0]);
    }, { passive: true });

    window.speechSynthesis.onvoiceschanged = () => {};
  }

  init();
})();
