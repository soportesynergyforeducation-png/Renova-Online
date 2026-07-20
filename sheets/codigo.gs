// ============================================================
// CONFIGURACIÓN
// ============================================================
const SOURCE_SPREADSHEET_ID = '1IkFQJW8kMcwQ9hwl0ixalQFUyribvDYDahbrBOFQf_g';
const DEST_SHEET_NAME       = 'Base General';
const COL_INDICES           = [1, 2, 3, 4, 5, 7, 9, 10];
const J_INDEX               = 9;
const TOTAL_COLS            = 17;
const IMPORTED_COLS         = COL_INDICES.length; // 8 columnas importadas

const HEADERS_BASE = [
  'Nombre', 'Correo', 'País', 'Teléfono',
  'Fecha de inscripción', 'EVENTO',
  'Tipo Membresía Skool', 'Vencimiento Skool',
  'Abeja', 'Comunicacion 1', 'Comunicacion 2',
  'Comunicacion 3', 'Comunicacion 4', 'Estado',
  'Termino', 'Notas', 'Comprobante'
];

// ============================================================
// HELPER UI
// ============================================================
function ui(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) { Logger.log(msg); }
}

// ============================================================
// FIREBASE
// ============================================================
const FB_PROJECT = 'renovabase-77be4';
const FB_API_KEY = 'AIzaSyAs6EL1WjhGtVjgow-UP35ZV5fGZDLCn1g';

function fbNotificarCambio() {
  try {
    const url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT +
                '/databases/(default)/documents/rb_eventos?key=' + FB_API_KEY;
    UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        fields: {
          ts:     { integerValue: String(new Date().getTime()) },
          origen: { stringValue: 'sheets' }
        }
      }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('fbNotificarCambio error: ' + e.message); }
}

function onEditTrigger(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== DEST_SHEET_NAME) return;
    if (e.range.getRow() < 2) return;
    fbNotificarCambio();
  } catch(err) { Logger.log('onEditTrigger error: ' + err.message); }
}

function instalarTriggerOnEdit() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit().create();
  ui('✅ Trigger onEdit instalado.');
}

// ============================================================
// HELPERS
// ============================================================
const SOURCE_TAB_NAME = 'Registro de atención';

function getSourceSheet() {
  const ss = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  return ss.getSheetByName(SOURCE_TAB_NAME) || ss.getSheets()[0];
}

function getDestSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DEST_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DEST_SHEET_NAME);
    sheet.appendRow(HEADERS_BASE);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function extractCols(row) {
  return COL_INDICES.map(i => row[i] !== undefined ? row[i] : '');
}

function getNegros() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const negros  = ss.getSheetByName('Negros');
  const emailsN = new Set(), telesN = new Set();
  if (!negros || negros.getLastRow() < 2) return { emailsN, telesN };
  const datos = negros.getRange(2, 1, negros.getLastRow() - 1, 3).getValues();
  datos.forEach(row => {
    const email = String(row[1]).trim().toLowerCase();
    const tel   = String(row[2]).replace(/\D/g, '').slice(-10);
    if (email) emailsN.add(email);
    if (tel.length === 10) telesN.add(tel);
  });
  return { emailsN, telesN };
}

// ============================================================
// OBTENER MAPA DE CONTACTOS VÁLIDOS DEL ORIGEN
// Solo los que tengan "SÍ" o columna I vacía/válida (NO "NO" ni "Revocado")
// ============================================================
function getSourceValidKeys() {
  const srcSheet   = getSourceSheet();
  const srcLastRow = srcSheet.getLastRow();
  if (srcLastRow < 2) return new Set();
  const keys = new Set();
  let startRow = 2;
  while (startRow <= srcLastRow) {
    const numRows = Math.min(2000, srcLastRow - startRow + 1);
    const data = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    data.forEach(row => {
      const jVal = row[J_INDEX];
      if (!jVal || jVal === '') return;

      const colI = String(row[8]).trim().toUpperCase();
      if (colI === 'NO' || colI === 'REVOCADO') return;

      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      if (!email && tel.length !== 10) return;
      if (email) keys.add('email:' + email);
      if (tel.length === 10) keys.add('tel:' + tel);
    });
    startRow += 2000;
  }
  return keys;
}

