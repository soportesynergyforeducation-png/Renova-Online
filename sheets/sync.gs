// ============================================================
// CONFIGURACIÓN
// ============================================================
const SOURCE_SPREADSHEET_ID = '1IkFQJW8kMcwQ9hwl0ixalQFUyribvDYDahbrBOFQf_g';
const DEST_SHEET_NAME       = 'Base General';
const COL_INDICES           = [1, 2, 3, 4, 5, 7, 9, 10];
const J_INDEX               = 9;
const TOTAL_COLS            = 17;

const TABS = {
  vigente:   'Vigente',
  porVencer: 'Por vencer',
  hoy:       'Vence hoy',
  vencidos:  'Vencidos'
};

const HEADERS_BASE = [
  'Nombre', 'Correo', 'País', 'Teléfono',
  'Fecha de inscripción', 'EVENTO',
  'Tipo Membresía Skool', 'Vencimiento Skool',
  'Abeja', 'Comunicacion 1', 'Comunicacion 2',
  'Comunicacion 3', 'Comunicacion 4', 'Estado',
  'Termino', 'Notas', 'Comprobante'
];

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
  } catch(e) {
    Logger.log('fbNotificarCambio error: ' + e.message);
  }
}

function onEditTrigger(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== DEST_SHEET_NAME) return;
    if (e.range.getRow() < 2) return;
    fbNotificarCambio();
  } catch(err) {
    Logger.log('onEditTrigger error: ' + err.message);
  }
}

function instalarTriggerOnEdit() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert('✅ Trigger onEdit instalado.');
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

function getOrCreateTab(ss, nombre) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
    sheet.appendRow(HEADERS_BASE);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getExistingKeys(destSheet) {
  const lastRow = destSheet.getLastRow();
  if (lastRow < 2) return new Set();
  const data = destSheet.getRange(2, 2, lastRow - 1, 3).getValues();
  const keys  = new Set();
  data.forEach(row => {
    const email = String(row[0]).trim().toLowerCase();
    const tel   = String(row[2]).replace(/\D/g, '').slice(-10);
    if (email) keys.add('email:' + email);
    if (tel.length === 10) keys.add('tel:' + tel);
  });
  return keys;
}

function extractCols(row) {
  return COL_INDICES.map(i => row[i] !== undefined ? row[i] : '');
}

function clasificarFila(fechaVal) {
  if (!fechaVal || fechaVal === '') return null;
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaVal);
  fecha.setHours(0, 0, 0, 0);
  const diff  = Math.floor((fecha - hoy) / (1000 * 60 * 60 * 24));
  if (diff < 0)   return 'vencidos';
  if (diff === 0) return 'hoy';
  if (diff <= 30) return 'porVencer';
  return 'vigente';
}

function getNegros() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const negros  = ss.getSheetByName('Negros');
  const emailsN = new Set();
  const telesN  = new Set();
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
// OBTENER CLAVES DEL SHEET ORIGEN
// ============================================================
function getSourceKeys() {
  const srcSheet   = getSourceSheet();
  const srcLastRow = srcSheet.getLastRow();
  if (srcLastRow < 2) return new Set();

  const data = srcSheet.getRange(2, 1, srcLastRow - 1, 13).getValues();
  const keys = new Set();

  data.forEach(row => {
    const jVal  = row[J_INDEX];
    const email = String(row[2]).trim().toLowerCase();
    const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
    if (!jVal || jVal === '') return;
    if (!email && tel.length !== 10) return;
    if (email) keys.add('email:' + email);
    if (tel.length === 10) keys.add('tel:' + tel);
  });

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
    .setAllowInvalid(true)
    .build();

  const pestanas = [DEST_SHEET_NAME, TABS.vigente, TABS.porVencer, TABS.hoy, TABS.vencidos];
  pestanas.forEach(nombre => {
    const sheet = ss.getSheetByName(nombre);
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).setDataValidation(regla);
  });
}

