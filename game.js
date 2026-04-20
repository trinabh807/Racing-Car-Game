// ╔═══════════════════════════════════════════════════════╗
// ║   PIXEL RACER — game.js                               ║
// ║   Top-down arcade racing · 3 maps · Mascot driver     ║
// ╚═══════════════════════════════════════════════════════╝

// ── Canvas dimensions ─────────────────────────────────────
const CW = 460;   // canvas width
const CH = 700;   // canvas height

// ── Road layout ───────────────────────────────────────────
const ROAD_X  = 95;          // road left edge
const ROAD_W  = 270;         // road width
const ROAD_R  = ROAD_X + ROAD_W; // road right edge
const ROAD_MX = ROAD_X + ROAD_W / 2; // road centre x

// ── Car constants ─────────────────────────────────────────
const CAR_W      = 46;
const CAR_H      = 72;
const CAR_Y      = 565;   // car centre y (fixed)
const CAR_SPD    = 4;     // lateral move speed (px/frame)

// ── Physics ───────────────────────────────────────────────
const GRAVITY     = 0.62;
const JUMP_FORCE  = -17;  // negative = up
const AIR_IMMUNE  = 9;    // min jumpH (abs) to ignore obstacles

// ── Game speed ────────────────────────────────────────────
const SPD_MIN    = 2.8;
const SPD_MAX    = 13;
const SPD_ACCEL  = 0.0014; // base auto-acceleration per frame
const SPD_STEP   = 0.8;    // manual speed step per keypress
const SPD_DECAY  = 0.018;  // how fast manual boost/brake decays back to auto
const DISP_MAX   = 150;    // km/h shown on speedometer

// ── Utilities ─────────────────────────────────────────────
const rand    = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp   = (v, a, b) => Math.max(a, Math.min(b, v));

/** Draw a rounded rectangle path (no fill/stroke — caller does that). */
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** AABB overlap test. */
function overlaps(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
           a.y + a.h <= b.y || b.y + b.h <= a.y);
}


// ═══════════════════════════════════════════════
// CLASS  Particle
// ═══════════════════════════════════════════════
class Particle {
  constructor(x, y, color, vx, vy, life, size) {
    this.x = x;  this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;          // 0..1
    this.size = size;
    this.decay = rand(0.018, 0.04);
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.18;           // gravity
    this.vx *= 0.97;
    this.life -= this.decay;
    this.size *= 0.96;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.1, this.size), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  dead() { return this.life <= 0 || this.size < 0.3; }
}

/** Burst of hit particles around a point. */
function hitBurst(x, y, color = '#ff4444', n = 20) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const s = rand(2, 8);
    out.push(new Particle(x, y, color, Math.cos(a)*s, Math.sin(a)*s, rand(0.6,1), rand(3,7)));
  }
  return out;
}

/** Sparkle burst for coin collection. */
function coinBurst(x, y) {
  const cols = ['#ffd700','#ffe57a','#fff176','#ffed4a'];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const s = rand(1.5, 4.5);
    out.push(new Particle(x, y, cols[i % cols.length], Math.cos(a)*s, Math.sin(a)*s - 2, rand(0.7,1), rand(2,5)));
  }
  return out;
}


// ═══════════════════════════════════════════════
// CLASS  Coin
// ═══════════════════════════════════════════════
class Coin {
  constructor(x, y) {
    this.x = x;  this.y = y;
    this.r = 13;
    this.active = true;
    this.bob    = rand(0, Math.PI * 2); // phase offset
  }
  update(spd) {
    this.y   += spd;
    this.bob += 0.07;
  }
  draw(ctx) {
    if (!this.active) return;
    const dy = Math.sin(this.bob) * 3;
    ctx.save();
    ctx.translate(this.x, this.y + dy);

    // Glow
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, this.r + 6);
    glow.addColorStop(0, 'rgba(255,215,0,0.55)');
    glow.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, this.r + 6, 0, Math.PI * 2); ctx.fill();

    // Body
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();

    // Shine
    ctx.fillStyle = '#fff176';
    ctx.beginPath(); ctx.arc(-3, -3, this.r * 0.45, 0, Math.PI * 2); ctx.fill();

    // Label
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¢', 0, 1);

    ctx.restore();
  }
  offScreen() { return this.y > CH + 30; }
  hitbox()    { return { x: this.x - this.r, y: this.y - this.r, w: this.r*2, h: this.r*2 }; }
}


// ═══════════════════════════════════════════════
// CLASS  Bump
// ═══════════════════════════════════════════════
class Bump {
  constructor(x, y) {
    this.x = x;  this.y = y;
    this.w = randInt(38, 68);
    this.h = 16;
    this.active = true;
  }
  update(spd) { this.y += spd; }
  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(2, 5, this.w/2, this.h/3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bump hump
    ctx.fillStyle = '#e8c035';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w/2, this.h/2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stripe
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w/3, this.h/3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-5, -3, this.w/6, this.h/5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Arrow warning
    ctx.fillStyle = '#cc4400';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', 0, 1);

    ctx.restore();
  }
  offScreen() { return this.y > CH + 30; }
  hitbox()    { return { x: this.x - this.w/2, y: this.y - this.h/2, w: this.w, h: this.h }; }
}


