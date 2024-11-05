// blocked.js

document.addEventListener('DOMContentLoaded', () => {
  const timeRemainingElement = document.getElementById('timeRemaining');
  const pauseButton = document.getElementById('pauseSession');
  const originalUrlElement = document.getElementById('originalUrl');

  let countdownInterval;

  // Función para formatear el tiempo en mm:ss
  function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Función para actualizar el tiempo restante en la interfaz
  function updateTime() {
      chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
          if (response && response.remainingTime !== undefined) {
              timeRemainingElement.textContent = formatTime(response.remainingTime);
          } else {
              timeRemainingElement.textContent = 'N/A';
          }
      });
  }

  // Función para obtener la URL original
  function getOriginalUrl() {
      return new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'getOriginalUrl' }, (response) => {
              if (response && response.originalUrl) {
                  resolve(response.originalUrl);
              } else {
                  resolve('la página solicitada');
              }
          });
      });
  }

  // Actualizar el tiempo cada segundo
  countdownInterval = setInterval(updateTime, 1000);
  updateTime(); // Llamada inicial para mostrar el tiempo inmediatamente

  // Obtener y mostrar la URL original en el botón
  getOriginalUrl().then((originalUrl) => {
      originalUrlElement.textContent = originalUrl;
  });

  // Manejar el botón de pausa y redirección
  pauseButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'pauseAndGetOriginalUrl' }, (response) => {
          if (response && response.status === 'paused' && response.originalUrl) {
              // Redirigir al usuario a la URL original
              window.location.href = response.originalUrl;
          } else {
              alert('No se pudo pausar la sesión y redirigir.');
          }
      });
  });

  // Escuchar mensajes del background.js para redireccionar (opcional, si se necesita)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'redirectToOriginal') {
          chrome.runtime.sendMessage({ action: 'getOriginalUrl' }, (response) => {
              const originalUrl = response.originalUrl;
              if (originalUrl) {
                  window.location.href = originalUrl;
              } else {
                  // Si no se puede obtener la URL original, cerrar la pestaña
                  window.close();
              }
          });
      }
  });

  // Limpiar el intervalo cuando la página se cierra
  window.addEventListener('beforeunload', () => {
      clearInterval(countdownInterval);
  });
});
