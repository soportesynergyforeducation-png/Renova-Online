# Migración RenovaBase: Google Sheets/Apps Script -> Firebase

Copia independiente en `Copia Renova/`. El original en `RenovaBase/` no fue
tocado y sigue siendo la app en producción.

## 1. Qué se migró

- **SDK**: Firebase modular v12.16.0 vía CDN (`firebase-app.js`,
  `firebase-auth.js`, `firebase-firestore.js`), inicializado en un
  `<script type="module">` al inicio de `index.html`, con la config del
  proyecto `renova-bdonl` provista por el usuario. Se expone en
  `window.FB = { app, auth, db, ...funciones modulares }`.

- **Autenticación**: `doLogin()` sigue llamando a
  `apiGet({action:'login', usuario, password})` (sin tocar ese call site),
  pero `apiGet` ahora internamente usa
  `signInWithEmailAndPassword(auth, email, password)` de Firebase Auth.
  Como Firebase Auth exige un email y el login de la app usa "usuario"
  (username corto), se mapea: si `usuario` no contiene `@`, se autentica
  como `usuario@renovabase.local`. Tras el login exitoso se lee
  `usuarios/{uid}` en Firestore para poblar `rol`, `nombre`, `activo`, y se
  arma la misma forma de respuesta `{ok, usuario, nombre, rol, activo,
  fila}` que ya esperaba el resto del código (`fila` ahora es el `uid` de
  Firebase Auth, se sigue usando igual para `updateUsuario`/`toggleUsuario`).

- **Datos (Firestore, SDK modular)**: se reescribió por completo la función
  `apiGet` (y su alias `apiPost`) en `index.html` como un dispatcher que
  interpreta el mismo `params.action` que antes iba al proxy de Apps
  Script, pero resuelve contra Firestore. Ningún otro call site de
  `apiGet(...)` en el archivo fue modificado — se mantiene la misma firma
  y forma de respuesta (`{ok, ...}`) para minimizar el riesgo de romper la
  UI (~30 call sites en un archivo de 5400 líneas).

  | action (antes -> GAS/Sheets)   | Ahora (Firestore)                                                                 |
  |---------------------------------|-------------------------------------------------------------------------------|
  | `login`                          | `signInWithEmailAndPassword` + `getDoc(usuarios/{uid})`                        |
  | `getUsuarios`                    | `getDocs(collection('usuarios'))`                                              |
  | `addUsuario`                     | `createUserWithEmailAndPassword` (en una **app secundaria** de Firebase, ver abajo) + `setDoc(usuarios/{uid})` |
  | `updateUsuario`                  | `updateDoc(usuarios/{fila})` para nombre/rol; `updatePassword(auth.currentUser)` si el usuario cambia SU PROPIA contraseña |
  | `toggleUsuario`                  | `updateDoc(usuarios/{fila}, {activo})`                                         |
  | `getLeads`                       | `getDocs(collection('leads'))` (admin/coordinador) o `query(where('abeja','==',usuario))` (abeja) — SIN paginación real, se trae todo en una lectura |
  | `updateLead`                     | Busca el doc por `correo`/`telefono` (`query + where + limit(1)`, igual que hacía GAS) y `updateDoc` con TODOS los campos modificados juntos |
  | `bulkAsignar`                    | Por cada correo/teléfono de la selección: busca el doc y `updateDoc({abeja})` |

- **Lógica de negocio preservada tal cual**: `getListaAbejas()` (ya incluye
  a todos los usuarios, sin excluir admin/coordinador) y el dropdown
  `dp_abeja` (ya muestra el rol junto al nombre) — no se tocaron, ya
  estaban correctos en el original y no dependen del backend.

- **Reglas de seguridad**: `firestore.rules` en la raíz de esta carpeta.
  admin/coordinador acceso total a `leads`; una `abeja` solo lee/edita los
  leads donde `lead.abeja == su usuario`, y no puede reasignarlos a otra
  persona. Colección `usuarios` de lectura abierta a cualquier logueado
  (necesaria para poblar dropdowns), escritura solo por `admin`.

- **Optimización de lecturas (plan Spark)**: se preservó el patrón
  existente de `USUARIOS_CACHE` / `ALL_LEADS` + caché en `localStorage`
  (`rb_leads_cache`, TTL 4 min) + refresco manual/periódico
  (`loadLeadsSilent` cada 3 min) — NO se usa `onSnapshot` en listas
  completas, solo se agregó `getDocs` puntual donde antes había
  `apiGet` -> Apps Script. Los `onSnapshot` que ya existían en el archivo
  (scores, agenda, pendientes, notificaciones) pertenecen a una integración
  de Firebase **anterior y separada** (proyecto `renovabase-77be4`, ver
  "Qué NO se tocó" abajo) y no forman parte de esta migración.