// ============================================================
// OBTENER MAPA DE TODOS LOS CONTACTOS DEL ORIGEN (incluyendo "NO")
// ============================================================
function getSourceAllKeys() {
  const srcSheet   = getSourceSheet();
  const srcLastRow = srcSheet.getLastRow();
  if (srcLastRow < 2) return new Map();
  const keys = new Map();
  let startRow = 2;
  while (startRow <= srcLastRow) {
    const numRows = Math.min(2000, srcLastRow - startRow + 1);
    const data = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    data.forEach(row => {
      const jVal = row[J_INDEX];
      if (!jVal || jVal === '') return;

      const colI = String(row[8]).trim().toUpperCase();
      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      if (!email && tel.length !== 10) return;

      if (email) keys.set('email:' + email, colI);
      if (tel.length === 10) keys.set('tel:' + tel, colI);
    });
    startRow += 2000;
  }
  return keys;
}

// ============================================================
// DROPDOWN ABEJA
// ============================================================
function aplicarDropdownAbeja(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const usuSheet = ss.getSheetByName('Usuarios');
  if (!usuSheet || usuSheet.getLastRow() < 2) return;
  const data = usuSheet.getRange(2, 1, usuSheet.getLastRow() - 1, 5).getValues();
  const activos = data
    .filter(row => String(row[4]).trim().toUpperCase() === 'TRUE')
    .map(row => String(row[0]).trim())
    .filter(Boolean);
  if (!activos.length) return;
  const regla = SpreadsheetApp.newDataValidation()
    .requireValueInList(activos, true)
    .setAllowInvalid(true).build();
  const sheet = ss.getSheetByName(DEST_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).setDataValidation(regla);
}

// ============================================================
// DROPDOWNS COMPLETOS
// ============================================================
function aplicarDropdowns() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const plantilla = ss.getSheetByName('Plantillas');
  if (!plantilla) return;
  const vComunicacion = plantilla.getRange('B1').getDataValidation();
  const vTermino      = plantilla.getRange('B2').getDataValidation();
  const vEstado       = plantilla.getRange('B3').getDataValidation();
  aplicarDropdownAbeja(ss);
  const sheet = ss.getSheetByName(DEST_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const numFilas = sheet.getLastRow() - 1;
  if (vComunicacion) {
    sheet.getRange(2, 10, numFilas, 1).setDataValidation(vComunicacion);
    sheet.getRange(2, 11, numFilas, 1).setDataValidation(vComunicacion);
    sheet.getRange(2, 12, numFilas, 1).setDataValidation(vComunicacion);
    sheet.getRange(2, 13, numFilas, 1).setDataValidation(vComunicacion);
  }
  if (vEstado)  sheet.getRange(2, 14, numFilas, 1).setDataValidation(vEstado);
  if (vTermino) sheet.getRange(2, 15, numFilas, 1).setDataValidation(vTermino);
  ui('✅ Dropdowns aplicados.');
}

// ============================================================
// SINCRONIZAR ELIMINACIONES
// ============================================================
function syncEliminar() {
  const srcValidKeys = getSourceValidKeys();
  const srcAllKeys   = getSourceAllKeys();
  const destSheet    = getDestSheet();
  const lastRow      = destSheet.getLastRow();
  if (lastRow < 2) return;

  const data = destSheet.getRange(2, 2, lastRow - 1, 3).getValues();
  const filasAEliminar = [];

  data.forEach((row, i) => {
    const email    = String(row[0]).trim().toLowerCase();
    const tel      = String(row[2]).replace(/\D/g, '').slice(-10);
    const emailKey = email ? 'email:' + email : null;
    const telKey   = tel.length === 10 ? 'tel:' + tel : null;

    const existeEnValidos = (emailKey && srcValidKeys.has(emailKey)) ||
                           (telKey && srcValidKeys.has(telKey));

    const emailKeyEnTodos = emailKey ? srcAllKeys.get(emailKey) : null;
    const telKeyEnTodos   = telKey ? srcAllKeys.get(telKey) : null;
    const colIValue = emailKeyEnTodos || telKeyEnTodos;

    if (!existeEnValidos) {
      const cambioA_NO = colIValue === 'NO' || colIValue === 'REVOCADO';
      if (!colIValue || cambioA_NO) {
        filasAEliminar.push(i + 2);
      }
    }
  });

  if (filasAEliminar.length > 0) {
    filasAEliminar.sort((a, b) => b - a);
    filasAEliminar.forEach(n => destSheet.deleteRow(n));
    Logger.log('syncEliminar: ' + filasAEliminar.length + ' filas eliminadas.');
  }
  fbNotificarCambio();
}

