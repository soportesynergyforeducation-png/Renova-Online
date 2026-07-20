// Crea en Firestore el doc de los 6 usuarios que hasta ahora solo vivían
// hardcodeados en el front (USUARIOS_HARDCODED en index.html). Esto permite
// que updateUsuario/toggleUsuario funcionen igual para todos (updateDoc falla
// si el doc no existe). Idempotente: usa setDoc con merge, se puede correr
// varias veces sin duplicar ni pisar datos ya editados desde la app.
//
// Uso: node scripts/seed_usuarios.mjs --commit   (sin --commit hace dry-run)

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const DRY_RUN = !process.argv.includes('--commit');

const firebaseConfig = {
  apiKey: "AIzaSyCw-SivHUks82gOuONN8QoYz4GthpOxxb0",
  authDomain: "renova-bdonl.firebaseapp.com",
  projectId: "renova-bdonl",
  storageBucket: "renova-bdonl.firebasestorage.app",
  messagingSenderId: "401233134030",
  appId: "1:401233134030:web:8203f31d653c5dd2c62b9f"
};

const ADMIN_EMAIL = 'samuel.diaz@renovabase.local';
const ADMIN_PASSWORD = process.env.RB_ADMIN_PASSWORD || '323122Sam';

// Mismo contenido que USUARIOS_HARDCODED en index.html.
const USUARIOS = {
  'qnOTWWgPcxWcA9r8ZlNhgp8O25R2': { usuario:'Samuel.Diaz',     nombre:'Samuel Otniel Diaz Gonzalez', rol:'admin',       activo:true },
  'QcRRYwRodKWpRjCFdoAYcbJxNWa2': { usuario:'Marisol.Zepeda',  nombre:'Marisol Zepeda Janeth',        rol:'abeja',       activo:true },
  '21SYfLBqKXPH4quAh89WTcfDU9q2': { usuario:'Marisol.Sanchez', nombre:'Marisol Sanchez',              rol:'coordinador', activo:true },
  'Btdsm7K4H9U1bfYxuZSWQwhYTQu1': { usuario:'Deborah.Puebla',  nombre:'Deborah Puebla Diaz',          rol:'admin',       activo:true },
  'JQQQt2ucMsQBnliHwx9KgoZ1R8t2': { usuario:'Daniel.Garcia',   nombre:'Daniel García',                rol:'admin',       activo:true },
  'Q9GpiysVyrUl0ojDnH5vqBreXpH3': { usuario:'Luis.DeLeon',     nombre:'Luis De León',                 rol:'admin',       activo:true },
};

async function main() {
  console.log(`Usuarios a crear/asegurar en Firestore: ${Object.keys(USUARIOS).length}`);
  console.log(JSON.stringify(USUARIOS, null, 2));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No se escribió nada. Corre con --commit para escribir a Firestore.');
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Autenticando como ${ADMIN_EMAIL} ...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('Autenticado. Escribiendo docs...');

  for (const [uid, data] of Object.entries(USUARIOS)) {
    await setDoc(doc(db, 'usuarios', uid), data, { merge: true });
    console.log(`  OK: usuarios/${uid} (${data.usuario})`);
  }

  console.log('\nListo. Los 6 usuarios ya tienen doc en Firestore.');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
