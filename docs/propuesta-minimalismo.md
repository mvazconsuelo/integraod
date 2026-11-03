# Propuesta de minimalismo profundo — IntegraOD

Es una propuesta: **no se modificó código**. Parte de la revisión anterior (`revision-ux.md`) y la lleva más lejos: no mejorar lo que hay, sino **quitar**.

## La idea en una frase

IntegraOD hace **cuatro cosas**: *crear un presupuesto · compartirlo · registrar un pago · ver cuánto falta cobrar*. Todo lo que no ayude a una de esas cuatro se esconde o se elimina.

El cambio de fondo: hoy hay **dos mundos paralelos**, Presupuestos y Cobros, y la persona tiene que saber en cuál está. En la vida real hay **uno solo: el trabajo (presupuesto) y su plata**. Un "pedido de pago" es una parte de ese trabajo, no otra cosa.

## Qué se elimina o se fusiona

| Hoy | Propuesta |
|---|---|
| Sección **Cobros** (3 pestañas: Pendientes, Recibidos, Para revisar) | Se fusiona: *lo que falta cobrar* se ve en la lista de presupuestos; *lo recibido* está en Actividad |
| **Detalle de cobro** (pantalla aparte) | Desaparece: cada pedido de pago vive dentro de su presupuesto |
| Diálogos **Solicitar cobro**, **Pedir un pago**, **Registrar pago en efectivo**, **Usar un pago ya recibido** (4 formularios) | Dos acciones simples: **Pedir pago** y **Registrar pago**, cada una de 3 preguntas |
| "Crear presupuesto nuevo" dentro de Cobros | Se va (se crea con el botón Crear) |
| Pestañas Historial / Presupuestos / Cobros en Actividad | Actividad es **un solo historial**; los presupuestos se abren desde Inicio y la lista |
| Panel "¿Cómo querés cobrar?" (3 modos + % + monto + 2 botones) | Una pantalla de "Listo" con **Compartir** y **Pedir anticipo** |
| Dos colores configurables, zona horaria, vigencia, catálogo, condiciones en la primera pantalla de Configuración | Solo **nombre y logo**; el resto en "Más ajustes" |

Resultado en archivos: salen la página de Cobros, el detalle de cobro, 4 diálogos, el selector de presupuesto y las pestañas de Actividad. Entran 2 hojas chicas (Pedir pago, Registrar pago). **Menos código, no más.**

## Navegación

**Hoy:** barra inferior con 4 secciones + "+", y adentro, 3 pestañas más.
**Propuesta:** `Inicio · Actividad · Control` + el "+" central.
- **Clientes** sale de la barra: casi nunca se entra a la lista; los clientes se crean y se eligen al presupuestar. Quedan en el menú de perfil. *(decisión tuya)*
- "Actividad" abre **la lista de trabajos** con lo que falta cobrar arriba, y el historial un toque más abajo.

## Pantalla por pantalla (elementos visibles, aprox.)

### Inicio — 11 → 8
Se mantiene: saludo, **Crear presupuesto**, **Registrar pago**, **Ver pendientes**, Cobrado / Por cobrar, selector de período.
Se quita: el aviso de "pagos simulados" repetido (ya está en la franja de arriba), el enlace "Ver todas las métricas" (Control está en la barra) y la línea "¿Qué querés hacer ahora?".

### Crear presupuesto — 12 → 7
```
←  Nuevo presupuesto
Cliente      [ buscar o crear ]
Trabajo       [ qué es ]
Importe       [ $ ]
+ Más opciones            ← una sola; adentro: varios conceptos, vigencia, condiciones
────────────────────────
Total $250.000   [ Crear ]
```
Se quita: subtítulo "Tres datos y listo", los tres chips (pasan a uno), la barra de navegación inferior en esta pantalla (un solo pie).

### Después de crear — de panel con 8 controles a 2
```
✓ Presupuesto listo
Dana · Instalación de cocina · $250.000

[ Compartir ]            ← abre WhatsApp con el mensaje, directo
  Pedir anticipo  ›       ← un toque: 30 % · 50 % · otro → "Pedir y compartir"
```
Efectivo y transferencia **no están acá**: se registran cuando pasan, con *Registrar pago*. (Si el cliente no tiene teléfono, ahí recién se pide.)

### Presupuestos (lista) — por tarjeta 9 → 4, filtros 6 → 1
```
Dana                         Falta $70.000
Instalación de cocina        ▓▓▓░░░░ 30 %
```
- Toda la tarjeta es el botón (sin "Ver detalle / Compartir / Registrar pago").
- Una sola elección arriba: **Falta cobrar · Todos** (reemplaza buscador permanente + 4 filtros; el buscador aparece recién con más de 8 trabajos).
- El estado se dice con **una palabra** solo cuando importa (*Cobrado*, *Cancelado*); sin píldoras de color.

### Detalle de presupuesto — de 6 bloques / ~25 elementos a 3 bloques / ~10
```
Dana
Instalación de cocina
Cobrado $30.000 de $100.000   ▓▓░░░
                                   [ Compartir ]   ⋯
Pagos
  Anticipo · Mercado Pago · $30.000          Cobrado
  Pago · pide $20.000 · link               Esperando
Historial  ›     (se abre al tocar)
```
- Un **botón principal que cambia con el estado**: *Compartir* (sin pagos) → *Registrar pago* (con pedido pendiente) → nada (cobrado).
- **⋯** guarda lo ocasional: Editar, Pedir pago, Descargar PDF, Cancelar.
- Desaparecen: las 3 tarjetas de números (queda una línea), la tarjeta "El trabajo" (va bajo el título), la tarjeta de estado y el botón "¿Por qué no puedo cancelarlo?" (se explica dentro de Cancelar si hace falta).