// ============================================================
// SYNC INCREMENTAL
// ============================================================
function syncIncremental() {
  const srcSheet    = getSourceSheet();
  const destSheet   = getDestSheet();
  const srcLastRow  = srcSheet.getLastRow();
  const destLastRow = destSheet.getLastRow();
  if (srcLastRow < 2) return;

  const destMap = new Map();
  if (destLastRow >= 2) {
    const destData = destSheet.getRange(2, 2, destLastRow - 1, 3).getValues();
    destData.forEach((row, i) => {
      const email = String(row[0]).trim().toLowerCase();
      const tel   = String(row[2]).replace(/\D/g, '').slice(-10);
      if (email) destMap.set('email:' + email, i + 2);
      if (tel.length === 10) destMap.set('tel:' + tel, i + 2);
    });
  }

  const toAppend  = [];
  const toUpdate  = [];
  let added = 0, updated = 0;
  let startRow = 2;

  while (startRow <= srcLastRow) {
    const numRows = Math.min(2000, srcLastRow - startRow + 1);
    const batch   = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    batch.forEach(row => {
      const jVal = row[J_INDEX];
      if (!jVal || jVal === '') return;

      const colI = String(row[8]).trim().toUpperCase();
      if (colI === 'NO' || colI === 'REVOCADO') return;

      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      if (!email && tel.length !== 10) return;

      const emailKey = email ? 'email:' + email : null;
      const telKey   = tel.length === 10 ? 'tel:' + tel : null;
      const filaExistente = (emailKey && destMap.get(emailKey)) || (telKey && destMap.get(telKey));
      const extracted = extractCols(row);

      if (!filaExistente) {
        toAppend.push([...extracted, '', '', '', '', '', '', '', '', ''].slice(0, TOTAL_COLS));
        if (emailKey) destMap.set(emailKey, -1);
        if (telKey)   destMap.set(telKey, -1);
        added++;
      } else if (filaExistente > 0) {
        toUpdate.push({ fila: filaExistente, datos: extracted });
        updated++;
      }
    });
    startRow += 2000;
  }

  if (toAppend.length > 0) {
    destSheet.getRange(destSheet.getLastRow() + 1, 1, toAppend.length, TOTAL_COLS).setValues(toAppend);
  }

  if (toUpdate.length > 0) {
    toUpdate.forEach(item => {
      destSheet.getRange(item.fila, 1, 1, IMPORTED_COLS).setValues([item.datos]);
    });
  }

  if (toAppend.length > 0 || toUpdate.length > 0) fbNotificarCambio();
  Logger.log('syncIncremental: ' + added + ' nuevas, ' + updated + ' actualizadas.');
}

