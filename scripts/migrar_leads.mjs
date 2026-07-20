// Migración única: lee leads_export.csv (exportado del Sheet original) y los
// escribe en Firestore (colección "leads"), preservando el número de fila real
// del Sheet en el campo `fila` para no romper la integración existente de
// puntajes/pendientes (proyecto Firebase separado renovabase-77be4, que ya
// guarda datos keyed por ese mismo número de fila).
//
// Uso:
//   node scripts/migrar_leads.mjs                 -> hace un dry-run (no escribe)
//   node scripts/migrar_leads.mjs --commit         -> escribe de verdad a Firestore
//
// Requiere que el usuario admin (Samuel.Diaz) exista en Firebase Auth y que
// las reglas de Firestore ya estén desplegadas (permiten create de leads a
// admin/coordinador).

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, writeBatch } from 'firebase/firestore';

const DRY_RUN = !process.argv.includes('--commit');

const firebaseConfig = {
  apiKey: "AIzaSyCw-SivHUks82gOuONN8QoYz4GthpOxxb0",
  authDomain: "renova-bdonl.firebaseapp.com",
  projectId: "renova-bdonl",
  storageBucket: "renova-bdonl.firebasestorage.app",
  messagingSenderId: "401233134030",
  appId: "1:401233134030:web:8203f31d653c5dd2c62b9f"
};

const CSV_PATH = new URL('../leads_export.csv', import.meta.url);

// Mismo mapeo usado en _rbEmailFor() de index.html (usuario -> usuario@renovabase.local)
const ADMIN_USER = 'Samuel.Diaz';
const ADMIN_EMAIL = 'samuel.diaz@renovabase.local';
const ADMIN_PASSWORD = process.env.RB_ADMIN_PASSWORD || '323122Sam';

function parseFechaDMY(s) {
  return (s || '').trim();
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: false, relax_column_count: true });

  console.log(`Filas leídas del CSV (sin encabezado): ${rows.length}`);

  const leads = rows.map((r, i) => {
    const fila = i + 2; // fila 1 = encabezado, igual que en el Sheet original
    return {
      fila,
      nombre: (r['Nombre'] || '').trim(),
      correo: (r['Correo'] || '').trim().toLowerCase(),
      pais: (r['Pais'] || '').trim(),
      telefono: (r['Telefono'] || '').trim(),
      fechaInscripcion: parseFechaDMY(r['Fecha Inscripcion']),
      evento: (r['Evento'] || '').trim(),
      membresia: (r['Tipo Membresia Skool'] || '').trim(),
      vencimiento: (r['Vencimiento Skool'] || '').trim(),
      abeja: (r['Abeja'] || '').trim(),
      com1: (r['Comunicacion 1'] || '').trim(),
      com2: (r['Comunicacion 2'] || '').trim(),
      com3: (r['Comunicacion 3'] || '').trim(),
      com4: (r['Comunicacion 4'] || '').trim(),
      estado: (r['Estado'] || '').trim(),
      termino: (r['Termino'] || '').trim(),
      notas: (r['Notas'] || '').trim(),
      comprobante: (r['Comprobante'] || '').trim(),
      fechaTerminoFmt: (r['Fecha Termino'] || '').trim(),
      terminoTipo: (r['Tipo de Termino'] || '').trim(),
      plantillas: (r['Plantillas'] || '').trim(),
    };
  }).filter(l => l.nombre || l.correo || l.telefono); // descarta filas totalmente vacías

  console.log(`Leads válidos a migrar: ${leads.length}`);
  console.log('Ejemplo (primer lead):', JSON.stringify(leads[0], null, 2));

  const dupCorreos = {};
  leads.forEach(l => { if (l.correo) dupCorreos[l.correo] = (dupCorreos[l.correo]||0)+1; });
  const duplicados = Object.entries(dupCorreos).filter(([,c]) => c > 1);
  console.log(`Correos duplicados detectados: ${duplicados.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No se escribió nada. Corre con --commit para escribir a Firestore.');
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Autenticando como ${ADMIN_EMAIL} ...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('Autenticado. Escribiendo en Firestore en lotes de 450...');

  const BATCH_SIZE = 450; // margen bajo el límite de 500 ops/batch de Firestore
  let escritos = 0;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(lead => {
      const ref = doc(collection(db, 'leads'));
      batch.set(ref, lead);
    });
    await batch.commit();
    escritos += chunk.length;
    console.log(`  Escritos ${escritos}/${leads.length}`);
  }

  console.log(`\nMigración completa. ${escritos} leads escritos en Firestore.`);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
