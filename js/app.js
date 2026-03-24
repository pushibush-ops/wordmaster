// 页面路由
const PAGES = {
  HOME: 'home',
  STUDY: 'study',
  WORDLISTS: 'wordlists',
  SETTINGS: 'settings',
  ADD_WORD: 'add-word'
};

let currentPage = PAGES.HOME;
let currentWordList = null;
let studyQueue = [];
let currentIndex = 0;
let answeredCount = 0; // 实际已回答的单词数（不包括重新加入的）
let initialQueueLength = 0; // 初始队列长度，用于显示分母
let isReviewMode = false; // 是否是复习模式

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('SW registered'))
    .catch(err => console.log('SW registration failed:', err));
}

// 初始化音频上下文（解决移动端自动播放限制）
let audioInitialized = false;
function initAudio() {
  if (audioInitialized) return;

  // 预加载语音
  speechSynthesis.getVoices();
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.addEventListener('voiceschanged', () => {
      console.log('Voices loaded:', speechSynthesis.getVoices().length);
    });
  }

  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  speechSynthesis.speak(utterance);
  audioInitialized = true;
}

// 页面点击时初始化音频
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });

// 路由函数
function navigate(page) {
  currentPage = page;
  render();
}

// 主渲染函数
function render() {
  const app = document.getElementById('app');

  switch (currentPage) {
    case PAGES.HOME:
      renderHome(app);
      break;
    case PAGES.STUDY:
      renderStudy(app);
      break;
    case PAGES.WORDLISTS:
      renderWordlists(app);
      break;
    case PAGES.SETTINGS:
      renderSettings(app);
      break;
    case PAGES.ADD_WORD:
      renderAddWord(app);
      break;
  }
}

// 主页
async function renderHome(container) {
  isReviewMode = false; // 重置复习模式

  // 检查并更新每日饥饿值
  await checkDailyHunger();
  const pet = await getPet();

  // 迁移旧数据（添加新字段）
  if (pet && pet.type && pet.favorability === undefined) {
    pet.favorability = 0;
    pet.lastInteractDate = null;
    pet.unlockedActions = ['stretch', 'tail', 'sleep'];
    pet.lastCheckInDate = null;
    pet.checkInDays = 0;
    await db.put(STORE_PET, pet);
  }

  // 检查是否已领养宠物
  if (pet && !pet.adopted) {
    renderPetSelect(container);
    return;
  }

  const stats = await getStudyStats();

  container.innerHTML = `
    <div class="container">
      <h1 class="title">单词小助手</h1>

      ${pet && pet.type ? `
        <div class="pet-bar" onclick="togglePetPanel()">
          <div class="pet-emoji">${PET_TYPES.find(p => p.type === pet.type)?.emoji || '🐱'} ${pet.name}</div>
          <div class="pet-hunger-bar">
            <div class="pet-hunger-fill" style="width: ${pet.hunger}%"></div>
          </div>
          <div class="pet-hunger-text">${getPetMood(pet.hunger)} ${pet.hunger}%</div>
        </div>
        <div class="pet-panel hidden" id="petPanel"></div>
      ` : ''}

      <div class="stats-card">
        <div class="stat-item">
          <span class="stat-value">${stats.pendingReview}</span>
          <span class="stat-label">待复习</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.todayReviewed}</span>
          <span class="stat-label">今日已复习</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.todayLearned}</span>
          <span class="stat-label">今日已学</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.streak}</span>
          <span class="stat-label">连续天数</span>
        </div>
      </div>

      <button class="btn btn-primary btn-large" onclick="startStudy()">
        开始学习
      </button>

      <button class="btn btn-secondary btn-large" onclick="startReview()">
        复习
      </button>

      <div class="nav-links">
        <button class="nav-btn" onclick="navigate('${PAGES.WORDLISTS}')">
          📚 词库管理
        </button>
        <button class="nav-btn" onclick="navigate('${PAGES.SETTINGS}')">
          ⚙️ 设置
        </button>
      </div>
    </div>
  `;

  // 绑定宠物图标点击事件 - 点击宠物触发动作
  document.querySelector('.pet-emoji').onclick = async function() {
    // 面板展开后再触发动作
    setTimeout(async () => {
      const panel = document.querySelector('.pet-panel');
      if (panel && !panel.classList.contains('hidden')) {
        const action = await triggerPetAction();
        if (action) {
          const result = await addFavorability(2);
          showPetDialogue(await getPetDialogue());
          showActionAnimation(action.emoji);

          // 如果解锁了新动作，显示提示
          if (result.unlocked && result.newActions.length > 0) {
            showPetDialogue('我又学会新动作啦！🎉 ' + result.newActions.map(a => a.emoji).join(' '));
          }
        }
      }
    }, 100);
  };
}

