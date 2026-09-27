(function (root) {
  const balance = Object.freeze({
    version: '2.0.0', maxHp: 10, rocketCost: 5,
    shieldCost: 4, shieldCap: 3, healCost: 10, healsPerWave: 2,
    suppressionCost: 6, suppressionSeconds: 2, suppressionFactor: 0.5,
    shooterSeconds: 3, waveSeconds: 30, restSeconds: 6,
    threatCost: { normal: 1, runner: 1.5, tank: 3, shooter: 4, saboteur: 2 },
    profiles: {
      standard: { label: 'Padrão', startInterval: 1.8, minInterval: 0.9, initialShield: 1 },
      advanced: { label: 'Avançado', startInterval: 1.5, minInterval: 0.6, initialShield: 0 }
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = balance;
  else root.PDD_BALANCE = balance;
})(globalThis);
