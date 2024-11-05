// content.js

// Este script se ejecuta en todas las páginas que coinciden con "<all_urls>"
// Actualmente, no realiza ninguna acción específica.
// Sin embargo, puede ser utilizado para futuras funcionalidades, como:
 
// 1. Escuchar mensajes del background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'highlightBlocked') {
      // Ejemplo: Resaltar elementos específicos en páginas bloqueadas
      document.body.style.border = "5px solid red";
      sendResponse({ status: 'highlighted' });
    }
  });
  
  // 2. Enviar información al background script (si es necesario)
  // Por ejemplo, reportar el tiempo que el usuario ha pasado en una página específica
  // Este es solo un ejemplo y puede ser omitido si no es necesario
  
  /*
  let timeSpent = 0;
  setInterval(() => {
    timeSpent += 1; // Incrementa cada segundo
    chrome.runtime.sendMessage({ action: 'updateTimeSpent', time: timeSpent });
  }, 1000);
  */
  
  // 3. Implementar funcionalidades adicionales según las necesidades de la extensión
  
  // Por ahora, este script no realiza acciones específicas y puede ser expandido en el futuro.
  