// 获取学习统计
async function getStudyStats() {
  const records = await db.getAll(STORE_RECORDS);
  const today = new Date().toDateString();

  // 待复习：所有需要复习的单词数量（不限于今天）
  const pendingReview = records.filter(r =>
    new Date(r.nextReview).toDateString() <= today
  ).length;

  // 今日已复习（从 localStorage 读取实时进度）
  const todayReviewedKey = `todayReviewed_${today}`;
  let todayReviewed = parseInt(localStorage.getItem(todayReviewedKey)) || 0;

  // 今日新学（第一次学习的）
  const todayLearned = records.filter(r =>
    r.lastReview && new Date(r.lastReview).toDateString() === today && r.reviewCount === 1
  ).length;

  return {
    pendingReview,
    todayReviewed,
    todayLearned,
    streak: 1,
    total: records.length
  };
}

// 开始学习
async function startStudy() {
  const settings = await db.get(STORE_SETTINGS, 'daily') || { newWords: 10 };

  // 只获取新词
  const newWords = await getNewWords(settings.newWords);

  studyQueue = newWords;
  currentIndex = 0;
  answeredCount = 0;
  initialQueueLength = studyQueue.length;

  if (studyQueue.length === 0) {
    alert('今天的学习任务已完成！');
    return;
  }

  // 播放一个静音音频以启用自动播放（移动端兼容）
  const dummy = new SpeechSynthesisUtterance(' ');
  dummy.volume = 0;
  speechSynthesis.speak(dummy);

  navigate(PAGES.STUDY);
  render();
}

// 开始复习
async function startReview() {
  // 只获取复习单词
  const reviewWords = await getTodayReviewWords();

  // 初始化今日已复习计数
  const today = new Date().toDateString();
  const todayReviewedKey = `todayReviewed_${today}`;
  // 从数据库获取今天已复习的数量（根据数据库实时计算）
  const records = await db.getAll(STORE_RECORDS);
  const reviewed = records.filter(r =>
    r.lastReview && new Date(r.lastReview).toDateString() === today &&
    r.nextReview && new Date(r.nextReview).toDateString() <= today
  ).length;
  localStorage.setItem(todayReviewedKey, reviewed);

  if (reviewWords.length === 0) {
    alert('今天没有需要复习的单词！');
    return;
  }

  studyQueue = reviewWords;
  currentIndex = 0;
  answeredCount = 0;
  initialQueueLength = studyQueue.length;
  isReviewMode = true;

  // 播放一个静音音频以启用自动播放（移动端兼容）
  const dummy = new SpeechSynthesisUtterance(' ');
  dummy.volume = 0;
  speechSynthesis.speak(dummy);

  navigate(PAGES.STUDY);
  render();
}

