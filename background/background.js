// background.js

console.log('Service Worker iniciado correctamente.');

let timer;
let isPaused = false;
let remainingTime = 0;
let currentCycle = 0;
let settings = {};
let blockedUrls = [];
let timerActive = false; // Estado del temporizador

// Constante para el ID de la regla
const RULE_ID_BASE = 1000;

// Declaración de la variable badgeTimerInterval
let badgeTimerInterval;

// Objeto para mapear ID de pestaña a URL original
const tabOriginalUrls = {};

// Estado del temporizador: 'running', 'paused', 'stopped'
let timerState = 'stopped';

// Total de ciclos configurados
let totalCycles = 4;

// Función para generar una regla para una URL bloqueada
function createBlockingRule(url, ruleId) {
    return {
        id: ruleId,
        priority: 1,
        action: {
            type: "redirect",
            redirect: {
                extensionPath: "/blocked/blocked.html"
            }
        },
        condition: {
            urlFilter: url, // Patrón que incluye cualquier protocolo y ruta
            resourceTypes: ["main_frame"] // Aplica solo a la carga de páginas principales
        }
    };
}

// Cargar datos almacenados al iniciar el service worker
chrome.runtime.onStartup.addListener(() => {
    loadStoredData();
});

// Cargar datos almacenados al instalar la extensión
chrome.runtime.onInstalled.addListener(() => {
    loadStoredData();
});

// Función para cargar datos almacenados
function loadStoredData() {
    chrome.storage.local.get(['settings', 'currentCycle', 'timerState', 'remainingTime', 'blockedUrls'], (data) => {
        settings = data.settings || {
            workDuration: 25 * 60, // 25 minutos
            shortBreak: 5 * 60,    // 5 minutos
            longBreak: 15 * 60,    // 15 minutos
            cycles: 4              // 4 ciclos
        };
        currentCycle = data.currentCycle || 0;
        timerState = data.timerState || 'stopped';
        remainingTime = data.remainingTime || 0;
        blockedUrls = data.blockedUrls || [];
        totalCycles = settings.cycles;

        if (timerState === 'running') {
            timerActive = true;
            startTimer(() => {
                notify('Tiempo de trabajo terminado. Descanso corto.');
                startShortBreak();
                chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
            });
            addBlockingRules();
            // Notificar al popup sobre el ciclo actual al iniciar
            chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        } else if (timerState === 'paused') {
            timerActive = true;
            isPaused = true;
            updateBadge(remainingTime);
            // Notificar al popup sobre el ciclo actual al iniciar
            chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        }

        console.log('Datos cargados:', { settings, currentCycle, timerState, remainingTime, blockedUrls });
    });
}

// Guardar datos en storage
function saveData() {
    chrome.storage.local.set({
        settings,
        currentCycle,
        timerState,
        remainingTime,
        blockedUrls
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error al guardar datos:', chrome.runtime.lastError);
        } else {
            console.log('Datos guardados correctamente.');
        }
    });
}

// Escuchar mensajes entrantes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Mensaje recibido:', message); // Log para depuración

    if (message.action === 'toggleTimer') {
        toggleTimer();
        sendResponse({ status: { state: timerState, currentCycle, totalCycles } });
    } else if (message.action === 'getTimerState') {
        sendResponse({ state: timerState, remainingTime, currentCycle, totalCycles });
    } else if (message.action === 'getBlockedUrls') {
        sendResponse({ blockedUrls });
    } else if (message.action === 'addBlockedUrl') {
        addBlockedUrl(message.url);
        sendResponse({ status: 'added' });
    } else if (message.action === 'removeBlockedUrl') {
        removeBlockedUrl(message.index);
        sendResponse({ status: 'removed' });
    } else if (message.action === 'stop') {
        stopSession();
        sendResponse({ status: 'stopped', totalCycles });
    } else if (message.action === 'restart') {
        restartSession();
        sendResponse({ status: { state: timerState, currentCycle, totalCycles, remainingTime } });
    } else if (message.action === 'restartCurrentCycle') {
        restartCurrentCycle();
        sendResponse({ status: { state: timerState, currentCycle, totalCycles, remainingTime } });
    } else if (message.action === 'pauseTimer') { // Manejar 'pauseTimer'
        pauseTimer();
        sendResponse({ status: 'paused' });
    } else if (message.action === 'getOriginalUrl') { // Manejar 'getOriginalUrl'
        const tabId = sender.tab ? sender.tab.id : null;
        const originalUrl = tabId ? tabOriginalUrls[tabId] : null;
        sendResponse({ originalUrl: originalUrl || null });
    } else if (message.action === 'pauseAndGetOriginalUrl') { // Nueva acción
        pauseTimer();
        const tabId = sender.tab ? sender.tab.id : null;
        const originalUrl = tabId ? tabOriginalUrls[tabId] : null;
        sendResponse({ status: 'paused', originalUrl: originalUrl || null });
    }
    return true;
});

