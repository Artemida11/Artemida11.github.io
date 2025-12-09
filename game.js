// game.js - Основной игровой движок

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ============ КОНФИГУРАЦИЯ ============
const CONFIG = {
    tileSize: 100,
    playerSpeed: 3,
    flashlightAngle: Math.PI / 3,      // Шире конус (60° вместо 45°)
    flashlightRange: 500,               // Дальность 500 вместо 300
    ambientLight: 0,                 // Больше фонового света
    flashlightIntensity: 15,           // Яркость фонарика
    playerGlowRadius: 100,                // Свечение вокруг игрока
    ammoPickupAmount: 3,      // Патроны в ящиках
    healthPickupAmount: 5,    // HP в ящиках
    itemSpawnChance: 1      // Шанс спавна ящика в комнате
};

// ============ ИГРОВОЕ СОСТОЯНИЕ ============
const game = {
    level: null,
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],         
    floatingTexts: [],     
    camera: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
    keys: {}
};

// ============ ИГРОК ============
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.angle = 0;
        this.health = 100;
        this.ammo = 30;
        this.flashlightOn = true;
    }
    
    update() {
        // Движение
        let dx = 0, dy = 0;
        if (game.keys['KeyW'] || game.keys['ArrowUp']) dy -= 1;
        if (game.keys['KeyS'] || game.keys['ArrowDown']) dy += 1;
        if (game.keys['KeyA'] || game.keys['ArrowLeft']) dx -= 1;
        if (game.keys['KeyD'] || game.keys['ArrowRight']) dx += 1;
        
        // Нормализация диагонального движения
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        
        const newX = this.x + dx * CONFIG.playerSpeed;
        const newY = this.y + dy * CONFIG.playerSpeed;
        
        // Коллизия со стенами
        if (!game.level.isWall(newX, this.y)) this.x = newX;
        if (!game.level.isWall(this.x, newY)) this.y = newY;
        
        // Угол к курсору
        const screenX = this.x - game.camera.x;
        const screenY = this.y - game.camera.y;
        this.angle = Math.atan2(game.mouse.y - screenY, game.mouse.x - screenX);
    }
    
    shoot() {
        if (this.ammo <= 0) return;
        this.ammo--;
        
        game.bullets.push(new Bullet(
            this.x + Math.cos(this.angle) * 20,
            this.y + Math.sin(this.angle) * 20,
            this.angle
        ));
        
        // Вспышка при выстреле
        this.createMuzzleFlash();
    }
    
    createMuzzleFlash() {
        for (let i = 0; i < 5; i++) {
            game.particles.push({
                x: this.x + Math.cos(this.angle) * 25,
                y: this.y + Math.sin(this.angle) * 25,
                vx: Math.cos(this.angle + (Math.random() - 0.5)) * 3,
                vy: Math.sin(this.angle + (Math.random() - 0.5)) * 3,
                life: 10,
                color: '#FFA500'
            });
        }
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x - game.camera.x, this.y - game.camera.y);
        ctx.rotate(this.angle);
        
        // Тело
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Оружие
        ctx.fillStyle = '#333';
        ctx.fillRect(5, -3, 20, 6);
        
        ctx.restore();
    }
}

