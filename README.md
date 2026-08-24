# Premisa

El proyecto surgió a raiz del siguiente problema :
Mi padre tenia una linea telefónica por muchos años en la operadora Claro, dicho numero estaba asociado a su empresa y tenia cientos de contactos, sin embargo su plan telefónico se estaba volviendo demasiado elevado en comparación a lo que pagaba inicialmente, por lo cual fue a cancelarlo, lo que el no supo es que si cancelaba el plan cancelaba la linea, por lo cual terminó perdiendo su número, sin embargo whatsapp aun estaba funcional, pero el nunca realizó una exportación de contactos, a los pocos dias su telefono tuvo una accidente y se dañó, entonces al estar cancelado su número no podia iniciar sesión de whatsapp en nuevo teléfono, por suerte tenia whatsapp abierto en el navegador, a raiz de dicho problema, lo unico que quedaba era meterse al directorio y transcribir uno por uno los contactos o enviarlos, ya que en whatsapp web no esta habilitada la opción de exportación de contactos, solo en el móvil, por lo cual cree esta pequeña extensión para navegador con playwright, ya que whatsapp no permite capturar las cookies del navegador y al no tener su telefono era imposible volver a logearse por QR, entonces tuve que ingeniarmelas y este fue el resultado, este código va a la lista de los contactos, ingresa al chat (Abrirá el chat asi que dejará marcado como visto), irá a la info, extraerá el numero de telefono y los descarga en un archivo csv

# Exportador de contactos de WhatsApp Web

Este proyecto es una extensión de Chrome basada en un script de contenido que recorre la lista de personas disponible en la ventana **Nuevo chat** de WhatsApp Web. Para cada elemento identificado como contacto, abre la conversación, accede a la información del contacto, obtiene el nombre y el número telefónico visibles y genera un archivo CSV descargable.

El proyecto está pensado para ejecutarse localmente como una extensión desempaquetada durante la etapa de desarrollo. No utiliza un servidor propio, una base de datos, una API externa ni bibliotecas de terceros.

> El script interactúa con la interfaz visible de WhatsApp Web. No accede directamente a una API privada de WhatsApp ni lee datos desde las bases internas de la aplicación.

## Características principales

La extensión incorpora un panel independiente fijado en la parte inferior izquierda de la ventana del navegador. Este panel permite elegir cuántos contactos se desean procesar y comenzar o detener la extracción.

| Función                    | Descripción                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Exportación de contactos   | Recorre la lista que aparece al abrir Nuevo chat.                                  |
| Apertura de conversaciones | Hace clic sobre el nombre o número de la fila seleccionada.                        |
| Lectura de información     | Abre el encabezado de la conversación y el panel lateral de información.           |
| Extracción de teléfonos    | Busca primero enlaces `tel:` y después números dentro del texto del panel lateral. |
| Contactos sin nombre       | Guarda `Sin registrar` cuando la fila contiene únicamente un número telefónico.    |
| Separadores alfabéticos    | Ignora elementos como `#`, `A`, `B`, `C` y otras letras individuales.              |
| Límites configurables      | Permite procesar 3, 10, 50 contactos o todos los contactos disponibles.            |
| Exportación CSV            | Descarga las columnas `Nombre` y `Teléfono` en formato CSV UTF-8.                  |
| Depuración                 | Registra cada etapa en la consola y permite copiar o descargar los logs.           |

## Estructura mínima del proyecto

La carpeta que se cargará en Chrome debe contener al menos los siguientes archivos:

```text
wa-contact-exporter/
├── manifest.json
└── content.js
```

El archivo `content.js` corresponde al script principal del proyecto. El archivo `manifest.json` le indica a Chrome que debe inyectar ese script cuando se abra una página de WhatsApp Web. Chrome exige que `manifest.json` se encuentre en la carpeta raíz de la extensión [1].

## Archivo manifest.json

Crea un archivo llamado `manifest.json` en la misma carpeta donde se encuentre `content.js` y utiliza el siguiente contenido:

