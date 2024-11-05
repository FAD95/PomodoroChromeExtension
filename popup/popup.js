// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggleButton');
  const toggleIcon = document.getElementById('toggleIcon');
  const timerElement = document.getElementById('countdown');
  const cycleElement = document.getElementById('cycle');
  const blockedUrlInput = document.getElementById('blockedUrl');
  const addUrlButton = document.getElementById('addUrlButton');
  const blockedUrlsList = document.getElementById('blockedUrlsList');
  const stopButton = document.getElementById('stopButton');
  const restartButton = document.getElementById('restartButton');
  const saveSettingsButton = document.getElementById('saveSettingsButton');
  
  const workDurationInput = document.getElementById('workDuration');
  const shortBreakInput = document.getElementById('shortBreak');
  const longBreakInput = document.getElementById('longBreak');
  const cyclesInput = document.getElementById('cycles');

  // Función para formatear el tiempo en mm:ss
  function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  
  // Función para actualizar el botón según el estado
  function updateButton(state) {
      if (state === 'running') {
          toggleIcon.src = '../icons/pause.png';
          toggleButton.title = 'Pausar';
          toggleButton.setAttribute('aria-label', 'Pausar temporizador');
      } else if (state === 'paused' || state === 'stopped') {
          toggleIcon.src = '../icons/play.png';
          toggleButton.title = 'Iniciar/Reanudar';
          toggleButton.setAttribute('aria-label', 'Iniciar o reanudar temporizador');
      }
  }
  
  // Función para actualizar el display del temporizador
  function updateTimerDisplay(time) {
      timerElement.textContent = formatTime(time);
  }
  
  // Función para actualizar el display del ciclo
  function updateCycleDisplay(current, total) {
      cycleElement.textContent = `Ciclo: ${current}/${total}`;
  }
  
  // Función para renderizar la lista de URLs bloqueadas
  function renderBlockedUrls(blockedUrls) {
      blockedUrlsList.innerHTML = '';
      blockedUrls.forEach((url, index) => {
          const li = document.createElement('li');
          li.textContent = url;
          const removeButton = document.createElement('button');
          removeButton.textContent = 'Eliminar';
          removeButton.className = 'remove-url-button';
          removeButton.setAttribute('aria-label', `Eliminar ${url}`);
          removeButton.addEventListener('click', () => {
              removeBlockedUrl(index);
          });
          li.appendChild(removeButton);
          blockedUrlsList.appendChild(li);
      });
  }
  
  // Función para agregar una URL bloqueada
  function addBlockedUrl(url) {
      if (url.trim() === '') return;
      chrome.runtime.sendMessage({ action: 'addBlockedUrl', url }, (response) => {
          if (response && response.status === 'added') {
              loadBlockedUrls();
              blockedUrlInput.value = '';
          }
      });
  }
  
  // Función para eliminar una URL bloqueada
  function removeBlockedUrl(index) {
      chrome.runtime.sendMessage({ action: 'removeBlockedUrl', index }, (response) => {
          if (response && response.status === 'removed') {
              loadBlockedUrls();
          }
      });
  }
  
  // Función para cargar y renderizar las URLs bloqueadas
  function loadBlockedUrls() {
      chrome.runtime.sendMessage({ action: 'getBlockedUrls' }, (response) => {
          if (response && response.blockedUrls) {
              renderBlockedUrls(response.blockedUrls);
          }
      });
  }

  // Función para guardar la configuración del temporizador
  function saveSettings() {
      const workDuration = parseInt(workDurationInput.value) || 25;
      const shortBreak = parseInt(shortBreakInput.value) || 5;
      const longBreak = parseInt(longBreakInput.value) || 15;
      const cycles = parseInt(cyclesInput.value) || 4;

      // Validar los valores ingresados
      if (workDuration <= 0 || shortBreak <= 0 || longBreak <= 0 || cycles <= 0) {
          alert('Por favor, ingresa valores válidos mayores que 0.');
          return;
      }

      // Guardar en storage local
      chrome.storage.local.set({
          settings: {
              workDuration: workDuration * 60, // Convertir a segundos
              shortBreak: shortBreak * 60,
              longBreak: longBreak * 60,
              cycles: cycles
          }
      }, () => {
          if (chrome.runtime.lastError) {
              console.error('Error al guardar la configuración:', chrome.runtime.lastError);
              alert('Error al guardar la configuración.');
          } else {
              alert('Configuración guardada correctamente.');
              chrome.runtime.sendMessage({ action: 'updateSettings', settings: {
                  workDuration: workDuration * 60,
                  shortBreak: shortBreak * 60,
                  longBreak: longBreak * 60,
                  cycles: cycles
              }});
          }
      });
  }

  // Solicitar el estado actual del temporizador al service worker
  chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
      if (response) {
          updateButton(response.state);
          updateTimerDisplay(response.remainingTime);
          updateCycleDisplay(response.currentCycle, response.totalCycles);
          // Cargar configuraciones en los inputs
          chrome.storage.local.get('settings', (data) => {
              if (data.settings) {
                  workDurationInput.value = Math.floor(data.settings.workDuration / 60);
                  shortBreakInput.value = Math.floor(data.settings.shortBreak / 60);
                  longBreakInput.value = Math.floor(data.settings.longBreak / 60);
                  cyclesInput.value = data.settings.cycles;
              }
          });
      }
  });
  
  // Escuchar mensajes entrantes para actualizar el temporizador y el botón
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateCountdown') {
          updateTimerDisplay(message.remainingTime);
      } else if (message.action === 'timerStateChanged') {
          updateButton(message.state);
      } else if (message.action === 'cycleUpdated') {
          updateCycleDisplay(message.currentCycle, message.totalCycles);
      }
  });
  
  // Manejar el clic en el botón de Play/Pause
  toggleButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'toggleTimer' }, (response) => {
          if (response && response.status) {
              updateButton(response.status.state);
              updateCycleDisplay(response.status.currentCycle, response.status.totalCycles);
          }
      });
  });
  
  // Manejar el clic en el botón de Detener
  stopButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stop' }, (response) => {
          if (response && response.status === 'stopped') {
              updateButton('stopped');
              updateTimerDisplay(0);
              updateCycleDisplay(0, response.totalCycles);
          }
      });
  });
  
  // Manejar el clic en el botón de Reiniciar
  restartButton.addEventListener('click', () => {
      if (confirm('¿Estás seguro de que deseas reiniciar el ciclo actual?')) {
          chrome.runtime.sendMessage({ action: 'restartCurrentCycle' }, (response) => {
              if (response && response.status) {
                  updateButton(response.status.state);
                  updateCycleDisplay(response.status.currentCycle, response.status.totalCycles);
                  updateTimerDisplay(response.status.remainingTime);
              }
          });
      }
  });
  
  // Manejar el clic en el botón de Agregar URL Bloqueada
  addUrlButton.addEventListener('click', () => {
      const url = blockedUrlInput.value;
      addBlockedUrl(url);
  });

  // Manejar la tecla Enter para agregar URLs bloqueadas
  blockedUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
          addUrlButton.click();
      }
  });
  
  // Manejar el clic en el botón de Guardar Configuración
  saveSettingsButton.addEventListener('click', () => {
      saveSettings();
  });
  
  // Cargar las URLs bloqueadas al iniciar
  loadBlockedUrls();
});