// ============================================================
// SYNC COMPLETO
// ============================================================
function syncCompleto() {
  const srcSheet   = getSourceSheet();
  const destSheet  = getDestSheet();
  const srcLastRow = srcSheet.getLastRow();
  if (srcLastRow < 2) { Logger.log('Origen vacío.'); return; }

  const destLastRow = destSheet.getLastRow();
  const manualesMap = new Map();
  if (destLastRow >= 2) {
    const destData = destSheet.getRange(2, 1, destLastRow - 1, TOTAL_COLS).getValues();
    destData.forEach(row => {
      const email = String(row[1]).trim().toLowerCase();
      const tel   = String(row[3]).replace(/\D/g, '').slice(-10);
      const manuales = row.slice(IMPORTED_COLS);
      if (email) manualesMap.set('email:' + email, manuales);
      else if (tel.length === 10) manualesMap.set('tel:' + tel, manuales);
    });
  }

  if (destLastRow > 1) {
    destSheet.getRange(2, 1, destLastRow - 1, TOTAL_COLS).clearContent();
  }

  const toAppend = [];
  let added = 0, startRow = 2;
  while (startRow <= srcLastRow) {
    const numRows = Math.min(2000, srcLastRow - startRow + 1);
    const batch   = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    batch.forEach(row => {
      const jVal  = row[J_INDEX];
      if (!jVal || jVal === '') return;

      const colI = String(row[8]).trim().toUpperCase();
      if (colI === 'NO' || colI === 'REVOCADO') return;

      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      if (!email && tel.length !== 10) return;
      const extracted = extractCols(row);
      const emailKey  = email ? 'email:' + email : null;
      const telKey    = tel.length === 10 ? 'tel:' + tel : null;
      const manuales  = (emailKey && manualesMap.get(emailKey)) ||
                        (telKey && manualesMap.get(telKey)) ||
                        new Array(TOTAL_COLS - IMPORTED_COLS).fill('');
      toAppend.push([...extracted, ...manuales].slice(0, TOTAL_COLS));
      added++;
    });
    startRow += 2000;
  }

  if (toAppend.length > 0)
    destSheet.getRange(2, 1, toAppend.length, TOTAL_COLS).setValues(toAppend);

  fbNotificarCambio();
  ui('✅ Sync completo: ' + added + ' filas importadas.');
}

// ============================================================
// ACTUALIZAR CELDAS VACÍAS
// ============================================================
function syncActualizarVacias() {
  const srcSheet    = getSourceSheet();
  const destSheet   = getDestSheet();
  const srcLastRow  = srcSheet.getLastRow();
  const destLastRow = destSheet.getLastRow();
  if (srcLastRow < 2 || destLastRow < 2) return;
  const srcMap = new Map();
  let startRow = 2;
  while (startRow <= srcLastRow) {
    const numRows = Math.min(2000, srcLastRow - startRow + 1);
    const batch = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    batch.forEach(row => {
      const jVal = row[J_INDEX];
      if (!jVal || jVal === '') return;

      const colI = String(row[8]).trim().toUpperCase();
      if (colI === 'NO' || colI === 'REVOCADO') return;

      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      const datos = extractCols(row);
      if (email) srcMap.set('email:' + email, datos);
      if (tel.length === 10) srcMap.set('tel:' + tel, datos);
    });
    startRow += 2000;
  }
  const destData = destSheet.getRange(2, 1, destLastRow - 1, TOTAL_COLS).getValues();
  let actualizadas = 0;
  destData.forEach((row, i) => {
    const email  = String(row[1]).trim().toLowerCase();
    const tel    = String(row[3]).replace(/\D/g, '').slice(-10);
    const origen = srcMap.get('email:' + email) || srcMap.get('tel:' + tel);
    if (!origen) return;
    let cambio = false;
    origen.forEach((val, colIdx) => {
      if ((row[colIdx] === '' || row[colIdx] === null || row[colIdx] === undefined) && val !== '' && val !== null) {
        destData[i][colIdx] = val;
        cambio = true;
      }
    });
    if (cambio) actualizadas++;
  });
  if (actualizadas > 0) {
    destSheet.getRange(2, 1, destLastRow - 1, TOTAL_COLS).setValues(destData);
    fbNotificarCambio();
  }
  Logger.log('Celdas vacías actualizadas: ' + actualizadas);
}

