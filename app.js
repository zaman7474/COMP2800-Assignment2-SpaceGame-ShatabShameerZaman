const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 900;
canvas.height = 900;

const STATE = {
    MENU: 'menu',
    SETTINGS: 'settings',
    PLAYING: 'playing',
    LEVEL_TRANSITION: 'level_transition',
    GAME_OVER: 'game_over',
    WIN: 'win'
};

let gameState = STATE.MENU;

const settings = {
    musicOn: true,
    soundOn: true,
    keybindings: {
        moveLeft: 'A',
        moveRight: 'D',
        moveUp: 'W',
        moveDown: 'S',
        shoot: 'Space'
    }
};

const sounds = {
    laser: new Audio('audio/laser.mp3'),
    explosion: new Audio('audio/explosion.mp3'),
    damage: new Audio('audio/damage.mp3'),
    music: new Audio('audio/music.mp3')
};

sounds.music.loop = true;
sounds.music.volume = 0.4;

function playSound(name) {
    if (name === 'music') {
        if (!settings.musicOn) return;
        sounds.music.play().catch(() => {});
        return;
    }
    if (!settings.soundOn) return;
    const s = sounds[name];
    if (!s) return;
    s.currentTime = 0;
    s.play().catch(() => {});
}

function stopMusic() {
    sounds.music.pause();
    sounds.music.currentTime = 0;
}

const playerImg = new Image(); playerImg.src   = 'images/player.png';
const enemyImg = new Image(); enemyImg.src    = 'images/enemyShip.png';
const bgImg = new Image(); bgImg.src       = 'images/bg.png';
const laserImg = new Image(); laserImg.src    = 'images/laserRed.png';
const asteroidImg = new Image(); asteroidImg.src = 'images/asteroid.png';

let asteroidImgLoaded = false;
asteroidImg.onload = () => { asteroidImgLoaded = true; };

let score = 0;
let playerHealth = 20; // the hearts appear according to the number given here. was 5 before but i kept losing the game so, 20 hearts.
let tookDamageThisRun = false;
let highScore= 0;
let previousScore = 0;
let gameStartTime = 0;
let finalTime = '';
let currentLevel = 1;
let levelPhase= 1;
let levelTimer= 0;
let levelTimerInterval = null;
let transitionTimer= 0;

const player = {
    x: canvas.width / 2 - 25,
    y: canvas.height - 80,
    width: 50,
    height: 50,
    speed: 5,
    minY: canvas.height / 2,
    maxY: canvas.height - 60
};

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' && gameState === STATE.PLAYING) fireLaser();
    if ((e.key === 'r' || e.key === 'R') &&
        (gameState === STATE.GAME_OVER || gameState === STATE.WIN)) {
        gameState = STATE.MENU;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function movePlayer() {
    if ((keys['a'] || keys['A'] || keys['ArrowLeft']) && player.x > 0)
        player.x -= player.speed;
    if ((keys['d'] || keys['D'] || keys['ArrowRight']) && player.x + player.width < canvas.width)
        player.x += player.speed;
    if ((keys['w'] || keys['W'] || keys['ArrowUp']) && player.y > player.minY)
        player.y -= player.speed;
    if ((keys['s'] || keys['S'] || keys['ArrowDown']) && player.y + player.height < player.maxY)
        player.y += player.speed;
}

const lasers = [];

function fireLaser() {
    lasers.push({
        x: player.x + player.width / 2 - 5,
        y: player.y,
        width: 15,
        height: 20,
        speed: 10 // speed at which the player will shoot 
    });
    playSound('laser');
}

function moveLasers() {
    for (let i = lasers.length - 1; i >= 0; i--) {
        lasers[i].y -= lasers[i].speed;
        if (lasers[i].y < 0) lasers.splice(i, 1);
    }
}

const enemyLasers = [];
const explosions  = [];

function moveEnemyLasers() {
    for (let i = enemyLasers.length - 1; i >= 0; i--) {
        enemyLasers[i].y += enemyLasers[i].speed;
        if (enemyLasers[i].y > canvas.height) enemyLasers.splice(i, 1);
    }
}

function enemyShoot(enemy) {
    enemyLasers.push({
        x: enemy.x + enemy.width / 2 - 3,
        y: enemy.y + enemy.height,
        width: 30, // otherwise invisible lasers 
        height: 40,
        speed: 2
    });
}

function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].timer--;
        if (explosions[i].timer <= 0) explosions.splice(i, 1);
    }
}

