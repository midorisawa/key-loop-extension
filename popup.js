// このファイルから読み始める。画面の操作を、音声処理とループ処理へ送る。
function element(id) {
  return document.getElementById(id);
}

let tabId;
let pitchEnabled = false;
let switching = false;

// 成功時は表示を消し、失敗時だけ画面に理由を表示する。
async function runAction(action) {
  try {
    await action();
    element('status').textContent = '';
  } catch (error) {
    let message = error.message;
    if (message.startsWith('Cannot access')) {
      message = 'このページでは使えません。動画や音声のあるWebページで開いてください。';
    }
    element('status').textContent = message;
  }
}

// キー変更は、バックグラウンド経由で非表示の音声処理ページへ送る。
async function sendAudioCommand(action, pitch) {
  const state = await chrome.runtime.sendMessage({ target: 'background', action, tabId, pitch });
  if (state.error) throw new Error(state.error);
  return state;
}

// ループ操作は、動画を再生しているページへ直接送る。
async function sendLoopCommand(command) {
  const message = { target: 'media', command };
  let state;
  try {
    state = await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // 初回やページ再読み込み後は、先にループ処理をページへ追加する。
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    state = await chrome.tabs.sendMessage(tabId, message);
  }
  if (state.error) throw new Error(state.error);
  showLoopState(state);
}

function formatTime(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainder = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function showLoopState(state) {
  element('position').textContent = formatTime(state.time);
  element('bounds').textContent = state.a === null
    ? '開始位置A → 終了位置Bの順に設定'
    : `A ${formatTime(state.a)} → B ${formatTime(state.b)}`;
  element('loop').disabled = state.a === null || state.b === null;
  element('loop').setAttribute('aria-pressed', String(state.looping));
  element('loop').title = state.looping ? '区間ループをオフにする' : '区間ループをオンにする';
}

function showPitchValue() {
  const pitch = Number(element('pitch').value);
  const sign = pitch > 0 ? '+' : '';
  element('pitchValue').textContent = `${sign}${pitch}半音`;
}

function showAudioState(state) {
  pitchEnabled = state.tabId === tabId;
  element('capture').checked = pitchEnabled;
  element('capture').disabled = false;
  element('audioSettings').disabled = !pitchEnabled;
  element('pitch').value = pitchEnabled ? state.pitch : 0;
  showPitchValue();
}

async function togglePitch() {
  switching = true;
  element('capture').disabled = true;
  try {
    const action = pitchEnabled ? 'stop' : 'start';
    showAudioState(await sendAudioCommand(action));
  } finally {
    // 失敗した場合は、スイッチを切り替える前の状態に戻す。
    element('capture').checked = pitchEnabled;
    element('capture').disabled = false;
    switching = false;
  }
}

async function resetSettings() {
  if (pitchEnabled) showAudioState(await sendAudioCommand('pitch', 0));
  await sendLoopCommand('reset');
}

// 各部品を操作したときに実行する処理を登録する。
element('capture').addEventListener('change', () => runAction(togglePitch));
element('pitch').addEventListener('input', () => {
  showPitchValue();
  runAction(() => sendAudioCommand('pitch', Number(element('pitch').value)));
});
element('setA').addEventListener('click', () => runAction(() => sendLoopCommand('a')));
element('setB').addEventListener('click', () => runAction(() => sendLoopCommand('b')));
element('loop').addEventListener('click', () => runAction(() => sendLoopCommand('loop')));
element('reset').addEventListener('click', () => runAction(resetSettings));

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('操作対象のタブが見つかりません。');
  tabId = tab.id;

  showAudioState(await sendAudioCommand('status'));
  await sendLoopCommand('status');

  // ポップアップが開いている間だけ、再生位置を1秒ごとに更新する。
  setInterval(() => {
    if (switching) return;
    // ページ移動中などの一時的な失敗は、ここでは表示しない。
    sendLoopCommand('status').catch(() => {});
  }, 1000);
}

runAction(initialize);
