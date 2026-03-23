// 内置词库
const BUILT_IN_WORDLISTS = [
  {
    id: 'gaokao',
    name: '高考英语',
    isActive: true,
    words: [
      { word: 'abandon', definition: '放弃；遗弃', phonetic: '/əˈbændən/' },
      { word: 'ability', definition: '能力', phonetic: '/əˈbɪləti/' },
      { word: 'able', definition: '能够的', phonetic: '/ˈeɪbl/' },
      { word: 'about', definition: '关于；大约', phonetic: '/əˈbaʊt/' },
      { word: 'above', definition: '在...上面', phonetic: '/əˈbʌv/' },
      { word: 'abroad', definition: '在国外', phonetic: '/əˈbrɔːd/' },
      { word: 'absence', definition: '缺席；缺乏', phonetic: '/ˈæbsəns/' },
      { word: 'absent', definition: '缺席的', phonetic: '/ˈæbsənt/' },
      { word: 'accept', definition: '接受', phonetic: '/əkˈsept/' },
      { word: 'accident', definition: '事故；意外', phonetic: '/ˈæksɪdənt/' },
      { word: 'achieve', definition: '达到；获得', phonetic: '/əˈtʃiːv/' },
      { word: 'across', definition: '穿过', phonetic: '/əˈkrɔːs/' },
      { word: 'act', definition: '行动；表演', phonetic: '/ækt/' },
      { word: 'action', definition: '行动', phonetic: '/ˈækʃn/' },
      { word: 'active', definition: '积极的；活跃的', phonetic: '/ˈæktɪv/' },
    ]
  },
  {
    id: 'cet4',
    name: '大学英语四级',
    isActive: false,
    words: [
      { word: 'abandon', definition: '放弃；遗弃', phonetic: '/əˈbændən/' },
      { word: 'ability', definition: '能力', phonetic: '/əˈbɪləti/' },
      { word: 'absence', definition: '缺席；缺乏', phonetic: '/ˈæbsəns/' },
      { word: 'absent', definition: '缺席的', phonetic: '/ˈæbsənt/' },
      { word: 'accept', definition: '接受', phonetic: '/əkˈsept/' },
      { word: 'accident', definition: '事故', phonetic: '/ˈæksɪdənt/' },
      { word: 'achieve', definition: '达到', phonetic: '/əˈtʃiːv/' },
      { word: 'achievement', definition: '成就', phonetic: '/əˈtʃiːvmənt/' },
      { word: 'across', definition: '穿过', phonetic: '/əˈkrɔːs/' },
      { word: 'action', definition: '行动', phonetic: '/ˈækʃn/' },
    ]
  }
];

// 初始化内置词库
async function initBuiltInWordlists() {
  for (const list of BUILT_IN_WORDLISTS) {
    const existing = await db.get(STORE_WORDS, list.id);
    if (!existing) {
      await db.put(STORE_WORDS, list);
    }
  }
}