function drawExplosions() {
    for (let exp of explosions) {
        const progress = 1 - (exp.timer / exp.maxTimer);
        const radius = 10 + progress * 30;
        const alpha = exp.timer / exp.maxTimer;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(255, ${Math.floor(165 * progress)}, 0)`;
        ctx.beginPath();
        ctx.arc(exp.x + exp.width / 2, exp.y + exp.height / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

const ENEMY_TYPE = {
    GENERIC: 'generic'
};

let enemies = [];
let enemyDirection = 1;
let enemySpeed = 0.5;
let totalEnemyRows = 0;
let visibleRows = 4;

function spawnGenericEnemies(rows, cols) {
    enemies = [];
    const w = 45, h = 35, pad = 10;
    const startX = (canvas.width - cols * (w + pad)) / 2;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            enemies.push({
                x: startX + col * (w + pad),
                y: 50 + row * (h + pad),
                width: w,
                height: h,
                alive: true,
                type: ENEMY_TYPE.GENERIC,
                row: row,
                visible: row < 4,
                shootTimer: Math.random() * 120 + 60
            });
        }
    }

    totalEnemyRows = rows;
    visibleRows    = 4;
}

function checkRowReveal() {
    if (visibleRows >= totalEnemyRows) return;
    const visibleAlive = enemies.some(e => e.alive && e.visible);
    if (!visibleAlive) {
        visibleRows++;
        for (let enemy of enemies) {
            if (enemy.row === visibleRows - 1) enemy.visible = true;
        }
    }
}

function moveEnemies() {
    let hitEdge = false;

    for (let enemy of enemies) {
        if (!enemy.alive || !enemy.visible) continue;

        enemy.x += enemySpeed * enemyDirection;
        if (enemy.x + enemy.width >= canvas.width || enemy.x <= 0) hitEdge = true;

        const inFiringZone = enemy.row >= visibleRows - 4;
        if (inFiringZone) {
            enemy.shootTimer--;
            if (enemy.shootTimer <= 0) {
                if (Math.floor(Math.random() * 2) > 0) enemyShoot(enemy);
                enemy.shootTimer = Math.random() * 150 + 60;
            }
        }
    }

    if (hitEdge) {
        enemyDirection *= -1;
        for (let enemy of enemies) {
            if (enemy.visible) enemy.y += 20;
        }
    }
}

let asteroids = [];
let asteroidSpawnTimer = 0;
let asteroidSpawnRate = 90;

function spawnAsteroid() {
    const x = Math.random() * (canvas.width - 40);
    const dx = player.x + player.width  / 2 - x;
    const dy = player.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 3 + Math.random() * 2;
    asteroids.push({
        x, y: -40,
        width: 40, height: 40,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed
    });
}

function moveAsteroids() {
    asteroidSpawnTimer++;
    if (asteroidSpawnTimer >= asteroidSpawnRate) {
        spawnAsteroid();
        asteroidSpawnTimer = 0;
    }
    for (let i = asteroids.length - 1; i >= 0; i--) {
        asteroids[i].x += asteroids[i].vx;
        asteroids[i].y += asteroids[i].vy;
        if (asteroids[i].y > canvas.height + 50 ||
            asteroids[i].x < -50 ||
            asteroids[i].x > canvas.width + 50) {
            asteroids.splice(i, 1);
        }
    }
}

function getElapsedTime() {
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return mins + 'm ' + secs + 's';
}

function damagePlayer() {
    playerHealth--;
    explosions.push({ x: player.x, y: player.y, width: 60, height: 60, timer: 20, maxTimer: 20 });
    tookDamageThisRun = true;
    playSound('damage');
    if (playerHealth <= 0) {
        playerHealth = 0;
        previousScore = score;
        if (score > highScore) highScore = score;
		finalTime = getElapsedTime();
        gameState = STATE.GAME_OVER;
        stopMusic();
        if (levelTimerInterval) clearInterval(levelTimerInterval);
    }
}

function checkCollisions() {
    outer:
    for (let i = lasers.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (!enemies[j].alive || !enemies[j].visible) continue;
            if (rectsOverlap(lasers[i], enemies[j])) {
                enemies[j].alive = false;
                explosions.push({ x: enemies[j].x, y: enemies[j].y, width: 60, height: 60, timer: 20, maxTimer: 20 });
                score += 10;
                lasers.splice(i, 1);
                playSound('explosion');
                continue outer;
            }
        }
    }

    for (let i = enemyLasers.length - 1; i >= 0; i--) {
        if (rectsOverlap(enemyLasers[i], player)) {
            enemyLasers.splice(i, 1);
            damagePlayer();
        }
    }

    for (let i = asteroids.length - 1; i >= 0; i--) {
        if (rectsOverlap(asteroids[i], player)) {
            asteroids.splice(i, 1);
            damagePlayer();
        }
    }

    for (let enemy of enemies) {
        if (!enemy.alive || !enemy.visible || enemy.type !== ENEMY_TYPE.GENERIC) continue;
        if (enemy.y + enemy.height >= player.y) {
            previousScore = score;
            if (score > highScore) highScore = score;
			finalTime = getElapsedTime();
            gameState = STATE.GAME_OVER;
            stopMusic();
            if (levelTimerInterval) clearInterval(levelTimerInterval);
        }
    }
}

function rectsOverlap(a, b) {
    return (
        a.x < b.x + b.width  &&
        a.x + a.width  > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function loadLevel(level) {
    enemies = [];
    lasers.length = 0;
    enemyLasers.length= 0;
    asteroids.length= 0;
    asteroidSpawnTimer = 0;
    asteroidSpawnRate = 90;
    enemyDirection = 1;
    levelPhase = 1;
    visibleRows= 4;
    totalEnemyRows= 0;

    player.x = canvas.width  / 2 - 25;
    player.y = canvas.height - 80;

    if (level === 1) {
        spawnGenericEnemies(12, 8);
    } else if (level === 2) {
        spawnGenericEnemies(12, 8);
    } else if (level === 3) {
        levelTimer        = 180;
        asteroidSpawnRate = 55;
        startLevelTimer();
    }
}

function startLevelTimer() {
    if (levelTimerInterval) clearInterval(levelTimerInterval);
    levelTimerInterval = setInterval(() => {
        levelTimer--;
        if (levelTimer <= 0) {
            clearInterval(levelTimerInterval);
            advanceLevel();
        }
    }, 1000);
}

function checkLevelComplete() {
    if (gameState !== STATE.PLAYING) return;
    const allDead = enemies.every(e => !e.alive);

    if      (currentLevel === 1 && allDead) advanceLevel();
    else if (currentLevel === 2 && allDead) advanceLevel();
    else if (currentLevel === 3)            { /* timer handles it */ }
}

function advanceLevel() {
    if (currentLevel >= 3) { endGame(); return; }
    currentLevel++;
    transitionTimer = 180;
    gameState = STATE.LEVEL_TRANSITION;
}


function drawHearts() {
    for (let i = 0; i < playerHealth; i++) {
        ctx.font = '22px Arial'; // used built in colors rather than an image 
        ctx.fillStyle = i < playerHealth ? '#ff3333' : '#444444';
        ctx.fillText('♥', 10 + i * 28, 60);
    }
}

function drawButton(label, cx, cy, w, h) {
    ctx.fillStyle = '#1a6fcc';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill();
    ctx.fillStyle  = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 7);
}

function drawMenu() {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle  = 'white';
    ctx.font= 'bold 46px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE INVADERS', canvas.width / 2, 210);
    if (highScore > 0) {
        ctx.font = '20px Arial';
        ctx.fillText('Best Score: ' + highScore, canvas.width / 2, 270);
    }
    if (previousScore > 0) {
        ctx.font = '18px Arial';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('Previous Score: ' + previousScore, canvas.width / 2, 300);
    }
    drawButton('PLAY',     canvas.width / 2, 360, 180, 52);
    drawButton('SETTINGS', canvas.width / 2, 430, 180, 52);
    ctx.textAlign = 'left';
}

function drawSettings() {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle= 'white';
    ctx.textAlign = 'center';

    ctx.font = 'bold 36px Arial';
    ctx.fillText('SETTINGS', canvas.width / 2, 100);

    ctx.font = '24px Arial';
    ctx.fillText('Music: ' + (settings.musicOn ? 'ON' : 'OFF'), canvas.width / 2, 190);
    drawButton(settings.musicOn ? 'Turn OFF' : 'Turn ON', canvas.width / 2, 230, 160, 40);

    ctx.fillText('Sound FX: ' + (settings.soundOn ? 'ON' : 'OFF'), canvas.width / 2, 310);
    drawButton(settings.soundOn ? 'Turn OFF' : 'Turn ON', canvas.width / 2, 350, 160, 40);

    ctx.font = 'bold 22px Arial';
    ctx.fillText('Keybindings', canvas.width / 2, 430);
    ctx.font= '18px Arial';
    ctx.fillText('Move Up / Down / Left / Right:   W  S  A  D', canvas.width / 2, 465);
    ctx.fillText('Shoot:   Space', canvas.width / 2, 495);

    drawButton('BACK', canvas.width / 2, 570, 140, 46);
    ctx.textAlign = 'left';
}

function drawLevelTransition() {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle= 'cyan';
    ctx.font= 'bold 54px Arial';
    ctx.textAlign= 'center';
    ctx.fillText('LEVEL ' + currentLevel, canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle= 'white';
    ctx.font= '22px Arial';
    const desc = ['', 'Survive the invasion!', 'Asteroids incoming!', 'Survive 3 minutes!'];
    ctx.fillText(desc[currentLevel] || '', canvas.width / 2, canvas.height / 2 + 40);
    ctx.textAlign = 'left';
}

function draw() {
    if (bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000011';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (gameState === STATE.MENU) {drawMenu();            return; }
    if (gameState === STATE.SETTINGS){ drawSettings();        return; }
    if (gameState === STATE.LEVEL_TRANSITION) { drawLevelTransition(); return; }

    ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

    for (let laser of lasers)
        ctx.drawImage(laserImg, laser.x, laser.y, laser.width, laser.height);

    for (let laser of enemyLasers)
        ctx.drawImage(laserImg, laser.x, laser.y, laser.width, laser.height);

    for (let enemy of enemies) {
        if (!enemy.alive || !enemy.visible) continue;
        ctx.drawImage(enemyImg, enemy.x, enemy.y, enemy.width, enemy.height);
    }

    for (let a of asteroids) {
        if (asteroidImgLoaded) {
            ctx.drawImage(asteroidImg, a.x, a.y, a.width, a.height);
        } else {
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(a.x + a.width / 2, a.y + a.height / 2, a.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawExplosions();

    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText('Score: ' + score, 10, 30);
    ctx.fillText('Level: ' + currentLevel, canvas.width - 100, 30);

    if (currentLevel === 3) {
        ctx.fillStyle = 'yellow';
        ctx.font = '22px Arial';
        ctx.fillText('Time: ' + levelTimer + 's', canvas.width / 2 - 50, 30);
    }

    drawHearts();

    if (gameState === STATE.GAME_OVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '52px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2);
        ctx.fillText('Time: ' + finalTime, canvas.width / 2, canvas.height / 2 + 40);
        ctx.fillText('Best Score: ' + highScore, canvas.width / 2, canvas.height / 2 + 80);
        ctx.fillText('Previous Score: ' + previousScore, canvas.width / 2, canvas.height / 2 + 115);
        ctx.fillText('Press R to return to menu', canvas.width / 2, canvas.height / 2 + 155);
        ctx.textAlign = 'left';
    }

    if (gameState === STATE.WIN) {
		ctx.fillStyle = 'rgba(0,0,0,0.65)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'lime';
		ctx.font= '52px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 80);
		ctx.fillStyle = 'white';
		ctx.font = '22px Arial';
		ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 10);
		ctx.fillText('Time: ' + finalTime, canvas.width / 2, canvas.height / 2 + 45);
		ctx.fillText('Best Score: ' + highScore, canvas.width / 2, canvas.height / 2 + 80);
		ctx.fillText('Previous Score: ' + previousScore, canvas.width / 2, canvas.height / 2 + 115);
		ctx.fillText('Press R to return to menu', canvas.width / 2, canvas.height / 2 + 155);
		ctx.textAlign = 'left';
	}
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx= e.clientX - rect.left;
    const my= e.clientY - rect.top;

    function hit(cx, cy, w, h) {
        return mx >= cx - w/2 && mx <= cx + w/2 && my >= cy - h/2 && my <= cy + h/2;
    }

    if (gameState === STATE.MENU) {
        if (hit(canvas.width/2, 360, 180, 52)) startGame();
        if (hit(canvas.width/2, 430, 180, 52)) gameState = STATE.SETTINGS;
    }

    if (gameState === STATE.SETTINGS) {
        if (hit(canvas.width/2, 230, 160, 40)) {
            settings.musicOn = !settings.musicOn;
            if (!settings.musicOn) stopMusic();
        }
        if (hit(canvas.width/2, 350, 160, 40)) settings.soundOn = !settings.soundOn;
        if (hit(canvas.width/2, 570, 140, 46)) gameState = STATE.MENU;
    }
});

function startGame() {
    score= 0;
    playerHealth= 20; // here is the main health-bar
//  playerHealth=1000;    when iwas loosing my own game.
    tookDamageThisRun = false;
    currentLevel= 1;
    gameState= STATE.PLAYING;
    loadLevel(1);
    playSound('music');
    gameStartTime = Date.now();
}

function endGame() {
    previousScore = score;
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    if (elapsed < 300) score = score * 10;       // under 5 minutes = x10
    score = score * playerHealth;                 // always multiply by remaining hearts and player gets that much bonus 
    if (score > highScore) highScore = score;
	finalTime = getElapsedTime();
    gameState = STATE.WIN;
    stopMusic();
}

function gameLoop() {
    if (gameState === STATE.PLAYING) {
        movePlayer();
        moveLasers();
        moveEnemyLasers();
        moveEnemies();
        checkRowReveal();
        updateExplosions();

        const asteroidsActive = currentLevel === 2 || currentLevel === 3;
        if (asteroidsActive) moveAsteroids();

        checkCollisions();
        checkLevelComplete();
    }

    if (gameState === STATE.LEVEL_TRANSITION) {
        transitionTimer--;
        if (transitionTimer <= 0) {
            gameState = STATE.PLAYING;
            loadLevel(currentLevel);
        }
    }

    draw();
    requestAnimationFrame(gameLoop);
}

bgImg.onload = () => { gameLoop(); };

setTimeout(() => {
    if (gameState === STATE.MENU) gameLoop();
}, 500);