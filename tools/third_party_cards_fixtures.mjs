import { readFileSync } from 'node:fs';
export const png = readFileSync(new URL('../src/_logo/emoji/speech_balloon_3d.png', import.meta.url));
export const prompt = '你是一位热爱阅读的图书管理员，耐心回答读者的问题，帮助读者了解图书目录。\n保留完整的人格提示词。';
export const detailedDescription = ['## 阅读指南', '', '**阅读说明**与*友好交流*。', '', '### 提供的帮助', '', '- 查阅图书目录', '- 介绍阅读知识', '', '> 这段详细内容仅供浏览，不进入角色存档。', '', '| 条目 | 说明 |', '| --- | --- |', '| 阅读 | 图书索引 |', '', '```text', '### 头像', '这是文档示例，不是附件字段。', '```', '', '[共创计划](https://fritia.online/creator/#intro)'].join('\n');
export const wav = Buffer.alloc(44 + 1600);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
export function issue(number = 1, overrides = {}) {
  return { id: 8000 + number, number, state: 'open', labels: [{ name: '角色卡' }, { name: '初审通过' }],
    user: { login: `author${number}` }, created_at: new Date(Date.UTC(2026, 9, number)).toISOString(),
    body: `### 角色卡名称\n\n图书管理员 ${number}\n\n### 角色卡介绍\n\n耐心解答读者问题，介绍阅读知识。\n\n### 详细描述\n\n${number % 2 ? detailedDescription : '_No response_'}\n\n### 头像\n\n![avatar.png](https://github.com/user-attachments/assets/avatar-${number})\n\n### 人格提示词\n\n[prompt.txt](https://github.com/user-attachments/files/111/prompt.txt)\n\n### 参考语音\n\n[voice.wav](https://github.com/user-attachments/files/111/voice.wav)\n\n### 必要上传声明\n\n- [x] 已阅读共创计划`,
    ...overrides };
}
