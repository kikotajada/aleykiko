# RSVP: conectar la web con la lista de invitados

La web busca a cada invitado en la pestaña **Lista invitados** del master y le muestra su invitación: todas las filas que comparten el mismo código en **Invitación** (A-01, K-20…). Las respuestas se escriben en esas mismas filas.

## 1. El master tiene que ser una Hoja de cálculo de Google

"Boda A&K – master-2" ahora mismo es un archivo **.xlsx**, y Apps Script solo funciona con Hojas de Google.
Ábrelo en Drive → **Archivo → Guardar como Hojas de cálculo de Google** y, a partir de ahí, trabajad siempre en esa copia.

## 2. Pegar el script

1. En esa hoja: **Extensiones → Apps Script**.
2. Borra lo que haya y pega el contenido de `Code.gs`. Guarda.
3. Elige la función `setup` arriba y pulsa **Ejecutar**. Acepta los permisos (Google avisará de que "la app no está verificada": *Configuración avanzada → Ir a…*).
   Esto añade a la derecha de **Notas** las columnas `Permite +1`, `Ofrecer autobús`, `Canción`, `Mensaje` y `Respondido (web)`, y crea la pestaña **Respuestas web**, con el registro de cada envío.

## 3. Publicarlo

**Implementar → Nueva implementación → Aplicación web**
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario**

Copia la URL que termina en `/exec` y pégala en `content.js` → `rsvpEndpoint` (o pásasela a Claude).
Cada vez que cambies el script: **Implementar → Gestionar implementaciones → editar → Nueva versión** (así la URL no cambia).

## 4. Qué ve cada invitado (se controla desde la hoja)

| Columna | Valor | Efecto en la web |
|---|---|---|
| Invitación | mismo código | Esas personas confirman juntas en el mismo formulario |
| Permite +1 | **Sí** en cualquier fila de la invitación | Aparece "Vendré con acompañante (+1)". Si lo marcan, se añade una fila nueva debajo (Rol "Pareja / +1", Notas "+1 (web)") y la opción desaparece. |
| Ofrecer autobús | **No** | Se oculta la pregunta del autobús (vacío = se muestra) |

Lo que escribe la web: `Estado RSVP` (Confirmado / No viene), `Adulto/Niño`, `Alergias / dieta`, `Autobús`, `Teléfono / contacto`, `Canción`, `Mensaje`, `Respondido (web)`.

Notas:
- Si en **Apellido** pone algo entre paréntesis, p. ej. "(mujer Juan)", en la web solo aparece el nombre.
- Para que una pareja confirme junta, las dos filas tienen que tener el mismo código de **Invitación**.
- Si alguien busca con muy pocas letras y hay demasiadas coincidencias, la web le pide también el apellido, para no enseñar media lista.

## 5. Enlaces personales (opcional)

Cada invitación tiene además su propio enlace `aleykiko.com/?i=XXXX`, con un código que no se puede adivinar, para mandarlo por WhatsApp sin que tengan que buscarse.
Para sacar la lista: en Apps Script → **Configuración del proyecto → Propiedades del script**, copia el valor de `SECRET` y abre
`URL_DEL_SCRIPT?links=1&admin=SECRET`
