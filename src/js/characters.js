import { loadAppStore, saveAppStore, now, normalizeCharacterRecord, ensurePrivateConversation } from './storage.js';

const PRESET_CHARACTER_SOURCES = [
  {
    id: 'fritia',
    name: '芙提雅',
    description: '天才小老师，海姆达尔部队成员。',
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
    description: '黄金狮子，热情耀眼的瓦尔基里明星。',
    avatar: 'src/_char/Fenny/Profile_Fenny.png',
    promptPath: 'src/_char/Fenny/char_fenny_prompt.txt',
    voiceSample: 'src/_char/Fenny/Fenny_Voice.mp3',
    examples: '',
    tags: ['预置', '黄金狮子', '傲娇']
  },
  {
    id: 'cherno',
    name: '琴诺',
    description: '温柔胆怯，也与莫尔索共享一颗心。',
    avatar: 'src/_char/Cherno/Profile_Cherno.png',
    promptPath: 'src/_char/Cherno/char_cherno_prompt.txt',
    voiceSample: 'src/_char/Cherno/Cherno_Voice.mp3',
    examples: '',
    tags: ['预置', '双重人格', '温柔']
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
