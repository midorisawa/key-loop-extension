// タブ音声の取得にはバックグラウンドが必要になる。
// 開始と停止が重ならないよう、届いた操作を順番に処理する。
let lastOperation = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'background') return;

  lastOperation = lastOperation.catch(() => {}).then(() => handleAudioCommand(message));
  lastOperation.then(reply, error => reply({ error: error.message }));

  // 非同期処理が終わるまで、返信先を有効に保つ。
  return true;
});

function sendToAudio(message) {
  return chrome.runtime.sendMessage({ ...message, target: 'audio' });
}

async function handleAudioCommand(message) {
  const { action, tabId } = message;

  // ポップアップを閉じても音を出せるよう、非表示のページを用意する。
  if (action === 'start' && !await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'タブ音声のキーを変更して再生する'
    });
  }

  if (!await chrome.offscreen.hasDocument()) return { tabId: null, pitch: 0 };

  const state = await sendToAudio({ action: 'status' });
  if (action === 'status') return state;

  if (action === 'start') {
    if (state.tabId === tabId) return state;
    if (state.tabId !== null) {
      throw new Error('別のタブでキー変更中です。先にオフにしてください。');
    }
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    return sendToAudio({ action: 'start', tabId, streamId });
  }

  if (state.tabId !== tabId) {
    throw new Error('このタブのキー変更をオンにしてください。');
  }
  return sendToAudio(message);
}

// 処理対象のタブを閉じたら、音声処理も終了する。
chrome.tabs.onRemoved.addListener(tabId => {
  lastOperation = lastOperation.catch(() => {}).then(async () => {
    if (!await chrome.offscreen.hasDocument()) return;
    const state = await sendToAudio({ action: 'status' });
    if (state.tabId === tabId) await sendToAudio({ action: 'stop' });
  });
  lastOperation.catch(console.error);
});