// 学习页面
function renderStudy(container) {
  if (currentIndex >= studyQueue.length) {
    container.innerHTML = `
      <div class="container">
        <div class="study-complete">
          <h2>🎉 ${isReviewMode ? '复习' : '学习'}完成！</h2>
          <p>${isReviewMode ? '今日复习' : '今日学习'}: ${initialQueueLength} 个单词</p>
          <button class="btn btn-primary" onclick="navigate('${PAGES.HOME}')">
            返回主页
          </button>
        </div>
      </div>
    `;
    return;
  }

  const word = studyQueue[currentIndex];
  const progress = `${answeredCount + 1}/${initialQueueLength}`;

  container.innerHTML = `
    <div class="container">
      <div class="study-header">
        <button class="back-btn" onclick="navigate('${PAGES.HOME}')">← 返回</button>
        <span class="progress">${progress}</span>
      </div>

      <div class="word-card">
        <button class="speak-btn" onclick="speakWord('${word.word}')">🔊</button>
        <div class="word-text">${word.word}</div>
        <div class="word-phonetic">${word.phonetic || ''}</div>
      </div>

      <div class="answer-section hidden" id="answerSection">
        <div class="word-definition">${word.definition}</div>
        <div class="examples-section">
          ${word.examples ? word.examples.slice(0, 1).map((ex) => `
            <div class="example-item">
              <div class="example-en">${ex.en}</div>
              <div class="example-cn">${ex.cn}</div>
            </div>
          `).join('') : ''}
        </div>
      </div>

      <div class="action-buttons">
        <button class="btn btn-primary" id="showAnswerBtn" onclick="showAnswer()">
          显示答案
        </button>

        <div class="result-buttons hidden" id="resultButtons">
          <button class="btn btn-error" onclick="answerWord(false)">
            不认识
          </button>
          <button class="btn btn-success" onclick="answerWord(true)">
            认识
          </button>
        </div>
      </div>
    </div>
  `;

  // 自动发音
  setTimeout(() => speakWord(word.word), 500);
}

// 显示答案
function showAnswer() {
  document.getElementById('answerSection').classList.remove('hidden');
  document.getElementById('showAnswerBtn').classList.add('hidden');
  document.getElementById('resultButtons').classList.remove('hidden');

  // 自动朗读例句
  const word = studyQueue[currentIndex];
  if (word.examples && word.examples.length > 0) {
    setTimeout(() => speakWord(word.examples[0].en), 800);
  }
}

// 回答单词
async function answerWord(isCorrect) {
  const word = studyQueue[currentIndex];

  if (isCorrect) {
    // 复习模式：一次认识就计入已背
    if (isReviewMode) {
      const result = calculateNextReview(word.level || 0, true);

      await db.put(STORE_RECORDS, {
        wordId: word.wordId,
        word: word.word,
        definition: word.definition,
        phonetic: word.phonetic,
        lastReview: new Date().toISOString(),
        nextReview: result.nextReview.toISOString(),
        level: result.level,
        reviewCount: (word.reviewCount || 0) + 1
      });

      await addCoins();
      answeredCount++;

      // 更新今日已复习的实时进度
      const today = new Date().toDateString();
      const todayReviewedKey = `todayReviewed_${today}`;
      const currentReviewed = parseInt(localStorage.getItem(todayReviewedKey)) || 0;
      localStorage.setItem(todayReviewedKey, currentReviewed + 1);
      const favResult = await addFavorability(1);
      if (favResult.unlocked && favResult.newActions.length > 0) {
        showPetDialogue('我又学会新动作啦！🎉 ' + favResult.newActions.map(a => a.emoji).join(' '));
      }
    } else {
      // 学习模式：需要两次认识才计入已背
      if (word.seenOnce) {
        // 第二次认识：算真正背会
        const result = calculateNextReview(word.level || 0, true);

        await db.put(STORE_RECORDS, {
          wordId: word.wordId,
          word: word.word,
          definition: word.definition,
          phonetic: word.phonetic,
          lastReview: new Date().toISOString(),
          nextReview: result.nextReview.toISOString(),
          level: result.level,
          reviewCount: (word.reviewCount || 0) + 1
        });

        await addCoins();
        answeredCount++;
        const favResult = await addFavorability(1);
        if (favResult.unlocked && favResult.newActions.length > 0) {
          showPetDialogue('我又学会新动作啦！🎉 ' + favResult.newActions.map(a => a.emoji).join(' '));
        }
      } else {
        // 第一次认识：标记需要再次复习，放入队列末尾
        word.seenOnce = true;
        studyQueue.push(word);
      }
    }
  } else {
    // 不认识：将单词重新插入队列末尾
    studyQueue.push(word);
  }

  currentIndex++;
  render();
}

// 发音 - 使用 ResponsiveVoice (在线更自然) 或系统语音
function speakWord(text) {
  // 停止当前播放
  speechSynthesis.cancel();

  // 使用 ResponsiveVoice (免费在线语音)
  if (window.responsivevoice) {
    responsivevoice.speak(text, "US English Male", { rate: 0.9 });
  } else if (navigator.onLine) {
    // 动态加载 ResponsiveVoice
    loadResponsiveVoice();
    playSystemTTS(text);
  } else {
    playSystemTTS(text);
  }
}