// ============================================================
// DROPDOWNS COMPLETOS
// ============================================================
function aplicarDropdowns() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const plantilla = ss.getSheetByName('Vigente');
  if (!plantilla) return;

  const vComunicacion = plantilla.getRange('Z2').getDataValidation();
  const vTermino      = plantilla.getRange('Z3').getDataValidation();
  const vEstado       = plantilla.getRange('Z4').getDataValidation();

  aplicarDropdownAbeja(ss);

  const mapa = {
    10: vComunicacion,
    11: vComunicacion,
    12: vComunicacion,
    13: vComunicacion,
    14: vEstado,
    15: vTermino
  };

  const todasLasPestanas = [DEST_SHEET_NAME, TABS.vigente, TABS.porVencer, TABS.hoy, TABS.vencidos];
  todasLasPestanas.forEach(nombre => {
    const sheet   = ss.getSheetByName(nombre);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const numFilas = lastRow - 1;
    const correos  = sheet.getRange(2, 2, numFilas, 1).getValues();
    correos.forEach((row, i) => {
      const fila  = i + 2;
      const email = String(row[0]).trim();
      if (!email) return;
      for (const col in mapa) {
        if (mapa[col]) sheet.getRange(fila, parseInt(col)).setDataValidation(mapa[col]);
      }
    });
  });

  SpreadsheetApp.getUi().alert('✅ Dropdowns aplicados en todas las pestañas.');
}

// ============================================================
// COPIAR FORMATO CONDICIONAL
// ============================================================
function copiarFormatoCondicional() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const base = ss.getSheetByName(DEST_SHEET_NAME);

  const reglasG = base.getConditionalFormatRules().filter(r =>
    r.getRanges().some(rng => rng.getColumn() === 7)
  );
  const reglasH = base.getConditionalFormatRules().filter(r =>
    r.getRanges().some(rng => rng.getColumn() === 8)
  );

  for (const key in TABS) {
    const sheet   = ss.getSheetByName(TABS[key]);
    if (!sheet) continue;
    const lastRow = Math.max(sheet.getLastRow(), 2);
    let reglasActuales = sheet.getConditionalFormatRules();
    reglasActuales = reglasActuales.filter(r =>
      !r.getRanges().some(rng => rng.getColumn() === 7 || rng.getColumn() === 8)
    );
    reglasG.forEach(regla => {
      const builder = regla.copy();
      builder.setRanges([sheet.getRange(2, 7, lastRow - 1, 1)]);
      reglasActuales.push(builder.build());
    });
    reglasH.forEach(regla => {
      const builder = regla.copy();
      builder.setRanges([sheet.getRange(2, 8, lastRow - 1, 1)]);
      reglasActuales.push(builder.build());
    });
    sheet.setConditionalFormatRules(reglasActuales);
  }

  SpreadsheetApp.getUi().alert('✅ Formato condicional copiado a todas las pestañas.');
}