```json
{
  "manifest_version": 3,
  "name": "Exportador de contactos de WhatsApp Web",
  "version": "1.0.0",
  "description": "Extrae nombres y teléfonos visibles de contactos de WhatsApp Web y los exporta a CSV.",
  "content_scripts": [
    {
      "matches": ["https://web.whatsapp.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

La configuración utiliza **Manifest V3**, que es la versión actual de la plataforma de extensiones de Chrome [2]. En este proyecto no se necesita un `service_worker`, una ventana emergente ni permisos adicionales para mostrar el panel, porque el código se ejecuta directamente como script de contenido dentro de WhatsApp Web.

## Instalación como extensión desempaquetada en Chrome

### 1. Crear la carpeta de la extensión

Crea una carpeta en una ubicación fácil de encontrar, por ejemplo:

```text
Documentos/wa-contact-exporter/
```

Guarda dentro de ella los siguientes archivos:

```text
Documentos/wa-contact-exporter/manifest.json
Documentos/wa-contact-exporter/content.js
```

El archivo `content.js` debe contener la versión más reciente del extractor. No cambies la extensión del archivo ni lo guardes como `content.js.txt`.

### 2. Abrir la página de extensiones

Abre una pestaña nueva y escribe la siguiente dirección en la barra del navegador:

```text
chrome://extensions
```

También puedes acceder desde el menú de Chrome, entrando en **Extensiones** y después en **Gestionar extensiones**.

### 3. Activar el modo desarrollador

En la esquina superior derecha de la página de extensiones, activa el interruptor **Modo desarrollador**.

### 4. Cargar la extensión

Pulsa el botón **Cargar descomprimida** o **Load unpacked**, según el idioma de Chrome. Selecciona la carpeta completa `wa-contact-exporter`, no el archivo `content.js` individual.

Chrome cargará la extensión y mostrará una tarjeta con su nombre. La guía oficial de Chrome describe este proceso como la carga de una extensión desempaquetada en modo desarrollador [1].

### 5. Abrir WhatsApp Web

Abre:

```text
https://web.whatsapp.com/
```

Inicia sesión si Chrome lo solicita y espera a que cargue completamente la interfaz. Después de unos segundos debería aparecer el panel **Exportar contactos** en la parte inferior izquierda.

### 6. Recargar después de modificar el código

Cada vez que cambies `content.js`, realiza estas acciones:

1. Guarda el archivo.
2. Regresa a `chrome://extensions`.
3. Pulsa el botón de recarga de la extensión.
4. Regresa a WhatsApp Web.
5. Actualiza la pestaña con `Ctrl + R` o `Cmd + R`.

Los scripts de contenido requieren recargar la extensión y también la página donde se ejecutan para que los cambios surtan efecto [1].

## Uso de la extensión

Cuando el panel sea visible, selecciona un límite en el campo **Límite de contactos**. La opción predeterminada es 10.

| Opción  | Resultado                                                  |
| ------- | ---------------------------------------------------------- |
| `3`     | Procesa como máximo tres contactos.                        |
| `10`    | Procesa como máximo diez contactos.                        |
| `50`    | Procesa como máximo cincuenta contactos.                   |
| `Todos` | Continúa hasta que no encuentre más contactos procesables. |

Después de seleccionar el límite, pulsa **Exportar CSV**. Durante el proceso, el panel mostrará el contacto que se está procesando. No conviene hacer clic manualmente en WhatsApp Web mientras la extracción está activa, porque el script necesita conservar el estado de la ventana Nuevo chat y del panel lateral.

El botón **Detener** solicita la cancelación del proceso. Debido a que el script puede encontrarse esperando a que WhatsApp actualice su interfaz, la detención puede tardar algunos segundos.

## Flujo interno del procesamiento

El proceso de extracción se ejecuta siguiendo esta secuencia:

| Etapa | Acción del script                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Comprueba si existe un panel lateral de información anterior y lo cierra.                                                                       |
| 2     | Busca el botón Nuevo chat mediante atributos como `aria-label`, `title` y `data-testid`.                                                        |
| 3     | Abre la ventana Nuevo chat y localiza su campo de búsqueda o su drawer.                                                                         |
| 4     | Detecta las filas visibles mediante `role`, `data-testid` y elementos con títulos.                                                              |
| 5     | Obtiene el texto principal de cada fila.                                                                                                        |
| 6     | Descarta las opciones Nuevo grupo, Nuevo contacto, Nueva comunidad, los separadores alfabéticos y otros elementos que no representan contactos. |
| 7     | Evita repetir una fila usando una clave normalizada basada en su etiqueta.                                                                      |
| 8     | Selecciona el nombre o número visible dentro de la fila y genera eventos de puntero y ratón.                                                    |
| 9     | Espera a que desaparezca Nuevo chat y aparezca el encabezado de la conversación.                                                                |
| 10    | Hace clic en la información del perfil situada en el encabezado.                                                                                |
| 11    | Espera a que aparezca un panel lateral nuevo, diferente del panel anterior.                                                                     |
| 12    | Extrae el nombre y el teléfono del panel lateral.                                                                                               |
| 13    | Cierra el panel y continúa con la siguiente fila.                                                                                               |
| 14    | Genera y descarga el archivo CSV.                                                                                                               |

## Tratamiento de nombres y teléfonos

El nombre se obtiene de la etiqueta principal de la fila. Cuando dicha etiqueta parece ser un número telefónico, el nombre se guarda como:

```text
Sin registrar
```

El teléfono se obtiene en este orden:

1. Desde un enlace HTML cuyo destino empieza por `tel:`.
2. Desde las líneas de texto del panel lateral mediante una expresión regular.
3. Desde la etiqueta de la fila, si la propia etiqueta es un número telefónico.
4. Como `No encontrado`, si no se detecta ningún teléfono válido.

El script acepta números con formatos como los siguientes:

```text
+593 99 946 8587
+593980712513
+593-98-748-1200
```

Los grupos, canales o elementos que no tengan un teléfono individual pueden quedar con el valor `No encontrado`, ya que no existe necesariamente un único número telefónico que guardar.

## Separadores alfabéticos

La lista de Nuevo chat está organizada por secciones. Antes de los contactos puede aparecer un separador como `#`, y posteriormente pueden aparecer letras individuales como `A`, `B`, `C` o `D`.

Estos elementos no son contactos y no deben recibir clics. El script los descarta mediante esta función:

```javascript
function isAlphabeticalSeparator(value) {
  const text = normalize(value);
  return /^(?:#|\p{L})$/u.test(text);
}
```

La expresión reconoce el símbolo `#` y cualquier letra individual compatible con Unicode. Por tanto, también puede descartar letras acentuadas usadas como encabezados.

## Archivo CSV generado

El archivo descargado tiene un nombre similar a:

```text
contactos_whatsapp_2026-08-24.csv
```

Su estructura es:

```csv
Nombre,Teléfono
"Marcos O Algo(Tú)","+593 96 363 7259"
"Sin registrar","+593 99 946 8587"
"Ab. Alfonso Rios","+593 98 748 1200"
```

El código utiliza comillas dobles para proteger nombres que contengan comas o comillas. Las comillas internas se duplican según el formato CSV. También antepone una marca UTF-8 para mejorar la compatibilidad con Microsoft Excel y conservar caracteres como `ñ`, tildes y símbolos de nombres.

## Modo de depuración

La versión actual mantiene activado el modo de depuración mediante:

```javascript
const DEBUG = true;
```

Cada registro comienza con el prefijo:

```text
[WA exporter fecha-hora]
```

El panel incluye el botón **Copiar logs de depuración**. Si el portapapeles no está disponible, el script descarga automáticamente un archivo de texto con los registros.

### Procedimiento para obtener logs

1. Abre WhatsApp Web.
2. Abre las herramientas de desarrollador con `F12` o `Ctrl + Shift + J`.
3. Entra en la pestaña **Console**.
4. Limpia la consola.
5. Selecciona el límite `3`.
6. Pulsa **Exportar CSV**.
7. Espera a que termine o aparezca el error.
8. Pulsa **Copiar logs de depuración**.
9. Pega los registros que comiencen por `[WA exporter`.

Los registros más importantes son los siguientes:

| Registro                                    | Interpretación                                                    |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `openNewChat: ventana abierta`              | La ventana Nuevo chat fue localizada.                             |
| `getCandidateRows: filas detectadas`        | Indica las filas que el script encontró en el DOM.                |
| `getRowCandidates: separadores descartados` | Muestra los elementos `#`, `A`, `B` u otros que fueron ignorados. |
| `getRowCandidates: contactos utilizables`   | Muestra las filas que sí pueden procesarse.                       |
| `contacto seleccionado`                     | Indica el contacto elegido para esa iteración.                    |
| `clickLikeUser: objetivo efectivo`          | Muestra el elemento concreto que recibió el clic.                 |
| `openConversationFromRow: chat abierto`     | Confirma que apareció un encabezado de chat.                      |
| `openInfoDrawer: panel lateral abierto`     | Confirma que se abrió la información del contacto.                |
| `extractContacts: datos extraídos`          | Muestra el nombre y teléfono obtenidos.                           |
| `DIAGNÓSTICO:`                              | Incluye una instantánea del DOM cuando una etapa no se completa.  |

Los mensajes relacionados con `PerformanceObserver`, QPL u otros componentes internos de WhatsApp no pertenecen necesariamente a este proyecto. Para analizar el extractor, deben priorizarse los mensajes con el prefijo `[WA exporter`.

## Solución de problemas