function loadResponsiveVoice() {
  if (window.responsivevoice) return;
  const script = document.createElement('script');
  script.src = 'https://code.responsivevoice.org/responsivevoice.js';
  document.head.appendChild(script);
}

// 系统 TTS (离线备用)
function playSystemTTS(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.8;
  utterance.pitch = 1.0;

  const voices = speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Male'))
    || voices.find(v => v.lang.includes('en-US'));

  if (preferredVoice) utterance.voice = preferredVoice;
  speechSynthesis.speak(utterance);
}

// 词库管理页面
async function renderWordlists(container) {
  const wordlists = await db.getAll(STORE_WORDS);

  let listsHtml = wordlists.map(list => `
    <div class="wordlist-item ${list.isActive ? 'active' : ''}" onclick="selectWordlist('${list.id}')">
      <div class="wordlist-info">
        <span class="wordlist-name">${list.name}</span>
        <span class="wordlist-count">${list.words.length} 个单词</span>
      </div>
      ${list.isActive ? '<span class="active-tag">✓ 已启用</span>' : ''}
    </div>
  `).join('');

  container.innerHTML = `
    <div class="container">
      <div class="page-header">
        <button class="back-btn" onclick="navigate('${PAGES.HOME}')">← 返回</button>
        <h2>词库管理</h2>
      </div>

      <div class="wordlist-section">
        <h3>我的词库</h3>
        <div class="wordlist-list">
          ${listsHtml}
        </div>
      </div>

      <div class="action-buttons">
        <button class="btn btn-primary" onclick="navigate('${PAGES.ADD_WORD}')">
          + 添加自定义单词
        </button>
        <button class="btn" onclick="importWordlist()">
          📥 导入词库
        </button>
      </div>

      <input type="file" id="importFile" accept=".json" style="display:none" onchange="handleImport(event)">
    </div>
  `;
}

// 选择词库
async function selectWordlist(id) {
  const wordlists = await db.getAll(STORE_WORDS);

  for (const list of wordlists) {
    await db.put(STORE_WORDS, {
      ...list,
      isActive: list.id === id
    });
  }

  render();
}

// 添加自定义单词页面
async function renderAddWord(container) {
  container.innerHTML = `
    <div class="container">
      <div class="page-header">
        <button class="back-btn" onclick="navigate('${PAGES.WORDLISTS}')">← 返回</button>
        <h2>添加单词</h2>
      </div>

      <div class="form-group">
        <label>单词</label>
        <input type="text" id="newWord" placeholder="例如: hello">
      </div>
      <div class="form-group">
        <label>释义</label>
        <input type="text" id="newDefinition" placeholder="例如: 你好">
      </div>
      <div class="form-group">
        <label>音标 (可选)</label>
        <input type="text" id="newPhonetic" placeholder="例如: /həˈloʊ/">
      </div>

      <button class="btn btn-primary btn-large" onclick="saveNewWord()">
        保存
      </button>
    </div>
  `;
}

// 保存新单词
async function saveNewWord() {
  const word = document.getElementById('newWord').value.trim();
  const definition = document.getElementById('newDefinition').value.trim();
  const phonetic = document.getElementById('newPhonetic').value.trim();

  if (!word || !definition) {
    alert('请填写单词和释义');
    return;
  }

  // 获取或创建自定义词库
  let customList = await db.get(STORE_WORDS, 'custom');
  if (!customList) {
    customList = { id: 'custom', name: '我的词库', isActive: true, words: [] };
  }

  customList.words.push({ word, definition, phonetic });
  await db.put(STORE_WORDS, customList);

  alert('单词添加成功！');
  navigate(PAGES.WORDLISTS);
}

// 导入词库
function importWordlist() {
  document.getElementById('importFile').click();
}

// 处理导入
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.id || !data.name || !Array.isArray(data.words)) {
      throw new Error('词库格式错误');
    }

    await db.put(STORE_WORDS, data);
    alert('词库导入成功！');
    render();
  } catch (e) {
    alert('导入失败: ' + e.message);
  }

  event.target.value = '';
}

