"use strict";

/* =========================================================
   贪吃蛇 · 声音
   全部用 Web Audio 现场合成，不加载任何音频文件：
   三首循环 BGM（CHILL / ARCADE / PULSE）+ 一组音效。
   ========================================================= */

window.SnakeAudio = (function () {
  var ctx = null;
  var master = null;
  var musicBus = null;
  var sfxBus = null;
  var timer = null;
  var nextTime = 0;
  var step = 0;
  var current = "chill";
  var musicOn = true;
  var sfxOn = true;

  var TRACKS = {
    chill: {
      bpm: 82,
      lead: "triangle",
      bass: "sine",
      leadGain: 0.16,
      bassGain: 0.2,
      pattern: [0, 4, 7, 11, 7, 4, 2, 4, 0, 4, 7, 12, 11, 7, 4, 2],
      bassPattern: [0, 0, -5, -5, -7, -7, -5, -5],
      octave: 1,
      swing: 0.12
    },
    arcade: {
      bpm: 132,
      lead: "square",
      bass: "triangle",
      leadGain: 0.12,
      bassGain: 0.18,
      pattern: [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 15, 7],
      bassPattern: [0, 0, 3, 3, 5, 5, 3, 3],
      octave: 1,
      swing: 0
    },
    pulse: {
      bpm: 108,
      lead: "sawtooth",
      bass: "square",
      leadGain: 0.1,
      bassGain: 0.2,
      pattern: [0, 0, 12, 0, 3, 3, 15, 3, 7, 7, 19, 7, 5, 5, 17, 5],
      bassPattern: [0, 0, 0, 0, -5, -5, -5, -5],
      octave: 0,
      swing: 0.04
    }
  };

  var FREQ_BASE = 220;

  function ensure() {
    if (ctx) return true;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.5 : 0;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? 0.85 : 0;
    sfxBus.connect(master);
    return true;
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  function freq(semitones) {
    return FREQ_BASE * Math.pow(2, semitones / 12);
  }

  function playTone(bus, semitone, when, duration, wave, peak) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq(semitone), when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  function tick() {
    if (!ctx) return;
    var track = TRACKS[current];
    var stepDur = 60 / track.bpm / 2;
    while (nextTime < ctx.currentTime + 0.3) {
      var i = step % track.pattern.length;
      var swing = track.swing && step % 2 === 1 ? stepDur * track.swing : 0;
      var when = nextTime + swing;

      var note = track.pattern[i] + 12 * track.octave;
      playTone(musicBus, note, when, stepDur * 0.85, track.lead, track.leadGain);

      if (i % 4 === 0) {
        var bassNote = track.bassPattern[(step >> 2) % track.bassPattern.length] - 24;
        playTone(musicBus, bassNote, when, stepDur * 1.6, track.bass, track.bassGain);
      }

      nextTime += stepDur;
      step += 1;
    }
  }

  function startMusic() {
    if (!ensure()) return;
    if (timer) return;
    nextTime = ctx.currentTime + 0.08;
    step = 0;
    timer = window.setInterval(tick, 90);
    tick();
  }

  function stopMusic() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function setTrack(name) {
    if (!TRACKS[name]) return;
    current = name;
    if (timer) {
      stopMusic();
      startMusic();
    }
  }

  function setMusic(on) {
    musicOn = on;
    if (musicBus && ctx) {
      musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.05);
    }
    if (on) startMusic();
    else stopMusic();
  }

  function setSfx(on) {
    sfxOn = on;
    if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.03);
  }

  function blip(semitone, duration, wave, peak) {
    if (!sfxOn || !ensure()) return;
    playTone(sfxBus, semitone, ctx.currentTime + 0.005, duration, wave || "square", peak || 0.14);
  }

  function sequence(list, gap) {
    if (!sfxOn || !ensure()) return;
    var t = ctx.currentTime + 0.005;
    list.forEach(function (semi, i) {
      playTone(sfxBus, semi, t + i * gap, gap * 0.9, "square", 0.12);
    });
  }

  function noise(duration, gainValue) {
    if (!sfxOn || !ensure()) return;
    var frames = Math.floor(ctx.sampleRate * duration);
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 700;
    gain.gain.value = gainValue || 0.12;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start();
  }

  var SFX = {
    eat: function () { blip(12, 0.08, "square", 0.12); blip(19, 0.1, "square", 0.08); },
    power: function () { sequence([0, 4, 7, 12], 0.05); },
    dash: function () { noise(0.12, 0.14); blip(7, 0.1, "sawtooth", 0.1); },
    kill: function () { sequence([7, 3, 0], 0.06); noise(0.16, 0.1); },
    die: function () { sequence([0, -3, -7, -12], 0.09); noise(0.3, 0.12); },
    level: function () { sequence([0, 7, 12, 19], 0.07); },
    molt: function () { blip(-5, 0.14, "triangle", 0.1); },
    start: function () { sequence([0, 5, 12], 0.08); }
  };

  return {
    resume: resume,
    start: function () { resume(); if (musicOn) startMusic(); },
    stop: function () { stopMusic(); },
    setTrack: setTrack,
    setMusic: setMusic,
    setSfx: setSfx,
    play: function (name) {
      if (SFX[name]) SFX[name]();
    },
    get track() { return current; }
  };
})();