// Escuchar el evento onBeforeNavigate para capturar la URL original
chrome.webNavigation.onBeforeNavigate.addListener(details => {
    const urlToBlock = blockedUrls.find(url => details.url.includes(url));
    if (urlToBlock) {
        // Almacenar la URL original usando el ID de la pestaña
        tabOriginalUrls[details.tabId] = details.url;
        console.log(`URL original para pestaña ${details.tabId}: ${details.url}`);
    }
}, { urls: ["*://*/*"] });

// Función para alternar el estado del temporizador
function toggleTimer() {
    if (!timerActive || timerState === 'stopped') {
        startOrResumeSession();
    } else if (timerState === 'running') {
        pauseTimer();
    } else if (timerState === 'paused') {
        resumeTimer();
    }
}

// Función para iniciar o reanudar una sesión Pomodoro
function startOrResumeSession() {
    if (!timerActive || timerState === 'stopped') {
        currentCycle = 0; // Reiniciar ciclo si está detenido
    }
    chrome.storage.local.get(['settings'], (data) => {
        settings = data.settings || {
            workDuration: 25 * 60, // 25 minutos
            shortBreak: 5 * 60,    // 5 minutos
            longBreak: 15 * 60,    // 15 minutos
            cycles: 4              // 4 ciclos
        };
        totalCycles = settings.cycles;
        timerActive = true;
        timerState = 'running';
        startWork();
        saveData();
        notifyTimerStateChange();
    });
}

// Función para iniciar un ciclo de trabajo
function startWork() {
    if (currentCycle < settings.cycles) {
        currentCycle++;
        remainingTime = settings.workDuration;
        notify(`Ciclo ${currentCycle} de ${settings.cycles} - Tiempo de trabajo iniciado.`);
        // Notificar al popup inmediatamente al iniciar el ciclo
        chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        startTimer(() => {
            notify('Tiempo de trabajo terminado. Descanso corto.');
            startShortBreak();
            chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
            saveData();
        });
        addBlockingRules(); // Añadir reglas al iniciar
        saveData();
    } else {
        notify('¡Felicidades! Has completado todos los ciclos.');
        stopSession();
    }
}

// Función para iniciar un descanso corto
function startShortBreak() {
    remainingTime = settings.shortBreak;
    startTimer(() => {
        notify('Descanso corto terminado.');
        startWork();
        chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        saveData();
    });
}

// Función para iniciar un descanso largo
function startLongBreak() {
    remainingTime = settings.longBreak;
    startTimer(() => {
        notify('Descanso largo terminado.');
        startWork();
        chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        saveData();
    });
}

// Función para iniciar el temporizador
function startTimer(callback) {
    // Inicializar el badge
    updateBadge(remainingTime);
    startBadgeTimer();

    timer = setInterval(() => {
        if (!isPaused) {
            remainingTime--;
            updateBadge(remainingTime);
            // Enviar actualización al popup
            chrome.runtime.sendMessage({ action: 'updateCountdown', remainingTime });
            console.log(`Tiempo restante: ${remainingTime} segundos`); // Log para depuración

            if (remainingTime <= 0) {
                clearInterval(timer);
                stopBadgeTimer();
                callback();
            }
        }
    }, 1000);

    saveData();
}

// Función para pausar el temporizador
function pauseTimer() {
    if (timerActive && !isPaused) {
        isPaused = true;
        timerState = 'paused';
        notify('Temporizador pausado.');
        stopBadgeTimer();
        removeBlockingRules(); // Eliminar reglas al pausar

        // Enviar mensaje a todas las páginas blocked.html para redireccionar
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.includes('/blocked/blocked.html')) {
                    chrome.tabs.sendMessage(tab.id, { action: 'redirectToOriginal' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(`Error al enviar mensaje a la pestaña ${tab.id}:`, chrome.runtime.lastError);
                        }
                    });
                }
            });
        });

        saveData();
        notifyTimerStateChange();
    }
}

// Función para reanudar el temporizador
function resumeTimer() {
    if (timerActive && isPaused) {
        isPaused = false;
        timerState = 'running';
        notify('Temporizador reanudado.');
        startBadgeTimer();
        addBlockingRules(); // Reañadir reglas al reanudar
        saveData();
        notifyTimerStateChange();
    }
}

// Función para detener la sesión Pomodoro
function stopSession() {
    clearInterval(timer);
    stopBadgeTimer();
    isPaused = false;
    currentCycle = 0;
    remainingTime = 0;
    timerActive = false; // Temporizador ya no está activo
    timerState = 'stopped';
    notify('Sesión Pomodoro detenida.');
    updateBadge(0);
    removeBlockingRules(); // Eliminar reglas al detener

    saveData();
    notifyTimerStateChange();
}

