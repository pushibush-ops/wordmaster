// 动作定义
const ACTIONS = [
  { id: 'stretch', name: '伸懒腰', emoji: '🐱', favorability: 0 },
  { id: 'tail', name: '摇尾巴', emoji: '🐕', favorability: 0 },
  { id: 'sleep', name: '睡觉', emoji: '😴', favorability: 0 },
  { id: 'jump', name: '跳跃', emoji: '🐱🔼', favorability: 50 },
  { id: 'roll', name: '翻滚', emoji: '🔄', favorability: 100 },
  { id: 'cozy', name: '献殷勤', emoji: '💕', favorability: 150 },
  { id: 'prank', name: '扮鬼脸', emoji: '😜', favorability: 200 }
];

// 对话定义
const TIME_GREETINGS = {
  morning: ['主人早上好！☀️', '早安呀~ 🌅'],
  afternoon: ['主人午安~ 🌤️', '下午好！☀️'],
  evening: ['晚上好呀！🌙', '晚安~ 🌃'],
  night: ['晚安... 🌙', '睡觉啦~ 💤']
};

const STATE_DIALOGUES = {
  hungry: ['我好饿QAQ', '要吃饭饭... 😢'],
  starving: ['要死了要死了... 🤒', '救命呀... 💀'],
  afterFeed: ['谢谢主人！❤️', '好吃！😋', '爱你哟~ 💕'],
  newUnlock: ['我又学会新动作啦！🎉', '有新技能！✨']
};

const RANDOM_DIALOGUES = ['喵~', '汪~', '蹭蹭~', '要抱抱~', '陪我玩嘛~', '么么哒~', '哎呀~'];

// 食物定义
const FOODS = [
  { id: 'fish', name: '鱼干', emoji: '🐟', price: 5, restore: 20 },
  { id: 'meat', name: '肉罐', emoji: '🥩', price: 10, restore: 50 },
  { id: 'chicken', name: '烤鸡', emoji: '🍗', price: 20, restore: 100 }
];

// 宠物类型
const PET_TYPES = [
  { type: 'cat', emoji: '🐱', name: '小猫' },
  { type: 'dog', emoji: '🐶', name: '小狗' },
  { type: 'lizard', emoji: '🦎', name: '小蜥' }
];

// 获取宠物状态emoji
function getPetMood(hunger) {
  if (hunger >= 70) return '😊';
  if (hunger >= 30) return '😐';
  if (hunger > 0) return '😢';
  return '🤒';
}

// 获取宠物数据
async function getPet() {
  return await db.get(STORE_PET, 'pet');
}

// 创建/领养宠物
async function createPet(type, name = '小毛球') {
  const pet = await getPet();
  const petType = PET_TYPES.find(p => p.type === type);

  await db.put(STORE_PET, {
    id: 'pet',
    type: type,
    name: name,
    hunger: 100,
    coins: 0,
    todayCoins: 0,
    lastHungerDate: new Date().toISOString().split('T')[0],
    lastFeedDate: null,
    adopted: true,
    createdAt: pet ? pet.createdAt : new Date().toISOString(),
    // 新增字段
    favorability: 0,           // 好感度
    lastInteractDate: null,     // 上次互动日期
    unlockedActions: ['stretch', 'tail', 'sleep'],  // 已解锁动作
    lastCheckInDate: null,      // 上次签到日期
    checkInDays: 0              // 连续签到天数
  });
}

// 每日饥饿值检查
async function checkDailyHunger() {
  const pet = await getPet();
  if (!pet || !pet.type) return null; // 未领养

  const today = new Date().toISOString().split('T')[0];

  // 检查是否今天已经扣过
  if (pet.lastHungerDate !== today) {
    // 扣除饥饿值，最少为0
    pet.hunger = Math.max(0, pet.hunger - 30);
    pet.lastHungerDate = today;
    pet.todayCoins = 0; // 重置今日金币
    await db.put(STORE_PET, pet);
  }

  return pet;
}

// 喂食
async function feedPet(foodId) {
  const pet = await getPet();
  const food = FOODS.find(f => f.id === foodId);

  if (!food) {
    alert('食物不存在！');
    return false;
  }

  if (!pet || !pet.type) {
    alert('请先领养宠物！');
    return false;
  }

  if (pet.coins < food.price) {
    alert('金币不足！');
    return false;
  }

  if (pet.hunger >= 100) {
    alert('宠物已经吃饱了！');
    return false;
  }

  pet.coins -= food.price;
  pet.hunger = Math.min(100, pet.hunger + food.restore);
  pet.lastFeedDate = new Date().toISOString().split('T')[0];
  await db.put(STORE_PET, pet);

  // 添加好感度
  const result = await addFavorability(3);  // 喂食 +3 好感度

  return { success: true, unlocked: result.unlocked, newActions: result.newActions };
}

// 获得金币
async function addCoins() {
  const pet = await getPet();
  if (!pet || !pet.type) return;

  if (pet.todayCoins >= 50) return; // 每日上限50

  pet.coins += 1;
  pet.todayCoins += 1;
  await db.put(STORE_PET, pet);
}

