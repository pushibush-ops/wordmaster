// IndexedDB 封装
const DB_NAME = 'wordmaster';
const DB_VERSION = 2;
const STORE_WORDS = 'words';      // 词库
const STORE_RECORDS = 'records';  // 学习记录
const STORE_SETTINGS = 'settings'; // 设置
const STORE_PET = 'pet';  // 电子宠物

class DB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_WORDS)) {
          db.createObjectStore(STORE_WORDS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          db.createObjectStore(STORE_RECORDS, { keyPath: 'wordId' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_PET)) {
          db.createObjectStore(STORE_PET, { keyPath: 'id' });
        }
      };
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const db = new DB();

// 初始化数据库并加载内置数据
async function initDatabase() {
  await db.init();
  await initBuiltInWordlists();

  // 初始化自定义词库
  const customList = await db.get(STORE_WORDS, 'custom');
  if (!customList) {
    await db.put(STORE_WORDS, {
      id: 'custom',
      name: '我的词库',
      isActive: false,
      words: []
    });
  }

  // 初始化宠物数据
  await initPet();

  // 初始化默认设置
  const settings = await db.get(STORE_SETTINGS, 'daily');
  if (!settings) {
    await db.put(STORE_SETTINGS, {
      key: 'daily',
      newWords: 10,
      reviewLimit: 50
    });
  }
}

// 初始化电子宠物
async function initPet() {
  const pet = await db.get(STORE_PET, 'pet');
  if (!pet) {
    // 首次创建，会在首次选择时被覆盖
    await db.put(STORE_PET, {
      id: 'pet',
      type: 'cat',
      name: '小毛球',
      hunger: 100,
      coins: 0,
      todayCoins: 0,
      lastHungerDate: null,
      lastFeedDate: null,
      adopted: false,
      createdAt: new Date().toISOString()
    });
  }
}
