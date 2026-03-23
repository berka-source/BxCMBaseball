// =======================
// TIMING FEEDBACK SYSTEM
// =======================

function getTimingFeedback(batTip, ball) {
  const diff = batTip.x - ball.x;

  if (Math.abs(diff) < 25) {
    return { label: "PERFECT!", powerBonus: 1.15, direction: 1 };
  }

  if (diff < -25) {
    return { label: "TOO EARLY", powerBonus: 0.85, direction: 1.2 };
  }

  return { label: "TOO LATE", powerBonus: 0.85, direction: 0.8 };
}


// =======================
// MODIFY tryHit FUNCTION
// =======================

function tryHit(batTip) {
  if (!ball || !ball.active || ball.hit) return;

  const d = Math.hypot(ball.x - batTip.x, ball.y - batTip.y);
  if (d > CONTACT_DISTANCE) return;
  if (batVelocity.speed < parseFloat(swingThresholdSlider.value)) return;

  ball.hit = true;

  // 🎯 NEW TIMING LOGIC
  const timing = getTimingFeedback(batTip, ball);

  let power = clamp(batVelocity.speed / 700, 0.35, 2.1);
  power *= timing.powerBonus;

  const upwardSwing = clamp((-batVelocity.y) / 700, -0.4, 1.0);

  let lateral;
  if (battingSide === "right") {
    lateral = batVelocity.x >= 0 ? 1 : -1;
  } else {
    lateral = batVelocity.x <= 0 ? -1 : 1;
  }

  const result = classifyHit(power, upwardSwing);

  const baseVX = 9 + power * 8;
  const baseVY = -(4 + Math.max(0, upwardSwing) * 7 + power * 2.2);

  // 🎯 APPLY TIMING DIRECTION
  ball.vx =
    lateral *
    baseVX *
    result.launchBoost *
    timing.direction +
    (Math.random() - 0.5) * 1.4;

  ball.vy =
    baseVY * result.launchBoost +
    (Math.random() - 0.5) * 1.0;

  ball.result = result.label;

  score += result.points;
  hits++;
  bestExitVelo = Math.max(bestExitVelo, power * 100);
  pitchesLeft--;

  // 🎯 UPDATED TEXT OUTPUT
  showHitText(result.label + " • " + timing.label);

  spawnConfetti(ball.x, ball.y, result.confettiCount);
  spawnStars(ball.x, ball.y, result.label);
  updateHud();

  if (result.label === "HOME RUN!") {
    playHomeRunSound();
    triggerHomeRunCelebration(ball.x, ball.y);
    instructionChip.textContent = "HOME RUN! PERFECT SWING!";
  } else if (result.label === "TRIPLE!" || result.label === "DOUBLE!") {
    playBigHitSound();
    instructionChip.textContent = timing.label;
  } else {
    playHitSound();
    instructionChip.textContent = timing.label;
  }
}