// ============ ПУЛИ ============
class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.speed = 15;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.alive = true;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (game.level.isWall(this.x, this.y)) {
            this.alive = false;
            this.createSparks();
        }
    }
    
    createSparks() {
        for (let i = 0; i < 8; i++) {
            game.particles.push({
                x: this.x,
                y: this.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 20,
                color: '#FFD700'
            });
        }
    }
    
    draw() {
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ============ ГЕНЕРАЦИЯ УРОВНЕЙ ============
class Level {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tiles = [];
        this.rooms = [];
        this.generate();
        this.spawnPickups();
    }
    
    generate() {
        // Инициализация стенами
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = 1; // 1 = стена
            }
        }
        
        // BSP разделение
        const root = {
            x: 1, y: 1,
            w: this.width - 2,
            h: this.height - 2,
            left: null, right: null
        };
        
        this.splitNode(root, 4);
        this.createRooms(root);
        this.connectRooms();
        this.addDetails();
    }
    
    splitNode(node, depth) {
        if (depth === 0 || node.w < 10 || node.h < 10) return;
        
        const horizontal = node.w < node.h ? true : 
                          node.w > node.h ? false : 
                          Math.random() > 0.5;
        
        if (horizontal) {
            const split = Math.floor(node.h * (0.3 + Math.random() * 0.4));
            if (split < 5 || node.h - split < 5) return;
            
            node.left = { x: node.x, y: node.y, w: node.w, h: split };
            node.right = { x: node.x, y: node.y + split, w: node.w, h: node.h - split };
        } else {
            const split = Math.floor(node.w * (0.3 + Math.random() * 0.4));
            if (split < 5 || node.w - split < 5) return;
            
            node.left = { x: node.x, y: node.y, w: split, h: node.h };
            node.right = { x: node.x + split, y: node.y, w: node.w - split, h: node.h };
        }
        
        this.splitNode(node.left, depth - 1);
        this.splitNode(node.right, depth - 1);
    }
    
    createRooms(node) {
        if (!node) return null;
        
        if (node.left || node.right) {
            const leftRoom = this.createRooms(node.left);
            const rightRoom = this.createRooms(node.right);
            return leftRoom || rightRoom;
        }
        
        // Создаём комнату внутри листового узла
        const roomW = Math.floor(node.w * (0.6 + Math.random() * 0.3));
        const roomH = Math.floor(node.h * (0.6 + Math.random() * 0.3));
        const roomX = node.x + Math.floor(Math.random() * (node.w - roomW));
        const roomY = node.y + Math.floor(Math.random() * (node.h - roomH));
        
        const room = { x: roomX, y: roomY, w: roomW, h: roomH };
        this.rooms.push(room);
        
        // Вырезаем комнату
        for (let y = roomY; y < roomY + roomH; y++) {
            for (let x = roomX; x < roomX + roomW; x++) {
                this.tiles[y][x] = 0; // 0 = пол
            }
        }
        
        return room;
    }
    
    connectRooms() {
        for (let i = 0; i < this.rooms.length - 1; i++) {
            const a = this.rooms[i];
            const b = this.rooms[i + 1];
            
            const ax = Math.floor(a.x + a.w / 2);
            const ay = Math.floor(a.y + a.h / 2);
            const bx = Math.floor(b.x + b.w / 2);
            const by = Math.floor(b.y + b.h / 2);
            
            // L-образный коридор
            if (Math.random() > 0.5) {
                this.carveHorizontal(ax, bx, ay);
                this.carveVertical(ay, by, bx);
            } else {
                this.carveVertical(ay, by, ax);
                this.carveHorizontal(ax, bx, by);
            }
        }
    }
    
    carveHorizontal(x1, x2, y) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            if (y > 0 && y < this.height - 1) {
                this.tiles[y][x] = 0;
                // Ширина коридора = 2
                if (y + 1 < this.height - 1) this.tiles[y + 1][x] = 0;
            }
        }
    }
    
    carveVertical(y1, y2, x) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            if (x > 0 && x < this.width - 1) {
                this.tiles[y][x] = 0;
                if (x + 1 < this.width - 1) this.tiles[y][x + 1] = 0;
            }
        }
    }
    
    addDetails() {
        // Добавляем укрытия и объекты
        for (const room of this.rooms) {
            if (Math.random() > 0.5) {
                // Колонны
                const cx = room.x + Math.floor(room.w / 2);
                const cy = room.y + Math.floor(room.h / 2);
                this.tiles[cy][cx] = 2; // 2 = укрытие
            }
        }
    }
    
    isWall(px, py) {
        const tx = Math.floor(px / CONFIG.tileSize);
        const ty = Math.floor(py / CONFIG.tileSize);
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return true;
        return this.tiles[ty][tx] !== 0;
    }
    
    getSpawnPoint() {
        const room = this.rooms[0];
        return {
            x: (room.x + room.w / 2) * CONFIG.tileSize,
            y: (room.y + room.h / 2) * CONFIG.tileSize
        };
    }
    
    draw() {
        const p = currentPalette;  // Используем текущую палитру
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const screenX = x * CONFIG.tileSize - game.camera.x;
                const screenY = y * CONFIG.tileSize - game.camera.y;
                
                if (screenX < -CONFIG.tileSize || screenX > canvas.width ||
                    screenY < -CONFIG.tileSize || screenY > canvas.height) continue;
                
                const tile = this.tiles[y][x];
                
                if (tile === 1) {
                    // Стена с вариацией
                    ctx.fillStyle = p.wall;
                    ctx.fillRect(screenX, screenY, CONFIG.tileSize, CONFIG.tileSize);
                    
                    // Обводка
                    ctx.strokeStyle = p.wallStroke;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(screenX + 0.5, screenY + 0.5, CONFIG.tileSize - 1, CONFIG.tileSize - 1);
                    
                    // Детали на стенах (случайные линии)
                    if ((x + y) % 7 === 0) {
                        ctx.strokeStyle = p.wallStroke;
                        ctx.beginPath();
                        ctx.moveTo(screenX + 5, screenY + 5);
                        ctx.lineTo(screenX + CONFIG.tileSize - 5, screenY + CONFIG.tileSize - 5);
                        ctx.stroke();
                    }
                    
                } else if (tile === 0) {
                    // Пол с шахматным паттерном
                    ctx.fillStyle = (x + y) % 2 === 0 ? p.floor : p.floorAlt;
                    ctx.fillRect(screenX, screenY, CONFIG.tileSize, CONFIG.tileSize);
                    
                    // Случайные пятна/детали на полу
                    if ((x * 7 + y * 13) % 23 === 0) {
                        ctx.fillStyle = p.wallStroke;
                        ctx.globalAlpha = 0.1;
                        ctx.beginPath();
                        ctx.arc(
                            screenX + CONFIG.tileSize / 2, 
                            screenY + CONFIG.tileSize / 2, 
                            5 + Math.random() * 10, 
                            0, Math.PI * 2
                        );
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    
                } else if (tile === 2) {
                    // Пол под укрытием
                    ctx.fillStyle = p.floor;
                    ctx.fillRect(screenX, screenY, CONFIG.tileSize, CONFIG.tileSize);
                    
                    // Укрытие (колонна/ящик)
                    ctx.fillStyle = p.cover;
                    ctx.fillRect(screenX + 4, screenY + 4, CONFIG.tileSize - 8, CONFIG.tileSize - 8);
                    ctx.strokeStyle = p.wallStroke;
                    ctx.strokeRect(screenX + 4, screenY + 4, CONFIG.tileSize - 8, CONFIG.tileSize - 8);
                    }
            }
        }
    }
    spawnPickups() {
        game.pickups = [];
        
        // Пропускаем первую комнату (спавн игрока)
        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            
            if (Math.random() > CONFIG.itemSpawnChance) continue;
            
            // Случайная позиция в комнате
            const px = (room.x + 1 + Math.random() * (room.w - 2)) * CONFIG.tileSize;
            const py = (room.y + 1 + Math.random() * (room.h - 2)) * CONFIG.tileSize;
            
            // Случайный тип (50/50)
            const type = Math.random() > 0.5 ? 'ammo' : 'health';
            
            game.pickups.push(new Pickup(px, py, type));
        }
        
        // Гарантированный спавн в нескольких комнатах
        // (чтобы игрок не остался без ресурсов)
        if (this.rooms.length > 3) {
            const midRoom = this.rooms[Math.floor(this.rooms.length / 2)];
            game.pickups.push(new Pickup(
                (midRoom.x + midRoom.w / 2) * CONFIG.tileSize,
                (midRoom.y + midRoom.h / 2) * CONFIG.tileSize,
                'ammo'
            ));
        }
        
        if (this.rooms.length > 5) {
            const lateRoom = this.rooms[Math.floor(this.rooms.length * 0.75)];
            game.pickups.push(new Pickup(
                (lateRoom.x + lateRoom.w / 2) * CONFIG.tileSize,
                (lateRoom.y + lateRoom.h / 2) * CONFIG.tileSize,
                'health'
            ));
        }
    }
}

