(function() {
	const BALANCE = typeof module !== "undefined" && module.exports ? require("./balance.js") : globalThis.PDD_BALANCE;
	//#region src/game/config.ts
	const Color = {
		Red: 1,
		Green: 2,
		Blue: 3,
		Yellow: 4,
		Diamond: 5
	};
	const GEM_HEX = {
		[Color.Red]: "#e23b3b",
		[Color.Green]: "#3cb85a",
		[Color.Blue]: "#3a6fe0",
		[Color.Yellow]: "#e2c43a",
		[Color.Diamond]: "#f4fbff"
	};
	const INK = "#12140f";
	const BONE = "#e6e1d6";
	const MUTED = "#9a937f";
	const AMBER = "#e2a43a";
	const BLOOD = "#8f2d2d";
	const STEEL = "#3d5a80";
	const FIELD = "#1a1e16";
	const WELL = "#242920";
	const LINE = "#34392e";
	const ZOMBIE_KIND = [
		"normal",
		"runner",
		"tank",
		"shooter",
		"saboteur"
	];
	const SPAWN_WEIGHTS = [
		.4,
		.2,
		.15,
		.15,
		.1
	];
	/** Threat first, then closest x. Shooters chip the base from range, so they outrank the front line. */
	const THREAT = {
		shooter: 0,
		runner: 1,
		saboteur: 2,
		normal: 3,
		tank: 4
	};
	const ZOMBIE_HEX = {
		normal: "#3cb85a",
		runner: "#e2c43a",
		tank: "#1f4d32",
		shooter: "#7a4ea3",
		saboteur: "#e07a2f"
	};
	const SPAWN_START = 1.8;
	const CRASH_BASE = .2;
	const CRASH_BONUS = .15;
	const STEP = 1 / 60;
	const SAVE_KEY = "pdd-save-v2";
	function crashChance(spawnInterval) {
		const t = 1 - spawnInterval / SPAWN_START;
		return CRASH_BASE + Math.min(1, Math.max(0, t)) * CRASH_BONUS;
	}
	function diamondCountdown(towersSpawned) {
		const mod = towersSpawned % 30;
		return mod === 0 ? 30 : 30 - mod;
	}
	//#endregion
	//#region src/game/audio.ts
	let ctx$1 = null;
	let sfxBus = null;
	let muted = false;
	function context() {
		if (typeof window === "undefined") return null;
		if (!ctx$1) {
			const Ctor = window.AudioContext ?? window.webkitAudioContext;
			if (!Ctor) return null;
			ctx$1 = new Ctor({ latencyHint: "interactive" });
			sfxBus = ctx$1.createGain();
			sfxBus.gain.value = .8;
			sfxBus.connect(ctx$1.destination);
		}
		return ctx$1;
	}
	/** Call synchronously inside the first pointer/key handler. */
	function unlockAudio() {
		const audio = context();
		if (audio && audio.state === "suspended") audio.resume();
	}
	function resumeAudio() {
		if (ctx$1 && ctx$1.state === "suspended") ctx$1.resume();
	}
	function setMuted(next) {
		muted = next;
		if (!sfxBus || !ctx$1) return;
		sfxBus.gain.setTargetAtTime(next ? 1e-4 : .8, ctx$1.currentTime, .02);
	}
	function toggleMuted() {
		setMuted(!muted);
		return muted;
	}
	const TONE = {
		shoot: {
			freq: 640,
			dur: .06,
			type: "square",
			gain: .08
		},
		rocket: {
			freq: 180,
			dur: .18,
			type: "sawtooth",
			gain: .12
		},
		explode: {
			freq: 90,
			dur: .22,
			type: "triangle",
			gain: .16
		},
		clear: {
			freq: 520,
			dur: .1,
			type: "square",
			gain: .07
		},
		hurt: {
			freq: 140,
			dur: .16,
			type: "sawtooth",
			gain: .12
		},
		over: {
			freq: 110,
			dur: .4,
			type: "triangle",
			gain: .14
		},
		lock: {
			freq: 220,
			dur: .05,
			type: "square",
			gain: .05
		},
		rotate: {
			freq: 760,
			dur: .04,
			type: "square",
			gain: .04
		}
	};
	function playSfx(name) {
		const audio = ctx$1;
		if (!audio || !sfxBus || muted || audio.state !== "running") return;
		const tone = TONE[name];
		const osc = audio.createOscillator();
		const gain = audio.createGain();
		osc.type = tone.type;
		osc.frequency.value = tone.freq * (.96 + Math.random() * .08);
		osc.connect(gain);
		gain.connect(sfxBus);
		const t = audio.currentTime;
		gain.gain.setValueAtTime(1e-4, t);
		gain.gain.exponentialRampToValueAtTime(tone.gain, t + .01);
		gain.gain.exponentialRampToValueAtTime(1e-4, t + tone.dur);
		osc.start(t);
		osc.stop(t + tone.dur + .02);
		osc.onended = () => {
			osc.disconnect();
			gain.disconnect();
		};
	}
	//#endregion
	//#region src/game/input.ts
	const GAME_KEYS = /* @__PURE__ */ new Set([
		"ArrowLeft",
		"ArrowRight",
		"ArrowDown",
		"ArrowUp",
		"Space",
		"KeyA",
		"KeyD",
		"KeyS",
		"KeyZ",
		"KeyX",
		"KeyP",
		"KeyR",
		"KeyM",
		"Escape",
		"Enter"
	]);
	function radial(x, y, dead = .2) {
		const m = Math.hypot(x, y);
		if (m < dead) return {
			x: 0,
			y: 0
		};
		const scale = (m - dead) / (1 - dead) / m;
		return {
			x: x * scale,
			y: y * scale
		};
	}
	var Input = class {
		keys = /* @__PURE__ */ new Set();
		holds = {
			left: false,
			right: false,
			soft: false
		};
		edges = {
			rotate: false,
			hard: false,
			pause: false,
			start: false,
			restart: false,
			mute: false
		};
		padPrev = new Array(16).fill(false);
		constructor() {
			window.addEventListener("keydown", this.onDown);
			window.addEventListener("keyup", this.onUp);
			window.addEventListener("blur", this.clear);
			document.addEventListener("visibilitychange", this.onHide);
		}
		dispose() {
			window.removeEventListener("keydown", this.onDown);
			window.removeEventListener("keyup", this.onUp);
			window.removeEventListener("blur", this.clear);
			document.removeEventListener("visibilitychange", this.onHide);
			this.clear();
		}
		setHold(name, down) {
			this.holds[name] = down;
		}
		tap(name) {
			this.edges[name] = true;
		}
		sample() {
			let left = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.holds.left;
			let right = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.holds.right;
			let soft = this.keys.has("ArrowDown") || this.keys.has("KeyS") || this.holds.soft;
			const pads = navigator.getGamepads?.() ?? [];
			for (const pad of pads) {
				if (!pad) continue;
				const stick = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
				if ((pad.buttons[14]?.pressed ?? false) || stick.x < -.35) left = true;
				if ((pad.buttons[15]?.pressed ?? false) || stick.x > .35) right = true;
				if ((pad.buttons[13]?.pressed ?? false) || stick.y > .35) soft = true;
				const edgeButton = (index, edge) => {
					const down = pad.buttons[index]?.pressed ?? false;
					if (down && !this.padPrev[index]) this.edges[edge] = true;
					this.padPrev[index] = down;
				};
				edgeButton(0, "rotate");
				edgeButton(1, "hard");
				edgeButton(9, "pause");
			}
			let moveX = 0;
			if (left && !right) moveX = -1;
			else if (right && !left) moveX = 1;
			const actions = {
				moveX,
				soft,
				rotate: this.edges.rotate,
				hard: this.edges.hard,
				pause: this.edges.pause,
				start: this.edges.start,
				restart: this.edges.restart,
				mute: this.edges.mute
			};
			this.edges.rotate = false;
			this.edges.hard = false;
			this.edges.pause = false;
			this.edges.start = false;
			this.edges.restart = false;
			this.edges.mute = false;
			return actions;
		}
		onDown = (event) => {
			if (GAME_KEYS.has(event.code)) event.preventDefault();
			this.keys.add(event.code);
			if (event.repeat) return;
			if (event.code === "ArrowUp" || event.code === "KeyZ" || event.code === "KeyX") this.edges.rotate = true;
			if (event.code === "Space") this.edges.hard = true;
			if (event.code === "Escape" || event.code === "KeyP") this.edges.pause = true;
			if (event.code === "Enter") this.edges.start = true;
			if (event.code === "KeyR") this.edges.restart = true;
			if (event.code === "KeyM") this.edges.mute = true;
		};
		onUp = (event) => {
			this.keys.delete(event.code);
		};
		clear = () => {
			this.keys.clear();
			for (const name of Object.keys(this.edges)) this.edges[name] = false;
			this.holds.left = false;
			this.holds.right = false;
			this.holds.soft = false;
		};
		onHide = () => {
			if (document.hidden) this.clear();
		};
	};
	//#endregion
	//#region src/game/rng.ts
	/** Mulberry32. `next()` is in [0, 1). */
	function mulberry32(seed) {
		let a = seed >>> 0;
		const next = () => {
			a |= 0;
			a = a + 1831565813 | 0;
			let t = Math.imul(a ^ a >>> 15, 1 | a);
			t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
		return {
			next,
			int(min, maxInclusive) {
				return min + Math.floor(next() * (maxInclusive - min + 1));
			},
			pick(items) {
				return items[Math.floor(next() * items.length)];
			}
		};
	}
	function pickWeighted(rng, items, weights) {
		let sum = 0;
		for (const w of weights) sum += w;
		let r = rng.next() * sum;
		for (let i = 0; i < items.length; i++) {
			r -= weights[i] ?? 0;
			if (r <= 0) return items[i];
		}
		return items[items.length - 1];
	}
	//#endregion
	//#region src/game/combat.ts
	const SPEED = {
		normal: [18, 42],
		runner: [60, 90],
		tank: [9, 18],
		shooter: [12, 24],
		saboteur: [24, 36]
	};
	const HP = {
		normal: 1,
		runner: 1,
		tank: 3,
		shooter: 2,
		saboteur: 1
	};
	function contactOutcome(kind) {
		return {
			damage: kind === "tank" ? 3 : 1,
			sabotage: kind === "saboteur"
		};
	}
	/** Dying never sabotages. Junk drops only when a saboteur reaches the base. */
	function deathOutcome() {
		return {
			score: 50,
			sabotage: false
		};
	}
	function createZombie(kind, rng, id) {
		const tank = kind === "tank";
		const w = tank ? 30 : 22;
		const h = tank ? 30 : 22;
		const [min, max] = SPEED[kind];
		const bandTop = 18;
		const bandBottom = 160 - h - 8;
		return {
			id,
			kind,
			x: 428,
			y: rng.int(bandTop, Math.max(bandTop, bandBottom)),
			w,
			h,
			hp: HP[kind],
			maxHp: HP[kind],
			speed: min + rng.next() * (max - min),
			attack: 0,
			alive: true
		};
	}
	function pickZombieKind(sim) {
		const shooters = sim.zombies.filter(z => z.alive && z.kind === "shooter").length;
		const unlock = { normal: 1, runner: 2, tank: 3, shooter: 4, saboteur: 5 };
		const weights = SPAWN_WEIGHTS.map((weight, i) => {
			const kind = ZOMBIE_KIND[i];
			return sim.wave >= unlock[kind] && BALANCE.threatCost[kind] <= sim.waveBudget &&
				(kind !== "shooter" || shooters < (sim.wave < 6 ? 1 : 2)) ? weight : 0;
		});
		const eligible = ZOMBIE_KIND.filter((_, i) => weights[i] > 0);
		return eligible.length ? pickWeighted(sim.enemyRng, eligible, weights.filter(w => w > 0)) : null;
	}
	function spreadFor(distance, rng) {
		if (distance > 280) return rng.int(-18, 18);
		if (distance > 140) return rng.int(-8, 8);
		return 0;
	}
	function randomWarY(rng) {
		return rng.int(26, 144);
	}
	function byThreat(a, b) {
		return THREAT[a.kind] - THREAT[b.kind] || a.x - b.x;
	}
	/**
	* Rockets spend their splash against a virtual HP pool first.
	* Normal shots then fill whatever threat is still predicted alive,
	* so a rocket doesn't get a full volley dumped into the same corpse.
	*/
	function planVolley(zombies, normalCount, rocketCount, rng) {
		const living = zombies.filter((zombie) => zombie.alive && zombie.hp > 0);
		const virtual = /* @__PURE__ */ new Map();
		for (const zombie of living) virtual.set(zombie.id, zombie.hp);
		const ordered = [...living].sort(byThreat);
		const aims = [];
		for (let i = 0; i < rocketCount; i++) {
			const target = ordered.find((zombie) => (virtual.get(zombie.id) ?? 0) > 0) ?? ordered[0];
			if (!target) {
				aims.push({
					y: randomWarY(rng),
					targetId: null,
					kind: "rocket"
				});
				continue;
			}
			const y = target.y + target.h / 2;
			aims.push({
				y,
				targetId: target.id,
				kind: "rocket"
			});
			const tx = target.x + target.w / 2;
			for (const zombie of living) {
				const dx = zombie.x + zombie.w / 2 - tx;
				const dy = zombie.y + zombie.h / 2 - y;
				if (Math.hypot(dx, dy) <= 70) virtual.set(zombie.id, (virtual.get(zombie.id) ?? 0) - 2);
			}
		}
		for (let i = 0; i < normalCount; i++) {
			const target = ordered.find((zombie) => (virtual.get(zombie.id) ?? 0) > 0);
			if (!target) {
				const fallback = ordered[0];
				const y = fallback ? fallback.y + fallback.h / 2 + spreadFor(fallback.x - 50, rng) : randomWarY(rng);
				aims.push({
					y,
					targetId: null,
					kind: "normal"
				});
				continue;
			}
			const distance = target.x - 50;
			const y = target.y + target.h / 2 + spreadFor(distance, rng);
			virtual.set(target.id, (virtual.get(target.id) ?? 0) - 1);
			aims.push({
				y,
				targetId: target.id,
				kind: "normal"
			});
		}
		return aims;
	}
	function makeBullet(aim, stagger) {
		const rocket = aim.kind === "rocket";
		const w = rocket ? 16 : 10;
		const h = rocket ? 16 : 5;
		return {
			x: 50 - stagger,
			y: aim.y - h / 2,
			w,
			h,
			speed: rocket ? 540 : 720,
			kind: aim.kind,
			damage: rocket ? 2 : 1,
			alive: true
		};
	}
	function makeEnemyShot(x, y) {
		return {
			x,
			y: y - 4,
			w: 10,
			h: 8,
			speed: 220,
			alive: true
		};
	}
	function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
		return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
	}
	/** Among overlapping zombies, the leftmost one is in front of the muzzle. */
	function frontmostHit(bullet, zombies) {
		let best = null;
		for (const zombie of zombies) {
			if (!zombie.alive || zombie.hp <= 0) continue;
			if (!overlaps(bullet.x, bullet.y, bullet.w, bullet.h, zombie.x, zombie.y, zombie.w, zombie.h)) continue;
			if (!best || zombie.x < best.x) best = zombie;
		}
		return best;
	}
	function shooterHolds(zombie) {
		return zombie.kind === "shooter" && zombie.x <= 292;
	}
	//#endregion
	//#region src/game/flood.ts
	/**
	* Scanline flood fill.
	*
	* The original DFS pushed every orthogonal neighbor into a JS array of tuples,
	* so each cell could be enqueued up to four times and every step allocated.
	* This version:
	* - walks a horizontal span once and enqueues only the first cell of each
	*   neighboring span (not every cell)
	* - stamps visited/queued with a generation counter, so searches reuse one buffer
	* - stores packed indices in a typed ring, with no per-cell objects
	*
	* Each accepted cell is written to `out` exactly once. Queue capacity is 4×N;
	* a cell is stamped when enqueued, so a healthy fill stays well under that.
	*/
	var FloodScratch = class {
		cols;
		rows;
		visited;
		queued;
		queue;
		gen = 1;
		constructor(cols, rows) {
			this.cols = cols;
			this.rows = rows;
			const n = cols * rows;
			this.visited = new Uint8Array(n);
			this.queued = new Uint8Array(n);
			this.queue = new Uint16Array(n * 4);
		}
		bump() {
			this.gen++;
			if (this.gen >= 250) {
				this.visited.fill(0);
				this.queued.fill(0);
				this.gen = 1;
			}
		}
	};
	function floodFillScanline(match, start, cols, rows, scratch, out) {
		const { visited, queued, queue } = scratch;
		const gen = scratch.gen;
		const n = cols * rows;
		if (start < 0 || start >= n || !match(start) || visited[start] === gen) return 0;
		let head = 0;
		let tail = 0;
		queue[tail++] = start;
		queued[start] = gen;
		let count = 0;
		while (head < tail) {
			const idx = queue[head++];
			if (visited[idx] === gen) continue;
			const y = idx / cols | 0;
			let x = idx - y * cols;
			while (x > 0) {
				const leftIndex = y * cols + (x - 1);
				if (visited[leftIndex] === gen || !match(leftIndex)) break;
				x--;
			}
			let spanUp = false;
			let spanDown = false;
			while (x < cols) {
				const i = y * cols + x;
				if (visited[i] === gen || !match(i)) break;
				visited[i] = gen;
				out[count++] = i;
				if (y > 0) {
					const up = i - cols;
					if (visited[up] !== gen && queued[up] !== gen && match(up)) {
						if (!spanUp) {
							if (tail >= queue.length) throw new Error("flood queue overflow");
							queue[tail++] = up;
							queued[up] = gen;
							spanUp = true;
						}
					} else spanUp = false;
				}
				if (y + 1 < rows) {
					const down = i + cols;
					if (visited[down] !== gen && queued[down] !== gen && match(down)) {
						if (!spanDown) {
							if (tail >= queue.length) throw new Error("flood queue overflow");
							queue[tail++] = down;
							queued[down] = gen;
							spanDown = true;
						}
					} else spanDown = false;
				}
				x++;
			}
		}
		return count;
	}
	//#endregion
	//#region src/game/puzzle.ts
	const ORTHO = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];
	function createBoard(cols = 10, rows = 14) {
		const n = cols * rows;
		return {
			cols,
			rows,
			cells: Array.from({ length: n }, () => null),
			scratch: new FloodScratch(cols, rows),
			out: new Uint16Array(n),
			clearMask: new Uint8Array(n)
		};
	}
	function gemInvariant(gem) {
		if (gem.diamond) return gem.color === Color.Diamond && !gem.crash;
		if (gem.color === Color.Diamond) return false;
		return gem.color >= Color.Red && gem.color <= Color.Yellow;
	}
	function signature(gem) {
		return `${gem.color}:${gem.crash ? 1 : 0}:${gem.diamond ? 1 : 0}`;
	}
	/** Rotation is legal only if it moves whole gems (color + crash + diamond together). */
	function rotationIsValid(before, after) {
		if (before.length !== 3 || after.length !== 3) return false;
		if (!before.every(gemInvariant) || !after.every(gemInvariant)) return false;
		return before.map(signature).sort().join("|") === after.map(signature).sort().join("|");
	}
	function cloneGem(gem) {
		return {
			color: gem.color,
			crash: gem.crash,
			diamond: gem.diamond
		};
	}
	/**
	* Cycle the three gems down the tower: bottom receives the top gem.
	* Rejects the turn if the diamond flag would detach from its gem.
	*/
	function rotateTower(gems) {
		if (gems.length !== 3) return {
			gems: gems.map(cloneGem),
			ok: false
		};
		const next = [
			cloneGem(gems[2]),
			cloneGem(gems[0]),
			cloneGem(gems[1])
		];
		if (!rotationIsValid(gems, next)) return {
			gems: gems.map(cloneGem),
			ok: false
		};
		return {
			gems: next,
			ok: true
		};
	}
	function towerCollides(board, x, cells) {
		for (const cell of cells) {
			if (x < 0 || x >= board.cols || cell.y >= board.rows) return true;
			if (cell.y >= 0 && board.cells[cell.y * board.cols + x]) return true;
		}
		return false;
	}
	/** Any gem still above the well means lock-out — those gems are not written. */
	function isLockout(cells, rows = 14) {
		return cells.some((cell) => cell.y < 0 || cell.y >= rows);
	}
	function commitTower(board, x, cells) {
		if (isLockout(cells, board.rows)) return "lockout";
		for (const cell of cells) {
			const index = cell.y * board.cols + x;
			if (board.cells[index]) return "lockout";
		}
		for (const cell of cells) board.cells[cell.y * board.cols + x] = cell.gem;
		return "ok";
	}
	function compactColumn(board, x) {
		const stack = [];
		for (let y = board.rows - 1; y >= 0; y--) {
			const gem = board.cells[y * board.cols + x];
			if (gem) stack.push(gem);
		}
		for (let y = board.rows - 1; y >= 0; y--) {
			const fromBottom = board.rows - 1 - y;
			board.cells[y * board.cols + x] = stack[fromBottom] ?? null;
		}
	}
	function compactAll(board) {
		for (let x = 0; x < board.cols; x++) compactColumn(board, x);
	}
	function diamondTarget(board, index) {
		const x = index % board.cols;
		const y = index / board.cols | 0;
		const adjacent = [
			0,
			0,
			0,
			0,
			0
		];
		for (const [dx, dy] of ORTHO) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows) continue;
			const gem = board.cells[ny * board.cols + nx];
			if (!gem || gem.diamond || gem.color < Color.Red || gem.color > Color.Yellow) continue;
			adjacent[gem.color] = (adjacent[gem.color] ?? 0) + 1;
		}
		let best = 0;
		const tied = [];
		for (let color = Color.Red; color <= Color.Yellow; color++) {
			const n = adjacent[color] ?? 0;
			if (n > best) {
				best = n;
				tied.length = 0;
				tied.push(color);
			} else if (n === best && n > 0) tied.push(color);
		}
		if (best === 0 || tied.length === 0) return null;
		if (tied.length === 1) return tied[0];
		const totals = [
			0,
			0,
			0,
			0,
			0
		];
		for (const gem of board.cells) if (gem && !gem.diamond && gem.color >= Color.Red && gem.color <= Color.Yellow) totals[gem.color] = (totals[gem.color] ?? 0) + 1;
		tied.sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a - b);
		return tied[0];
	}
	/** One simultaneous clear. Groups of 4+, crash groups of 2–3, and diamond wipes. */
	function findClears(board) {
		const { cells, cols, rows, scratch, out, clearMask } = board;
		const n = cols * rows;
		clearMask.fill(0);
		scratch.bump();
		for (let i = 0; i < n; i++) {
			const gem = cells[i];
			if (!gem || gem.diamond) continue;
			if (scratch.visited[i] === scratch.gen) continue;
			const color = gem.color;
			const groupLen = floodFillScanline((index) => {
				const cell = cells[index];
				return !!cell && !cell.diamond && cell.color === color;
			}, i, cols, rows, scratch, out);
			let hasCrash = false;
			for (let k = 0; k < groupLen; k++) if (cells[out[k]]?.crash) hasCrash = true;
			if (groupLen >= 4 || hasCrash && groupLen >= 2) for (let k = 0; k < groupLen; k++) clearMask[out[k]] = 1;
		}
		for (let i = 0; i < n; i++) {
			if (!cells[i]?.diamond) continue;
			const target = diamondTarget(board, i);
			if (target == null) continue;
			clearMask[i] = 1;
			for (let j = 0; j < n; j++) {
				const other = cells[j];
				if (other && !other.diamond && other.color === target) clearMask[j] = 1;
			}
		}
		let count = 0;
		let reds = 0;
		const colors = [0, 0, 0, 0, 0, 0];
		for (let i = 0; i < n; i++) {
			if (!clearMask[i]) continue;
			count++;
			colors[cells[i].color]++;
			if (cells[i]?.color === Color.Red) reds++;
		}
		return {
			count,
			reds, colors
		};
	}
	/**
	* Pack the well, then repeat clear → compact until stable.
	* A crash or diamond that only touches its target after falling resolves now,
	* not on the next lock.
	*/
	function resolveCascade(board) {
		compactAll(board);
		let chain = 0;
		let cleared = 0;
		let reds = 0;
		let score = 0;
		const colors = [0, 0, 0, 0, 0, 0];
		for (let step = 0; step < 20; step++) {
			const found = findClears(board);
			if (found.count === 0) break;
			chain++;
			score += found.count * 10 * chain;
			reds += found.reds;
			found.colors.forEach((n, color) => colors[color] += n);
			cleared += found.count;
			for (let i = 0; i < board.cells.length; i++) if (board.clearMask[i]) board.cells[i] = null;
			compactAll(board);
		}
		return {
			chain,
			cleared,
			reds,
			score, colors
		};
	}
	/** Junk never lands in the active tower's column, and never as a crash or diamond. */
	function dropJunk(board, forbiddenCol, count, rng) {
		const cols = [];
		for (let x = 0; x < board.cols; x++) if (x !== forbiddenCol) cols.push(x);
		for (let i = cols.length - 1; i > 0; i--) {
			const j = rng.int(0, i);
			const swap = cols[i];
			cols[i] = cols[j];
			cols[j] = swap;
		}
		let placed = 0;
		for (const x of cols) {
			if (placed >= count) break;
			let room = false;
			for (let y = 0; y < board.rows; y++) if (!board.cells[y * board.cols + x]) {
				room = true;
				break;
			}
			if (!room || board.cells[x]) continue;
			board.cells[x] = {
				color: rng.int(Color.Red, Color.Yellow),
				crash: false,
				diamond: false
			};
			compactColumn(board, x);
			placed++;
		}
		return placed;
	}
	//#endregion
	//#region src/game/storage.ts
	function readBest(mode = "standard") {
		if (typeof localStorage === "undefined") return 0;
		try {
			const raw = localStorage.getItem(`${SAVE_KEY}-${mode}`);
			if (!raw) return 0;
			const parsed = JSON.parse(raw);
			if (parsed.version !== 1 || typeof parsed.best !== "number" || !Number.isFinite(parsed.best)) return 0;
			return Math.max(0, Math.floor(parsed.best));
		} catch {
			return 0;
		}
	}
	function writeBest(best, mode = "standard") {
		if (typeof localStorage === "undefined") return;
		try {
			const save = {
				version: 1,
				best: Math.max(0, Math.floor(best))
			};
			localStorage.setItem(`${SAVE_KEY}-${mode}`, JSON.stringify(save));
		} catch {}
	}
	//#endregion
	//#region src/game/sim.ts
	function pushSfx(sim, name) {
		if (sim.sfx.length < 16) sim.sfx.push(name);
	}
	function noteScore(sim, amount) {
		if (amount <= 0) return;
		sim.score += amount;
		if (sim.tutorial) return;
		if (sim.score > sim.best) {
			sim.best = sim.score;
			writeBest(sim.best, sim.mode);
		}
	}
	function blankRun(sim, seed, best) {
		sim.phase = "title";
		sim.seed = seed >>> 0;
		sim.rng = mulberry32(sim.seed);
		sim.enemyRng = mulberry32(sim.seed ^ 0x9e3779b9);
		sim.aimRng = mulberry32(sim.seed ^ 0x85ebca6b);
		sim.junkRng = mulberry32(sim.seed ^ 0xc2b2ae35);
		sim.mode = sim.mode || "standard";
		sim.profile = BALANCE.profiles[sim.mode];
		sim.shield = sim.profile.initialShield;
		sim.blueMeter = sim.greenMeter = sim.yellowMeter = 0;
		sim.suppression = sim.shieldFlash = 0;
		sim.wave = 1;
		sim.waveTime = sim.rest = 0;
		sim.waveBudget = 14;
		sim.healsThisWave = 0;
		sim.nextGems = null;
		sim.tutorial = false;
		sim.endReason = null;
		sim.notice = "Onda 1 · forme grupos de 4 para defender a base";
		sim.noticeUntil = 6;
		sim.stats = { damage: {}, blocked: 0, healed: 0, cleared: 0, fired: 0, hits: 0,
			intercepted: 0, rocketsIntercepted: 0, maxShooters: 0, maxChain: 0, maxOccupancy: 0 };
		sim.trace = [];
		sim.traceTruncated = false;
		sim.steps = 0;
		sim.time = 0;
		sim.acc = 0;
		sim.board = createBoard();
		sim.active = null;
		sim.holdDir = 0;
		sim.dasMs = 0;
		sim.dasRepeating = false;
		sim.fallMs = 0;
		sim.hp = BALANCE.maxHp;
		sim.score = 0;
		sim.best = best;
		sim.towersSpawned = 0;
		sim.redMeter = 0;
		sim.spawnTimer = .35;
		sim.spawnInterval = sim.profile.startInterval;
		sim.nextId = 1;
		sim.zombies = [];
		sim.bullets = [];
		sim.shots = [];
		sim.booms = [];
		sim.floaters = [];
		sim.shake = 0;
		sim.flash = 0;
		sim.sfx = [];
		sim.lastChain = 0;
	}
	function createSim(seed = 1, best = readBest()) {
		const sim = {};
		blankRun(sim, seed, best);
		return sim;
	}
	function startGame(sim, seed = Math.random() * 1e9 | 0, mode = sim.mode) {
		const best = mode === sim.mode && !sim.tutorial ? sim.best : readBest(mode);
		sim.mode = BALANCE.profiles[mode] ? mode : "standard";
		blankRun(sim, seed, best);
		sim.phase = "playing";
		if (!spawnTower(sim)) endGame(sim);
	}
	function endGame(sim, reason = "board") {
		if (sim.phase === "over") return;
		sim.phase = "over";
		sim.endReason = reason;
		sim.active = null;
		if (!sim.tutorial && sim.score > sim.best) {
			sim.best = sim.score;
			writeBest(sim.best, sim.mode);
		}
		pushSfx(sim, "over");
	}
	function hurt(sim, amount, source = "contact") {
		if (sim.phase !== "playing") return true;
		if (source === "shooter" && sim.shield > 0) {
			sim.shield--;
			sim.shieldFlash = 1;
			sim.stats.blocked++;
			announce(sim, "Escudo bloqueou um disparo");
			return false;
		}
		sim.stats.damage[source] = (sim.stats.damage[source] || 0) + Math.min(sim.hp, amount);
		announce(sim, source === "shooter" ? "Base atingida por disparo" : `Base atingida: ${enemyLabel(source)}`);
		sim.hp = Math.max(0, sim.hp - amount);
		sim.shake = Math.min(1, sim.shake + .5);
		pushSfx(sim, "hurt");
		if (sim.hp <= 0) {
			endGame(sim, "base");
			return true;
		}
		return false;
	}
	function makeGem(sim, diamond) {
		if (diamond) return {
			color: Color.Diamond,
			crash: false,
			diamond: true
		};
		return {
			color: sim.rng.int(Color.Red, Color.Yellow),
			crash: sim.rng.next() < crashChance(sim.spawnInterval),
			diamond: false
		};
	}
	function spawnTower(sim) {
		sim.towersSpawned += 1;
		const x = 5;
		const gems = sim.nextGems || makeTowerGems(sim, sim.towersSpawned);
		sim.nextGems = makeTowerGems(sim, sim.towersSpawned + 1);
		const cells = gems.map((gem, i) => ({
			y: -1 - i,
			gem
		}));
		const tower = {
			x,
			cells,
			grounded: false,
			lockMs: 0,
			lockResets: 0
		};
		if (towerCollides(sim.board, x, cells) || blockedAboveWell(sim.board, tower)) {
			sim.active = null;
			return false;
		}
		sim.active = tower;
		sim.fallMs = 0;
		return true;
	}
	function makeTowerGems(sim, number) {
		return Array.from({ length: 3 }, (_, i) => makeGem(sim, number % 30 === 0 && i === 0));
	}
	function enemyLabel(kind) {
		return ({ normal: "normal", runner: "corredor", tank: "tanque", shooter: "atirador", saboteur: "sabotador" })[kind] || kind;
	}
	function announce(sim, message) {
		sim.notice = message;
		sim.noticeUntil = sim.time + 4;
	}
	function startTutorial(sim) {
		startGame(sim, 42, "standard");
		sim.tutorial = true;
		sim.shield = 0;
		for (let y = 11; y < 14; y++) sim.board.cells[y * 10 + 5] = { color: Color.Blue, crash: false, diamond: false };
		sim.active.cells.forEach(cell => cell.gem = { color: Color.Blue, crash: false, diamond: false });
		announce(sim, "Treino: pressione Espaço ou Cai para juntar as azuis na coluna marcada.");
		sim.noticeUntil = Infinity;
	}
	function blockedAboveWell(board, tower) {
		const dropped = tower.cells.map((cell) => ({ y: cell.y + 1 }));
		return tower.cells.some((cell) => cell.y < 0) && towerCollides(board, tower.x, dropped);
	}
	function resetLock(sim) {
		const tower = sim.active;
		if (!tower?.grounded) return;
		if (tower.lockResets >= 15) return;
		tower.lockResets += 1;
		tower.lockMs = 150;
	}
	function tryShift(sim, dir) {
		const tower = sim.active;
		if (!tower || sim.phase !== "playing") return false;
		if (towerCollides(sim.board, tower.x + dir, tower.cells)) return false;
		tower.x += dir;
		resetLock(sim);
		return true;
	}
	function tryRotate(sim) {
		const tower = sim.active;
		if (!tower || sim.phase !== "playing") return;
		const turned = rotateTower(tower.cells.map((cell) => cell.gem));
		if (!turned.ok) return;
		for (let i = 0; i < tower.cells.length; i++) tower.cells[i].gem = turned.gems[i];
		pushSfx(sim, "rotate");
		resetLock(sim);
	}
	function fallOne(sim) {
		const tower = sim.active;
		if (!tower) return false;
		const next = tower.cells.map((cell) => ({ y: cell.y + 1 }));
		if (towerCollides(sim.board, tower.x, next)) {
			if (!tower.grounded) {
				tower.grounded = true;
				tower.lockMs = 150;
			}
			return false;
		}
		for (const cell of tower.cells) cell.y += 1;
		tower.grounded = false;
		tower.lockResets = 0;
		return true;
	}
	function awardCascade(sim, cascade) {
		if (cascade.cleared <= 0) return;
		const colors = cascade.colors || [0, cascade.reds, 0, 0, 0, 0];
		sim.stats.cleared += cascade.cleared;
		sim.stats.maxChain = Math.max(sim.stats.maxChain, cascade.chain);
		// At most one bonus energy per resolution, even for very long chains.
		sim.blueMeter += colors[Color.Blue] + (cascade.chain > 1 ? 1 : 0);
		sim.shield = Math.min(BALANCE.shieldCap, sim.shield + Math.floor(sim.blueMeter / BALANCE.shieldCost));
		sim.blueMeter = sim.shield === BALANCE.shieldCap ? 0 : sim.blueMeter % BALANCE.shieldCost;
		sim.greenMeter += colors[Color.Green];
		const heals = Math.min(Math.floor(sim.greenMeter / BALANCE.healCost), BALANCE.maxHp - sim.hp,
			BALANCE.healsPerWave - sim.healsThisWave);
		sim.hp += heals;
		sim.stats.healed += heals;
		sim.healsThisWave += heals;
		sim.greenMeter = sim.hp === BALANCE.maxHp || sim.healsThisWave === BALANCE.healsPerWave ? 0 : sim.greenMeter % BALANCE.healCost;
		sim.yellowMeter += colors[Color.Yellow];
		if (sim.yellowMeter >= BALANCE.suppressionCost) {
			sim.suppression = BALANCE.suppressionSeconds;
			sim.yellowMeter %= BALANCE.suppressionCost;
			announce(sim, "Supressão: movimento e carga inimiga reduzidos");
		}
		noteScore(sim, cascade.score);
		sim.redMeter += cascade.reds;
		const rockets = Math.floor(sim.redMeter / BALANCE.rocketCost);
		sim.redMeter %= BALANCE.rocketCost;
		sim.lastChain = cascade.chain;
		sim.flash = 1;
		pushSfx(sim, "clear");
		sim.floaters.push({
			text: cascade.chain > 1 ? `CADEIA x${cascade.chain}` : `+${cascade.score}`,
			x: 210,
			y: 38,
			age: 0,
			life: .9
		});
		planVolley(sim.zombies, cascade.cleared, rockets, sim.aimRng).forEach((aim, index) => {
			sim.bullets.push(makeBullet(aim, index * (aim.kind === "rocket" ? 22 : 12)));
			sim.stats.fired++;
		});
		if (rockets > 0) pushSfx(sim, "rocket");
		else if (cascade.cleared > 0) pushSfx(sim, "shoot");
		if (sim.tutorial && colors[Color.Blue] >= 4) endGame(sim, "tutorial");
	}
	function lockTower(sim) {
		const tower = sim.active;
		if (!tower || sim.phase !== "playing") return;
		const result = commitTower(sim.board, tower.x, tower.cells);
		sim.active = null;
		if (result === "lockout") {
			endGame(sim);
			return;
		}
		pushSfx(sim, "lock");
		awardCascade(sim, resolveCascade(sim.board));
		if (sim.phase !== "playing") return;
		if (!spawnTower(sim)) endGame(sim);
	}
	function hardDrop(sim) {
		if (!sim.active || sim.phase !== "playing") return;
		let dropped = 0;
		while (fallOne(sim)) dropped += 1;
		if (dropped > 0) noteScore(sim, dropped);
		lockTower(sim);
	}
	function applyOneShots(sim, actions) {
		if (actions.mute) {}
		if (sim.phase === "title" && actions.start) {
			startGame(sim);
			return;
		}
		if (sim.phase === "over" && (actions.restart || actions.start)) {
			startGame(sim);
			return;
		}
		if (actions.pause) {
			if (sim.phase === "playing") sim.phase = "paused";
			else if (sim.phase === "paused") sim.phase = "playing";
		}
		if (sim.phase !== "playing") return;
		if (actions.rotate) tryRotate(sim);
		if (actions.hard && sim.phase === "playing") hardDrop(sim);
	}
	function applyHeld(sim, dt, actions) {
		if (sim.phase !== "playing" || !sim.active) return;
		const dir = actions.moveX;
		if (dir !== sim.holdDir) {
			sim.holdDir = dir;
			sim.dasMs = 0;
			sim.dasRepeating = false;
			if (dir !== 0) tryShift(sim, dir);
		} else if (dir !== 0) {
			sim.dasMs += dt * 1e3;
			const gate = sim.dasRepeating ? 40 : 170;
			if (sim.dasMs >= gate) {
				sim.dasMs = 0;
				sim.dasRepeating = true;
				tryShift(sim, dir);
			}
		}
		if (!sim.active || sim.phase !== "playing") return;
		sim.fallMs += dt * 1e3;
		const interval = actions.soft ? 50 : 600;
		if (sim.fallMs >= interval) {
			sim.fallMs = 0;
			fallOne(sim);
		}
		const tower = sim.active;
		if (tower?.grounded) {
			tower.lockMs -= dt * 1e3;
			if (tower.lockMs <= 0) lockTower(sim);
		}
	}
	function compactAlive(list) {
		let write = 0;
		for (let i = 0; i < list.length; i++) if (list[i].alive) list[write++] = list[i];
		list.length = write;
	}
	function updateWave(sim, dt) {
		if (sim.rest > 0) {
			sim.rest = Math.max(0, sim.rest - dt);
			if (sim.rest === 0) {
				sim.wave++;
				sim.waveTime = 0;
				sim.spawnTimer = 0;
				sim.waveBudget = Math.min(65, 14 + (sim.wave - 1) * 5);
				sim.healsThisWave = 0;
				sim.spawnInterval = Math.max(sim.profile.minInterval, sim.profile.startInterval - (sim.wave - 1) * .15);
				const tips = { 2: "Corredores: rápidos, mas frágeis", 3: "Tanques: 3 HP e 3 de dano por contato",
					4: "Atiradores: use azuis para bloquear disparos", 5: "Sabotadores: causam dano e adicionam gemas ao chegar" };
				announce(sim, `Onda ${sim.wave} · ${tips[sim.wave] || "Segure a linha"}`);
			}
			return;
		}
		sim.waveTime += dt;
		// Recovery starts only after threats and their projectiles are gone.
		if ((sim.waveTime >= BALANCE.waveSeconds || sim.waveBudget < 1) &&
			!sim.zombies.some(z => z.alive) && !sim.shots.some(s => s.alive)) {
			sim.rest = BALANCE.restSeconds;
			announce(sim, "Campo seguro · prepare o tabuleiro para a próxima onda");
			return;
		}
		if (sim.waveTime >= BALANCE.waveSeconds || sim.waveBudget < 1) return;
		sim.spawnTimer += dt;
		if (sim.spawnTimer >= sim.spawnInterval) {
			sim.spawnTimer = 0;
			const kind = pickZombieKind(sim);
			if (kind) {
				sim.zombies.push(createZombie(kind, sim.enemyRng, sim.nextId++));
				sim.waveBudget -= BALANCE.threatCost[kind];
			}
		}
	}
	function explodeRocket(sim, bullet) {
		const cx = bullet.x + bullet.w / 2;
		const cy = bullet.y + bullet.h / 2;
		sim.booms.push({ x: cx, y: cy, radius: 70, age: 0, life: .28 });
		sim.shake = Math.min(1, sim.shake + .35);
		pushSfx(sim, "explode");
		for (const zombie of sim.zombies) {
			if (!zombie.alive || Math.hypot(zombie.x + zombie.w / 2 - cx, zombie.y + zombie.h / 2 - cy) > 70) continue;
			zombie.hp -= bullet.damage;
			sim.stats.hits++;
			if (zombie.hp <= 0) killZombie(sim, zombie);
		}
	}
	function updateCombat(sim, dt) {
		if (sim.phase !== "playing") return;
		if (sim.tutorial) return;
		updateWave(sim, dt);
		const slow = sim.suppression > 0 ? BALANCE.suppressionFactor : 1;
		sim.suppression = Math.max(0, sim.suppression - dt);
		sim.stats.maxShooters = Math.max(sim.stats.maxShooters, sim.zombies.filter(z => z.alive && z.kind === "shooter").length);
		for (const zombie of sim.zombies) {
			if (!zombie.alive) continue;
			if (shooterHolds(zombie)) {
				zombie.attack += dt * slow;
				if (zombie.attack >= BALANCE.shooterSeconds) {
					zombie.attack = 0;
					const muzzleY = zombie.y + zombie.h / 2;
					sim.shots.push(makeEnemyShot(zombie.x, muzzleY));
				}
			} else zombie.x -= zombie.speed * dt * slow;
			if (zombie.x < 42) {
				const hit = contactOutcome(zombie.kind);
				zombie.alive = false;
				if (hit.sabotage) {
					const column = sim.active?.x ?? -1;
					dropJunk(sim.board, column, 3, sim.junkRng);
					awardCascade(sim, resolveCascade(sim.board));
					sim.floaters.push({
						text: "SABOTAGEM",
						x: 420 * .55,
						y: 77.5,
						age: 0,
						life: 1
					});
				}
				if (hurt(sim, hit.damage, zombie.kind)) return;
			}
		}
		const bulletCount = sim.bullets.length;
		for (let i = 0; i < bulletCount; i++) {
			const bullet = sim.bullets[i];
			if (!bullet.alive) continue;
			const prevX = bullet.x;
			bullet.x += bullet.speed * dt;
			const sweepX = Math.min(prevX, bullet.x);
			const sweepW = bullet.w + Math.abs(bullet.x - prevX);
			if (bullet.x > 440) {
				bullet.alive = false;
				continue;
			}
			let shotDown = false;
			for (const shot of sim.shots) {
				if (!shot.alive) continue;
				if (overlaps(sweepX, bullet.y, sweepW, bullet.h, shot.x, shot.y, shot.w, shot.h)) {
					shot.alive = false;
					bullet.alive = false;
					shotDown = true;
					sim.stats.intercepted++;
					if (bullet.kind === "rocket") {
						sim.stats.rocketsIntercepted++;
						bullet.x = shot.x;
						explodeRocket(sim, bullet);
					}
					sim.booms.push({
						x: shot.x,
						y: shot.y,
						radius: 16,
						age: 0,
						life: .2
					});
					break;
				}
			}
			if (shotDown) continue;
			const hit = frontmostHit({
				...bullet,
				x: sweepX,
				w: sweepW
			}, sim.zombies);
			if (!hit) continue;
			bullet.alive = false;
			if (bullet.kind === "rocket") {
				explodeRocket(sim, bullet);
			} else {
				sim.stats.hits++;
				hit.hp -= bullet.damage;
				if (hit.hp <= 0) killZombie(sim, hit);
			}
			if (sim.phase !== "playing") return;
		}
		for (const shot of sim.shots) {
			if (!shot.alive) continue;
			shot.x -= shot.speed * dt;
			if (shot.x < 42) {
				shot.alive = false;
				if (hurt(sim, 1, "shooter")) return;
			}
		}
		compactAlive(sim.zombies);
		compactAlive(sim.bullets);
		compactAlive(sim.shots);
	}
	function killZombie(sim, zombie) {
		if (!zombie.alive) return;
		zombie.alive = false;
		const reward = deathOutcome();
		noteScore(sim, reward.score);
		if (reward.sabotage) dropJunk(sim.board, sim.active?.x ?? -1, 3, sim.junkRng);
	}
	function tickFx(sim, dt) {
		sim.time += dt;
		sim.shieldFlash = Math.max(0, sim.shieldFlash - dt * 2);
		sim.stats.maxOccupancy = Math.max(sim.stats.maxOccupancy, sim.board.cells.filter(Boolean).length);
		sim.shake = Math.max(0, sim.shake - dt * 1.8);
		sim.flash = Math.max(0, sim.flash - dt * 3);
		for (const boom of sim.booms) boom.age += dt;
		for (const floater of sim.floaters) floater.age += dt;
		sim.booms = sim.booms.filter((boom) => boom.age < boom.life);
		sim.floaters = sim.floaters.filter((floater) => floater.age < floater.life);
	}
	function tick(sim, dt, actions) {
		if (sim.phase !== "playing") return;
		applyHeld(sim, dt, actions);
		if (sim.phase === "playing") updateCombat(sim, dt);
		if (sim.phase === "playing") tickFx(sim, dt);
	}
	function advance(sim, frameDt, actions) {
		const wasPlaying = sim.phase === "playing";
		function record() {
			if (sim.tutorial) return;
			if (sim.trace.length < 60000) sim.trace.push({ step: sim.steps, dt: Math.min(frameDt, .1), actions: { ...actions, start: false, restart: false, pause: false } });
			else sim.traceTruncated = true;
		}
		if (wasPlaying && !actions.pause) record();
		applyOneShots(sim, actions);
		if (sim.phase !== "playing") return;
		if (!wasPlaying) record();
		sim.acc += Math.min(frameDt, .1);
		let steps = 0;
		while (sim.acc >= .016666666666666666 && steps < 6) {
			sim.acc -= STEP;
			steps += 1;
			tick(sim, STEP, actions);
			if (sim.phase === "playing") sim.steps++;
		}
	}
	function hudDiamond(sim) {
		if (sim.active?.cells.some((cell) => cell.gem.diamond)) return "Diamante em jogo";
		return `Diamante em ${diamondCountdown(sim.towersSpawned)}`;
	}
	function ghostCells(sim) {
		const tower = sim.active;
		if (!tower) return null;
		let drop = 0;
		while (!towerCollides(sim.board, tower.x, tower.cells.map((cell) => ({ y: cell.y + drop + 1 })))) {
			drop += 1;
			if (drop > 40) break;
		}
		if (drop === 0) return null;
		return tower.cells.map((cell) => ({
			x: tower.x,
			y: cell.y + drop,
			gem: cell.gem
		}));
	}
	//#endregion
	//#region src/game/render.ts
	const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	function round(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, r);
	}
	function symbol(ctx, gem, x, y, s) {
		const cx = x + s / 2;
		const cy = y + s / 2;
		ctx.strokeStyle = INK;
		ctx.fillStyle = INK;
		ctx.lineWidth = 2;
		if (gem.diamond) {
			ctx.beginPath();
			ctx.moveTo(cx, y + 5);
			ctx.lineTo(x + s - 5, cy);
			ctx.lineTo(cx, y + s - 5);
			ctx.lineTo(x + 5, cy);
			ctx.closePath();
			ctx.stroke();
			ctx.fillStyle = BONE;
			ctx.beginPath();
			ctx.arc(cx, cy, s * .14, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		if (gem.color === 1) {
			ctx.beginPath();
			ctx.moveTo(x + 7, cy);
			ctx.lineTo(x + s - 7, cy);
			ctx.stroke();
		} else if (gem.color === 2) {
			ctx.beginPath();
			ctx.moveTo(cx, y + 7);
			ctx.lineTo(cx, y + s - 7);
			ctx.moveTo(x + 7, cy);
			ctx.lineTo(x + s - 7, cy);
			ctx.stroke();
		} else if (gem.color === 3) {
			ctx.beginPath();
			ctx.arc(cx, cy, s * .18, 0, Math.PI * 2);
			ctx.stroke();
		} else if (gem.color === 4) {
			ctx.beginPath();
			ctx.moveTo(cx, y + 7);
			ctx.lineTo(x + s - 8, y + s - 8);
			ctx.lineTo(x + 8, y + s - 8);
			ctx.closePath();
			ctx.stroke();
		}
		if (gem.crash) {
			ctx.beginPath();
			ctx.arc(cx, cy, s * .34, 0, Math.PI * 2);
			ctx.strokeStyle = BONE;
			ctx.lineWidth = 2;
			ctx.stroke();
		}
	}
	function drawGem(ctx, gem, px, py, alpha) {
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = GEM_HEX[gem.color] ?? "#e6e1d6";
		round(ctx, px + 1, py + 1, 24, 24, 4);
		ctx.fill();
		symbol(ctx, gem, px, py, 26);
		ctx.restore();
	}
	function drawZombieBody(ctx, z) {
		ctx.fillStyle = ZOMBIE_HEX[z.kind];
		ctx.strokeStyle = INK;
		ctx.lineWidth = 2;
		if (z.kind === "runner") {
			ctx.beginPath();
			ctx.moveTo(z.x + 6, z.y);
			ctx.lineTo(z.x + z.w, z.y + 4);
			ctx.lineTo(z.x + z.w - 4, z.y + z.h);
			ctx.lineTo(z.x, z.y + z.h - 4);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		} else {
			round(ctx, z.x, z.y, z.w, z.h, z.kind === "tank" ? 3 : 5);
			ctx.fill();
			ctx.stroke();
		}
		if (z.kind === "tank") {
			ctx.fillStyle = INK;
			ctx.fillRect(z.x + 4, z.y + z.h * .35, z.w - 8, 4);
		} else if (z.kind === "shooter") {
			ctx.fillStyle = INK;
			ctx.fillRect(z.x - 8, z.y + z.h / 2 - 2, 10, 4);
		} else if (z.kind === "saboteur") {
			ctx.strokeStyle = INK;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(z.x + z.w / 2, z.y + 5);
			ctx.lineTo(z.x + z.w - 6, z.y + z.h - 5);
			ctx.lineTo(z.x + 6, z.y + z.h - 5);
			ctx.closePath();
			ctx.stroke();
		} else {
			ctx.fillStyle = INK;
			ctx.fillRect(z.x + 5, z.y + 6, 4, 4);
		}
	}
	function drawZombie(ctx, z) {
		if (!z.alive) return;
		drawZombieBody(ctx, z);
		if (z.kind === "shooter") {
			const charge = Math.min(1, z.attack / BALANCE.shooterSeconds);
			ctx.strokeStyle = AMBER;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(z.x + z.w / 2, z.y + z.h / 2, 8, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
			ctx.stroke();
		}
		if (z.maxHp > 1) for (let i = 0; i < z.maxHp; i++) {
			ctx.fillStyle = i < z.hp ? BONE : INK;
			ctx.fillRect(z.x + 3 + i * 7, z.y - 5, 5, 3);
		}
	}
	function draw(ctx, sim) {
		const shake = reduceMotion ? 0 : sim.shake;
		const ox = Math.sin(sim.time * 48) * shake * 5;
		const oy = Math.cos(sim.time * 37) * shake * 3;
		ctx.clearRect(0, 0, 420, 548);
		ctx.fillStyle = FIELD;
		ctx.fillRect(0, 0, 420, 548);
		ctx.save();
		ctx.translate(ox, oy);
		ctx.fillStyle = INK;
		ctx.fillRect(0, 10, 420, 150);
		ctx.strokeStyle = LINE;
		ctx.beginPath();
		ctx.moveTo(0, 160);
		ctx.lineTo(420, 160);
		ctx.stroke();
		ctx.fillStyle = STEEL;
		ctx.fillRect(0, 10, 42, 150);
		ctx.fillStyle = INK;
		ctx.fillRect(34, 28, 8, 114);
		ctx.fillStyle = AMBER;
		ctx.fillRect(39, 83, 8, 4);
		if (sim.shield > 0 || sim.shieldFlash > 0) {
			ctx.fillStyle = `rgba(100,180,255,${.18 + sim.shieldFlash * .5})`;
			ctx.fillRect(44, 12, 5 + sim.shield * 2, 146);
		}
		if (sim.suppression > 0) {
			ctx.fillStyle = "rgba(226,196,58,.12)";
			ctx.fillRect(55, 10, 365, 150);
		}
		for (const zombie of sim.zombies) drawZombie(ctx, zombie);
		for (const shot of sim.shots) {
			if (!shot.alive) continue;
			ctx.fillStyle = ZOMBIE_HEX.shooter;
			round(ctx, shot.x, shot.y, shot.w, shot.h, 3);
			ctx.fill();
		}
		for (const bullet of sim.bullets) {
			if (!bullet.alive) continue;
			if (bullet.kind === "rocket") {
				ctx.fillStyle = BLOOD;
				ctx.beginPath();
				ctx.arc(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2, bullet.w / 2, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = AMBER;
				ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
			}
		}
		for (const boom of sim.booms) {
			const t = boom.age / boom.life;
			const radius = reduceMotion ? boom.radius : boom.radius * (.35 + t * .65);
			ctx.beginPath();
			ctx.arc(boom.x, boom.y, radius, 0, Math.PI * 2);
			ctx.strokeStyle = `rgba(226, 122, 47, ${1 - t})`;
			ctx.lineWidth = 3;
			ctx.stroke();
		}
		ctx.fillStyle = WELL;
		ctx.fillRect(80, 172, 260, 364);
		if (sim.flash > 0) {
			ctx.fillStyle = `rgba(226, 164, 58, ${sim.flash * .18})`;
			ctx.fillRect(80, 172, 260, 364);
		}
		const ghost = ghostCells(sim);
		if (ghost && sim.phase === "playing") for (const cell of ghost) {
			if (cell.y < 0) continue;
			drawGem(ctx, cell.gem, 80 + cell.x * 26, 172 + cell.y * 26, .28);
		}
		for (let y = 0; y < 14; y++) for (let x = 0; x < 10; x++) {
			const gem = sim.board.cells[y * 10 + x];
			if (!gem) continue;
			drawGem(ctx, gem, 80 + x * 26, 172 + y * 26, 1);
		}
		if (sim.active && sim.phase === "playing") {
			const blink = sim.active.grounded && sim.active.lockMs < 60 ? .55 : 1;
			for (const cell of sim.active.cells) {
				if (cell.y < 0) continue;
				drawGem(ctx, cell.gem, 80 + sim.active.x * 26, 172 + cell.y * 26, blink);
			}
		}
		ctx.strokeStyle = LINE;
		ctx.lineWidth = 1;
		for (let i = 0; i <= 10; i++) {
			const x = 80 + i * 26;
			ctx.beginPath();
			ctx.moveTo(x, 172);
			ctx.lineTo(x, 536);
			ctx.stroke();
		}
		for (let i = 0; i <= 14; i++) {
			const y = 172 + i * 26;
			ctx.beginPath();
			ctx.moveTo(80, y);
			ctx.lineTo(340, y);
			ctx.stroke();
		}
		ctx.fillStyle = BONE;
		ctx.font = "600 14px Barlow, sans-serif";
		for (const floater of sim.floaters) {
			const t = floater.age / floater.life;
			ctx.globalAlpha = 1 - t;
			ctx.fillText(floater.text, floater.x - 40, floater.y - t * 16);
			ctx.globalAlpha = 1;
		}
		ctx.fillStyle = MUTED;
		ctx.font = "500 11px Barlow, sans-serif";
		ctx.fillText("BASE", 6, 26);
		ctx.restore();
	}
	//#endregion
	//#region src/html/boot.ts
	// A DOM-free entry point lets tests execute the same simulation as the browser.
	if (typeof module !== "undefined" && module.exports) {
		module.exports = { BALANCE, createSim, startGame, startTutorial, advance, updateCombat, updateWave,
			hurt, awardCascade, resolveCascade, createBoard, createZombie, makeBullet, makeEnemyShot,
			mulberry32, pickZombieKind, makeGem, hardDrop, spawnTower, rotateTower };
		return;
	}
	const canvas = document.querySelector("#field");
	const ctx = canvas?.getContext("2d");
	if (!canvas || !ctx) throw new Error("Canvas #field ausente em index.html");
	const input = new Input();
	const sim = createSim(Math.random() * 1e9 | 0);
	const hpEl = must("#hp");
	const hpBar = must("#hp-bar");
	const scoreEl = must("#score");
	const bestEl = must("#best");
	const diamondEl = must("#diamond");
	const redEl = must("#red");
	const redBar = must("#red-bar");
	const overlay = must("#overlay");
	const overlayTitle = must("#overlay-title");
	const overlayBody = must("#overlay-body");
	const action = must("#action");
	const pauseBtn = must("#pause");
	const muteBtn = must("#mute");
	const rules = must("#rules");
	const difficulty = must("#difficulty");
	const shieldEl = must("#shield");
	const blueEl = must("#blue-energy");
	const healEl = must("#heal");
	const healLimitEl = must("#heal-limit");
	const suppressionEl = must("#suppression");
	const waveEl = must("#wave");
	const noticeEl = must("#notice");
	const nextEl = must("#next");
	const sameSeedBtn = must("#same-seed");
	const menuBtn = must("#menu");
	const exportBtn = must("#export");
	let previewSignature = "";
	function must(selector) {
		const node = document.querySelector(selector);
		if (!node) throw new Error(`Falta ${selector} no index.html`);
		return node;
	}
	function paintHud(live) {
		shieldEl.textContent = `${live.shield}/${BALANCE.shieldCap}`;
		blueEl.textContent = live.shield === BALANCE.shieldCap ? "Escudo completo" : `${live.blueMeter}/${BALANCE.shieldCost} azuis`;
		healEl.textContent = `${live.greenMeter}/${BALANCE.healCost}`;
		healLimitEl.textContent = live.hp === BALANCE.maxHp ? "Base íntegra" : `${BALANCE.healsPerWave - live.healsThisWave} HP disponíveis nesta onda`;
		suppressionEl.textContent = live.suppression > 0 ? `${live.suppression.toFixed(1)} s ativa` : `${live.yellowMeter}/${BALANCE.suppressionCost}`;
		waveEl.textContent = live.tutorial ? "Treino sem inimigos" : live.rest > 0 ? `Recuperação · ${Math.ceil(live.rest)} s` : `Onda ${live.wave} · ${Math.floor(live.time)} s`;
		const notice = live.time < live.noticeUntil ? live.notice : "Azuis protegem de tiros · verdes reparam · amarelas desaceleram";
		if (noticeEl.textContent !== notice) noticeEl.textContent = notice;
		const signature = JSON.stringify(live.nextGems);
		if (signature !== previewSignature) {
			previewSignature = signature;
			nextEl.replaceChildren();
			const names = ["", "vermelha", "verde", "azul", "amarela", "diamante"];
			const labels = [];
			for (const gem of [...(live.nextGems || [])].reverse()) {
				const node = document.createElement("span");
				node.style.backgroundColor = GEM_HEX[gem.color];
				node.textContent = ["", "−", "+", "○", "△", "◇"][gem.color];
				node.style.outline = gem.crash ? "2px solid white" : "none";
				labels.push(`${names[gem.color]}${gem.crash ? " com anel" : ""}`);
				nextEl.append(node);
			}
			nextEl.setAttribute("aria-label", `Próxima torre, de cima para baixo: ${labels.join(", ")}`);
		}
		hpEl.textContent = String(live.hp);
		hpBar.style.transform = `scaleX(${live.hp / BALANCE.maxHp})`;
		scoreEl.textContent = String(live.score);
		bestEl.textContent = String(live.best);
		diamondEl.textContent = hudDiamond(live);
		redEl.textContent = `${live.redMeter}/5`;
		redBar.style.transform = `scaleX(${live.redMeter / 5})`;
		const playing = live.phase === "playing";
		overlay.hidden = playing;
		pauseBtn.hidden = !playing;
		rules.hidden = live.phase !== "title";
		sameSeedBtn.hidden = live.phase !== "over" || live.tutorial;
		exportBtn.hidden = live.phase !== "over" || live.tutorial;
		menuBtn.hidden = live.phase !== "paused" && live.phase !== "over";
		if (live.phase === "title") {
			overlayTitle.textContent = "Segure a linha";
			overlayBody.textContent = "";
			action.textContent = "Entrar na defesa";
		} else if (live.phase === "paused") {
			overlayTitle.textContent = "Pausa";
			overlayBody.textContent = "A horda espera. O tabuleiro também.";
			action.textContent = "Continuar";
		} else if (live.phase === "over") {
			overlayTitle.textContent = live.endReason === "tutorial" ? "Escudo carregado!" : live.endReason === "base" ? "Base destruída" : "Tabuleiro bloqueado";
			const damage = Object.entries(live.stats.damage).map(([kind, n]) => `${enemyLabel(kind)}: ${n}`).join(", ") || "nenhum";
			overlayBody.textContent = live.endReason === "tutorial" ? "Azuis geram tiros e proteção. O escudo bloqueia disparos automaticamente; inimigos em contato ainda causam dano. Você está pronto para defender a base." :
				`${Math.floor(live.time)} s · onda ${live.wave} · ${live.score} pontos\nMaior cadeia: ${live.stats.maxChain} · bloqueios: ${live.stats.blocked} · reparos: ${live.stats.healed}\nDano recebido — ${damage}\nSemente: ${live.seed} · ${live.profile.label}`;
			action.textContent = live.tutorial ? "Entrar na defesa" : "Nova partida";
		}
	}
	function setMuteLabel(muted) {
		muteBtn.textContent = muted ? "Mudo" : "Som";
		muteBtn.setAttribute("aria-label", muted ? "Ativar som" : "Silenciar");
	}
	function tap(name) {
		unlockAudio();
		if (name === "mute") {
			setMuteLabel(toggleMuted());
			return;
		}
		input.tap(name);
	}
	action.addEventListener("click", () => {
		if (sim.phase === "paused") tap("pause");
		else { unlockAudio(); startGame(sim, undefined, difficulty.value); }
	});
	must("#tutorial").addEventListener("click", () => { unlockAudio(); startTutorial(sim); });
	sameSeedBtn.addEventListener("click", () => { unlockAudio(); startGame(sim, sim.seed, sim.mode); });
	menuBtn.addEventListener("click", () => { input.clear(); sim.phase = "title"; });
	difficulty.addEventListener("change", () => {
		sim.mode = difficulty.value;
		sim.profile = BALANCE.profiles[sim.mode];
		sim.best = readBest(sim.mode);
	});
	exportBtn.addEventListener("click", () => {
		const report = { version: BALANCE.version, seed: sim.seed, mode: sim.mode, duration: sim.time,
			wave: sim.wave, reason: sim.endReason, score: sim.score, stats: sim.stats,
			clearedPerSecond: sim.time ? sim.stats.cleared / sim.time : 0,
			trace: sim.trace, traceTruncated: sim.traceTruncated };
		const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = `puzzle-dead-${sim.seed}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});
	pauseBtn.addEventListener("click", () => tap("pause"));
	muteBtn.addEventListener("click", () => tap("mute"));
	for (const button of document.querySelectorAll("[data-tap]")) button.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		tap(button.dataset.tap);
	});
	for (const button of document.querySelectorAll("[data-hold]")) {
		const name = button.dataset.hold;
		const down = (event) => {
			event.preventDefault();
			unlockAudio();
			button.setPointerCapture(event.pointerId);
			input.setHold(name, true);
		};
		button.addEventListener("pointerdown", down);
		button.addEventListener("pointerup", () => input.setHold(name, false));
		button.addEventListener("pointercancel", () => input.setHold(name, false));
		button.addEventListener("lostpointercapture", () => input.setHold(name, false));
	}
	function autoPause() {
		input.clear();
		if (sim.phase === "playing") sim.phase = "paused";
	}
	window.addEventListener("blur", autoPause);
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) autoPause();
		else resumeAudio();
	});
	let last = performance.now();
	const loop = (now) => {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.floor(420 * dpr);
		const height = Math.floor(548 * dpr);
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const dt = Math.min(.1, (now - last) / 1e3);
		last = now;
		const actions = input.sample();
		if (actions.mute) setMuteLabel(toggleMuted());
		advance(sim, dt, actions);
		for (const name of sim.sfx) playSfx(name);
		sim.sfx.length = 0;
		draw(ctx, sim);
		paintHud(sim);
		requestAnimationFrame(loop);
	};
	paintHud(sim);
	requestAnimationFrame(loop);
	//#endregion
})();
