## 使用音色复刻进行语音合成

- 通过传入音频样本，即可精准复刻目标音色并生成语音。当前仅支持 `mimo-v2.5-tts-voiceclone` 模型
- 支持通过在 user message 中传入自然语言指令来控制合成语音的风格
- 支持通过音频标签来控制合成语音的风格

### 调用示例

将音频文件样本转换为 Base64 编码字符串后传入。转换后的 Base64 编码的字符串大小不能超过 10 MB，目前仅支持传入 `mp3` 和 `wav` 格式的音频样本文件。



**注意事项**

- 请在 Base64 编码前携带前缀：`data:{MIME_TYPE};base64,$BASE64_AUDIO`
- `{MIME_TYPE}`：音频的 MIME 类型（媒体类型），用于标识音频格式，需替换为实际音频对应的 MIME 值。这里的取值可以为：`audio/mpeg`（或 `audio/mp3`），`audio/wav`。
- `$BASE64_AUDIO`：音频文件的纯 Base64 编码字符串（不含任何前缀）。

#### 非流式调用

**Curl**

```
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "mimo-v2.5-tts-voiceclone",
    "messages": [
        {
            "role": "user",
            "content": ""
        },
        {
            "role": "assistant",
            "content": "Yes, I had a sandwich."
        }
    ],
    "audio": {
        "format": "wav",
        "voice": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
    }
}'
```

Python

``` 
import base64
import os

from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1",
)

with open("voice.mp3", "rb") as f:
    voice_bytes = f.read()
voice_base64 = base64.b64encode(voice_bytes).decode("utf-8")

completion = client.chat.completions.create(
    model="mimo-v2.5-tts-voiceclone",
    messages=[
        {
            "role": "user",
            "content": ""
        },
        {
            "role": "assistant", 
            "content": "Yes, I had a sandwich."
        }
    ],
    audio={
        "format": "wav",
        "voice": f"data:audio/mpeg;base64,{voice_base64}"
    }
)

message = completion.choices[0].message
audio_bytes = base64.b64decode(message.audio.data)
with open("audio_file.wav", "wb") as f:
    f.write(audio_bytes)
```

#### 流式调用

- `mimo-v2.5-tts-voiceclone` 的低延迟流式输出功能暂未上线，如有相关需求，请关注近期的功能更新。
- 流式调用接口目前降级为兼容模式，**仅在所有推理完成后**以流式格式返回**一次**结果。

**Curl**

```
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "mimo-v2.5-tts-voiceclone",
    "messages": [
        {
            "role": "user",
            "content": ""
        },
        {
            "role": "assistant",
            "content": "You are UN-BE-LIEVABLE! I am sooooo done with your constant lies. GET. OUT!"
        }
    ],
    "audio": {
        "format": "pcm16",
        "voice": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
    },
    "stream": true
}'
```

**Python**

```
import base64
import os

import numpy as np
import soundfile as sf
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1",
)

with open("voice.mp3", "rb") as f:
    voice_bytes = f.read()
voice_base64 = base64.b64encode(voice_bytes).decode("utf-8")

completion = client.chat.completions.create(
    model="mimo-v2.5-tts-voiceclone",
    messages=[
        {
            "role": "user",
            "content": ""
        },
        {
            "role": "assistant", 
            "content": "Yes, I had a sandwich."
        }
    ],
    audio={
        "format": "wav",
        "voice": f"data:audio/mpeg;base64,{voice_base64}",
    },
    stream=True
)

# 24kHz PCM16LE mono audio
collected_chunks: np.ndarray = np.array([], dtype=np.float32)

for chunk in completion:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    audio = getattr(delta, "audio", None)

    if audio is not None:
        assert isinstance(audio, dict), (
            f"Expected audio to be a dict, got {type(audio)}"
        )
        pcm_bytes = base64.b64decode(audio["data"])
        np_pcm = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        collected_chunks = np.concatenate((collected_chunks, np_pcm))
        print(f"Received audio chunk of size {len(pcm_bytes)} bytes")

# Save the collected audio to a file
os.makedirs("tmp", exist_ok=True)
sf.write("tmp/output.wav", collected_chunks, samplerate=24000)
print("Audio saved to tmp/output.wav")
```

