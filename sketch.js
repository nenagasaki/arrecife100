// Arrecife 100 — reto de supervivencia de 60 segundos.
// Los peces autónomos se pierden al chocar con residuos humanos.
// El objetivo es retirar la mayor cantidad posible de residuos antes de que acabe el tiempo.

const BASE_W = 1100, BASE_H = 610;
let ROUND_SECONDS = 60, INITIAL_FISH = 100, trashDifficulty = 2;
let isPaused = false, pauseStarted = 0;
let fishes = [], hazards = [], oilPatches = [], turbines = [];
let gameState = 'ready'; // ready, running, ended
let timeLeft = ROUND_SECONDS, startMillis = 0, lastSpawn = 0, removed = 0, lost = 0;
let bestScore = 0, tick = 0, lastFrameMillis = 0;
const ink = '#263b3a', red = '#e87555', orange = '#e7a15e', teal = '#6faaa0', paper = '#e8eee7';

function setup() {
  const c = createCanvas(BASE_W, BASE_H);
  c.parent('canvas-holder');
  pixelDensity(1);
  resetRound(false);
  // Elementos ambientales persistentes: aceite y turbinas son amenazas evitables,
  // pero solo la basura sólida causa pérdida de peces en esta versión.
  oilPatches = [new OilPatch(width*.23,height*.32,100,38,.2), new OilPatch(width*.72,height*.68,125,34,1.8)];
  turbines = [new Turbine(width*.91,height*.25,29), new Turbine(width*.12,height*.78,22)];
  updateUI();
}

function draw() {
  tick += .012;
  background(paper);
  drawWaterLines();
  if (gameState !== 'running' || !isPaused) {
    for (const p of oilPatches) { p.update(); p.draw(); }
    for (const t of turbines) { t.update(); t.draw(); }
  } else {
    for (const p of oilPatches) p.draw();
    for (const t of turbines) t.draw();
  }

  if (gameState === 'running' && !isPaused) {
    const elapsed = (millis() - startMillis) / 1000;
    timeLeft = max(0, ROUND_SECONDS - elapsed);
    spawnHazardsOverTime(elapsed);
    if (timeLeft <= 0) endRound();
  }

  for (const h of hazards) { if (gameState !== 'running' || !isPaused) h.update(); h.draw(); }
  for (const f of fishes) { if (gameState !== 'running' || !isPaused) f.update(); f.draw(); }
  drawParticles();

  if (gameState === 'running' && !isPaused) {
    checkCollisions();
    if (fishes.length === 0) showGameOver();
  }
  if (frameCount % 5 === 0) updateUI();
}

function drawWaterLines() {
  noFill(); stroke(95,147,137,35); strokeWeight(1);
  for (let i=0;i<12;i++) {
    const y=48+i*46;
    beginShape();
    for(let x=0;x<=width;x+=25) vertex(x,y+sin(x*.008+tick*1.4+i*.7)*3.5);
    endShape();
  }
  noStroke(); fill(255,255,245,85); circle(width*.77,height*.12,100);
}

function drawParticles() {
  noStroke();
  for(let i=0;i<36;i++) {
    fill(38,59,58,26);
    circle((i*137+frameCount*.16)%width,(i*83+sin(tick+i)*9)%height,i%4===0?2:1);
  }
}


function showGameOver() {
  if (gameState !== 'running') return;
  gameState = 'ended';
  isPaused = false;
  timeLeft = 0;
  document.getElementById('pause-btn').textContent = 'Pausar';
  document.getElementById('game-status').textContent = 'GAME OVER';
  document.getElementById('canvas-hint').hidden = true;
  document.getElementById('overlay-title').textContent = 'GAME OVER';
  document.getElementById('overlay-copy').textContent = 'Ya no queda ningún pez en el arrecife.';
  document.getElementById('overlay-survivors').textContent = '0';
  document.getElementById('overlay-removed').textContent = removed;
  document.getElementById('game-over-overlay').hidden = false;
  document.getElementById('game-over-restart').focus();
}