// Función para reiniciar la sesión Pomodoro completa
function restartSession() {
    stopSession();
    startOrResumeSession();
    notify('Sesión Pomodoro reiniciada.');
}

// Función para reiniciar el ciclo actual
function restartCurrentCycle() {
    if (timerActive) {
        clearInterval(timer);
        stopBadgeTimer();
        notify(`Ciclo ${currentCycle} reiniciado.`);
        // Determinar si el ciclo actual es trabajo o descanso
        // Asumiendo que ciclos impares son trabajo y pares son descanso
        const isWorkCycle = (currentCycle % 2 === 1);
        remainingTime = isWorkCycle ? settings.workDuration : settings.shortBreak;
        // Notificar al popup sobre el ciclo actualizado
        chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
        startTimer(() => {
            if (isWorkCycle) {
                notify('Tiempo de trabajo terminado. Descanso corto.');
                startShortBreak();
            } else {
                notify('Descanso corto terminado. Tiempo de trabajo.');
                startWork();
            }
            chrome.runtime.sendMessage({ action: 'cycleUpdated', currentCycle, totalCycles });
            saveData();
        });
        if (isWorkCycle) {
            addBlockingRules(); // Añadir reglas si es ciclo de trabajo
        } else {
            removeBlockingRules(); // No bloquear durante descansos
        }
        saveData();
    }
}

// Función para añadir una URL bloqueada
function addBlockedUrl(url) {
    if (url.trim() === '') return;
    if (!blockedUrls.includes(url)) {
        blockedUrls.push(url);
        updateBlockingRules();
        saveData();
    }
}

// Función para eliminar una URL bloqueada
function removeBlockedUrl(index) {
    if (index >= 0 && index < blockedUrls.length) {
        blockedUrls.splice(index, 1);
        updateBlockingRules();
        saveData();
    }
}

// Función para añadir reglas de bloqueo
function addBlockingRules() {
    if (blockedUrls.length === 0) return; // No hay URLs para bloquear

    const rules = blockedUrls.map((url, index) => createBlockingRule(url, RULE_ID_BASE + index));
    const ruleIdsToRemove = blockedUrls.map((url, index) => RULE_ID_BASE + index);

    // Primero, eliminar reglas existentes con esos IDs para evitar duplicados
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsToRemove, // Eliminar reglas existentes
        addRules: rules
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error al agregar reglas de bloqueo:', chrome.runtime.lastError);
        } else {
            console.log('Reglas de bloqueo agregadas o actualizadas:', rules);
        }
    });
}

// Función para eliminar reglas de bloqueo
function removeBlockingRules() {
    if (blockedUrls.length === 0) return; // No hay reglas que eliminar

    const ruleIdsToRemove = blockedUrls.map((url, index) => RULE_ID_BASE + index);
    console.log('Eliminando reglas con IDs:', ruleIdsToRemove); // Log para depuración

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsToRemove,
        addRules: []
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error al eliminar reglas de bloqueo:', chrome.runtime.lastError);
        } else {
            console.log('Reglas de bloqueo eliminadas.');
        }
    });
}

// Función para actualizar las reglas de bloqueo según el estado del temporizador
function updateBlockingRules() {
    if (timerActive) {
        // Si el temporizador está activo, actualizar las reglas
        addBlockingRules(); // Ya elimina las reglas existentes y añade las nuevas
    } else {
        // Si el temporizador no está activo, eliminar las reglas
        removeBlockingRules();
    }
}

// Función para actualizar el badge de la extensión
function updateBadge(time) {
    const minutes = Math.floor(time / 60);
    let badgeText = '';

    if (minutes > 99) {
        // Limitar a 99m para no exceder el límite de 4 caracteres
        badgeText = '99m';
    } else {
        badgeText = `${minutes}m`;
    }
    
    console.log(`Actualizando badge a: ${badgeText}`); // Log para depuración

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }); // Verde Pomodoro
}

// Función para mostrar notificaciones
function notify(message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Pomodoro Timer',
        message: message
    });
}

// Función para notificar al popup sobre cambios en el estado del temporizador
function notifyTimerStateChange() {
    chrome.runtime.sendMessage({ action: 'timerStateChanged', state: timerState });
}

// Función para iniciar el temporizador del badge
function startBadgeTimer() {
    if (badgeTimerInterval) return; // Evitar múltiples intervalos

    badgeTimerInterval = setInterval(() => {
        if (!isPaused && remainingTime > 0) {
            updateBadge(remainingTime);
        }
    }, 1000);
}

// Función para detener el temporizador del badge
function stopBadgeTimer() {
    if (badgeTimerInterval) {
        clearInterval(badgeTimerInterval);
        badgeTimerInterval = null;
    }
}
