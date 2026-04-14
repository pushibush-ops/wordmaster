// translation.js - 查词核心逻辑

async function translate(query, lang = 'en') {
  if (!query || !query.trim()) {
    throw new Error('查询词不能为空');
  }

  query = query.trim();

  // 1. 调用 API（不缓存查询结果）
  let result;
  if (lang === 'en') {
    // 英译中：使用 MyMemory API
    result = await fetchTranslation(query, 'en', 'zh');
  } else {
    // 中译英：使用 MyMemory API
    result = await fetchTranslation(query, 'zh', 'en');
  }

  return result;
}

// MyMemory 翻译 API
async function fetchTranslation(query, fromLang, toLang) {
  let langpair;
  if (fromLang === 'en' && toLang === 'zh') {
    langpair = 'en|zh-CN';
  } else if (fromLang === 'zh' && toLang === 'en') {
    langpair = 'zh-Hans|en';
  } else {
    langpair = `${fromLang}|${toLang}`;
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${langpair}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('网络异常，请重试');
  }

  const data = await response.json();

  if (data.ResponseStatus !== 200 && data.responseStatus !== 200) {
    throw new Error('翻译失败，请重试');
  }

  return parseTranslationResult(data, query);
}

// 解析翻译结果
function parseTranslationResult(data, query) {
  const result = {
    word: query,
    phonetic: '',
    definitions: [],
    examples: []
  };

  const translatedText = data.responseData?.translatedText;
  if (translatedText) {
    result.definitions.push(translatedText);
  }

  // 获取匹配结果作为备选释义
  if (data.matches && data.matches.length > 0) {
    for (let i = 0; i < Math.min(3, data.matches.length); i++) {
      const match = data.matches[i];
      if (match.translation && match.translation !== translatedText) {
        result.definitions.push(match.translation);
      }
    }
  }

  return result;
}

async function collectToWordlist(word, definition, phonetic) {
  let customList = await db.get(STORE_WORDS, 'custom');
  if (!customList) {
    customList = { id: 'custom', name: '我的词库', isActive: false, words: [] };
  }

  const exists = customList.words.some(w => w.word.toLowerCase() === word.toLowerCase());
  if (exists) {
    throw new Error('该单词已存在于词库中');
  }

  customList.words.push({ word, definition, phonetic: phonetic || '' });
  await db.put(STORE_WORDS, customList);

  return true;
}
