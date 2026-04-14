// dict.js - 查词页 UI

// 渲染查词页
async function renderDict(container) {
  container.innerHTML = `
    <div class="container">
      <div class="page-header">
        <button class="back-btn" onclick="navigate('${PAGES.HOME}')">← 返回</button>
        <h2>查词</h2>
      </div>

      <div class="dict-search-section">
        <input
          type="text"
          id="dictSearchInput"
          class="dict-search-input"
          placeholder="输入单词或句子..."
          onkeypress="handleDictSearchKeypress(event)"
        >
        <button class="btn btn-primary" onclick="performDictSearch()">
          🔍 查询
        </button>
      </div>

      <div id="dictResult" class="dict-result-section">
        <div class="dict-placeholder">
          <p>输入要查询的单词或句子</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const input = document.getElementById('dictSearchInput');
    if (input) input.focus();
  }, 100);
}

// 处理回车键
function handleDictSearchKeypress(event) {
  if (event.key === 'Enter') {
    performDictSearch();
  }
}

// 执行查词
async function performDictSearch() {
  const input = document.getElementById('dictSearchInput');
  const query = input.value.trim();

  if (!query) {
    return;
  }

  const resultDiv = document.getElementById('dictResult');
  resultDiv.innerHTML = '<div class="dict-loading">查询中...</div>';

  try {
    const lang = isChinese(query) ? 'zh' : 'en';
    const result = await translate(query, lang);
    renderDictResult(result, resultDiv, query);
  } catch (err) {
    resultDiv.innerHTML = `
      <div class="dict-error">
        <p>❌ ${err.message}</p>
        <button class="btn" onclick="performDictSearch()">重试</button>
      </div>
    `;
  }
}

// 判断是否包含中文
function isChinese(str) {
  return /[\u4e00-\u9fa5]/.test(str);
}

// 渲染查词结果
function renderDictResult(result, container, originalQuery) {
  const defHtml = result.definitions.length > 0
    ? result.definitions.map(d => `<div class="dict-def">${d}</div>`).join('')
    : '<div class="dict-no-def">暂无释义</div>';

  const exampleHtml = result.examples.length > 0
    ? result.examples.map(ex => `
        <div class="dict-example">
          <div class="dict-example-en">${ex.en}</div>
          <div class="dict-example-cn">${ex.cn}</div>
        </div>
      `).join('')
    : '';

  container.innerHTML = `
    <div class="dict-result-card">
      <div class="dict-word-header">
        <span class="dict-word">${result.word}</span>
        <button class="speak-btn" onclick="speakWord('${result.word.replace(/'/g, "\\'")}')">🔊</button>
      </div>
      ${result.phonetic ? `<div class="dict-phonetic">${result.phonetic}</div>` : ''}

      <div class="dict-section">
        <h4>释义</h4>
        ${defHtml}
      </div>

      ${exampleHtml ? `
        <div class="dict-section">
          <h4>例句</h4>
          ${exampleHtml}
        </div>
      ` : ''}

      <div class="dict-actions">
        <button class="btn btn-primary" onclick="showCollectDialog('${result.word.replace(/'/g, "\\'")}', '${(result.definitions.join('; ') || '').replace(/'/g, "\\'")}', '${(result.phonetic || '').replace(/'/g, "\\'")}')">
          ⭐ 收藏到词库
        </button>
      </div>
    </div>
  `;
}

// 显示收藏对话框
function showCollectDialog(word, definition, phonetic) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'collectModal';

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>收藏到词库</h3>
        <button class="pet-close" onclick="closeCollectDialog()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>单词</label>
          <input type="text" id="collectWord" value="${word}" readonly>
        </div>
        <div class="form-group">
          <label>释义</label>
          <textarea id="collectDefinition" rows="3">${definition}</textarea>
        </div>
        <div class="form-group">
          <label>音标 (可选)</label>
          <input type="text" id="collectPhonetic" value="${phonetic}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeCollectDialog()">取消</button>
        <button class="btn btn-primary" onclick="confirmCollect()">确定</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

// 关闭收藏对话框
function closeCollectDialog() {
  const modal = document.getElementById('collectModal');
  if (modal) {
    modal.remove();
  }
}

// 确认收藏
async function confirmCollect() {
  const word = document.getElementById('collectWord').value.trim();
  const definition = document.getElementById('collectDefinition').value.trim();
  const phonetic = document.getElementById('collectPhonetic').value.trim();

  if (!word || !definition) {
    alert('单词和释义不能为空');
    return;
  }

  try {
    await collectToWordlist(word, definition, phonetic);
    alert('收藏成功！');
    closeCollectDialog();
  } catch (err) {
    alert(err.message);
  }
}