## 2. Decisiones de diseño relevantes

- **Colecciones**: `usuarios` (doc id = uid de Firebase Auth) y `leads`
  (doc id = autogenerado por Firestore).
- **Campo `fila` en `leads`**: el front usa `lead.fila` como identificador
  numérico en atributos `onclick="...(${l.fila})"` (sin comillas: si fuera
  el id string de Firestore, generaría JS inválido). Por eso **cada
  documento de `leads` debe tener un campo `fila` (número) propio**,
  independiente del id del documento. El id de Firestore (`_id`, agregado
  por `getLeads`) se usa solo internamente para `updateDoc`/`deleteDoc`.
  El futuro conector Sheet -> Firestore (ver `sheets/sync_a_firestore.md`)
  debe asignar `fila` de forma secuencial (por ejemplo con un contador en
  `contadores/leads`, ya contemplado en `firestore.rules`).
- **addUsuario y una app Firebase secundaria**: crear un usuario con
  `createUserWithEmailAndPassword` desde el cliente inicia sesión
  automáticamente como ESE usuario nuevo, lo que cerraría la sesión del
  admin que lo está creando. Para evitarlo se inicializó una segunda app de
  Firebase en el mismo proyecto (`initializeApp(firebaseConfig,
  "secondary")`) solo para esa operación; se cierra su sesión
  inmediatamente después de crear el usuario.
- **Limitación conocida**: un admin NO puede cambiar la contraseña de OTRO
  usuario desde el cliente (Firebase Auth no lo permite sin Admin SDK). Se
  devuelve un error explicativo si se intenta. Requeriría una Cloud
  Function con `firebase-admin` (no implementada, fuera del alcance de
  esta migración).
- **Qué NO se tocó**: el archivo ya tenía una integración de Firebase
  independiente (proyecto `renovabase-77be4`, SDK compat v10.14.1, variable
  `_fbDB`) para funciones en tiempo real no relacionadas con el backend de
  leads/usuarios: `rb_scores`, `rb_pendientes`, `rb_updates`, `rb_notify`,
  `rb_agenda`, `rb_comisiones`. Esas colecciones/proyecto se dejaron
  exactamente igual — están fuera del alcance de "reemplazar Sheets/Apps
  Script" porque ya eran Firebase. Si se quiere consolidar todo en el
  proyecto nuevo `renova-bdonl` más adelante, es un cambio aparte.

## 3. Qué falta (pendiente, requiere acción del usuario)

1. **Desplegar las reglas**: `firebase deploy --only firestore:rules`
   (instrucciones completas dentro de `firestore.rules`).
2. **Crear los primeros usuarios**:
   - En la consola de Firebase Auth (o con la propia UI de "Nuevo usuario"
     una vez que exista al menos un admin): crear el usuario con email
     `usuario@renovabase.local` (o un email real) y contraseña.
   - Crear a mano el documento `usuarios/{uid}` en Firestore con
     `{ usuario, nombre, rol: "admin"|"coordinador"|"abeja", activo: true }`
     — el `uid` es el que Firebase Auth asigna al crear el usuario (se ve
     en la consola, pestaña Authentication).
   - El primer admin casi seguro hay que crearlo a mano (huevo y gallina:
     `addUsuario` requiere estar logueado como admin).
3. **Conector Sheet -> Firestore**: no implementado, ver
   `sheets/sync_a_firestore.md`. Requiere una service account con acceso al
   Sheet origen y al proyecto `renova-bdonl` (credenciales que el usuario
   no ha dado todavía).
4. Revisar si se quiere consolidar las colecciones de Firebase "viejas"
   (`renovabase-77be4`) dentro del proyecto nuevo `renova-bdonl` — no se
   hizo en esta migración por estar fuera del alcance pedido.

## 4. Cómo probar localmente

1. Servir la carpeta con cualquier servidor estático (necesario porque el
   `<script type="module">` de Firebase no funciona con `file://`):
   ```
   npx serve "Copia Renova"
   ```
   o `python -m http.server` dentro de la carpeta.
2. Abrir la URL que imprima (p. ej. `http://localhost:3000`).
3. Antes de poder loguearte necesitas al menos un usuario creado a mano en
   Firebase Auth + su doc en Firestore `usuarios/{uid}` (ver punto 2 de
   arriba).
4. Desplegar `firestore.rules` (paso 1) ANTES de probar con datos reales,
   o las reglas por defecto de un proyecto nuevo pueden bloquear todo (o
   dejarlo abierto, según cómo se creó el proyecto) — revisa el modo
   (prueba/producción) con el que se creó `renova-bdonl` en la consola.
5. `api/proxy.js` y `sheets/*.gs` quedan en el repo solo como referencia
   histórica; ya no se llaman desde `index.html`.