function spawnHazardsOverTime(elapsed) {
  // La presión crece por etapas, con un límite de población: desafiante, no infinita.
  const settings = {
    1: { interval: 5.2, max: 6, wave: 3 },   // Fácil: antes Suave
    2: { interval: 3.7, max: 10, wave: 5 },  // Media: antes Fácil
    3: { interval: 2.5, max: 16, wave: 8 }   // Alta: antes Media
  }[trashDifficulty];
  const stage = Math.floor(elapsed / 12);
  const interval = Math.max(settings.interval * 0.62, settings.interval * Math.pow(0.91, stage));
  if (millis() - lastSpawn >= interval * 1000 && hazards.length < settings.max) {
    const count = Math.min(floor(random(1, settings.wave + 1)), settings.max - hazards.length);
    for (let i=0; i<count; i++) {
      const kind = random(['bag','bottle','can','net']);
      const side = floor(random(4));
      let x, y;
      if (side === 0) { x = random(0,width); y = -18; }
      else if (side === 1) { x = width+18; y = random(0,height); }
      else if (side === 2) { x = random(0,width); y = height+18; }
      else { x = -18; y = random(0,height); }
      hazards.push(new Hazard(x,y,kind,side));
    }
    lastSpawn = millis();
  }
}

class Fish {
  constructor(x,y) {
    this.pos=createVector(x,y);
    this.vel=p5.Vector.random2D().mult(random(1.5,2.4));
    this.acc=createVector(0,0);
    this.size=random(11,16);
    this.speed=random(1.65,2.45);
    this.phase=random(TWO_PI);
    this.turn=random(TWO_PI);
    this.col=random([ink,red,orange,teal,'#d9b7a0']);
    this.tailStyle=random([0,1,2]);
    this.dead=false;
  }
  steer(target,maxForce=.045) {
    const desired=p5.Vector.sub(target,this.pos);
    if(desired.mag()<.01)return createVector(0,0);
    desired.setMag(this.speed);
    return desired.sub(this.vel).limit(maxForce);
  }
  update() {
    this.turn += random(-.22,.22);
    // Wander tipo autonomous agents: el objetivo cambia aleatoriamente delante del pez,
    // así cada individuo explora direcciones distintas sin orbitar solo por las orillas.
    const wander=p5.Vector.add(this.pos,p5.Vector.fromAngle(this.turn).mult(105));
    this.acc.add(this.steer(wander,.075).mult(1.05));
    this.acc.add(p5.Vector.random2D().mult(.018));

    // Cohesión sutil: los peces comparten el espacio sin formar una figura rígida.
    let center=createVector(0,0),n=0;
    for(const other of fishes) {
      if(other===this||other.dead)continue;
      const d=p5.Vector.dist(this.pos,other.pos);
      if(d<54){center.add(other.pos);n++;}
      if(d<13)this.acc.add(p5.Vector.sub(this.pos,other.pos).setMag(.025));
    }
    if(n){center.div(n);this.acc.add(this.steer(center,.012).mult(.055));}

    // Evitación de amenazas: el aceite y las turbinas desvían el movimiento.
    for(const p of oilPatches) {
      const d=p5.Vector.dist(this.pos,p.pos),range=p.rx*.8;
      if(d<range)this.acc.add(this.avoid(p.pos,d,range,.07));
    }
    for(const t of turbines) {
      const d=p5.Vector.dist(this.pos,t.pos),range=t.r*3.8;
      if(d<range)this.acc.add(this.avoid(t.pos,d,range,.13));
    }

    // Los peces se acercan al cursor para permitir una maniobra de rescate.
    if(mouseX>=0&&mouseX<=width&&mouseY>=0&&mouseY<=height&&mouseIsPressed) {
      this.acc.add(this.steer(createVector(mouseX,mouseY),.035).mult(.38));
    }

    this.acc.add(createVector(.008,sin(this.pos.x*.008+tick)*.009));
    // Campo de retorno progresivo: los peces giran antes de llegar al borde,
    // en vez de quedarse pegados a las orillas.
    const margin = 125;
    if(this.pos.x < margin) this.acc.add(createVector(map(this.pos.x,0,margin,.19,0),0));
    if(this.pos.x > width-margin) this.acc.add(createVector(-map(width-this.pos.x,0,margin,.19,0),0));
    if(this.pos.y < margin) this.acc.add(createVector(0,map(this.pos.y,0,margin,.19,0)));
    if(this.pos.y > height-margin) this.acc.add(createVector(0,-map(height-this.pos.y,0,margin,.19,0)));
    // Cerca de una esquina, fuerza un giro hacia el interior, pero no fija una órbita.
    if(this.pos.x < 32 || this.pos.x > width-32 || this.pos.y < 32 || this.pos.y > height-32) {
      const interior = createVector(width*.5 + random(-width*.18,width*.18), height*.5 + random(-height*.18,height*.18));
      this.acc.add(this.steer(interior,.09).mult(.45));
    }
    this.vel.add(this.acc).limit(this.speed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }
  avoid(target,d,range,force) {
    const away=p5.Vector.sub(this.pos,target);
    if(away.mag()<.01)away.set(1,0);
    away.setMag(this.speed).sub(this.vel).limit(force);
    return away.mult(map(d,0,range,1,.1));
  }
  draw() {
    push(); translate(this.pos.x,this.pos.y); rotate(this.vel.heading());
    const s=this.size,tail=sin(frameCount*.15+this.phase)*s*.17;
    noStroke(); fill(this.col);
    if(this.tailStyle===0)triangle(-s*.3,0,-s*.9,-s*.4+tail,-s*.9,s*.4+tail);
    else if(this.tailStyle===1){triangle(-s*.3,0,-s*.78,-s*.48+tail,-s*.7,-s*.04);triangle(-s*.3,0,-s*.78,s*.48+tail,-s*.7,s*.04);}
    else triangle(-s*.3,0,-s*.8,-s*.27+tail,-s*.8,s*.27+tail);
    ellipse(0,0,s*1.45,s*.76);
    if(this.phase%2>1){fill(this.col===red||this.col===orange?paper:red);ellipse(-s*.05,0,s*.3,s*.5);}
    fill(paper);circle(s*.42,-s*.06,s*.11);fill(ink);circle(s*.44,-s*.06,s*.055);
    pop();
  }
}

class Hazard {
  constructor(x,y,kind,side=null) {
    this.pos=createVector(x,y);this.kind=kind;this.rot=random(-.7,.7);
    this.phase=random(TWO_PI);this.size=random(1.0,1.35);
    this.speed=random(.35,.8);
    const inward = createVector(width*.5-x,height*.5-y);
    if(side===0) inward.rotate(random(-.9,.9));
    else if(side===1) inward.rotate(random(-.9,.9));
    else if(side===2) inward.rotate(random(-.9,.9));
    else if(side===3) inward.rotate(random(-.9,.9));
    inward.setMag(this.speed);
    this.vel=inward;
  }
  update() {
    this.phase+=.018;
    this.pos.add(this.vel);
    this.pos.x+=sin(this.phase)*.12;
    this.pos.y+=cos(this.phase*.83)*.12;
    if(this.pos.x>width+28)this.pos.x=-25;
    if(this.pos.x<-28)this.pos.x=width+25;
    if(this.pos.y>height+28)this.pos.y=-25;
    if(this.pos.y<-28)this.pos.y=height+25;
  }
  draw() {
    push();translate(this.pos.x,this.pos.y);rotate(this.rot+sin(this.phase)*.035);scale(this.size);
    noFill();stroke(38,59,58,210);strokeWeight(1.35);
    if(this.kind==='bottle'){
      beginShape();vertex(-4,-12);vertex(4,-12);vertex(4,-7);vertex(7,-3);vertex(7,10);vertex(-7,10);vertex(-7,-3);vertex(-4,-7);endShape(CLOSE);
      line(-3,-15,3,-15);line(-2,-2,3,-2);
    } else if(this.kind==='bag'){
      beginShape();vertex(-8,-7);vertex(-3,-12);vertex(1,-7);vertex(8,-9);vertex(6,8);vertex(-7,7);endShape(CLOSE);
      line(-4,-9,-6,-15);line(3,-8,5,-14);
    } else if(this.kind==='can'){
      rectMode(CENTER);rect(0,0,12,18,2);line(-4,-4,4,-4);line(-4,2,4,2);
    } else {
      for(let i=-12;i<=12;i+=6){line(i,-10,i+7,10);line(i,10,i+7,-10);}
    }
    pop();
  }
}

class OilPatch {
  constructor(x,y,rx,ry,phase){this.pos=createVector(x,y);this.rx=rx;this.ry=ry;this.phase=phase;}
  update(){this.phase+=.004;if(gameState==='running')this.pos.x+=.07;if(this.pos.x>width+this.rx)this.pos.x=-this.rx;}
  draw(){
    push();translate(this.pos.x,this.pos.y);rotate(sin(this.phase)*.05);noStroke();
    fill(33,57,54,15);ellipse(0,0,this.rx*2.1,this.ry*2.2);
    fill(33,57,54,24);beginShape();
    for(let a=0;a<TWO_PI;a+=.2){const r=1+.13*sin(a*3+this.phase)+.07*cos(a*5-this.phase);vertex(cos(a)*this.rx*r,sin(a)*this.ry*r);}
    endShape(CLOSE);
    noFill();stroke(232,117,85,75);strokeWeight(1);beginShape();
    for(let a=.2;a<PI*1.8;a+=.18)vertex(cos(a)*this.rx*.7,sin(a)*this.ry*.55);
    endShape();pop();
  }
}

class Turbine {
  constructor(x,y,r){this.pos=createVector(x,y);this.r=r;this.a=0;}
  update(){this.a+=.018;}
  draw(){
    push();translate(this.pos.x,this.pos.y);
    noFill();stroke(232,117,85,105);strokeWeight(1);circle(0,0,this.r*2.05);
    stroke(38,59,58,125);circle(0,0,this.r*2.6);rotate(this.a);
    for(let i=0;i<3;i++){push();rotate(i*TWO_PI/3);fill(38,59,58,115);noStroke();beginShape();vertex(0,0);vertex(this.r*.25,-this.r*.2);vertex(this.r*1.1,-this.r*.65);vertex(this.r*.85,-this.r*.05);vertex(this.r*.25,this.r*.2);endShape(CLOSE);pop();}
    fill(paper);stroke(38,59,58,160);circle(0,0,this.r*.35);pop();
  }
}

function checkCollisions() {
  const survivors=[];
  for(const f of fishes) {
    let hit=false;
    for(const h of hazards) {
      // Radio de colisión intencionalmente mayor que el trazo para que el juego se entienda.
      if(p5.Vector.dist(f.pos,h.pos)<Math.max(12,f.size*.78)) { hit=true; break; }
    }
    // Las turbinas son obstáculos industriales: sus aspas también pueden causar pérdidas.
    if(!hit) {
      for(const t of turbines) {
        if(p5.Vector.dist(f.pos,t.pos)<t.r*.72) { hit=true; break; }
      }
    }
    if(hit) lost++; else survivors.push(f);
  }
  if(survivors.length!==fishes.length) { fishes=survivors; updateUI(); }
}

function startRound() {
  document.getElementById('game-over-overlay').hidden = true;
  if(gameState==='running')return;
  if(gameState==='ended')resetRound(false);
  gameState='running';isPaused=false;timeLeft=ROUND_SECONDS;startMillis=millis();lastSpawn=millis();
  document.getElementById('pause-btn').textContent='Pausar';
  document.getElementById('game-status').textContent='EN CURSO';
  document.getElementById('canvas-hint').hidden=true;
  document.getElementById('result-panel').hidden=true;
  document.getElementById('start-btn').textContent='Reto en curso';
  document.getElementById('start-btn').disabled=true;
  updateUI();
}

function endRound() {
  if(gameState!=='running')return;
  gameState='ended';isPaused=false;timeLeft=0;
  document.getElementById('pause-btn').textContent='Pausar';
  const score=fishes.length;
  bestScore=Math.max(bestScore,score);
  document.getElementById('game-status').textContent='TIEMPO AGOTADO';
  document.getElementById('start-btn').disabled=false;
  document.getElementById('start-btn').textContent='Jugar otra vez';
  document.getElementById('result-panel').hidden=false;
  document.getElementById('final-score').textContent=score;
  document.getElementById('result-title').textContent=score>INITIAL_FISH*.75?'¡Buen trabajo!':score>INITIAL_FISH*.4?'El arrecife necesita ayuda':'El arrecife quedó muy afectado';
  document.getElementById('result-copy').textContent=`Salvaste ${score} de ${INITIAL_FISH} peces y retiraste ${removed} residuos.`;
  document.getElementById('overlay-title').textContent = 'TIME OVER';
  document.getElementById('overlay-copy').textContent = 'Terminó el tiempo. Estos son los resultados de tu arrecife.';
  document.getElementById('overlay-survivors').textContent = score;
  document.getElementById('overlay-removed').textContent = removed;
  document.getElementById('game-over-overlay').hidden = false;
  updateUI();
}

function resetRound(showHint=true) {
  document.getElementById('game-over-overlay').hidden = true;
  fishes=[];hazards=[];removed=0;lost=0;timeLeft=ROUND_SECONDS;
  // Distribución uniforme en toda el área, sin dejar una franja vacía junto a los bordes.
  const cols = Math.ceil(Math.sqrt(INITIAL_FISH * width / height)), rows = Math.ceil(INITIAL_FISH / cols);
  const cellW = width / cols, cellH = height / rows;
  for(let i=0;i<INITIAL_FISH;i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cellW + cellW * random(.15,.85);
    const y = row * cellH + cellH * random(.15,.85);
    fishes.push(new Fish(x,y));
  }
  // Solo dos residuos al inicio: tiempo para entender y actuar.
  for(let i=0;i<2;i++)hazards.push(new Hazard(random(90,width-90),random(70,height-70),random(['bag','bottle','can','net'])));
  gameState='ready';isPaused=false;lastSpawn=millis();
  const hint=document.getElementById('canvas-hint');hint.hidden=!showHint;
  hint.textContent='Pulsa «Iniciar reto» para comenzar';
  document.getElementById('game-status').textContent='PREPARADO';
  document.getElementById('start-btn').disabled=false;
  document.getElementById('start-btn').textContent='Iniciar reto';
  document.getElementById('result-panel').hidden=true;
  updateUI();
}

function updateUI() {
  document.getElementById('fish-count').textContent=fishes.length;
  document.getElementById('removed-count').textContent=removed;
  document.getElementById('lost-count').textContent=lost;
  document.getElementById('best-score').textContent=bestScore===0?'—':bestScore;
  const seconds=Math.ceil(timeLeft);
  const timer=document.getElementById('timer');
  timer.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  timer.classList.toggle('urgent',seconds<=10);
  const pct=constrain(timeLeft/ROUND_SECONDS*100,0,100);
  const bar=document.getElementById('time-progress');bar.style.width=pct+'%';
  bar.style.background=seconds<=10?'#e86d4d':'#202b2b';
}

function mousePressed() {
  if(gameState!=='running')return;
  let idx=-1,best=24;
  for(let i=0;i<hazards.length;i++){
    const d=dist(mouseX,mouseY,hazards[i].pos.x,hazards[i].pos.y);
    if(d<best){best=d;idx=i;}
  }
  if(idx>=0){hazards.splice(idx,1);removed++;updateUI();}
}

function keyPressed() {
  if(keyCode===UP_ARROW&&fishes.length<140)fishes.push(new Fish(random(30,width-30),random(30,height-30)));
  if(keyCode===DOWN_ARROW&&fishes.length>1)fishes.pop();
  updateUI();
  if(keyCode===UP_ARROW||keyCode===DOWN_ARROW)return false;
}

function toggleSettings(show) {
  const panel = document.getElementById('settings-panel');
  panel.hidden = !show;
  document.getElementById('settings-btn').setAttribute('aria-expanded', String(show));
}

function updateSettingLabels() {
  const fish = Number(document.getElementById('fish-setting').value);
  const difficulty = Number(document.getElementById('trash-setting').value);
  const duration = Number(document.getElementById('duration-setting').value);
  const names = {1:'Fácil',2:'Media',3:'Alta'};
  const help = {
    1:'Poca basura, aparición lenta',
    2:'Reto equilibrado',
    3:'Más residuos en pantalla'
  };
  document.getElementById('fish-setting-value').textContent = fish;
  document.getElementById('trash-setting-value').textContent = names[difficulty];
  document.getElementById('trash-setting-help').textContent = help[difficulty];
  document.getElementById('duration-setting-value').textContent = duration + ' s';
}

function applySettings() {
  INITIAL_FISH = Number(document.getElementById('fish-setting').value);
  trashDifficulty = Number(document.getElementById('trash-setting').value);
  ROUND_SECONDS = Number(document.getElementById('duration-setting').value);
  toggleSettings(false);
  resetRound(true);
}

function togglePause() {
  if (gameState !== 'running') return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseStarted = millis();
    document.getElementById('pause-btn').textContent = 'Continuar';
    document.getElementById('game-status').textContent = 'EN PAUSA';
    document.getElementById('canvas-hint').textContent = 'Partida en pausa';
    document.getElementById('canvas-hint').hidden = false;
  } else {
    const pausedFor = millis() - pauseStarted;
    startMillis += pausedFor;
    lastSpawn += pausedFor;
    document.getElementById('pause-btn').textContent = 'Pausar';
    document.getElementById('game-status').textContent = 'EN CURSO';
    document.getElementById('canvas-hint').hidden = true;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('start-btn').addEventListener('click',startRound);
  document.getElementById('reset-btn').addEventListener('click',()=>resetRound(true));
  document.getElementById('play-again').addEventListener('click',()=>{resetRound(false);startRound();});
  document.getElementById('pause-btn').addEventListener('click',togglePause);
  document.getElementById('game-over-restart').addEventListener('click',()=>{resetRound(false);startRound();});
  document.getElementById('settings-btn').addEventListener('click',()=>toggleSettings(document.getElementById('settings-panel').hidden));
  document.getElementById('close-settings').addEventListener('click',()=>toggleSettings(false));
  document.getElementById('apply-settings').addEventListener('click',applySettings);
  ['fish-setting','trash-setting','duration-setting'].forEach(id=>document.getElementById(id).addEventListener('input',updateSettingLabels));
  updateSettingLabels();
});
