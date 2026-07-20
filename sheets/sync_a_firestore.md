# Sheets -> Firestore (conector futuro, NO implementado)

`codigo.gs` y `sync.gs` en esta carpeta son una COPIA histórica del backend
original (RenovaBase en producción). Ya NO están conectados a nada en esta
copia: el front-end (`index.html`) ahora habla exclusivamente con Firebase
(Auth + Firestore), no con Apps Script ni con `api/proxy.js`.

## Flujo futuro propuesto

Google Sheets sigue siendo el punto donde alguien sube/edita leads nuevos
manualmente (hoja "Registro de atención"). Falta construir el conector que
lleve esos datos a Firestore (colección `leads`). Opciones, de más a menos
recomendada:

1. **Cloud Function programada (recomendado)**: una función en Firebase
   (Node, `functions.pubsub.schedule('every 5 minutes')`) que lea el Sheet
   origen vía Google Sheets API (con una cuenta de servicio) y haga
   `upsert` en `leads` por `correo`/`telefono`, asignando un `fila` numérico
   secuencial a los documentos nuevos (ver `MIGRACION.md`, sección "diseño
   de datos" — el front usa `lead.fila` como identificador numérico en
   `onclick="...(${l.fila})"`, así que TIENE que ser un número, no el id de
   Firestore).
2. **Apps Script llamando a un endpoint HTTPS** (Cloud Function `onRequest`
   o Cloud Run) que reciba las filas nuevas del Sheet y las escriba en
   Firestore vía Admin SDK. Reutiliza la lógica de `syncIncremental()` /
   `syncActualizarVacias()` que ya existe en `sync.gs`, solo que en vez de
   escribir en la pestaña "Base General" escribiría (via `fetch`) al
   endpoint.

Ambas opciones requieren credenciales de servicio (una service account con
permiso sobre el Sheet origen y sobre el proyecto Firebase `renova-bdonl`)
que el usuario todavía no ha proporcionado. **No se implementó ningún
conector en esta migración** — solo queda documentado aquí el plan.

Mientras tanto, los primeros leads y usuarios de prueba deben cargarse a
mano en Firestore (consola de Firebase) siguiendo el esquema de
`MIGRACION.md`.