// ============ СИСТЕМА ОСВЕЩЕНИЯ ============
class LightingSystem {
    constructor() {
        this.lightCanvas = document.createElement('canvas');
        this.lightCtx = this.lightCanvas.getContext('2d');
        this.lightCanvas.width = canvas.width;
        this.lightCanvas.height = canvas.height;
    }
    
    update() {
        const lctx = this.lightCtx;
        const p = currentPalette;
        
        // Фон с цветом палитры
        lctx.fillStyle = p.ambient;
        lctx.fillRect(0, 0, this.lightCanvas.width, this.lightCanvas.height);
        
        lctx.globalCompositeOperation = 'destination-out';
        
        if (game.player && game.player.flashlightOn) {
            this.drawFlashlight(game.player);
        }
        
        this.drawMuzzleFlashes();
        
        lctx.globalCompositeOperation = 'source-over';
    }
    
    drawFlashlight(player) {
        const lctx = this.lightCtx;
        const px = player.x - game.camera.x;
        const py = player.y - game.camera.y;
        const p = currentPalette;
        const fl = p.flashlight;
        
        const rays = this.castRays(player.x, player.y, player.angle);
        
        // Ядро света с цветом палитры
        const coreGradient = lctx.createRadialGradient(
            px, py, 0,
            px, py, CONFIG.flashlightRange * 0.4
        );
        coreGradient.addColorStop(0, `rgba(${fl.r}, ${fl.g}, ${fl.b}, 1)`);
        coreGradient.addColorStop(0.5, `rgba(${fl.r}, ${fl.g}, ${fl.b * 0.9}, 0.95)`);
        coreGradient.addColorStop(1, `rgba(${fl.r}, ${fl.g * 0.95}, ${fl.b * 0.85}, 0.7)`);
        
        lctx.fillStyle = coreGradient;
        lctx.beginPath();
        lctx.moveTo(px, py);
        for (const ray of rays) {
            lctx.lineTo(ray.x - game.camera.x, ray.y - game.camera.y);
        }
        lctx.closePath();
        lctx.fill();
        
        // Основной свет
        const mainGradient = lctx.createRadialGradient(
            px, py, 0,
            px, py, CONFIG.flashlightRange
        );
        mainGradient.addColorStop(0, `rgba(${fl.r}, ${fl.g}, ${fl.b}, 1)`);
        mainGradient.addColorStop(0.2, `rgba(${fl.r}, ${fl.g}, ${fl.b * 0.9}, 0.9)`);
        mainGradient.addColorStop(0.5, `rgba(${fl.r}, ${fl.g * 0.95}, ${fl.b * 0.8}, 0.6)`);
        mainGradient.addColorStop(0.8, `rgba(${fl.r}, ${fl.g * 0.9}, ${fl.b * 0.7}, 0.3)`);
        mainGradient.addColorStop(1, `rgba(${fl.r}, ${fl.g * 0.85}, ${fl.b * 0.6}, 0)`);
        
        lctx.fillStyle = mainGradient;
        lctx.beginPath();
        lctx.moveTo(px, py);
        for (const ray of rays) {
            lctx.lineTo(ray.x - game.camera.x, ray.y - game.camera.y);
        }
        lctx.closePath();
        lctx.fill();
        
        // Рассеянный свет вокруг
        const scatterGradient = lctx.createRadialGradient(
            px, py, 0,
            px, py, CONFIG.playerGlowRadius
        );
        scatterGradient.addColorStop(0, `rgba(${fl.r}, ${fl.g}, ${fl.b}, 0.9)`);
        scatterGradient.addColorStop(0.4, `rgba(${fl.r}, ${fl.g}, ${fl.b}, 0.5)`);
        scatterGradient.addColorStop(1, `rgba(${fl.r}, ${fl.g}, ${fl.b}, 0)`);
        
        lctx.fillStyle = scatterGradient;
        lctx.beginPath();
        lctx.arc(px, py, CONFIG.playerGlowRadius, 0, Math.PI * 2);
        lctx.fill();
    }
    