// ============================================================
// SINCRONIZAR ELIMINACIONES
// ============================================================
function syncEliminar() {
  const srcKeys   = getSourceKeys();
  const destSheet = getDestSheet();
  const lastRow   = destSheet.getLastRow();
  if (lastRow < 2) return;

  const data = destSheet.getRange(2, 2, lastRow - 1, 3).getValues();
  const filasAEliminar = [];

  data.forEach((row, i) => {
    const email    = String(row[0]).trim().toLowerCase();
    const tel      = String(row[2]).replace(/\D/g, '').slice(-10);
    const emailKey = email ? 'email:' + email : null;
    const telKey   = tel.length === 10 ? 'tel:' + tel : null;
    const estaEnOrigen = (emailKey && srcKeys.has(emailKey)) ||
                         (telKey && srcKeys.has(telKey));
    if (!estaEnOrigen) filasAEliminar.push(i + 2);
  });

  if (filasAEliminar.length > 0) {
    filasAEliminar.sort((a, b) => b - a);
    filasAEliminar.forEach(filaNum => destSheet.deleteRow(filaNum));
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pestanas = [TABS.vigente, TABS.porVencer, TABS.hoy, TABS.vencidos];

  pestanas.forEach(nombrePestana => {
    const sheet = ss.getSheetByName(nombrePestana);
    if (!sheet || sheet.getLastRow() < 2) return;
    const dataTab = sheet.getRange(2, 2, sheet.getLastRow() - 1, 3).getValues();
    const filasAEliminarTab = [];
    dataTab.forEach((row, i) => {
      const email    = String(row[0]).trim().toLowerCase();
      const tel      = String(row[2]).replace(/\D/g, '').slice(-10);
      const emailKey = email ? 'email:' + email : null;
      const telKey   = tel.length === 10 ? 'tel:' + tel : null;
      const estaEnOrigen = (emailKey && srcKeys.has(emailKey)) ||
                           (telKey && srcKeys.has(telKey));
      if (!estaEnOrigen) filasAEliminarTab.push(i + 2);
    });
    if (filasAEliminarTab.length > 0) {
      filasAEliminarTab.sort((a, b) => b - a);
      filasAEliminarTab.forEach(filaNum => sheet.deleteRow(filaNum));
    }
  });

  fbNotificarCambio();
}

// ============================================================
// SYNC INCREMENTAL
// ============================================================
function syncIncremental() {
  const props         = PropertiesService.getScriptProperties();
  const lastProcessed = parseInt(props.getProperty('lastProcessedRow') || '1', 10);
  const srcSheet      = getSourceSheet();
  const destSheet     = getDestSheet();
  const srcLastRow    = srcSheet.getLastRow();

  if (lastProcessed >= srcLastRow) {
    SpreadsheetApp.getUi().alert('✅ Sin filas nuevas desde la última sincronización.');
    return;
  }

  const startRow = lastProcessed + 1;
  const numRows  = srcLastRow - startRow + 1;
  const allData  = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
  const existing = getExistingKeys(destSheet);
  const toAppend = [];
  let added = 0;

  allData.forEach(row => {
    const jVal  = row[J_INDEX];
    const email = String(row[2]).trim().toLowerCase();
    const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
    if (!jVal || jVal === '') return;
    if (!email && tel.length !== 10) return;
    const emailKey = email ? 'email:' + email : null;
    const telKey   = tel.length === 10 ? 'tel:' + tel : null;
    if (emailKey && existing.has(emailKey)) return;
    if (!emailKey && telKey && existing.has(telKey)) return;
    const extracted = extractCols(row);
    const fullRow   = [...extracted, '', '', '', '', '', '', '', '', ''];
    toAppend.push(fullRow.slice(0, TOTAL_COLS));
    if (emailKey) existing.add(emailKey);
    if (telKey)   existing.add(telKey);
    added++;
  });

  if (toAppend.length > 0) {
    destSheet.getRange(destSheet.getLastRow() + 1, 1, toAppend.length, TOTAL_COLS).setValues(toAppend);
  }

  props.setProperty('lastProcessedRow', String(srcLastRow));
  aplicarDropdowns();
  fbNotificarCambio();
  SpreadsheetApp.getUi().alert('✅ Incremental completado.\n➕ ' + added + ' filas nuevas agregadas.');
}

// ============================================================
// SYNC COMPLETO
// ============================================================
function syncCompleto() {
  const srcSheet   = getSourceSheet();
  const destSheet  = getDestSheet();
  const srcLastRow = srcSheet.getLastRow();

  if (srcLastRow < 2) {
    SpreadsheetApp.getUi().alert('⚠️ La hoja origen está vacía.');
    return;
  }

  const BATCH    = 5000;
  const existing = getExistingKeys(destSheet);
  const toAppend = [];
  let added    = 0;
  let startRow = 2;

  while (startRow <= srcLastRow) {
    const numRows = Math.min(BATCH, srcLastRow - startRow + 1);
    const batch   = srcSheet.getRange(startRow, 1, numRows, 13).getValues();
    batch.forEach(row => {
      const jVal  = row[J_INDEX];
      const email = String(row[2]).trim().toLowerCase();
      const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
      if (!jVal || jVal === '') return;
      if (!email && tel.length !== 10) return;
      const emailKey = email ? 'email:' + email : null;
      const telKey   = tel.length === 10 ? 'tel:' + tel : null;
      if (emailKey && existing.has(emailKey)) return;
      if (!emailKey && telKey && existing.has(telKey)) return;
      const extracted = extractCols(row);
      const fullRow   = [...extracted, '', '', '', '', '', '', '', '', ''];
      toAppend.push(fullRow.slice(0, TOTAL_COLS));
      if (emailKey) existing.add(emailKey);
      if (telKey)   existing.add(telKey);
      added++;
    });
    startRow += BATCH;
  }

  if (toAppend.length > 0) {
    destSheet.getRange(destSheet.getLastRow() + 1, 1, toAppend.length, TOTAL_COLS).setValues(toAppend);
  }

  PropertiesService.getScriptProperties().setProperty('lastProcessedRow', String(srcLastRow));
  aplicarDropdowns();
  fbNotificarCambio();
  SpreadsheetApp.getUi().alert('✅ Sync completo terminado.\n➕ ' + added + ' filas nuevas agregadas.');
}

// ============================================================
// ACTUALIZAR CELDAS VACÍAS CON DATOS DEL ORIGEN
// ============================================================
function syncActualizarVacias() {
  const srcSheet    = getSourceSheet();
  const destSheet   = getDestSheet();
  const srcLastRow  = srcSheet.getLastRow();
  const destLastRow = destSheet.getLastRow();

  if (srcLastRow < 2 || destLastRow < 2) return;

  const srcData = srcSheet.getRange(2, 1, srcLastRow - 1, 13).getValues();
  const srcMap  = new Map();

  srcData.forEach(row => {
    const jVal  = row[J_INDEX];
    if (!jVal || jVal === '') return;
    const email = String(row[2]).trim().toLowerCase();
    const tel   = String(row[4]).replace(/\D/g, '').slice(-10);
    const datos = extractCols(row);
    if (email) srcMap.set('email:' + email, datos);
    if (tel.length === 10) srcMap.set('tel:' + tel, datos);
  });

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

  Logger.log('✅ Celdas vacías actualizadas en ' + actualizadas + ' filas.');
}

// ============================================================
// DISTRIBUCIÓN POR PESTAÑAS
// ============================================================
function distribuirPestanas() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const base    = ss.getSheetByName(DEST_SHEET_NAME);
  const lastRow = base.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('⚠️ Base General está vacía.');
    return;
  }

  const data = base.getRange(2, 1, lastRow - 1, TOTAL_COLS).getValues();
  const tabs = {};

  for (const key in TABS) {
    const sheet = getOrCreateTab(ss, TABS[key]);
    if (sheet.getLastRow() === 0) { sheet.appendRow(HEADERS_BASE); sheet.setFrozenRows(1); }
    if (sheet.getLastRow() > 1)   { sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COLS).clearContent(); }
    tabs[key] = { sheet: sheet, rows: [] };
  }

  data.forEach(row => {
    const clase = clasificarFila(row[7]);
    if (clase) tabs[clase].rows.push(row);
  });

  let resumen = '';
  for (const key in tabs) {
    const { sheet, rows } = tabs[key];
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, TOTAL_COLS).setValues(rows);
    resumen += `${TABS[key]}: ${rows.length} filas\n`;
  }

  copiarFormatoCondicional();
  SpreadsheetApp.getUi().alert('✅ Pestañas actualizadas:\n\n' + resumen);
}