// 修改宠物名字
async function renamePet(newName) {
  const pet = await getPet();
  if (!pet) return;
  pet.name = newName;
  await db.put(STORE_PET, pet);
}

// 增加好感度（返回是否解锁新动作）
async function addFavorability(amount) {
  const pet = await getPet();
  if (!pet || !pet.type) return { unlocked: false, newActions: [] };

  pet.favorability = (pet.favorability || 0) + amount;

  // 检查是否解锁新动作
  const newActions = checkActionUnlock(pet);

  await db.put(STORE_PET, pet);
  return { favorability: pet.favorability, unlocked: newActions.length > 0, newActions };
}

// 检查并解锁新动作（返回新增的动作列表）
function checkActionUnlock(pet) {
  if (!pet.unlockedActions) {
    pet.unlockedActions = ['stretch', 'tail', 'sleep'];
  }

  const newlyUnlocked = [];
  for (const action of ACTIONS) {
    if (action.favorability > 0 &&
        pet.favorability >= action.favorability &&
        !pet.unlockedActions.includes(action.id)) {
      pet.unlockedActions.push(action.id);
      newlyUnlocked.push(action);
    }
  }
  return newlyUnlocked;
}

// 获取当前可用的动作列表
async function getAvailableActions() {
  const pet = await getPet();
  if (!pet) return [];

  const unlocked = pet.unlockedActions || ['stretch', 'tail', 'sleep'];
  return ACTIONS.filter(a => unlocked.includes(a.id));
}

// 获取时间段
function getTimePeriod() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
}

// 获取时间问候语
function getTimeGreeting() {
  const period = getTimePeriod();
  const greetings = TIME_GREETINGS[period];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// 获取状态对话
function getStateDialogue(state) {
  const dialogues = STATE_DIALOGUES[state];
  if (!dialogues) return null;
  return dialogues[Math.floor(Math.random() * dialogues.length)];
}

// 获取随机对话
function getRandomDialogue() {
  return RANDOM_DIALOGUES[Math.floor(Math.random() * RANDOM_DIALOGUES.length)];
}

// 获取综合对话（优先状态对话）
async function getPetDialogue(forceState = null) {
  const pet = await getPet();
  if (!pet) return getTimeGreeting();

  // 强制状态
  if (forceState) {
    return getStateDialogue(forceState) || getTimeGreeting();
  }

  // 饥饿状态优先
  if (pet.hunger < 30) {
    return pet.hunger === 0 ? getStateDialogue('starving') : getStateDialogue('hungry');
  }

  // 喂食后对话（短时间内）
  if (pet.lastFeedDate === new Date().toISOString().split('T')[0]) {
    return getStateDialogue('afterFeed') || getTimeGreeting();
  }

  // 默认时间问候
  return getTimeGreeting();
}

// 每日签到
async function dailyCheckIn() {
  const pet = await getPet();
  if (!pet || !pet.type) return { success: false, message: '请先领养宠物' };

  const today = new Date().toISOString().split('T')[0];

  // 今天已签到
  if (pet.lastCheckInDate === today) {
    return {
      success: false,
      message: `今天已经签到过了！连续 ${pet.checkInDays || 0} 天`,
      checkInDays: pet.checkInDays || 0
    };
  }

  // 检查是否连续签到
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let checkInDays = 1;
  if (pet.lastCheckInDate === yesterdayStr) {
    checkInDays = (pet.checkInDays || 0) + 1;
  }

  // 更新数据
  pet.lastCheckInDate = today;
  pet.checkInDays = checkInDays;
  pet.favorability = (pet.favorability || 0) + 5;
  pet.coins += 1;

  // 检查动作解锁
  checkActionUnlock(pet);

  await db.put(STORE_PET, pet);

  return {
    success: true,
    message: `签到成功！+5 好感度，+1 金币，连续 ${checkInDays} 天`,
    checkInDays: checkInDays,
    favorability: pet.favorability,
    coins: pet.coins
  };
}

// 触发宠物动作（不增加好感度，由调用者决定）
async function triggerPetAction(actionId = null) {
  const pet = await getPet();
  if (!pet || !pet.type) {
    alert('请先领养宠物！');
    return null;
  }

  const unlocked = pet.unlockedActions || ['stretch', 'tail', 'sleep'];

  // 如果没有指定动作，随机选择一个已解锁的
  if (!actionId) {
    // 只选择已解锁的动作
    const available = ACTIONS.filter(a => unlocked.includes(a.id));
    if (available.length === 0) {
      alert('暂无可用动作');
      return null;
    }
    actionId = available[Math.floor(Math.random() * available.length)].id;
  }

  // 检查动作是否可用
  const action = ACTIONS.find(a => a.id === actionId);
  if (!action) return null;

  const isUnlocked = unlocked.includes(actionId) || pet.favorability >= action.favorability;
  if (!isUnlocked) {
    alert(`需要 ${action.favorability} 好感度才能解锁此动作`);
    return null;
  }

  pet.lastInteractDate = new Date().toISOString().split('T')[0];
  await db.put(STORE_PET, pet);

  return action;
}
