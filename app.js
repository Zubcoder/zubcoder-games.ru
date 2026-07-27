(() => {
  'use strict';

  const API_BASE = window.API_BASE || (window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://zubcoder-games-tyna.fly.dev');
  const STORAGE_KEY = 'taynaZolotoyOrdyState';
  const HISTORY_KEY = 'taynaZolotoyOrdyHistory';

  const state = {
    session_id: '',
    inventory: [],
    flags: {
      chapter: 1,
      location: 'Начало пути',
      game_started: false,
      money: 0,
      health: 100
    },
    history: []
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
    commandInput: document.getElementById('command-input'),
    commandBtn: document.getElementById('command-btn'),
    duelPanel: document.getElementById('duel-panel'),
    duelInsult: document.getElementById('duel-insult'),
    musicBox: document.getElementById('music-box'),
    musicLink: document.getElementById('music-link')
  };

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      session_id: state.session_id,
      inventory: state.inventory,
      flags: state.flags
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
        state.flags = parsed.flags || { chapter: 1, location: 'Начало пути', game_started: false, money: 0, health: 100 };
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
    state.flags = { chapter: 1, location: 'Начало пути', game_started: false, money: 0, health: 100 };
    state.history = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    els.continueBtn.disabled = true;
    showScreen('start');
  }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
    els.menu.classList.add('hidden');
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
    } else {
      els.loader.classList.add('hidden');
    }
  }

  function renderStats() {
    const money = state.flags.money || 0;
    const health = state.flags.health || 100;
    els.moneyStat.textContent = `💰 ${money}`;
    els.healthStat.textContent = `❤️ ${health}/100`;
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
      const num = index + 1;
      const text = String(choice).replace(/^\d+\.\s*/, '');
      btn.innerHTML = `<span class="num">${num}.</span> ${escapeHtml(text)}`;
      btn.onclick = () => {
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
      showToast('Отличный ответ!');
    } else {
      showToast('Промах!');
    }
    state.lastDuelCorrectIndex = undefined;
    state.lastDuelInsult = undefined;
    els.duelPanel.classList.add('hidden');
    callApi(`Ответить: ${text}`);
  }

  async function callApi(action) {
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
      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }
      const data = await response.json();
      applyScene(data, action);
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить сцену. Проверьте соединение.');
      setLoading(false);
    }
  }

  function applyScene(data, action) {
    state.session_id = data.scene_id || state.session_id;
    state.flags.location = data.location || state.flags.location;
    state.flags.game_started = true;

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
    els.sceneText.textContent = data.scene_text;

    if (data.image_url) {
      els.sceneImage.src = data.image_url;
      els.sceneImage.onload = () => {
        els.sceneImage.classList.remove('hidden');
        setLoading(false);
      };
      els.sceneImage.onerror = () => {
        els.sceneImage.classList.add('hidden');
        setLoading(false);
      };
    } else {
      setLoading(false);
    }

    if (data.image_type) {
      els.sceneImageContainer.className = `scene-image-container ${data.image_type}`;
    }

    if (data.music_url) {
      els.musicLink.href = data.music_url;
      els.musicBox.classList.remove('hidden');
    } else {
      els.musicBox.classList.add('hidden');
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
    saveState();
    renderHistory();
    showScreen('game');
  }

  function startNewGame() {
    resetGame();
    const startAction = 'начать игру';
    callApi(startAction);
  }

  function makeChoice(action) {
    callApi(action);
  }

  function handleCommand() {
    const text = els.commandInput.value.trim();
    if (!text) return;
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

  function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(console.error);
    }

    loadState();

    els.startBtn.addEventListener('click', startNewGame);
    els.continueBtn.addEventListener('click', () => {
      if (state.session_id) {
        showScreen('game');
        renderStats();
        renderInventory();
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

    els.inventoryToggle.addEventListener('click', () => {
      els.inventoryPanel.classList.toggle('hidden');
    });

    els.commandBtn.addEventListener('click', handleCommand);
    els.commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleCommand();
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
  }

  init();
})();
