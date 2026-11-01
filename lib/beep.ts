export function beep() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Play 3 loud beeps in a row
    [0, 0.15, 0.3].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'square'; // Square wave is louder and more piercing
      osc.frequency.value = 800; // High pitch
      
      gain.gain.setValueAtTime(1, ctx.currentTime + delay); // Full volume
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.1); // Quick fade
      
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    });
  } catch (e) {
    console.error("Audio error:", e);
  }
}
