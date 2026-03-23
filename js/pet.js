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
    createdAt: pet ? pet.createdAt : new Date().toISOString()
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
  return true;
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