// ============================================================
// PINTAR NEGROS
// ============================================================
function pintarNegros() {
  const ss                  = SpreadsheetApp.getActiveSpreadsheet();
  const { emailsN, telesN } = getNegros();

  if (emailsN.size === 0 && telesN.size === 0) {
    SpreadsheetApp.getUi().alert('⚠️ La pestaña Negros está vacía.');
    return;
  }

  const pestanas = [DEST_SHEET_NAME, TABS.vigente, TABS.porVencer, TABS.hoy, TABS.vencidos];
  const NEGRO = '#000000', BLANCO = '#ffffff';
  let totalPintadas = 0;

  pestanas.forEach(nombre => {
    const sheet   = ss.getSheetByName(nombre);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const numFilas = lastRow - 1;
    const correos  = sheet.getRange(2, 2, numFilas, 1).getValues();
    const teles    = sheet.getRange(2, 4, numFilas, 1).getValues();

    for (let i = 0; i < numFilas; i++) {
      const email = String(correos[i][0]).trim().toLowerCase();
      const tel   = String(teles[i][0]).replace(/\D/g, '').slice(-10);
      const esNeg = (email && emailsN.has(email)) || (tel.length === 10 && telesN.has(tel));
      const rango = sheet.getRange(i + 2, 1, 1, TOTAL_COLS);
      if (esNeg) { rango.setBackground(NEGRO).setFontColor(BLANCO); totalPintadas++; }
      else       { rango.setBackground(null).setFontColor(null); }
    }
  });

  SpreadsheetApp.getUi().alert('⬛ Negros pintados: ' + totalPintadas + ' filas en total.');
}