    castRays(originX, originY, angle) {
        const rays = [];
        const numRays = 80;  // Больше лучей = плавнее края
        const halfAngle = CONFIG.flashlightAngle / 2;
        
        for (let i = 0; i <= numRays; i++) {
            const rayAngle = angle - halfAngle + (CONFIG.flashlightAngle * i / numRays);
            const hit = this.castSingleRay(originX, originY, rayAngle);
            rays.push(hit);
        }
        
        return rays;
    }
    
    castSingleRay(ox, oy, angle) {
        const step = 4;  // Меньше шаг = точнее тени
        const dx = Math.cos(angle) * step;
        const dy = Math.sin(angle) * step;
        
        let x = ox;
        let y = oy;
        let distance = 0;
        
        while (distance < CONFIG.flashlightRange) {
            x += dx;
            y += dy;
            distance += step;
            
            if (game.level.isWall(x, y)) {
                return { x, y, distance };
            }
        }
        
        return { x, y, distance: CONFIG.flashlightRange };
    }
    
    drawMuzzleFlashes() {
        const lctx = this.lightCtx;
        
        for (const p of game.particles) {
            if (p.color === '#FFA500') {
                // Яркая вспышка от выстрела
                const glow = lctx.createRadialGradient(
                    p.x - game.camera.x, p.y - game.camera.y, 0,
                    p.x - game.camera.x, p.y - game.camera.y, 150
                );
                glow.addColorStop(0, 'rgba(255, 200, 100, 1)');
                glow.addColorStop(0.2, 'rgba(255, 150, 50, 0.8)');
                glow.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
                glow.addColorStop(1, 'rgba(255, 50, 0, 0)');
                
                lctx.fillStyle = glow;
                lctx.beginPath();
                lctx.arc(p.x - game.camera.x, p.y - game.camera.y, 150, 0, Math.PI * 2);
                lctx.fill();
            }
        }
    }
    
    draw() {
        ctx.drawImage(this.lightCanvas, 0, 0);
    }
}

