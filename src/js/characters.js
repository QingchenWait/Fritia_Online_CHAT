import { loadAppStore, saveAppStore, now, normalizeCharacterRecord, ensurePrivateConversation } from './storage.js';

const PRESET_CHARACTER_SOURCES = [
  {
    id: 'fritia',
    name: '芙提雅',
    description: 'AI Researcher | 今日科研课题：如何让分析员更喜欢芙提雅老师',
    avatar: 'src/_char/Fritia/Profile_Fritia.png',
    promptPath: 'src/_char/Fritia/fritia_prompt.txt',
    voiceSample: 'src/_char/Fritia/Firtia_Voice.mp3',
    examples: [
      '用户：小老师真好看',
      '角色：芙提雅老师，果然很可爱吧？嘻嘻 ~',
      '用户：小老师的身材太平了',
      '角色：干什么！芙提雅老师以后肯定会长大的！'
    ].join('\n'),
    tags: ['预置', '小老师', '火种']
  },
  {
    id: 'fenny',
    name: '芬妮',
    description: '💖💍💞 分析员 💞💍💖',
    avatar: 'src/_char/Fenny/Profile_Fenny.png',
    promptPath: 'src/_char/Fenny/char_fenny_prompt.txt',
    voiceSample: 'src/_char/Fenny/Fenny_Voice.mp3',
    examples: '',
    tags: ['预置', '黄金狮子', '傲娇']
  },
  {
    id: 'cherno',
    name: '琴诺',
    description: '有事请先找莫尔索……分析员儿除外',
    avatar: 'src/_char/Cherno/Profile_Cherno.png',
    promptPath: 'src/_char/Cherno/char_cherno_prompt.txt',
    voiceSample: 'src/_char/Cherno/Cherno_Voice.mp3',
    examples: '',
    tags: ['预置', '双重人格', '温柔']
  },
  {
    id: 'acacia',
    name: '安卡希雅',
    description: '新星开拓 / 海姆大玩家系列游戏制作人 (已与分析员恒约版)',
    avatar: 'src/_char/Acacia/Profile_Acacia.png',
    promptPath: 'src/_char/Acacia/char_acacia_prompt.txt',
    voiceSample: 'src/_char/Acacia/Acacia_Voice.mp3',
    examples: '',
    tags: ['预置', '战术专家', '冷静']
  },
  {
    id: 'katya',
    name: '凯茜娅',
    description: '听歌，喝酒，然后去分析员房间',
    avatar: 'src/_char/Katya/Profile_Katya.png',
    promptPath: 'src/_char/Katya/cha_katya_prompt.txt',
    voiceSample: 'src/_char/Katya/Katya_Voice.mp3',
    examples: '',
    tags: ['预置', '狙击手', '优雅']
  },
  {
    id: 'lyfe',
    name: '里芙',
    description: '珍惜眼前人',
    avatar: 'src/_char/Lyfe/Profile_Lyfe.png',
    promptPath: 'src/_char/Lyfe/char_lyfe_prompt.txt',
    voiceSample: 'src/_char/Lyfe/Lyfe_Voice.mp3',
    examples: '',
    tags: ['预置', '清冷', '可靠']
  },
  {
    id: 'tess',
    name: '苔丝',
    description: '新魔术练习中 ~',
    avatar: 'src/_char/Tess/Profile_Tess.png',
    promptPath: 'src/_char/Tess/char_tess_prompt.txt',
    voiceSample: 'src/_char/Tess/Tess_Voice.mp3',
    examples: '',
    tags: ['预置', '魔术', '神秘']
  },
  {
    id: 'yao',
    name: '肴',
    description: '摸鱼才是本职工作！',
    avatar: 'src/_char/Yao/Profile_Yao.png',
    promptPath: 'src/_char/Yao/char_yao_prompt.txt',
    voiceSample: 'src/_char/Yao/Yao_Voice.mp3',
    examples: '',
    tags: ['预置', '治疗者', '慵懒']
  }
];

export async function ensurePresetCharacters() {
  const store = loadAppStore();
  const existing = new Map(store.characters.map(item => [item.id, item]));
  let changed = false;
  const nextCharacters = [...store.characters];
  for (const source of PRESET_CHARACTER_SOURCES) {
    const prompt = await fetchText(source.promptPath);
    const record = normalizeCharacterRecord({
      ...source,
      prompt,
      source: 'preset',
      createdAt: existing.get(source.id)?.createdAt || now(),
      updatedAt: now()
    });
    if (!record) continue;
    const index = nextCharacters.findIndex(item => item.id === record.id);
    if (index >= 0) {
      const current = nextCharacters[index];
      const isPresetRecord = current.source === 'preset' || !current.source;
      const nextRecord = {
        ...current,
        name: record.name,
        description: record.description,
        avatar: record.avatar,
        prompt: isPresetRecord ? record.prompt : current.prompt,
        examples: isPresetRecord ? record.examples : current.examples,
        voiceSample: isPresetRecord ? record.voiceSample : current.voiceSample,
        tags: record.tags,
        source: current.source || 'preset',
        updatedAt: now()
      };
      if (hasCharacterRecordChanged(current, nextRecord)) changed = true;
      nextCharacters[index] = nextRecord;
    } else {
      nextCharacters.push(record);
      changed = true;
    }
  }
  const nextStore = changed || nextCharacters.length !== store.characters.length
    ? saveAppStore({ ...store, characters: nextCharacters })
    : { ...store, characters: nextCharacters };

  let latest = loadAppStore();
  for (const preset of nextStore.characters.filter(item => item.source === 'preset')) {
    const conversation = latest.conversations.find(item => item.id === `private:${preset.id}`);
    if (!conversation) {
      ensurePrivateConversation(latest, preset);
      latest = loadAppStore();
    }
  }
  return loadAppStore().characters;
}

export function getCharacterById(characters, id) {
  return characters.find(item => item.id === id) || null;
}

export function characterAvatar(character) {
  return character?.avatar || 'src/_logo/emoji/robot_3d.png';
}

export function characterDisplayName(character) {
  return character?.name || '未知角色';
}

function hasCharacterRecordChanged(current, next) {
  return [
    'name',
    'description',
    'avatar',
    'prompt',
    'examples',
    'voiceSample',
    'source'
  ].some(key => current[key] !== next[key])
    || JSON.stringify(current.tags || []) !== JSON.stringify(next.tags || []);
}

async function fetchText(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } catch (err) {
    console.warn(`[characters] failed to load ${path}`, err);
    return '';
  }
}
