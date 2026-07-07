/**
 * Leer observación de comprobante interceptando printHtmlDocument
 */
async function leerObservacion(page, docCode, type) {
  return await page.evaluate(async (code, tipo) => {
    return new Promise((resolve) => {
      // Interceptar printHtmlDocument
      var origPrintHtml = window.printHtmlDocument;
      window.printHtmlDocument = function(html) {
        // Restaurar
        window.printHtmlDocument = origPrintHtml;
        // Extraer observación
        var match = html.match(/[Oo]bservaci[óo]n[^:]*:\s*([^<]{2,300})/);
        if (match) {
          resolve(match[1].trim());
        } else {
          resolve('(sin observacion en HTML)');
        }
        return origPrintHtml.apply(this, arguments);
      };

      // Llamar loadOtherForPrint (documento, type='cf')
      if (window.loadOtherForPrint) {
        window.loadOtherForPrint(code, tipo || 'cf');
      } else {
        resolve('Funcion no disponible');
      }

      // Timeout
      setTimeout(function() {
        window.printHtmlDocument = origPrintHtml;
        resolve('Timeout');
      }, 15000);
    });
  }, docCode, type);
}

module.exports = { leerObservacion };