// 设置页面
async function renderSettings(container) {
  const settings = await db.get(STORE_SETTINGS, 'daily') || { newWords: 10, reviewLimit: 50 };

  container.innerHTML = `
    <div class="container">
      <div class="page-header">
        <button class="back-btn" onclick="navigate('${PAGES.HOME}')">← 返回</button>
        <h2>设置</h2>
      </div>

      <div class="settings-section">
        <h3>学习设置</h3>

        <div class="setting-item">
          <label>每日新词数量</label>
          <input type="number" id="newWordsSetting" value="${settings.newWords}" min="1" max="50">
        </div>

      </div>

      <div class="settings-section">
        <h3>数据</h3>
        <button class="btn btn-full" onclick="exportData()">
          📤 导出词库和学习记录
        </button>
        <button class="btn btn-full btn-error" onclick="resetProgress()">
          🔄 重置学习进度
        </button>
      </div>

      <div class="settings-section">
        <h3>关于</h3>
        <p class="about-text">单词小助手 v1.0.0</p>
        <p class="about-text">将旧手机变成学习机</p>
      </div>

      <button class="btn btn-primary btn-large" onclick="saveSettings()">
        保存设置
      </button>
    </div>
  `;
}

// 保存设置
async function saveSettings() {
  const newWords = parseInt(document.getElementById('newWordsSetting').value);

  await db.put(STORE_SETTINGS, {
    key: 'daily',
    newWords
  });

  alert('设置已保存！');
  navigate(PAGES.HOME);
}