| Problema                                                  | Posible causa                                                                                             | Acción recomendada                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| El panel no aparece                                       | La extensión no se recargó o el manifest no coincide con WhatsApp Web.                                    | Recarga la extensión y actualiza la pestaña de WhatsApp Web. Comprueba que `matches` sea `https://web.whatsapp.com/*`. |
| Aparece un error de manifiesto                            | El JSON contiene una coma adicional, una comilla incorrecta o un archivo mal nombrado.                    | Valida `manifest.json` y confirma que esté en la raíz de la carpeta.                                                   |
| El script intenta abrir `#`, `A` o `B`                    | Se está ejecutando una versión anterior de `content.js`.                                                  | Recarga la extensión y la página; revisa que el log muestre `separadores descartados`.                                 |
| El contacto aparece, pero el chat no abre                 | WhatsApp cambió el elemento interactivo de la fila o el evento fue enviado a un contenedor no accionable. | Copia los logs de `clickLikeUser: objetivo efectivo` y `DIAGNÓSTICO`.                                                  |
| El teléfono se guarda como `No encontrado`                | El panel no muestra un teléfono individual o el formato cambió.                                           | Abre manualmente la información del mismo contacto y comprueba si aparece el número.                                   |
| Se repite un teléfono                                     | El panel lateral anterior no se cerró o se leyó antes de actualizarse.                                    | Revisa los registros de cierre y apertura del panel lateral. Si ocurre, detén la ejecución y vuelve a probar con `3`.  |
| El CSV tiene menos contactos                              | Hay filas sin teléfono, grupos, canales, duplicados por nombre o elementos que no pudieron abrirse.       | Revisa los logs y aumenta el límite solo después de validar una prueba pequeña.                                        |
| La extracción se detiene después de un cambio de WhatsApp | Los selectores internos de la interfaz cambiaron.                                                         | Revisa `findNewChatButton()`, `getCandidateRows()` y `findInfoDrawer()`.                                               |

## Selectores y funciones principales

WhatsApp Web puede cambiar sus atributos internos. El script usa varios selectores alternativos, pero las siguientes funciones concentran las partes más sensibles:

| Función                     | Responsabilidad                                      |
| --------------------------- | ---------------------------------------------------- |
| `findNewChatButton()`       | Localiza el botón para abrir Nuevo chat.             |
| `findNewChatContainer()`    | Localiza el drawer y el campo de búsqueda.           |
| `getCandidateRows()`        | Encuentra las filas potenciales del listado.         |
| `getRowLabel()`             | Obtiene el nombre o número visible de una fila.      |
| `isAlphabeticalSeparator()` | Descarta `#` y letras individuales de clasificación. |
| `findContactClickTarget()`  | Elige el elemento interno que recibirá el clic.      |
| `findConversationHeader()`  | Localiza el encabezado de la conversación.           |
| `findInfoDrawer()`          | Localiza el panel lateral de información.            |
| `extractContactData()`      | Obtiene el nombre y el teléfono.                     |
| `closeInfoDrawer()`         | Cierra el panel anterior antes de continuar.         |
| `downloadCsv()`             | Genera y descarga el archivo CSV.                    |

## Limitaciones conocidas

El script depende de la estructura visual de WhatsApp Web. Si WhatsApp cambia los nombres de los atributos `aria-label`, `data-testid`, los roles o la organización del DOM, una o varias funciones pueden dejar de encontrar los elementos esperados.

La identidad de un elemento se controla principalmente mediante su etiqueta visible normalizada. Si existen dos personas con exactamente el mismo nombre, el conjunto `processed` puede considerarlas la misma fila y procesar solo una. Para resolver ese caso sería necesario identificar cada fila mediante un identificador interno más estable de WhatsApp.

El script procesa contactos que estén disponibles en la lista de Nuevo chat. No descarga una agenda independiente ni garantiza que pueda recuperar personas que WhatsApp Web no muestre por razones de búsqueda, sincronización, privacidad o virtualización de la interfaz.

La opción **Todos** puede tardar bastante cuando la lista es extensa. Es recomendable validar primero con 3, después con 10 y finalmente con un límite mayor.

El archivo CSV se descarga en el equipo local mediante las APIs estándar `Blob`, `URL.createObjectURL()` y un enlace temporal. El script no envía los datos a un servidor propio ni realiza solicitudes de red adicionales.

## Privacidad y uso responsable

Los nombres y teléfonos de los contactos son datos personales. Utiliza la extensión únicamente con cuentas, contactos y finalidades para las que tengas autorización. Conserva el CSV de forma segura, evita compartirlo públicamente y elimínalo cuando ya no sea necesario.

## Desarrollo y mantenimiento

La extensión no requiere instalación de dependencias. Para modificarla, edita `content.js`, guarda los cambios, recarga la extensión desde `chrome://extensions` y actualiza WhatsApp Web.

Cuando se realicen cambios en los selectores, conviene probar en este orden:

1. Abrir Nuevo chat.
2. Confirmar que se detectan las filas de contactos.
3. Confirmar que se descartan los separadores alfabéticos.
4. Probar con un contacto con nombre.
5. Probar con un contacto cuyo nombre no esté registrado.
6. Confirmar que el teléfono se obtiene del panel lateral correcto.
7. Probar finalmente con un límite mayor.

## Referencias

[1]: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world "Hello World extension: cargar y recargar una extensión desempaquetada"
[2]: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 "Manifest V3: documentación oficial de Chrome"
[3]: https://developer.chrome.com/docs/extensions/reference/manifest "Manifest file format: documentación oficial de Chrome"