### Registrar pago — de 2 diálogos a 3 preguntas
```
¿Quién?      [ Dana ]        ← si tiene un solo trabajo con saldo, ya queda elegido
¿Cuánto?     [ $70.000 ]     ← precargado con lo que falta
¿Cómo?       [Efectivo] [Transferencia]
Hoy · cambiar                ← la fecha, escondida
[ Registrar ]
```
Mercado Pago nunca se registra a mano. Si el pedido tenía link, el texto lo dice: "Esto cierra el link de pago".

### Actividad — pestañas 3 → 0
Un solo historial en frases (ya existe). Arriba, una fila solo si hay algo urgente: *"2 pedidos vencidos · Ver"*.

### Control — de 8 cifras y 4 tarjetas a 3 bloques
1. **Cobrado** (con comparación con el período anterior).
2. **Por cobrar** (+ cuántos trabajos).
3. **Presupuestos**: emitidos, y cuántos ya se aceptaron (pagaron).
Todo lo demás (ticket promedio, anticipos por tipo, evolución mensual, medios de pago) queda en **"Ver detalle"**. Las definiciones siguen explicadas, pero dentro de ese detalle.

### Clientes
Lista: nombre y teléfono (ya está). **Ficha**: nombre, teléfono, **un número (cuánto debe)** y **la lista de sus trabajos**. Se quitan los 4 números, las 3 listas y la frase "no incluye información médica".

### Configuración — de 3 pestañas y ~20 campos a 2 campos
Primera pantalla: **nombre y logo**. Debajo, un enlace "Más ajustes" con grupos plegados:
- *Mercado Pago* (un botón: Conectar).
- *Presupuestos* (condiciones, vigencia, servicios).
- *Avanzado* (zona horaria, que se **detecta sola** del teléfono).
- **Un solo color** en lugar de dos (el de acento se deriva).

### Página que ve quien paga — de 6 filas a 3
Monto, concepto, **Pagar**. Se quitan "Fecha del pedido" y "A nombre de". El cliente del negocio pasa a una línea (teléfono · email).

### Menú de perfil (celular y escritorio)
`Clientes · Reportes · Configuración · Cerrar sesión`. Nada más.

## Dirección visual: Clean Minimal

- **Una sola acción primaria por pantalla** (botón relleno); lo demás, texto sin borde.
- **Listas en filas con una línea divisoria**, no tarjetas con sombra. La única superficie destacada es el botón de crear en Inicio.
- **Tres tamaños de texto**: título, texto, nota. Números grandes solo donde se decide.
- **Un color de marca** + grises. Verde y ámbar solo con significado (*cobrado* / *esperando*) y siempre acompañados de la palabra.
- **Íconos solo en la navegación**; los botones llevan texto.
- Más aire: menos de 7 elementos por pantalla como meta.

## Lo que NO cambia
Todas las reglas financieras, el historial, las anulaciones, la bitácora, las reservas anti-duplicado, la separación entre pagos reales y simulados, y el servicio de pagos. La plata recibida sin asignar a un presupuesto, o los pagos de Mercado Pago "para revisar", **siguen existiendo**: aparecen como un aviso con una acción cuando ocurren, en vez de vivir en una pestaña permanente.

## Riesgos
| Cambio | Riesgo | Mitigación |
|---|---|---|
| Fusionar Cobros en Presupuestos | Medio: la gente acostumbrada a "Cobros" | Mantener las rutas viejas redirigiendo; aviso "Cobros ahora está en Actividad" la primera vez |
| Registrar pago con elección automática | Bajo–medio: elegir el trabajo equivocado | Mostrar siempre "Dana · Instalación de cocina · falta $70.000" antes de confirmar; el servidor sigue validando importes |
| Efectivo sin "solicitud" | Bajo: ya se registra con las mismas reglas | Tests existentes del servicio de pagos |
| Un solo color / zona horaria automática | Bajo | La zona sigue editable en "Avanzado" |
| Rediseño visual | Bajo | Se hace sobre los mismos componentes |

## Orden sugerido (cada paso se aprueba por separado)
1. **Cobrar sin pensar:** Registrar pago (3 preguntas) + pantalla "Listo" tras crear + etiquetas de estado.
2. **Fusión:** Cobros dentro de Presupuestos y Actividad; detalle de presupuesto con un botón principal.
3. **Visual:** listas en filas, un color, sin sombras ni píldoras.
4. **Limpieza:** Control en 3 bloques, Clientes y Configuración mínimos, página de pago.

## Decisiones que necesito
1. **¿Fusiono Cobros dentro de Presupuestos/Actividad?** (es el cambio más grande y el que más simplifica)
2. **¿Clientes sale de la barra inferior** y queda en el menú de perfil?
3. **Cliente o Cliente** (sigue pendiente).
4. **Efectivo/transferencia:** ¿se registran solo con *Registrar pago* (sin "solicitarlos")?
5. **Teléfono del cliente:** ¿obligatorio al crear, o recién al compartir?
6. **Catálogo de servicios:** ¿arrancar vacío y sugerir lo que ya presupuestaste?
7. **Un solo color** de marca (el de acento se deriva).