// 导出数据
async function exportData() {
  const wordlists = await db.getAll(STORE_WORDS);
  const records = await db.getAll(STORE_RECORDS);

  const exportData = {
    wordlists,
    records,
    exportTime: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `wordmaster-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// 重置进度
async function resetProgress() {
  if (!confirm('确定要重置所有学习进度吗？此操作不可恢复。')) {
    return;
  }

  const records = await db.getAll(STORE_RECORDS);
  for (const record of records) {
    await db.delete(STORE_RECORDS, record.wordId);
  }

  // 清除今日已复习计数
  const today = new Date().toDateString();
  const todayReviewedKey = `todayReviewed_${today}`;
  localStorage.setItem(todayReviewedKey, 0);

  alert('学习进度已重置！');
  navigate(PAGES.HOME);
}

// 切换宠物面板显示
function togglePetPanel() {
  const panel = document.getElementById('petPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    document.querySelector('.pet-bar')?.classList.toggle('expanded');
    if (!panel.classList.contains('hidden')) {
      renderPetPanel();
    }
  }
}

// 渲染宠物面板
async function renderPetPanel() {
  const pet = await getPet();
  if (!pet || !pet.type) return;

  const petType = PET_TYPES.find(p => p.type === pet.type);

  const panel = document.getElementById('petPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="pet-panel-content">
      <div class="pet-panel-header">
        <span class="pet-large">${petType?.emoji || '🐱'}</span>
        <span class="pet-name">${pet.name}</span>
        <button class="pet-close" onclick="togglePetPanel()">✕</button>
      </div>

      <div class="pet-stats">
        <div class="pet-stat">
          <span class="pet-stat-label">饥饿</span>
          <div class="pet-stat-bar">
            <div class="pet-stat-fill" style="width: ${pet.hunger}%"></div>
          </div>
          <span>${pet.hunger}%</span>
        </div>
        <div class="pet-stat">
          <span class="pet-stat-label">🪙 金币</span>
          <span class="pet-coins">${pet.coins}</span>
        </div>
        <div class="pet-stat">
          <span class="pet-stat-label">❤️ 好感度</span>
          <span class="pet-favorability">${pet?.favorability || 0}</span>
        </div>
      </div>

      <div class="food-shop">
        ${FOODS.map(food => `
          <button class="food-btn" onclick="buyFood('${food.id}')">
            <span class="food-emoji">${food.emoji}</span>
            <span class="food-name">${food.name}</span>
            <span class="food-price">${food.price}金</span>
            <span class="food-restore">+${food.restore}</span>
          </button>
        `).join('')}
      </div>

      <div class="checkin-section">
        <button class="checkin-btn" onclick="handleCheckIn()" ${(pet?.lastCheckInDate === new Date().toISOString().split('T')[0]) ? 'disabled' : ''}>
          ${(pet?.lastCheckInDate === new Date().toISOString().split('T')[0]) ? '✅ 已签到' : '📅 签到'} ${pet?.checkInDays ? `(连续${pet.checkInDays}天)` : ''}
        </button>
      </div>

      <div class="pet-actions">
        <button class="btn" onclick="showRenameInput()">✏️ 修改名字</button>
      </div>
    </div>
  `;
}

// 购买食物
async function buyFood(foodId) {
  const result = await feedPet(foodId);
  if (result && result.success) {
    // 如果解锁了新动作，显示提示
    if (result.unlocked && result.newActions.length > 0) {
      showPetDialogue('我又学会新动作啦！🎉 ' + result.newActions.map(a => a.emoji).join(' '));
    }
    renderPetPanel();
  }
}

// 宠物选择界面
function renderPetSelect(container) {
  container.innerHTML = `
    <div class="container pet-select-container">
      <h1 class="title">选择你的小伙伴</h1>

      <div class="pet-options">
        ${PET_TYPES.map(p => `
          <div class="pet-option" onclick="selectPet('${p.type}')">
            <span class="pet-option-emoji">${p.emoji}</span>
            <span class="pet-option-name">${p.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 选择宠物
async function selectPet(type) {
  await createPet(type, '小毛球');
  render();
}

// 显示更换宠物界面
function showPetSelect() {
  const panel = document.getElementById('petPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="pet-panel-content">
      <h3>更换宠物</h3>
      <div class="pet-options-grid">
        ${PET_TYPES.map(p => `
          <button class="pet-option-btn" onclick="changePet('${p.type}')">
            ${p.emoji} ${p.name}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// 更换宠物
async function changePet(type) {
  await createPet(type);
  render();
}

// 显示改名界面
function showRenameInput() {
  const panel = document.getElementById('petPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="pet-panel-content">
      <h3>修改名字</h3>
      <input type="text" id="petNameInput" class="pet-name-input" placeholder="输入新名字" maxlength="10">
      <button class="btn btn-primary" onclick="submitRename()">确定</button>
    </div>
  `;
}

// 提交改名
async function submitRename() {
  const newName = document.getElementById('petNameInput').value.trim();
  if (!newName) {
    alert('请输入名字');
    return;
  }
  await renamePet(newName);
  render();
}

// 签到处理函数
async function handleCheckIn() {
  const result = await dailyCheckIn();
  // 使用对话气泡显示结果
  showPetDialogue(result.message);
  renderPetPanel();
}

// 动作点击处理函数
async function handleActionClick(actionId) {
  const action = await triggerPetAction(actionId);
  if (action) {
    const result = await addFavorability(1);  // 点击动作按钮 +1 好感度
    showPetDialogue(await getPetDialogue());
    showActionAnimation(action.emoji);
    // 如果解锁了新动作，显示提示
    if (result.unlocked && result.newActions.length > 0) {
      showPetDialogue('我又学会新动作啦！🎉 ' + result.newActions.map(a => a.emoji).join(' '));
    }
    renderPetPanel();
  }
}

// 对话气泡显示函数
function showPetDialogue(text) {
  // 创建临时对话气泡
  let bubble = document.getElementById('pet-dialogue-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'pet-dialogue-bubble';
    document.body.appendChild(bubble);
  }

  // 清除之前的 timeout
  if (bubble._timeout) {
    clearTimeout(bubble._timeout);
  }

  bubble.textContent = text || '';
  bubble.classList.add('show');

  bubble._timeout = setTimeout(() => bubble.classList.remove('show'), 3000);
}

// 动作动画函数
function showActionAnimation(emoji) {
  let anim = document.getElementById('pet-action-animation');
  if (!anim) {
    anim = document.createElement('div');
    anim.id = 'pet-action-animation';
    document.body.appendChild(anim);
  }

  // 清除之前的 timeout
  if (anim._timeout) {
    clearTimeout(anim._timeout);
  }

  anim.textContent = emoji || '✨';
  anim.classList.add('animate');

  anim._timeout = setTimeout(() => anim.classList.remove('animate'), 1500);
}
