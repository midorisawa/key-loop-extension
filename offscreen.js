// 非表示のページで音声を再生する。sessionには処理中の音声をまとめて保持する。
let session = null;

function getAudioState() {
  if (!session) return { tabId: null, pitch: 0 };
  return { tabId: session.tabId, pitch: session.pitch };
}

async function stopAudio() {
  if (!session) return;
  const previous = session;
  session = null;
  for (const track of previous.stream.getTracks()) {
    track.stop();
  }
  await previous.context.close();
}

async function startAudio(tabId, streamId) {
  await stopAudio();
  let stream;
  let context;
  try {
    // Chromeから受け取ったIDで、タブの音声を取得する。
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
      },
      video: false
    });
    context = new AudioContext();
    await context.audioWorklet.addModule('pitch-worklet.js');
    const source = context.createMediaStreamSource(stream);
    const pitchNode = new AudioWorkletNode(context, 'pitch-shifter', {
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit'
    });

    // タブの音声 → キー変更 → スピーカーの順につなぐ。
    source.connect(pitchNode);
    pitchNode.connect(context.destination);
    await context.resume();
    session = { tabId, stream, context, pitchNode, pitch: 0 };

    // Chrome側で音声共有を終了した場合も後片付けする。
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (session?.stream === stream) stopAudio().catch(console.error);
    });
  } catch (error) {
    // 開始途中で失敗しても、タブの音声を取得したままにしない。
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (context) await context.close();
    throw error;
  }
}

function changePitch(value) {
  if (!session) throw new Error('キー変更をオンにしてください。');
  const pitch = Number(value);
  if (!Number.isFinite(pitch)) throw new Error('設定値が不正です。');
  session.pitch = Math.max(-12, Math.min(12, pitch));

  // 急な切り替えによるノイズを抑えるため、短い時間をかけて値を変える。
  const parameter = session.pitchNode.parameters.get('semitones');
  parameter.setTargetAtTime(session.pitch, session.context.currentTime, 0.02);
}

async function handleAudioCommand(message) {
  switch (message.action) {
    case 'start':
      await startAudio(message.tabId, message.streamId);
      break;
    case 'stop':
      await stopAudio();
      break;
    case 'pitch':
      changePitch(message.pitch);
      break;
  }
  return getAudioState();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'audio') return;
  handleAudioCommand(message).then(reply, error => reply({ error: error.message }));
  return true;
});