// ═══════════════════════════════════════════════
// CLASS  Obstacle
// Types: 'cone' | 'barrier' | 'oilspill'
// ═══════════════════════════════════════════════
class Obstacle {
  constructor(x, y, type) {
    this.x = x;  this.y = y;
    this.type   = type;
    this.active = true;
    this.wobble = 0; // spin when hit
    // Dimensions per type
    if (type === 'cone')     { this.w = 26; this.h = 30; }
    if (type === 'barrier')  { this.w = 80; this.h = 24; }
    if (type === 'oilspill') { this.w = 68; this.h = 38; }
  }
  update(spd) {
    this.y += spd;
    if (this.wobble > 0) this.wobble -= 0.12;
  }
  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.wobble > 0) ctx.rotate(Math.sin(this.wobble * 4) * 0.35);
    switch (this.type) {
      case 'cone':     this._cone(ctx);     break;
      case 'barrier':  this._barrier(ctx);  break;
      case 'oilspill': this._oilspill(ctx); break;
    }
    ctx.restore();
  }

  _cone(ctx) {
    const hw = this.w / 2, hh = this.h / 2;
    // Base plate
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.ellipse(0, hh - 2, hw * 0.9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(3, hh, hw, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Orange body
    ctx.fillStyle = '#ff6200';
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(-hw, hh);
    ctx.lineTo(hw, hh);
    ctx.closePath();
    ctx.fill();
    // White stripe
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.28, -hh * 0.08);
    ctx.lineTo(hw * 0.28,  -hh * 0.08);
    ctx.lineTo(hw * 0.38,  hh * 0.22);
    ctx.lineTo(-hw * 0.38, hh * 0.22);
    ctx.closePath();
    ctx.fill();
    // Tip reflector
    ctx.fillStyle = '#ff2200';
    ctx.beginPath(); ctx.arc(0, -hh + 4, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  _barrier(ctx) {
    const hw = this.w / 2, hh = this.h / 2;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rrPath(ctx, -hw + 4, -hh + 5, this.w, this.h, 5);
    ctx.fill();
    // Striped body
    const gr = ctx.createLinearGradient(-hw, 0, hw, 0);
    gr.addColorStop(0,    '#ff0000');
    gr.addColorStop(0.18, '#ffffff');
    gr.addColorStop(0.36, '#ff0000');
    gr.addColorStop(0.54, '#ffffff');
    gr.addColorStop(0.72, '#ff0000');
    gr.addColorStop(0.9,  '#ffffff');
    gr.addColorStop(1,    '#ff0000');
    ctx.fillStyle = gr;
    rrPath(ctx, -hw, -hh, this.w, this.h, 5);
    ctx.fill();
    // Border
    ctx.strokeStyle = '#cc0000'; ctx.lineWidth = 2;
    rrPath(ctx, -hw, -hh, this.w, this.h, 5);
    ctx.stroke();
    // Reflectors
    ctx.fillStyle = '#ff9900';
    [-24, 0, 24].forEach(dx => {
      ctx.beginPath(); ctx.arc(dx, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  _oilspill(ctx) {
    const hw = this.w / 2, hh = this.h / 2;
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, hw);
    gr.addColorStop(0,   'rgba(70, 0, 100, 0.9)');
    gr.addColorStop(0.35,'rgba(0, 50, 130, 0.8)');
    gr.addColorStop(0.65,'rgba(0, 90, 60, 0.65)');
    gr.addColorStop(1,   'rgba(10, 10, 30, 0.45)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill();
    // Iridescent shimmer
    ctx.fillStyle = 'rgba(200, 180, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-6, -6, hw * 0.32, hh * 0.32, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,255,180,0.2)';
    ctx.beginPath();
    ctx.ellipse(8, 4, hw * 0.22, hh * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  offScreen() { return this.y > CH + 60; }
  hitbox() {
    const m = 5;
    return { x: this.x - this.w/2 + m, y: this.y - this.h/2 + m,
             w: this.w - m*2,           h: this.h - m*2 };
  }
}


// ═══════════════════════════════════════════════
// CLASS  Map
// Holds map theme + scrolling decorations
// ═══════════════════════════════════════════════
const MAP_THEMES = {
  'Pink Paradise Highway': {
    bgTop:    '#ffd0e8', bgBot:    '#ffb3cc',
    road:     '#f0a8c0', roadEdge: '#e06090',
    shoulder: '#fce8f4',
    lane:     '#ff80c0', laneGlow: false,
    ambience: 'pink',
  },
  'Desert Thunder Track': {
    bgTop:    '#ffe090', bgBot:    '#e89040',
    road:     '#c8a870', roadEdge: '#8b6510',
    shoulder: '#e8d4a0',
    lane:     '#ffffff', laneGlow: false,
    ambience: 'desert',
  },
  'Midnight Cyber City': {
    bgTop:    '#000818', bgBot:    '#000e28',
    road:     '#080818', roadEdge: '#00224a',
    shoulder: '#040410',
    lane:     '#00e5ff', laneGlow: true,
    ambience: 'cyber',
  },
};

class GameMap {
  constructor(name) {
    this.name   = name;
    this.t      = MAP_THEMES[name];
    this.scroll = 0;       // cumulative scroll offset for lane dashes
    this.decos  = [];      // shoulder decorations
    this.dust   = [];      // desert dust particles
    this._buildDecos();
  }

  /** Pre-generate a column of shoulder decorations that will loop. */
  _buildDecos() {
    for (let y = -1600; y < 200; y += randInt(70, 150)) {
      const side = Math.random() < 0.5 ? 'L' : 'R';
      const x    = side === 'L'
        ? randInt(8, ROAD_X - 12)
        : randInt(ROAD_R + 8, CW - 12);
      this.decos.push({ x, y, side, seed: Math.random() });
    }
  }

  update(spd) {
    this.scroll += spd;

    // Scroll decorations; wrap when off bottom
    for (const d of this.decos) {
      d.y += spd;
      if (d.y > CH + 120) {
        d.y -= CH + 1600;
        const side = Math.random() < 0.5 ? 'L' : 'R';
        d.side = side;
        d.x    = side === 'L'
          ? randInt(8, ROAD_X - 12)
          : randInt(ROAD_R + 8, CW - 12);
        d.seed = Math.random();
      }
    }

    // Desert dust
    if (this.t.ambience === 'desert' && Math.random() < 0.18) {
      this.dust.push({
        x: rand(0, CW), y: rand(0, CH),
        vx: rand(-0.4, 0.4), vy: rand(0.3, 0.8) + spd * 0.08,
        r: rand(1, 4), a: rand(0.08, 0.35), life: 1
      });
    }
    for (const p of this.dust) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.006;
    }
    this.dust = this.dust.filter(p => p.life > 0 && p.y < CH + 10);
  }

  draw(ctx) {
    const t = this.t;

    // ── Background gradient ──────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, t.bgTop); bg.addColorStop(1, t.bgBot);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);

    // ── Ambience layers ──────────────────────
    if (t.ambience === 'cyber')  this._cyberBg(ctx);
    if (t.ambience === 'desert') this._desertBg(ctx);
    if (t.ambience === 'pink')   this._pinkBg(ctx);

    // ── Shoulders ────────────────────────────
    ctx.fillStyle = t.shoulder;
    ctx.fillRect(0,       0, ROAD_X,        CH);
    ctx.fillRect(ROAD_R,  0, CW - ROAD_R,   CH);

    // ── Road surface ─────────────────────────
    ctx.fillStyle = t.road;
    ctx.fillRect(ROAD_X, 0, ROAD_W, CH);

    // Subtle vertical texture
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let i = 1; i < 7; i++) {
      ctx.fillRect(ROAD_X + (i / 7) * ROAD_W, 0, 1, CH);
    }

    // ── Road edges ───────────────────────────
    ctx.strokeStyle = t.roadEdge; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ROAD_X, 0); ctx.lineTo(ROAD_X, CH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROAD_R, 0); ctx.lineTo(ROAD_R, CH); ctx.stroke();

    // White kerb stripes
    this._kerbStripes(ctx);

    // ── Centre lane divider ───────────────────
    this._laneDivider(ctx);

    // ── Shoulder decorations ─────────────────
    for (const d of this.decos) {
      if (d.y < -80 || d.y > CH + 80) continue;
      switch (t.ambience) {
        case 'pink':   this._flower(ctx, d.x, d.y, d.seed);   break;
        case 'desert': this._cactus(ctx, d.x, d.y, d.seed);   break;
        case 'cyber':  this._building(ctx, d.x, d.y, d.seed); break;
      }
    }

    // ── Desert dust ──────────────────────────
    if (t.ambience === 'desert') {
      for (const p of this.dust) {
        ctx.save();
        ctx.globalAlpha = p.life * p.a;
        ctx.fillStyle   = 'rgba(210,165,85,1)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  /** Animated scrolling dashed centre line. */
  _laneDivider(ctx) {
    const dashLen = 28, gapLen = 18;
    const t = this.t;
    if (t.laneGlow) {
      ctx.shadowBlur = 14; ctx.shadowColor = t.lane;
    }
    ctx.strokeStyle = t.lane; ctx.lineWidth = 3;
    ctx.setLineDash([dashLen, gapLen]);
    ctx.lineDashOffset = -(this.scroll % (dashLen + gapLen));
    ctx.beginPath();
    ctx.moveTo(ROAD_MX, 0); ctx.lineTo(ROAD_MX, CH);
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.shadowBlur = 0;
  }

  /** Alternating red/white kerb marks at road edges. */
  _kerbStripes(ctx) {
    const h = 22, period = 44;
    const offset = Math.floor(this.scroll % period);
    for (let y = -h + offset; y < CH; y += period) {
      const even = Math.floor((y + offset) / h) % 2 === 0;
      ctx.fillStyle = even ? '#ff4444' : '#ffffff';
      ctx.fillRect(ROAD_X - 8, y, 8, h);
      ctx.fillStyle = even ? '#ffffff' : '#ff4444';
      ctx.fillRect(ROAD_R,     y, 8, h);
    }
  }

  // ── Ambience helpers ─────────────────────────
  _pinkBg(ctx) {
    // Soft clouds
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    [[55, 55, 48], [210, 38, 38], [380, 65, 42], [130, 100, 32]].forEach(([cx, cy, r]) => {
      ctx.beginPath(); ctx.arc(cx, cy, r,     0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*.6, cy+5, r*.7, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx-r*.6, cy+8, r*.6, 0, Math.PI*2); ctx.fill();
    });
    // Rainbow arc
    ['rgba(255,80,80,0.06)','rgba(255,200,0,0.05)','rgba(100,255,120,0.05)','rgba(80,100,255,0.06)'].forEach((c,i) => {
      ctx.strokeStyle = c; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(CW/2, -40, 170+i*16, 0, Math.PI); ctx.stroke();
    });
  }
  _desertBg(ctx) {
    // Dune silhouette
    ctx.fillStyle = 'rgba(200,145,70,0.22)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(110,CH*.18, 220,CH*.34, 330,CH*.12);
    ctx.bezierCurveTo(390,CH*.03, CW,CH*.22, CW, 0);
    ctx.closePath(); ctx.fill();
    // Heat shimmer
    ctx.strokeStyle = 'rgba(255,200,80,0.05)'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const hy = CH*0.08 + i*9;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.bezierCurveTo(CW*.3, hy-3, CW*.7, hy+3, CW, hy);
      ctx.stroke();
    }
    // Sun glow
    const sg = ctx.createRadialGradient(CW/2, 0, 0, CW/2, 0, 120);
    sg.addColorStop(0, 'rgba(255,220,80,0.18)'); sg.addColorStop(1, 'rgba(255,150,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, CW, 120);
  }
  _cyberBg(ctx) {
    // Stars
    for (let i = 0; i < 90; i++) {
      const sx = (i * 139 + 60) % CW;
      const sy = (i * 87 + 20) % (CH * 0.38);
      const br = i % 5 === 0;
      ctx.fillStyle = br ? 'rgba(150,255,255,0.8)' : 'rgba(80,200,255,0.35)';
      ctx.beginPath(); ctx.arc(sx, sy, br ? 1.2 : 0.7, 0, Math.PI*2); ctx.fill();
    }
    // Horizon glow
    const hg = ctx.createLinearGradient(0, CH*0.3, 0, CH*0.55);
    hg.addColorStop(0, 'rgba(0,60,160,0.0)');
    hg.addColorStop(1, 'rgba(0,100,220,0.18)');
    ctx.fillStyle = hg; ctx.fillRect(0, CH*0.3, CW, CH*0.25);
    // Grid lines on shoulder
    ctx.strokeStyle = 'rgba(0,200,255,0.07)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const lx = (i/8) * ROAD_X;
      ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,CH); ctx.stroke();
      const rx = ROAD_R + (i/8)*(CW-ROAD_R);
      ctx.beginPath(); ctx.moveTo(rx,0); ctx.lineTo(rx,CH); ctx.stroke();
    }
  }

  // ── Decoration helpers ────────────────────────
  _flower(ctx, x, y, seed) {
    const colors = ['#ff69b4','#ff85c2','#ff4da6','#ffb3d9'];
    const c = colors[Math.floor(seed * colors.length)];
    const sz = 10 + seed * 5;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#88cc44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(0, sz+14); ctx.stroke();
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) {
      const a = (i/5)*Math.PI*2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a)*sz*.65, Math.sin(a)*sz*.65-1, sz/2, sz/3, a, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(0, -1, sz*.28, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  _cactus(ctx, x, y, seed) {
    const h = 28 + seed * 14;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#5a8a3a';
    ctx.fillRect(-5, -h, 10, h+4);
    ctx.fillRect(-16, -h*.6, 7, 6); ctx.fillRect(-16, -h*.78, 5, h*.22);
    ctx.fillRect(9,   -h*.5, 7, 6); ctx.fillRect(11,  -h*.68, 5, h*.22);
    ctx.fillStyle = '#4a7a2a';
    ctx.fillRect(-3, -h, 6, h*0.6);
    ctx.restore();
  }
  _building(ctx, x, y, seed) {
    const bh = 50 + seed * 50, bw = 18 + seed * 18;
    const neons = ['#00ffff','#ff00ff','#00ff88','#ff4400','#ffcc00'];
    const nc    = neons[Math.floor(seed * neons.length)];
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#05050f';
    ctx.fillRect(-bw/2, -bh, bw, bh);
    ctx.shadowBlur = 8; ctx.shadowColor = nc;
    ctx.strokeStyle = nc; ctx.lineWidth = 1.5;
    ctx.strokeRect(-bw/2, -bh, bw, bh);
    ctx.shadowBlur = 0;
    const rows = Math.floor(bh/13), cols = Math.floor(bw/9);
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
      if (seed * 17 % (r+c+1+1) < 0.7) {
        ctx.fillStyle = (r+c) % 3 === 0 ? nc : 'rgba(255,255,150,0.45)';
        ctx.globalAlpha = 0.5 + seed * 0.5;
        ctx.fillRect(-bw/2+c*9+2, -bh+r*13+3, 5, 7);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}


// ═══════════════════════════════════════════════
// CLASS  Car
// Player-controlled car with mascot driver
// ═══════════════════════════════════════════════
class Car {
  constructor(mascotImg) {
    this.mascotImg  = mascotImg;
    this.x          = ROAD_MX;   // centre x
    this.y          = CAR_Y;     // fixed centre y
    this.lives      = 3;
    this.jumpVel    = 0;
    this.jumpH      = 0;   // current height above ground (negative = up)
    this.airborne   = false;
    this.invincible = false;
    this.invTimer   = 0;
    this.wobble     = 0;   // from oil spill
    this.tilt       = 0;   // steering tilt
    this.exhaust    = [];  // smoke puff data
    this.exhaustT   = 0;
  }

  /** Process held keys each frame. */
  handleInput(keys) {
    let dx = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;

    // Oil wobble overrides
    if (this.wobble > 0) {
      dx += Math.sin(this.wobble * 0.4) * 1.2;
    }
    this.tilt = dx * 0.06;

    this.x += dx * CAR_SPD;
    this.x  = clamp(this.x, ROAD_X + CAR_W/2 + 4, ROAD_R - CAR_W/2 - 4);
  }

  /** Trigger a jump (called when rolling over a bump). */
  jump() {
    if (this.airborne) return;
    this.jumpVel  = JUMP_FORCE;
    this.airborne = true;
  }

  update() {
    // Jump arc
    if (this.airborne) {
      this.jumpH   += this.jumpVel;
      this.jumpVel += GRAVITY;
      if (this.jumpH >= 0) {
        this.jumpH = 0; this.jumpVel = 0; this.airborne = false;
      }
    }

    // Invincibility countdown
    if (this.invincible) {
      this.invTimer--;
      if (this.invTimer <= 0) this.invincible = false;
    }

    // Wobble decay
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - 0.09);

    // Exhaust smoke
    this.exhaustT++;
    if (this.exhaustT % 5 === 0) {
      this.exhaust.push({ x: this.x + rand(-6,6), y: this.y + CAR_H/2, r: 3, a: 0.4, age: 0 });
    }
    for (const e of this.exhaust) { e.y += 3 + rand(0,2); e.r += 0.3; e.a -= 0.04; e.age++; }
    this.exhaust = this.exhaust.filter(e => e.a > 0);
  }

  /** Register a hit. Returns true if a life was actually deducted. */
  hit() {
    if (this.invincible) return false;
    this.lives--;
    this.invincible = true;
    this.invTimer   = 110; // ~1.8s
    return true;
  }

  /** True when high enough to pass over ground obstacles. */
  isAirborne() { return this.jumpH < -AIR_IMMUNE; }

  draw(ctx) {
    // Flash during invincibility
    if (this.invincible && Math.floor(Date.now() / 75) % 2 === 0) return;

    const jy    = this.jumpH;          // negative = up
    const scale = 1 + Math.abs(jy) * 0.0025;
    const hw    = CAR_W / 2;
    const hh    = CAR_H / 2;

    ctx.save();

    // ── Exhaust puffs (behind car) ────────────
    for (const e of this.exhaust) {
      ctx.save();
      ctx.globalAlpha = e.a;
      ctx.fillStyle   = '#aaaaaa';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ── Ground shadow while airborne ──────────
    if (jy < -4) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, 0.4 + jy * 0.01);
      ctx.fillStyle   = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 4, hw * (1/scale) * 0.85, 10, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // ── Car body ─────────────────────────────
    ctx.translate(this.x, this.y + jy);
    ctx.scale(scale, scale);
    ctx.rotate(this.tilt + (this.wobble > 0 ? Math.sin(this.wobble*0.5)*0.06 : 0));

    // Wheels (underneath)
    ctx.fillStyle = '#111';
    [[-hw-6,-hh+10], [hw-4,-hh+10], [-hw-6,hh-24], [hw-4,hh-24]].forEach(([wx,wy]) => {
      rrPath(ctx, wx, wy, 10, 16, 3); ctx.fill();
    });
    // Wheel rims
    ctx.fillStyle = '#555';
    [[-hw-1,-hh+18], [hw+5,-hh+18], [-hw-1,hh-16], [hw+5,hh-16]].forEach(([wx,wy]) => {
      ctx.beginPath(); ctx.arc(wx, wy, 3.5, 0, Math.PI*2); ctx.fill();
    });

    // Main body
    ctx.fillStyle = '#dc2626';
    rrPath(ctx, -hw, -hh, CAR_W, CAR_H, 9); ctx.fill();

    // Body gloss
    const gloss = ctx.createLinearGradient(-hw, -hh, hw, -hh);
    gloss.addColorStop(0,   'rgba(255,255,255,0)');
    gloss.addColorStop(0.42,'rgba(255,255,255,0.14)');
    gloss.addColorStop(0.58,'rgba(255,255,255,0.08)');
    gloss.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    rrPath(ctx, -hw, -hh, CAR_W, CAR_H, 9); ctx.fill();

    // Front windshield
    ctx.fillStyle = 'rgba(135, 206, 250, 0.7)';
    rrPath(ctx, -hw+6, -hh+5, CAR_W-12, CAR_H*0.31, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(100,180,220,0.85)'; ctx.lineWidth = 1.2;
    rrPath(ctx, -hw+6, -hh+5, CAR_W-12, CAR_H*0.31, 5); ctx.stroke();

    // Windshield wiper hint
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -hh+6); ctx.lineTo(2, -hh+20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -hh+6);  ctx.lineTo(-2, -hh+20); ctx.stroke();

    // Rear window
    ctx.fillStyle = 'rgba(110, 190, 230, 0.55)';
    rrPath(ctx, -hw+7, hh-CAR_H*0.28, CAR_W-14, CAR_H*0.22, 4); ctx.fill();

    // ── MASCOT in windshield ─────────────────
    this._drawMascot(ctx, 0, -hh + 7);

    // Headlights
    ctx.shadowBlur = 10; ctx.shadowColor = '#fffacd';
    ctx.fillStyle  = '#fffacd';
    ctx.beginPath(); ctx.ellipse(-hw+9, -hh+4, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( hw-9, -hh+4, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Tail-lights
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff0000';
    ctx.fillStyle  = '#ff3333';
    ctx.beginPath(); ctx.ellipse(-hw+8, hh-4, 5, 3.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( hw-8, hh-4, 5, 3.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Racing stripe
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-5, -hh+CAR_H*0.35, 10, CAR_H*0.3);

    ctx.restore();
  }

  /** Draw mascot face clipped into driver position. */
  _drawMascot(ctx, cx, topY) {
    const r = 13;
    const cy = topY + r + 2;

    ctx.save();
    // Circular clip for face
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();

    const img = this.mascotImg;
    if (img && img.complete && img.naturalWidth > 0) {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      // Crop: show head area (centre of image, top 55%)
      const srcX = iw * 0.12, srcY = ih * 0.02;
      const srcW = iw * 0.76, srcH = ih * 0.55;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, cx - r, cy - r, r*2, r*2);
    } else {
      // Fallback face
      ctx.fillStyle = '#fbbf77'; ctx.fillRect(cx-r, cy-r, r*2, r*2);
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(cx-4, cy, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+4, cy, 2, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Face ring
    ctx.strokeStyle = 'rgba(100,180,220,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  }
}


// ═══════════════════════════════════════════════
// CLASS  Game
// Main controller: state machine + game loop
// ═══════════════════════════════════════════════
class Game {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.state    = 'start';   // 'start' | 'playing' | 'gameover'
    this.keys     = {};

    // Persistent
    this.hiScore  = 0;

    // Per-run (set by _reset)
    this.score       = 0;
    this.frame       = 0;
    this.scrollSpeed = SPD_MIN;
    this.dispSpeed   = 0;
    this.manualOffset = 0; // user-controlled speed delta
    this.particles   = [];
    this.obstacles   = [];
    this.coins       = [];
    this.bumps       = [];

    // Asset
    this.mascotImg = new Image();
    this.mascotImg.src = 'mascot.jpeg';

    // Choose random map
    this.mapNames = Object.keys(MAP_THEMES);
    this.mapName  = null;
    this.map      = null;
    this._pickMap();

    this.car = null;

    this._bindInput();
  }

  _pickMap() {
    // Always rotate to a DIFFERENT map than the last one played
    const others = this.mapNames.filter(n => n !== this.mapName);
    this.mapName = others[randInt(0, others.length - 1)];
    this.map     = new GameMap(this.mapName);
  }

  _reset() {
    this.score       = 0;
    this.frame       = 0;
    this.scrollSpeed = SPD_MIN;
    this.dispSpeed   = 0;
    this.particles   = [];
    this.obstacles   = [];
    this.coins       = [];
    this.bumps       = [];
    this._pickMap();
    this.car = new Car(this.mascotImg);
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','W','s','S',' '].includes(e.key))
        e.preventDefault();
      const { state } = this;
      if ((e.key === 'Enter' || e.key === ' ') && state === 'start')    this._startGame();
      if ((e.key === 'Enter' || e.key === ' ') && state === 'gameover') this._restartGame();
      if ((e.key === 'r' || e.key === 'R')     && state === 'gameover') this._restartGame();
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });

    // Click / tap on canvas
    this.canvas.addEventListener('click', () => {
      if (this.state === 'start')    this._startGame();
      if (this.state === 'gameover') this._restartGame();
    });

    // Mobile buttons
    const setKey = (id, key, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      const apply = (v) => {
        this.keys[key] = v;
        el.classList.toggle('pressed', v);
      };
      el.addEventListener('touchstart', e => { e.preventDefault(); apply(true);  }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); apply(false); }, { passive: false });
      el.addEventListener('mousedown',  () => apply(true));
      el.addEventListener('mouseup',    () => apply(false));
      el.addEventListener('mouseleave', () => apply(false));
    };
    setKey('btn-left',  'ArrowLeft',  true);
    setKey('btn-right', 'ArrowRight', true);
    setKey('btn-up',    'ArrowUp',    true);
    setKey('btn-down',  'ArrowDown',  true);
  }

  _startGame() {
    this._reset();
    this.state = 'playing';
  }
  _restartGame() { this._startGame(); }

  // ── Update ────────────────────────────────────
  update() {
    if (this.state !== 'playing') return;
    this.frame++;

    // Auto-acceleration base
    const autoSpd = SPD_MIN + this.frame * SPD_ACCEL;

    // Manual speed input: Up/W = faster, Down/S = slower
    if (this.keys['ArrowUp']   || this.keys['w'] || this.keys['W'])
      this.manualOffset = Math.min(this.manualOffset + SPD_STEP * 0.12, SPD_MAX - autoSpd);
    else if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S'])
      this.manualOffset = Math.max(this.manualOffset - SPD_STEP * 0.12, SPD_MIN - autoSpd - 1.5);
    else
      // Decay back toward 0 when no key held
      this.manualOffset *= (1 - SPD_DECAY);

    this.scrollSpeed = clamp(autoSpd + this.manualOffset, SPD_MIN * 0.5, SPD_MAX);
    this.dispSpeed   = Math.round((this.scrollSpeed / SPD_MAX) * DISP_MAX);

    // Score from distance
    this.score += Math.ceil(this.scrollSpeed * 0.38);

    // Map
    this.map.update(this.scrollSpeed);

    // Car
    this.car.handleInput(this.keys);
    this.car.update();

    // Spawn objects
    this._spawnLogic();

    // Update all objects
    for (const o of this.obstacles) o.update(this.scrollSpeed);
    for (const c of this.coins)     c.update(this.scrollSpeed);
    for (const b of this.bumps)     b.update(this.scrollSpeed);
    for (const p of this.particles) p.update();

    // Purge off-screen / dead
    this.obstacles = this.obstacles.filter(o => !o.offScreen() && o.active);
    this.coins     = this.coins    .filter(c => !c.offScreen() && c.active);
    this.bumps     = this.bumps    .filter(b => !b.offScreen() && b.active);
    this.particles = this.particles.filter(p => !p.dead());

    // Collisions
    this._collide();

    // Game over
    if (this.car.lives <= 0) {
      this.hiScore = Math.max(this.hiScore, this.score);
      this.state = 'gameover';
    }
  }

  _spawnLogic() {
    const f   = this.frame;
    const spd = this.scrollSpeed;

    // Obstacles – rate increases with speed
    const obsEvery = Math.max(38, Math.floor(95 - spd * 5));
    if (f % obsEvery === 0) this._spawnObstacle();

    // Sometimes double obstacles side-by-side at high speed
    if (spd > 8 && f % (obsEvery * 3) === 0) this._spawnObstacle();

    // Coins
    if (f % 110 === 0)  this._spawnCoinRow();
    if (f % 110 === 55) this._spawnCoinRow();

    // Bumps
    const bumpEvery = Math.max(140, Math.floor(260 - spd * 9));
    if (f % bumpEvery === 0) this._spawnBump();
  }

  _spawnObstacle() {
    const types = ['cone', 'cone', 'cone', 'barrier', 'oilspill'];
    const type  = types[randInt(0, types.length - 1)];

    // Pick a lane (left or right)
    const lane = Math.random() < 0.5 ? 'L' : 'R';
    let x = lane === 'L'
      ? ROAD_X + ROAD_W * 0.27 + rand(-20, 20)
      : ROAD_X + ROAD_W * 0.73 + rand(-20, 20);

    // Never spawn directly on the car's current x
    if (Math.abs(x - this.car.x) < 38) {
      x += (x < this.car.x) ? -50 : 50;
    }
    x = clamp(x, ROAD_X + 20, ROAD_R - 20);

    this.obstacles.push(new Obstacle(x, -50, type));
  }

  _spawnCoinRow() {
    const x = rand(ROAD_X + 22, ROAD_R - 22);
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      this.coins.push(new Coin(x, -30 - i * 52));
    }
  }

  _spawnBump() {
    const lane = Math.random() < 0.5 ? 'L' : 'R';
    const x    = lane === 'L'
      ? ROAD_X + ROAD_W * 0.27 + rand(-18, 18)
      : ROAD_X + ROAD_W * 0.73 + rand(-18, 18);
    this.bumps.push(new Bump(x, -30));
  }

  _collide() {
    const car = this.car;
    const margin = 7;
    const carBox = {
      x: car.x - CAR_W/2 + margin,
      y: car.y - CAR_H/2 + margin,
      w: CAR_W - margin*2,
      h: CAR_H - margin*2,
    };

    // ── Bump → jump ──────────────────────────
    for (const b of this.bumps) {
      if (!b.active) continue;
      if (overlaps(carBox, b.hitbox())) {
        b.active = false;
        car.jump();
        // Golden launch particles
        this.particles.push(...hitBurst(car.x, car.y + CAR_H/2, '#ffd700', 16));
      }
    }

    // ── Obstacles → life ─────────────────────
    if (!car.isAirborne() && !car.invincible) {
      for (const obs of this.obstacles) {
        if (!obs.active) continue;
        if (overlaps(carBox, obs.hitbox())) {
          obs.active = false;
          obs.wobble = 4;
          const lost = car.hit();
          if (lost) {
            const col = obs.type === 'oilspill' ? '#9b59b6'
                      : obs.type === 'barrier'  ? '#e74c3c'
                      :                           '#e67e22';
            this.particles.push(...hitBurst(car.x, car.y, col, 22));
          }
        }
      }
    }

    // ── Coins ────────────────────────────────
    for (const coin of this.coins) {
      if (!coin.active) continue;
      if (overlaps(carBox, coin.hitbox())) {
        coin.active = false;
        this.score += 50;
        this.scrollSpeed = Math.min(SPD_MAX, this.scrollSpeed + 0.28);
        this.particles.push(...coinBurst(coin.x, coin.y));
      }
    }
  }

  // ── Render ────────────────────────────────────
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW, CH);

    // Map always visible as background
    this.map.draw(ctx);

    if (this.state === 'start') {
      this._drawStart(ctx);
      return;
    }

    // ── Game objects ──────────────────────────
    for (const b of this.bumps)     b.draw(ctx);
    for (const o of this.obstacles) o.draw(ctx);
    for (const c of this.coins)     c.draw(ctx);

    // ── Car ───────────────────────────────────
    this.car.draw(ctx);

    // ── Particles ─────────────────────────────
    for (const p of this.particles) p.draw(ctx);

    // ── HUD ───────────────────────────────────
    this._drawHUD(ctx);

    // ── Game Over overlay ─────────────────────
    if (this.state === 'gameover') {
      this._drawGameOver(ctx);
    }
  }

  // ── HUD ───────────────────────────────────────
  _drawHUD(ctx) {
    const night = this.map.t.ambience === 'cyber';
    const txtCol = night ? '#00e5ff' : '#111';
    const barBg  = night ? 'rgba(0,5,20,0.72)' : 'rgba(255,255,255,0.62)';

    // Top bar
    ctx.fillStyle = barBg;
    ctx.fillRect(0, 0, CW, 52);
    ctx.strokeStyle = night ? 'rgba(0,230,255,0.35)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,52); ctx.lineTo(CW,52); ctx.stroke();

    // Score
    ctx.font      = '13px "Press Start 2P"';
    ctx.fillStyle = txtCol;
    ctx.textAlign = 'left';
    ctx.fillText(`${this.score}`, 12, 32);

    // Score label
    ctx.font      = '7px "Press Start 2P"';
    ctx.fillStyle = night ? 'rgba(0,230,255,0.55)' : 'rgba(0,0,0,0.4)';
    ctx.fillText('SCORE', 12, 15);

    // Lives (hearts)
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += (i < this.car.lives ? '❤' : '♡');
    ctx.font      = '19px sans-serif';
    ctx.fillStyle = '#e53e3e';
    ctx.textAlign = 'center';
    ctx.fillText(hearts, CW/2, 34);

    // Map name top-right
    ctx.font      = '6.5px "Press Start 2P"';
    ctx.fillStyle = night ? 'rgba(0,255,180,0.7)' : 'rgba(80,80,80,0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(this.mapName, CW - 10, 15);

    // Coin label
    ctx.font      = '7px "Press Start 2P"';
    ctx.fillStyle = '#b8860b';
    ctx.fillText('+50 per coin', CW - 10, 34);

    // Speedometer
    this._drawSpeedometer(ctx, night);
  }

  _upHeld()   { return !!(this.keys['ArrowUp']   || this.keys['w'] || this.keys['W']); }
  _downHeld() { return !!(this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']); }

  _drawSpeedometer(ctx, night) {
    const sx = CW - 56, sy = CH - 62, r = 38;
    const pct  = this.dispSpeed / DISP_MAX;
    const sa   = Math.PI * 0.75;
    const ea   = sa + pct * Math.PI * 1.5;
    const col  = pct < 0.5 ? '#22dd55' : pct < 0.78 ? '#ffdd22' : '#ff3333';

    // Background
    ctx.fillStyle = night ? 'rgba(0,8,22,0.88)' : 'rgba(12,12,28,0.78)';
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();

    // Outer ring
    ctx.strokeStyle = night ? '#00e5ff' : '#334';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.stroke();

    // Tick marks
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const a = sa + (i/10) * Math.PI * 1.5;
      const inner = r - 8, outer = r - 4;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a)*inner, sy + Math.sin(a)*inner);
      ctx.lineTo(sx + Math.cos(a)*outer, sy + Math.sin(a)*outer);
      ctx.stroke();
    }

    // Speed arc
    if (night) { ctx.shadowBlur = 12; ctx.shadowColor = col; }
    ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sx, sy, r - 6, sa, ea); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineCap = 'butt';

    // Speed value
    ctx.fillStyle = '#fff';
    ctx.font      = `bold 14px "Press Start 2P"`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.dispSpeed, sx, sy - 2);

    ctx.font      = '6px "Press Start 2P"';
    ctx.fillStyle = '#aaa';
    ctx.fillText('km/h', sx, sy + 14);

    // ↑↓ speed arrows on sides of dial
    const upHeld   = this._upHeld();
    const downHeld = this._downHeld();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    // Up arrow (accelerate)
    ctx.fillStyle = upHeld   ? '#22ff88' : 'rgba(100,255,160,0.28)';
    ctx.fillText('▲', sx, sy - r - 5);
    // Down arrow (brake)
    ctx.fillStyle = downHeld ? '#ff4444' : 'rgba(255,80,80,0.28)';
    ctx.fillText('▼', sx, sy + r + 16);

    ctx.textBaseline = 'alphabetic';
  }

  // ── Screens ───────────────────────────────────
  _drawStart(ctx) {
    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, CW, CH);

    // Card
    ctx.fillStyle = 'rgba(10,10,25,0.88)';
    rrPath(ctx, 34, 100, CW - 68, 440, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(100,160,255,0.45)'; ctx.lineWidth = 2;
    rrPath(ctx, 34, 100, CW - 68, 440, 22); ctx.stroke();

    // Title
    ctx.textAlign = 'center';
    ctx.shadowBlur = 22; ctx.shadowColor = '#4488ff';
    ctx.fillStyle  = '#ffffff';
    ctx.font       = 'bold 32px "Press Start 2P"';
    ctx.fillText('PIXEL',  CW/2, 172);
    ctx.fillText('RACER',  CW/2, 212);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font      = '8px "Press Start 2P"';
    ctx.fillStyle = 'rgba(160,200,255,0.7)';
    ctx.fillText('ARCADE ROAD RACING', CW/2, 240);

    // Map badge
    ctx.fillStyle = 'rgba(255,200,50,0.12)';
    rrPath(ctx, CW/2 - 140, 254, 280, 30, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,50,0.4)'; ctx.lineWidth = 1;
    rrPath(ctx, CW/2 - 140, 254, 280, 30, 8); ctx.stroke();
    ctx.fillStyle = '#ffd700'; ctx.font = '8px "Press Start 2P"';
    ctx.fillText('MAP: ' + this.mapName, CW/2, 274);

    // Mascot
    this._drawMascotCircle(ctx, CW/2, 348, 50, '#44aaff');

    // Controls
    ctx.fillStyle = 'rgba(180,200,255,0.65)';
    ctx.font      = '8px "Press Start 2P"';
    ctx.fillText('← → / A D  =  steer', CW/2, 412);
    ctx.fillStyle = 'rgba(80,255,160,0.7)';
    ctx.fillText('↑ ↓ / W S  =  speed', CW/2, 432);
    ctx.fillStyle = 'rgba(255,220,80,0.7)';
    ctx.fillText('Drive over BUMPS to jump!', CW/2, 440);
    ctx.fillStyle = 'rgba(100,255,160,0.7)';
    ctx.fillText('Collect COINS for speed boost', CW/2, 460);

    // Blink prompt
    if (Math.floor(Date.now()/520) % 2) {
      ctx.shadowBlur  = 12; ctx.shadowColor = '#88aaff';
      ctx.fillStyle   = '#ffffff';
      ctx.font        = '10px "Press Start 2P"';
      ctx.fillText('PRESS ENTER OR TAP TO START', CW/2, 502);
      ctx.shadowBlur  = 0;
    }

    ctx.textAlign = 'left';
  }

  _drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, CW, CH);

    // Card
    ctx.fillStyle = 'rgba(18,0,0,0.94)';
    rrPath(ctx, 42, 140, CW - 84, 380, 20); ctx.fill();
    ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2.5;
    rrPath(ctx, 42, 140, CW - 84, 380, 20); ctx.stroke();

    // GAME OVER
    ctx.textAlign  = 'center';
    ctx.shadowBlur = 24; ctx.shadowColor = '#ff2222';
    ctx.fillStyle  = '#ff4444';
    ctx.font       = 'bold 34px "Press Start 2P"';
    ctx.fillText('GAME',  CW/2, 208);
    ctx.fillText('OVER',  CW/2, 252);
    ctx.shadowBlur = 0;

    // Mascot (sad)
    this._drawMascotCircle(ctx, CW/2, 318, 38, '#ff6666');

    // Scores
    ctx.fillStyle = '#ffffff';
    ctx.font      = '11px "Press Start 2P"';
    ctx.fillText(`SCORE  ${this.score}`, CW/2, 376);
    ctx.fillStyle = '#ffd700';
    ctx.font      = '10px "Press Start 2P"';
    ctx.fillText(`BEST   ${this.hiScore}`, CW/2, 400);

    // Map played
    ctx.fillStyle = 'rgba(180,180,255,0.5)';
    ctx.font      = '7px "Press Start 2P"';
    ctx.fillText(this.mapName, CW/2, 422);

    // Blink prompt
    if (Math.floor(Date.now()/520) % 2) {
      ctx.shadowBlur  = 10; ctx.shadowColor = '#ff4444';
      ctx.fillStyle   = '#ff8888';
      ctx.font        = '9px "Press Start 2P"';
      ctx.fillText('PRESS R OR TAP TO RETRY', CW/2, 468);
      ctx.shadowBlur  = 0;
    }

    ctx.textAlign = 'left';
  }

  /** Draws the mascot image inside a glowing circle (used on screens). */
  _drawMascotCircle(ctx, cx, cy, r, glowColor) {
    ctx.save();

    // Glow ring
    ctx.shadowBlur  = 18;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = glowColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur  = 0;

    // Clip & draw
    ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI*2); ctx.clip();
    const img = this.mascotImg;
    if (img && img.complete && img.naturalWidth > 0) {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      ctx.drawImage(img, iw*0.08, ih*0.0, iw*0.84, ih*0.9,
                    cx - r + 1, cy - r + 1, (r-1)*2, (r-1)*2);
    } else {
      ctx.fillStyle = '#fbbf77';
      ctx.fillRect(cx-r, cy-r, r*2, r*2);
    }

    ctx.restore();
  }

  // ── Game loop ─────────────────────────────────
  loop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.loop());
  }
}


// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  const canvas  = document.getElementById('game-canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const game    = new Game(canvas);
  game.loop();
});
