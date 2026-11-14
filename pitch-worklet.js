// Chromeが音声の小さなまとまりごとにprocessを呼び出す。
// 直前の音をため、読み出す速さを変えてキーを変更する。
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'semitones',
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automationRate: 'k-rate'
    }];
  }

  constructor() {
    super();
    // sampleRateは1秒あたりの音声データ数。左右の音を別々に保持する。
    this.bufferLength = Math.ceil(sampleRate * 0.12);
    this.delayLength = sampleRate * 0.06;
    this.buffers = [new Float32Array(this.bufferLength), new Float32Array(this.bufferLength)];
    this.writePosition = 0;
    this.phase = 0;
  }

  read(buffer, delay) {
    // 配列の末尾と先頭をつなげて使う。小数の位置は前後の値を混ぜる。
    const position = (this.writePosition - delay + this.bufferLength) % this.bufferLength;
    const index = Math.floor(position);
    const fraction = position - index;
    return buffer[index] * (1 - fraction) + buffer[(index + 1) % this.bufferLength] * fraction;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const semitones = parameters.semitones[0];
    // 12半音上げると周波数が2倍、12半音下げると半分になる。
    const ratio = 2 ** (semitones / 12);
    for (let i = 0; i < output[0].length; i++) {
      // 読み出し位置を戻す際の切れ目を、半周期ずらした音でつなぐ。
      const secondPhase = (this.phase + 0.5) % 1;
      const weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
      for (let channel = 0; channel < output.length; channel++) {
        const buffer = this.buffers[channel];
        const sample = input[channel]?.[i] ?? input[0]?.[i] ?? 0;
        buffer[this.writePosition] = sample;
        if (Math.abs(semitones) < 0.001) {
          output[channel][i] = sample;
        } else {
          const first = this.read(buffer, 2 + this.phase * this.delayLength);
          const second = this.read(buffer, 2 + secondPhase * this.delayLength);
          output[channel][i] = first * weight + second * (1 - weight);
        }
      }
      this.writePosition = (this.writePosition + 1) % this.bufferLength;
      this.phase = (this.phase + (1 - ratio) / this.delayLength + 1) % 1;
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifter);