// ============================================================
// SYNC AUTOMÁTICO (trigger cada 5 min)
// ============================================================
function syncAutomatic() {
  syncIncremental();
  syncActualizarVacias();
  syncEliminar();
  distribuirPestanas();
  pintarNegros();
}

// ============================================================
// SYNC COMPLETO CON ELIMINACIONES (manual, primera vez o reseteo)
// ============================================================
function syncCompletoConEliminaciones() {
  syncCompleto();
  syncEliminar();
  distribuirPestanas();
  pintarNegros();
}

// ============================================================
// MENÚ
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Sync Base General')
    .addItem('⚡ Incremental (solo nuevos)',          'syncIncremental')
    .addItem('🔁 Completo + eliminar borrados',       'syncCompletoConEliminaciones')
    .addSeparator()
    .addItem('🔄 Rellenar celdas vacías del origen',  'syncActualizarVacias')
    .addSeparator()
    .addItem('🗂 Solo distribuir pestañas',            'distribuirPestanas')
    .addItem('⬛ Solo pintar negros',                 'pintarNegros')
    .addItem('📋 Solo aplicar dropdowns',             'aplicarDropdowns')
    .addItem('🎨 Copiar formato condicional',         'copiarFormatoCondicional')
    .addSeparator()
    .addItem('⏱ Activar auto-sync 5 min',            'crearTriggerAutomatico')
    .addItem('🔥 Instalar trigger onEdit',            'instalarTriggerOnEdit')
    .addToUi();
}

// ============================================================
// TRIGGER AUTOMÁTICO — cada 5 minutos
// ============================================================
function crearTriggerAutomatico() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['syncIncremental', 'syncIncrementalYDistribuir', 'syncIncrementalConEliminaciones', 'syncAutomatic'].includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('syncAutomatic')
    .timeBased()
    .everyMinutes(5)
    .create();
  SpreadsheetApp.getUi().alert('✅ Auto-sync activado: cada 5 minutos.\nIncluye: nuevos + celdas vacías + eliminados + distribución.');
}

function resetPuntero() {
  PropertiesService.getScriptProperties().deleteProperty('lastProcessedRow');
  SpreadsheetApp.getUi().alert('✅ Puntero reseteado. Ya puedes correr Sync Completo.');
}
