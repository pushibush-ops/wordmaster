// 艾宾浩斯遗忘曲线算法
const LEVEL_INTERVALS = {
  0: 1,   // 新词 -> 1天后复习
  1: 1,   // level 1 -> 1天后复习
  2: 2,   // level 2 -> 2天后复习
  3: 4,   // level 3 -> 4天后复习
  4: 7,   // level 4 -> 7天后复习
  5: 15   // level 5 -> 15天后复习 (已掌握)
};

// 计算下次复习时间
function calculateNextReview(level, isCorrect) {
  if (isCorrect) {
    // 答对了，增加等级
    const newLevel = Math.min(level + 1, 5);
    const interval = LEVEL_INTERVALS[newLevel];
    return {
      level: newLevel,
      nextReview: addDays(new Date(), interval)
    };
  } else {
    // 答错了，重置等级
    return {
      level: 0,
      nextReview: addDays(new Date(), 1)
    };
  }
}

// 日期加减天数
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// 获取今日待复习的单词
async function getTodayReviewWords() {
  const records = await db.getAll(STORE_RECORDS);
  const today = new Date().toDateString();

  return records
    .filter(r => new Date(r.nextReview).toDateString() <= today)
    .sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
}

// 获取今日可学的新词
async function getNewWords(limit = 10) {
  const settings = await db.get(STORE_SETTINGS, 'daily') || { newWords: 10 };
  const records = await db.getAll(STORE_RECORDS);
  const learnedWordIds = new Set(records.map(r => r.wordId));

  const wordlists = await db.getAll(STORE_WORDS);
  const activeList = wordlists.find(w => w.isActive) || wordlists[0];

  if (!activeList) return [];

  return activeList.words
    .map(w => ({ ...w, wordId: `${activeList.id}_${w.word}` }))
    .filter(w => !learnedWordIds.has(w.wordId))
    .slice(0, limit);
}
