
import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker for pdfjs-dist via CDN to avoid Vite worker build issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Expected PDF Field Format & Structure Documentation:
 * 
 * This utility expects the PDF to contain lines with keyword labels followed by an optional transaction 
 * count in parentheses, a '+' or ':' separator, a '$' symbol, and a monetary amount.
 * 
 * Supported examples:
 * - "EFECTIVO (42) + $ 306.000" -> Extracts 306000
 * - "TARJETA DÉBITO (28) + $ 144.102" -> Extracts 144102
 * - "CRÉDITO (1) + $ 47.340" -> Extracts 47340
 * - "Vuelta: $ 154.050" -> Extracts 154050
 * - "Total General: $ 343.392" -> Extracts 343392
 * - "Ingresos de Efectivo: $ 10.000" -> Extracts 10000
 * - "Retiros de Efectivo: $ 5.000" -> Extracts 5000
 * 
 * The regex skips the transaction counts to strictly capture the final monetary value.
 */

export const extractPDFData = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullTextLines = [];

    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Sort items by Y position (top to bottom) and then X position (left to right)
      content.items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

      let currentY = null;
      let currentLine = '';

      for (const item of content.items) {
        if (currentY !== item.transform[5]) {
          if (currentLine) fullTextLines.push(currentLine.trim());
          currentLine = item.str;
          currentY = item.transform[5];
        } else {
          currentLine += ' ' + item.str;
        }
      }
      if (currentLine) fullTextLines.push(currentLine.trim());
    }

    const fullText = fullTextLines.join(' ');

    const parseCurrency = (str) => {
      if (!str) return 0;
      // Extract numbers only to handle both dots and commas as separators ($XXX.XXX or $XXX,XXX)
      const clean = str.replace(/[^\d]/g, '');
      return parseInt(clean, 10) || 0;
    };

    // Improved regex to handle various separators and optional $ symbol
    const extractAmountAfterKeyword = (keywords, customPattern) => {
      const keywordPattern = customPattern || keywords.join('|');
      // Regex looks for the keyword, then optional characters (like "(42) + "), 
      // then either a '$', ':', or just whitespace, and finally the numeric amount (at least 3 digits to avoid counts)
      const regexStr = `(?:${keywordPattern}).*?(?:\\$|[:\\+])\\s*([\\d.,]+)`;
      const regex = new RegExp(regexStr, 'i');

      // Try line by line first
      for (const line of fullTextLines) {
        const match = line.match(regex);
        if (match && match[1]) {
          const val = parseCurrency(match[1]);
          // Ignore very small numbers that likely represent counts (e.g. (1), (42))
          if (val > 100) return val;
        }
      }

      // Fallback: try on the entire joined text
      const fullMatch = fullText.match(regex);
      if (fullMatch && fullMatch[1]) {
        const val = parseCurrency(fullMatch[1]);
        if (val > 100) return val;
      }

      return 0;
    };

    // Extract fields using the improved regex with expanded keyword lists
    const data = {
      venta_efectivo: extractAmountAfterKeyword(['efectivo', 'ventas en efectivo']),
      redelcom: extractAmountAfterKeyword(['tarjeta débito', 'débito', 'debito', 'redcompra']),
      tarjeta_credito: extractAmountAfterKeyword(['tarjeta crédito', 'tarjeta credito', 'visa', 'mastercard', 'amex']),
      credito: extractAmountAfterKeyword(['crédito', 'credito'], '(?<!tarjeta\\s)(?:crédito|credito)'),
      vuelta: extractAmountAfterKeyword(['vuelta', 'vuelto']),
      ingresos_efectivo: extractAmountAfterKeyword(['ingresos de efectivo', 'otros ingresos', 'ingreso de dinero', 'ingreso de efectivo']),
      retiros_efectivo: extractAmountAfterKeyword(['retiros de efectivo', 'retiro de efectivo', 'redifos de efectivo', 'retiros']),
      transferencia: extractAmountAfterKeyword(['transferencia', 'transf']),
      edenred: extractAmountAfterKeyword(['edenred', 'sodexo', 'ticket', 'amipass']),
      saldo_inicial: extractAmountAfterKeyword(['saldo de apertura inicial', 'saldo de apertura', 'apertura inicial', 'saldo apertura inicial', 'saldo apertura', 'caja inicial', 'apertura', 'saldo inicial', 'monto inicial']),
      cierre_sistema_pdf: extractAmountAfterKeyword(['saldo teórico', 'saldo teorico', 'venta esperada', 'efectivo esperado', 'cierre sistema', 'total sistema', 'saldo sistema', 'cierre caja sistema', 'total esperado']),
      cierre_declarado_pdf: extractAmountAfterKeyword(['saldo final', 'efectivo final', 'caja final', 'total efectivo final', 'saldo de cierre', 'cierre final', 'caja real', 'cierre declarado', 'total entregado']),
      total_ventas_pdf: extractAmountAfterKeyword(['total ventas', 'resumen de ventas', 'total general', 'total']),
    };

    return { success: true, data, rawLines: fullTextLines };

  } catch (error) {
    console.error('Error extracting PDF data:', error);
    return { success: false, error: error.message };
  }
};