// ============ ВРАГИ ============
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.angle = Math.random() * Math.PI * 2;
        this.health = 100;
        this.state = 'patrol'; // patrol, alert, chase, search
        this.alertLevel = 0;
        this.lastKnownPlayerPos = null;
        this.patrolPoints = [];
        this.currentPatrolIndex = 0;
        this.viewDistance = 200;
        this.viewAngle = Math.PI / 3;
    }
    
    update() {
        switch (this.state) {
            case 'patrol':
                this.patrol();
                break;
            case 'alert':
                this.alert();
                break;
            case 'chase':
                this.chase();
                break;
            case 'search':
                this.search();
                break;
        }
        
        this.checkPlayerVisibility();
    }
    
    checkPlayerVisibility() {
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > this.viewDistance) return;
        
        // Проверка угла обзора
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = Math.abs(this.angle - angleToPlayer);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        
        if (angleDiff > this.viewAngle / 2) return;
        
        // Raycast к игроку
        if (!this.hasLineOfSight(game.player.x, game.player.y)) return;
        
        // Игрок обнаружен!
        this.alertLevel += 2;
        this.lastKnownPlayerPos = { x: game.player.x, y: game.player.y };
        
        if (this.alertLevel > 100) {
            this.state = 'chase';
        } else if (this.alertLevel > 50) {
            this.state = 'alert';
        }
    }
    
    hasLineOfSight(targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.floor(distance / 10);
        
        for (let i = 1; i < steps; i++) {
            const x = this.x + (dx * i / steps);
            const y = this.y + (dy * i / steps);
            if (game.level.isWall(x, y)) return false;
        }
        return true;
    }
    
    patrol() {
        this.alertLevel = Math.max(0, this.alertLevel - 0.5);
        
        // Простое патрулирование - случайное вращение
        this.angle += (Math.random() - 0.5) * 0.05;
        
        // Движение вперёд
        const newX = this.x + Math.cos(this.angle) * 1;
        const newY = this.y + Math.sin(this.angle) * 1;
        
        if (!game.level.isWall(newX, newY)) {
            this.x = newX;
            this.y = newY;
        } else {
            this.angle += Math.PI / 2;
        }
    }
    
    chase() {
        if (!this.lastKnownPlayerPos) {
            this.state = 'search';
            return;
        }
        
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.angle = Math.atan2(dy, dx);
        
        if (distance > 30) {
            const newX = this.x + Math.cos(this.angle) * 2.5;
            const newY = this.y + Math.sin(this.angle) * 2.5;
            
            if (!game.level.isWall(newX, newY)) {
                this.x = newX;
                this.y = newY;
            }
        } else {
            // Атака!
            this.attack();
        }
        
        // Потеря игрока из виду
        if (!this.hasLineOfSight(game.player.x, game.player.y)) {
            this.alertLevel -= 1;
            if (this.alertLevel < 50) {
                this.state = 'search';
            }
        }
    }
    
    alert() {
        // Поворот к последней известной позиции
        if (this.lastKnownPlayerPos) {
            const dx = this.lastKnownPlayerPos.x - this.x;
            const dy = this.lastKnownPlayerPos.y - this.y;
            this.angle = Math.atan2(dy, dx);
        }
        this.alertLevel -= 0.3;
        if (this.alertLevel < 30) {
            this.state = 'patrol';
        }
    }
    
    search() {
        if (this.lastKnownPlayerPos) {
            const dx = this.lastKnownPlayerPos.x - this.x;
            const dy = this.lastKnownPlayerPos.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 20) {
                this.angle = Math.atan2(dy, dx);
                const newX = this.x + Math.cos(this.angle) * 1.5;
                const newY = this.y + Math.sin(this.angle) * 1.5;
                
                if (!game.level.isWall(newX, newY)) {
                    this.x = newX;
                    this.y = newY;
                }
            } else {
                this.lastKnownPlayerPos = null;
            }
        }
        
        this.alertLevel -= 0.2;
        if (this.alertLevel < 10) {
            this.state = 'patrol';
        }
    }
    
    attack() {
        // Наносим урон игроку
        game.player.health -= 0.5;
    }
    
    takeDamage(amount) {
        this.health -= amount;
        this.state = 'chase';
        this.alertLevel = 100;
        this.lastKnownPlayerPos = { x: game.player.x, y: game.player.y };
        
        return this.health <= 0;
    }
    
    draw() {
        const screenX = this.x - game.camera.x;
        const screenY = this.y - game.camera.y;
        
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        
        // Тело
        ctx.fillStyle = this.state === 'chase' ? '#8B0000' : 
                       this.state === 'alert' ? '#DAA520' : '#4a4a5e';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Направление взгляда
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(15, 0);
        ctx.stroke();
        
        ctx.restore();
        
        // Индикатор тревоги
        if (this.alertLevel > 0) {
            ctx.fillStyle = `rgba(255, ${255 - this.alertLevel * 2}, 0, 0.8)`;
            ctx.fillRect(screenX - 15, screenY - 25, (this.alertLevel / 100) * 30, 5);
        }
    }
}

// ============ ИНИЦИАЛИЗАЦИЯ И ИГРОВОЙ ЦИКЛ ============
const lighting = new LightingSystem();

