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
  const stats = await getStudyStats();

  container.innerHTML = `
    <div class="container">
      <h1 class="title">单词小助手</h1>

      <div class="stats-card">
        <div class="stat-item">
          <span class="stat-value">${stats.todayReview}</span>
          <span class="stat-label">今日待复习</span>
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
}

// 获取学习统计
async function getStudyStats() {
  const records = await db.getAll(STORE_RECORDS);
  const today = new Date().toDateString();

  const todayReview = records.filter(r =>
    new Date(r.nextReview).toDateString() <= today
  ).length;

  const todayLearned = records.filter(r =>
    r.lastReview && new Date(r.lastReview).toDateString() === today
  ).length;

  return {
    todayReview,
    todayLearned,
    streak: 1,
    total: records.length
  };
}

// 开始学习
async function startStudy() {
  const settings = await db.get(STORE_SETTINGS, 'daily') || { newWords: 10, reviewLimit: 50 };

  // 获取复习单词
  const reviewWords = await getTodayReviewWords();
  const limitedReview = reviewWords.slice(0, settings.reviewLimit);

  // 获取新词
  const newWords = await getNewWords(settings.newWords);

  // 合并：复习优先
  studyQueue = [...limitedReview, ...newWords];
  currentIndex = 0;

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

// 学习页面
function renderStudy(container) {
  if (currentIndex >= studyQueue.length) {
    container.innerHTML = `
      <div class="container">
        <div class="study-complete">
          <h2>🎉 学习完成！</h2>
          <p>今日学习: ${studyQueue.length} 个单词</p>
          <button class="btn btn-primary" onclick="navigate('${PAGES.HOME}')">
            返回主页
          </button>
        </div>
      </div>
    `;
    return;
  }

  const word = studyQueue[currentIndex];
  const progress = `${currentIndex + 1}/${studyQueue.length}`;

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
          ${word.examples ? word.examples.map((ex, i) => `
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
  const result = calculateNextReview(word.level || 0, isCorrect);

  // 保存学习记录
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

  currentIndex++;
  render();
}

// 发音
function speakWord(text) {
  // 停止当前播放
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;  // 稍慢一点更清晰
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // 尝试选择更好的语音
  const voices = speechSynthesis.getVoices();
  const preferredVoice = voices.find(v =>
    v.lang.includes('en') && v.name.includes('Google')
  ) || voices.find(v => v.lang.includes('en-US'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

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

        <div class="setting-item">
          <label>每日复习上限</label>
          <input type="number" id="reviewLimitSetting" value="${settings.reviewLimit}" min="10" max="200">
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
  const reviewLimit = parseInt(document.getElementById('reviewLimitSetting').value);

  await db.put(STORE_SETTINGS, {
    key: 'daily',
    newWords,
    reviewLimit
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

  alert('学习进度已重置！');
  navigate(PAGES.HOME);
}