// ============================================================
// PINTAR NEGROS
// ============================================================
function pintarNegros() {
  const ss                  = SpreadsheetApp.getActiveSpreadsheet();
  const { emailsN, telesN } = getNegros();
  if (emailsN.size === 0 && telesN.size === 0) {
    Logger.log('Negros vacío, se omite.');
    return;
  }
  const NEGRO = '#000000', BLANCO = '#ffffff';
  let totalPintadas = 0;
  const sheet = ss.getSheetByName(DEST_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const numFilas = sheet.getLastRow() - 1;
  const correos  = sheet.getRange(2, 2, numFilas, 1).getValues();
  const teles    = sheet.getRange(2, 4, numFilas, 1).getValues();
  const fondos   = [];
  const fuentes  = [];
  for (let i = 0; i < numFilas; i++) {
    const email = String(correos[i][0]).trim().toLowerCase();
    const tel   = String(teles[i][0]).replace(/\D/g, '').slice(-10);
    const esNeg = (email && emailsN.has(email)) || (tel.length === 10 && telesN.has(tel));
    fondos.push(new Array(TOTAL_COLS).fill(esNeg ? NEGRO : null));
    fuentes.push(new Array(TOTAL_COLS).fill(esNeg ? BLANCO : null));
    if (esNeg) totalPintadas++;
  }
  sheet.getRange(2, 1, numFilas, TOTAL_COLS).setBackgrounds(fondos);
  sheet.getRange(2, 1, numFilas, TOTAL_COLS).setFontColors(fuentes);
  Logger.log('Negros pintados: ' + totalPintadas);
  ui('⬛ Negros pintados: ' + totalPintadas + ' filas.');
}

// ============================================================
// SYNC AUTOMÁTICO — cada 5 min
// ============================================================
function syncAutomatic() {
  try {
    syncIncremental();
    Logger.log('syncAutomatic OK: ' + new Date().toLocaleString());
  } catch(e) {
    Logger.log('syncAutomatic error: ' + e.message);
  }
}

// ============================================================
// SYNC CADA HORA — rellena campos vacíos
// ============================================================
function syncHourly() {
  try {
    syncActualizarVacias();
    Logger.log('syncHourly OK: ' + new Date().toLocaleString());
  } catch(e) {
    Logger.log('syncHourly error: ' + e.message);
  }
}

// ============================================================
// SYNC CADA 2 HORAS — borra eliminados y rechazados
// ============================================================
function syncBiHourly() {
  try {
    syncEliminar();
    Logger.log('syncBiHourly OK: ' + new Date().toLocaleString());
  } catch(e) {
    Logger.log('syncBiHourly error: ' + e.message);
  }
}

// ============================================================
// SYNC COMPLETO CON ELIMINACIONES (manual)
// ============================================================
function syncCompletoConEliminaciones() {
  syncCompleto();
  syncEliminar();
  pintarNegros();
  ui('✅ Sync completo terminado.');
}

// ============================================================
// MENÚ
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Sync Base General')
    .addItem('⚡ Incremental (solo nuevos)',          'syncIncremental')
    .addItem('🔁 Sync completo (reimporta todo)',     'syncCompletoConEliminaciones')
    .addSeparator()
    .addItem('🔄 Rellenar celdas vacías del origen',  'syncActualizarVacias')
    .addItem('🗑 Eliminar borrados/rechazados',       'syncEliminar')
    .addSeparator()
    .addItem('⬛ Solo pintar negros',                 'pintarNegros')
    .addItem('📋 Solo aplicar dropdowns',             'aplicarDropdowns')
    .addSeparator()
    .addItem('⏱ Activar todos los triggers',         'crearTriggerAutomatico')
    .addItem('🔥 Instalar trigger onEdit',            'instalarTriggerOnEdit')
    .addToUi();
}

// ============================================================
// TRIGGER AUTOMÁTICO
// ============================================================
function crearTriggerAutomatico() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['syncAutomatic', 'syncHourly', 'syncBiHourly',
         'syncIncremental', 'syncIncrementalYDistribuir',
         'syncIncrementalConEliminaciones']
        .includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAutomatic').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('syncHourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('syncBiHourly').timeBased().everyHours(2).create();
  ui('✅ Triggers activados:\n- Incremental: cada 5 min\n- Rellenar vacíos: cada hora\n- Eliminar/Rechazados: cada 2 horas');
}
