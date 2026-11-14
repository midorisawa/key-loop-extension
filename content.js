// このファイルはWebページ内で動く。重複して追加された場合は何もしない。
if (!globalThis.keyChangeLoopLoaded) {
  globalThis.keyChangeLoopLoaded = true;
  let media = null;
  let loopStart = null;
  let loopEnd = null;
  let looping = false;

  function findMedia() {
    const candidates = Array.from(document.querySelectorAll('video, audio'));
    const playing = candidates.find(item => !item.paused && !item.ended);
    let selected = playing;
    if (!selected) selected = media?.isConnected ? media : candidates[0];
    if (!selected) {
      throw new Error('動画・音声が見つかりません。ページで再生してから開いてください。');
    }

    if (selected !== media) {
      media = selected;
      clearLoop();
    }
    return media;
  }

  function clearLoop() {
    loopStart = null;
    loopEnd = null;
    looping = false;
  }

  function handleLoopCommand(command) {
    const item = findMedia();
    switch (command) {
      case 'a':
        loopStart = item.currentTime;
        if (loopEnd !== null && loopEnd <= loopStart) loopEnd = null;
        looping = false;
        break;
      case 'b':
        if (loopStart === null || item.currentTime <= loopStart + 0.1) {
          throw new Error('Aより後の位置でBを設定してください。');
        }
        loopEnd = item.currentTime;
        looping = true;
        item.currentTime = loopStart;
        break;
      case 'loop':
        if (loopStart === null || loopEnd === null) {
          throw new Error('AとBを設定してください。');
        }
        looping = !looping;
        if (looping) item.currentTime = loopStart;
        break;
      case 'reset':
        clearLoop();
        break;
    }
    return { time: item.currentTime, a: loopStart, b: loopEnd, looping };
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.target !== 'media') return;
    try {
      reply(handleLoopCommand(message.command));
    } catch (error) {
      reply({ error: error.message });
    }
  });

  // Bに達したらAへ戻す。停止中やループがオフのときは操作しない。
  setInterval(() => {
    if (!looping || !media.isConnected || media.paused) return;
    if (media.currentTime >= loopEnd || media.currentTime < loopStart) {
      media.currentTime = loopStart;
    }
  }, 50);
}