function init() {
    // Выбираем палитру (80% готовая, 20% случайная)
    if (Math.random() > 0.2) {
        currentPalette = randomPalette();
    } else {
        currentPalette = generateRandomPalette();
    }
    
    console.log(`Уровень: ${currentPalette.name}`);
    
    // Генерация уровня
    game.level = new Level(50, 40);
    
    // Спавн игрока
    const spawn = game.level.getSpawnPoint();
    game.player = new Player(spawn.x, spawn.y);
    
    // Спавн врагов
    game.enemies = [];
    game.bullets = [];
    game.particles = [];
    
    for (let i = 1; i < game.level.rooms.length; i++) {
        const room = game.level.rooms[i];
        const ex = (room.x + room.w / 2) * CONFIG.tileSize;
        const ey = (room.y + room.h / 2) * CONFIG.tileSize;
        game.enemies.push(new Enemy(ex, ey));
        
        if (room.w > 6 && room.h > 6 && Math.random() > 0.5) {
            game.enemies.push(new Enemy(
                ex + (Math.random() - 0.5) * room.w * CONFIG.tileSize * 0.5,
                ey + (Math.random() - 0.5) * room.h * CONFIG.tileSize * 0.5
            ));
        }
    }
     game.levelStartTime = Date.now();
}

function update() {
    if (game.player.health <= 0) return;
    
    game.player.update();
    
    // Камера
    game.camera.x = game.player.x - canvas.width / 2;
    game.camera.y = game.player.y - canvas.height / 2;
    
    // Враги
    for (const enemy of game.enemies) {
        enemy.update();
    }
    
    // Предметы
    for (const pickup of game.pickups) {
        pickup.update();
    }
    game.pickups = game.pickups.filter(p => !p.collected);
    
    // Пули
    for (const bullet of game.bullets) {
        bullet.update();
        
        for (let i = game.enemies.length - 1; i >= 0; i--) {
            const enemy = game.enemies[i];
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            if (dx * dx + dy * dy < 400) {
                bullet.alive = false;
                if (enemy.takeDamage(35)) {
                    game.enemies.splice(i, 1);
                    createDeathParticles(enemy.x, enemy.y);
                    
                    // Шанс дропа с врага (очень маленький)
                    if (Math.random() < 0.2) {
                        const type = Math.random() > 0.5 ? 'ammo' : 'health';
                        game.pickups.push(new Pickup(enemy.x, enemy.y, type));
                    }
                }
            }
        }
    }
    game.bullets = game.bullets.filter(b => b.alive);
    
    // Частицы
    for (const p of game.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;
    }
    game.particles = game.particles.filter(p => p.life > 0);
    
    // Всплывающий текст
    for (const ft of game.floatingTexts) {
        ft.y -= 1;
        ft.life--;
    }
    game.floatingTexts = game.floatingTexts.filter(ft => ft.life > 0);
    
    // Освещение
    lighting.update();
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Уровень
    game.level.draw();
    
    // Предметы (под врагами)
    for (const pickup of game.pickups) {
        pickup.draw();
    }
    
    // Враги
    for (const enemy of game.enemies) {
        enemy.draw();
    }
    
    // Пули
    for (const bullet of game.bullets) {
        bullet.draw();
    }
    
    // Частицы
    for (const p of game.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.beginPath();
        ctx.arc(p.x - game.camera.x, p.y - game.camera.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Игрок
    game.player.draw();
    
    // Освещение
    lighting.draw();
    
    // Всплывающий текст (поверх освещения)
    for (const ft of game.floatingTexts) {
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = ft.life / 40;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x - game.camera.x, ft.y - game.camera.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    
    // UI
    drawUI();
}

function createDeathParticles(x, y) {
    for (let i = 0; i < 20; i++) {
        game.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 30 + Math.random() * 20,
            color: '#8B0000'
        });
    }
}

function draw() {
    // Очистка
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Уровень
    game.level.draw();
    
    // Враги
    for (const enemy of game.enemies) {
        enemy.draw();
    }
    
    // Пули
    for (const bullet of game.bullets) {
        bullet.draw();
    }
    
    // Частицы
    for (const p of game.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.beginPath();
        ctx.arc(p.x - game.camera.x, p.y - game.camera.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Игрок
    game.player.draw();
    
    // Освещение поверх всего
    lighting.draw();
    
    // UI
    drawUI();
}

function drawUI() {
    const p = currentPalette;
    
    
    
    // Название локации (появляется в начале)
    if (game.levelStartTime && Date.now() - game.levelStartTime < 3000) {
        const alpha = Math.min(1, (3000 - (Date.now() - game.levelStartTime)) / 1000);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(currentPalette.name.toUpperCase(), canvas.width / 2, 100);
        ctx.font = '18px monospace';
        ctx.fillText(`Враги: ${game.enemies.length}`, canvas.width / 2, 130);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }
    
        // Полоса здоровья
    ctx.fillStyle = p.wall;
    ctx.fillRect(20, 20, 200, 20);
    ctx.fillStyle = game.player.health > 30 ? '#4CAF50' : '#f44336';
    ctx.fillRect(20, 20, game.player.health * 2, 20);
    ctx.strokeStyle = p.wallStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 200, 20);
    
    // Иконка здоровья
    ctx.fillStyle = '#FF3333';
    ctx.fillRect(8, 24, 6, 12);
    ctx.fillRect(4, 28, 14, 4);
    
    // Патроны с иконкой
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(28, 55, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFF';
    ctx.font = '18px monospace';
    ctx.fillText(`${game.player.ammo}`, 45, 60);
    
    // Враги
    ctx.fillStyle = '#FF6666';
    ctx.beginPath();
    ctx.arc(28, 85, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFF';
    ctx.fillText(`${game.enemies.length}`, 45, 90);
    
    // Предметы на уровне
    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText(`Предметов: ${game.pickups.length}`, 20, 115);
    
    // Мини-индикатор палитры
    ctx.fillStyle = p.wall;
    ctx.fillRect(canvas.width - 60, 20, 40, 40);
    ctx.strokeStyle = p.wallStroke;
    ctx.strokeRect(canvas.width - 60, 20, 40, 40);
    
    // Победа
    if (game.enemies.length === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4CAF50';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AREA CLEARED', canvas.width / 2, canvas.height / 2);
        ctx.font = '24px monospace';
        ctx.fillText('Press R for next level', canvas.width / 2, canvas.height / 2 + 50);
        ctx.textAlign = 'left';
    }
    
    // Смерть
    if (game.player.health <= 0) {
        ctx.fillStyle = 'rgba(139, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFF';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', canvas.width / 2, canvas.height / 2);
        ctx.font = '24px monospace';
        ctx.fillText('Press R to retry', canvas.width / 2, canvas.height / 2 + 50);
        ctx.textAlign = 'left';
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ============ УПРАВЛЕНИЕ ============
document.addEventListener('keydown', (e) => {
    game.keys[e.code] = true;
    
    if (e.code === 'KeyF') {
        game.player.flashlightOn = !game.player.flashlightOn;
    }
    
    if (e.code === 'KeyR') {
        init();
    }
});

document.addEventListener('keyup', (e) => {
    game.keys[e.code] = false;
});

document.addEventListener('mousemove', (e) => {
    game.mouse.x = e.clientX;
    game.mouse.y = e.clientY;
});

canvas.addEventListener('click', () => {
    game.player.shoot();
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    lighting.lightCanvas.width = canvas.width;
    lighting.lightCanvas.height = canvas.height;
});

// ============ ЦВЕТОВЫЕ ПАЛИТРЫ ============
const PALETTES = [
    {
        name: 'Склад',
        wall: '#1a1a2e',
        wallStroke: '#2a2a4e',
        floor: '#0d0d15',
        floorAlt: '#12121a',
        cover: '#2a2a3e',
        flashlight: { r: 255, g: 255, b: 240 },
        ambient: 'rgba(0, 0, 20, 0.92)',
        fog: '#0a0a15'
    },
    {
        name: 'Подвал',
        wall: '#1c2e1a',
        wallStroke: '#2e4a2a',
        floor: '#0d150d',
        floorAlt: '#121a12',
        cover: '#2a3e2a',
        flashlight: { r: 255, g: 250, b: 220 },
        ambient: 'rgba(0, 20, 0, 0.92)',
        fog: '#0a150a'
    },
    {
        name: 'Особняк',
        wall: '#2e1a1a',
        wallStroke: '#4a2a2a',
        floor: '#150d0d',
        floorAlt: '#1a1212',
        cover: '#3e2a2a',
        flashlight: { r: 255, g: 240, b: 220 },
        ambient: 'rgba(20, 5, 0, 0.92)',
        fog: '#150a0a'
    },
    {
        name: 'Лаборатория',
        wall: '#1a2a2e',
        wallStroke: '#2a4a5e',
        floor: '#0d1215',
        floorAlt: '#101518',
        cover: '#2a3a4e',
        flashlight: { r: 240, g: 250, b: 255 },
        ambient: 'rgba(0, 10, 30, 0.92)',
        fog: '#0a1015'
    },
    {
        name: 'Тюрьма',
        wall: '#2e2215',
        wallStroke: '#4a3a25',
        floor: '#15100a',
        floorAlt: '#1a140d',
        cover: '#3e3020',
        flashlight: { r: 255, g: 230, b: 200 },
        ambient: 'rgba(20, 10, 0, 0.92)',
        fog: '#100a05'
    },
    {
        name: 'Неон',
        wall: '#1a1a2e',
        wallStroke: '#4a2a6e',
        floor: '#0d0d18',
        floorAlt: '#12101f',
        cover: '#2e2a4e',
        flashlight: { r: 230, g: 200, b: 255 },
        ambient: 'rgba(10, 0, 20, 0.90)',
        fog: '#0f0a18'
    },
    {
        name: 'Больница',
        wall: '#202528',
        wallStroke: '#354040',
        floor: '#101515',
        floorAlt: '#151a1a',
        cover: '#2a3535',
        flashlight: { r: 240, g: 255, b: 250 },
        ambient: 'rgba(0, 15, 15, 0.92)',
        fog: '#0a1212'
    },
    {
        name: 'Бункер',
        wall: '#252525',
        wallStroke: '#404040',
        floor: '#121212',
        floorAlt: '#181818',
        cover: '#353535',
        flashlight: { r: 255, g: 245, b: 230 },
        ambient: 'rgba(10, 10, 10, 0.93)',
        fog: '#0d0d0d'
    }
];

// Текущая палитра
let currentPalette = PALETTES[0];

// Выбор случайной палитры
function randomPalette() {
    return PALETTES[Math.floor(Math.random() * PALETTES.length)];
}

// Генерация процедурной палитры
function generateRandomPalette() {
    const hue = Math.random() * 360;
    const saturation = 20 + Math.random() * 30;
    
    return {
        name: 'Случайная',
        wall: hslToHex(hue, saturation, 15),
        wallStroke: hslToHex(hue, saturation, 25),
        floor: hslToHex(hue, saturation * 0.5, 8),
        floorAlt: hslToHex(hue, saturation * 0.5, 10),
        cover: hslToHex(hue, saturation, 20),
        flashlight: hslToRgb((hue + 30) % 360, 20, 95),
        ambient: `hsla(${hue}, ${saturation}%, 5%, 0.92)`,
        fog: hslToHex(hue, saturation * 0.5, 5)
    };
}

// Вспомогательные функции для цветов
function hslToHex(h, s, l) {
    const rgb = hslToRgbValues(h, s, l);
    return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
}

function hslToRgb(h, s, l) {
    const rgb = hslToRgbValues(h, s, l);
    return { r: rgb.r, g: rgb.g, b: rgb.b };
}

function hslToRgbValues(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
        r: Math.round(255 * f(0)),
        g: Math.round(255 * f(8)),
        b: Math.round(255 * f(4))
    };
}

// ============ ПРЕДМЕТЫ ============
class Pickup {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;  // 'ammo' или 'health'
        this.radius = 12;
        this.collected = false;
        this.bobOffset = Math.random() * Math.PI * 2;  // Для анимации
    }
    
    update() {
        // Проверка подбора игроком
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.radius + game.player.radius) {
            this.collect();
        }
    }
    
    collect() {
        if (this.collected) return;
        
        if (this.type === 'ammo') {
            game.player.ammo += CONFIG.ammoPickupAmount;
            this.createPickupEffect('#FFD700');
            
        } else if (this.type === 'health') {
            game.player.health = Math.min(100, game.player.health + CONFIG.healthPickupAmount);
            this.createPickupEffect('#4CAF50');
        }
        
        this.collected = true;
    }
    
    createPickupEffect() {
        const color = this.type === 'ammo' ? '#FFD700' : '#4CAF50';
        
        // Частицы при подборе
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            game.particles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                life: 20,
                color: color
            });
        }
        
        // Текст "+3" или "+5"
        const amount = this.type === 'ammo' ? CONFIG.ammoPickupAmount : CONFIG.healthPickupAmount;
        game.floatingTexts.push({
            x: this.x,
            y: this.y,
            text: `+${amount}`,
            color: color,
            life: 40
        });
    }
    
    draw() {
        if (this.collected) return;
        
        const screenX = this.x - game.camera.x;
        const screenY = this.y - game.camera.y;
        
        // Анимация покачивания
        const bob = Math.sin(Date.now() / 200 + this.bobOffset) * 2;
        const p = currentPalette;
        
        ctx.save();
        ctx.translate(screenX, screenY + bob);
        
        if (this.type === 'ammo') {
            // Ящик с патронами
            ctx.fillStyle = '#5D4E37';
            ctx.fillRect(-10, -8, 20, 16);
            
            // Крышка
            ctx.fillStyle = '#4A3F2F';
            ctx.fillRect(-10, -8, 20, 4);
            
            // Значок патрона
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('•••', 0, 5);
            
            // Обводка
            ctx.strokeStyle = '#3A2F1F';
            ctx.lineWidth = 1;
            ctx.strokeRect(-10, -8, 20, 16);
            
        } else if (this.type === 'health') {
            // Аптечка
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(-10, -8, 20, 16);
            
            // Красный крест
            ctx.fillStyle = '#FF3333';
            ctx.fillRect(-2, -6, 4, 12);
            ctx.fillRect(-6, -2, 12, 4);
            
            // Обводка
            ctx.strokeStyle = '#CCCCCC';
            ctx.lineWidth = 1;
            ctx.strokeRect(-10, -8, 20, 16);
        }
        
        ctx.restore();
        
        // Мягкое свечение под предметом
        ctx.fillStyle = this.type === 'ammo' 
            ? 'rgba(255, 215, 0, 0.15)' 
            : 'rgba(76, 175, 80, 0.15)';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Старт!
init();
gameLoop();