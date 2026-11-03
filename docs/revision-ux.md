# Revisión de producto y UX — IntegraOD

Fecha: 3/11/2026. Es solo análisis: **no se modificó código**. Está hecho recorriendo la app real (celular y escritorio) y leyendo los flujos. Nada de lo de abajo se implementa hasta que lo apruebes.

## 0. La prueba definitiva

> Alguien que nunca vio la app: ¿puede crear un presupuesto, compartirlo, registrar un pago recibido y entender cuánto le falta cobrar sin que le expliquen?

**Hoy: todavía no.** Crear el presupuesto y entender "cuánto falta" sí se entiende solo. Se traba en tres lugares:

1. **Registrar un pago recibido** (efectivo o transferencia): primero hay que elegir un *presupuesto* de un desplegable cuyo texto dice "Elegí o escribí el cliente…", y no se puede elegir transferencia aunque el sistema la soporta.
2. **Compartir**: es un diálogo de dos pasos; el PDF se descarga y se adjunta a mano en WhatsApp.
3. **Palabras del sistema** que no son las de una persona: "Enviado" (que no significa enviado), "En curso", "Dinero sin presupuesto", "Elegir presupuesto", "Usar un pago ya recibido", "Sin usar".

Cuántos toques lleva hoy el camino completo (cliente existente): crear → elegir cliente → trabajo → importe → Crear → elegir cómo cobrar → Pedir → Compartir → Abrir WhatsApp → (volver, descargar PDF, adjuntarlo). **9 a 10 acciones**, y hay una decisión por pantalla.

## 1. Mapa de pantallas y de qué sirve cada una

| Pantalla | Propósito | ¿Está claro? |
|---|---|---|
| Inicio | Empezar: crear, anotar un cobro, ver pendientes, 2 números | Sí |
| Crear / editar presupuesto | Tres datos y listo | Sí (con detalles abajo) |
| Presupuestos (lista) | Ver qué presupuesté y cuánto falta | Sí |
| Detalle de presupuesto | Un trabajo: dinero, historial, acciones | Casi: 5 acciones y 6 bloques |
| Cobros (Pendientes / Recibidos / Para revisar) | Qué me deben y qué entró | Parcial: mezcla conceptos contables |
| Detalle de cobro | Un pedido de pago | Funciona, repite lo del presupuesto |
| Actividad (Historial) | Qué pasó, en frases | Sí |
| Control | Cómo viene el negocio | **No tiene una pregunta clara** (ver U9) |
| Clientes y su ficha | Agenda y resumen de cada uno | Ficha parece un mini-ERP |
| Configuración | Datos del negocio, logo, colores, servicios, Mercado Pago | Mucho para una primera vez |
| Página pública de pago / checkout simulado | Lo que ve quien paga | Sí |

## 2. Problemas de UX

Cada uno: **dónde · qué vive el usuario · por qué pasa · cómo lo resolvería · impacto · riesgo**.

### U1 — Registrar un pago recibido es confuso y no distingue efectivo de transferencia  *(prioridad 1)*
- **Dónde:** Cobros → Registrar pago; botón "Registrar pago" en cada cobro pendiente y en el presupuesto; menú (ya no).
- **Qué vive el usuario:** el diálogo se llama "Registrar pago en efectivo", pide primero un **Presupuesto** (placeholder "Elegí o escribí el cliente…"), después importe y fecha. No hay forma de decir "me transfirió". Si el cobro es online (con link de Mercado Pago), también ofrece "Registrar pago", sin avisar que eso cierra el link.
- **Por qué:** el formulario nació para "efectivo"; el backend ya acepta `transfer` pero la pantalla no lo expone. El orden de preguntas sigue el modelo de datos (presupuesto → pago) y no la frase de la persona ("Juan me pagó 30 mil").
- **Cómo:** una sola acción **"Registrar pago"** con la frase natural: *¿Quién? → ¿Cuánto? → ¿Cómo te pagó? (Efectivo · Transferencia)* y la fecha de hoy ya puesta. Si el cliente tiene un solo presupuesto con saldo, se elige solo; si tiene varios, se ofrece una lista corta; si el cobro es online, el texto aclara "Me pagó en mano: cierra el link de pago". Mercado Pago **nunca** se registra a mano: llega solo.
- **Impacto:** alto (es una de las cuatro tareas centrales).
- **Riesgo:** bajo. La lógica del backend no cambia; solo qué se muestra y en qué orden.

### U2 — Cobrar en efectivo o transferencia está modelado como "solicitud"  *(prioridad 1, necesita tu decisión)*
- **Dónde:** panel "¿Cómo querés cobrar?" tras crear un presupuesto; "Solicitar cobro".
- **Qué vive el usuario:** elige "Efectivo o transferencia", pone un importe y el sistema "anota un cobro" pendiente. Nadie "solicita" efectivo: se lo dan o no. Después tiene que ir a registrarlo (otra acción).
- **Por qué:** el backend exige que todo pago pertenezca a un cobro/presupuesto y un cobro en efectivo es una "solicitud sin link".
- **Cómo:** en ese panel, con efectivo/transferencia ofrecer directamente **"Ya me pagó"** (registra el pago ahora, con el medio) y, solo como opción secundaria, "Me va a pagar" (deja un recordatorio pendiente). Con Mercado Pago queda "Pedir con link".
- **Impacto:** alto: quita un concepto ("solicitar efectivo") y un paso.
- **Riesgo:** bajo–medio: solo reordena qué llamada hace la pantalla; no cambia reglas.

### U3 — Hay cuatro caminos para hacer casi lo mismo  *(prioridad 2)*
- **Dónde:** pedir un cobro existe en tres lugares con pantallas distintas (panel posterior a crear, "Pedir un pago" del detalle, "Solicitar cobro" de Cobros), y **crear un presupuesto** existe además dentro de "Solicitar cobro" (opción "Crear presupuesto nuevo").
- **Qué vive el usuario:** decisiones distintas según desde dónde entró (porcentajes en uno, "anticipo / total" en otro); aprende dos formas.
- **Por qué:** cada flujo se fue sumando.
- **Cómo:** **un solo componente** "Pedir un pago" (método → cuánto: 20/30/50 % o total o monto) usado en los tres lugares; sacar "crear presupuesto" de adentro de Cobros (se crea desde Crear).
- **Impacto:** medio–alto; menos pantallas y comportamiento consistente.
- **Riesgo:** medio: toca formularios con lógica de límites (el servidor sigue validando todo; hay tests).

### U4 — Compartir: dos pasos y el PDF a mano  *(prioridad 2)*
- **Dónde:** botón Compartir → diálogo → Abrir WhatsApp.
- **Qué vive el usuario:** abre un diálogo, toca "Abrir WhatsApp", escribe en el chat, y para adjuntar el presupuesto tiene que haber descargado el PDF antes y buscarlo con el clip.
- **Por qué:** WhatsApp por enlace no admite archivos; no se probó el envío nativo de archivos en teléfonos reales.
- **Cómo:** probar la hoja de compartir del teléfono con el PDF adjunto (si funciona en iPhone y Android, un solo toque); si no, dejar el flujo actual pero sin diálogo intermedio cuando el cliente ya tiene teléfono. Hoy el diálogo solo hace falta si falta el teléfono.
- **Impacto:** alto para "compartir en segundos".
- **Riesgo:** medio: depende del navegador/teléfono; por eso se prueba antes de decidir.

### U5 — Los estados no hablan como una persona  *(prioridad 2)*
- **Dónde:** badges en listas y detalle ("Enviado", "En curso", "Completado"); en cobros ("Pendiente", "Parcialmente pagado").
- **Qué vive el usuario:** "Enviado" aparece apenas se crea el presupuesto, aunque no se haya compartido. No se distingue un presupuesto sin pagos de un cobro pendiente. "En curso" no dice nada.
- **Por qué:** son los nombres del modelo interno.
- **Cómo:** solo etiquetas (el backend no cambia): presupuesto **"Sin pagos" · "Con pagos" · "Cobrado" · "Cancelado"**; cobros **"Esperando pago" · "Pagó una parte" · "Vencido"**. Una sola línea de ayuda en el detalle: "Falta cobrar $X".
- **Impacto:** medio, muy visible.
- **Riesgo:** bajo (textos; hay que actualizar algunos tests que leen etiquetas).

### U6 — La app arranca con servicios de odontología y no aprende de quien la usa  *(prioridad 2)*
- **Dónde:** el campo "¿Qué trabajo es?" ofrece un listado precargado (Limpieza dental, Blanqueamiento…); Configuración → Servicios.
- **Qué vive el usuario:** un electricista o fotógrafo ve un catálogo de dentista al empezar.
- **Por qué:** el catálogo se carga por migración con datos de ejemplo del primer cliente.
- **Cómo:** arrancar **sin catálogo** y sugerir **los trabajos que esa persona ya presupuestó** (con el último precio): escribe "Instal…" y aparece lo suyo. El catálogo explícito pasa a ser opcional dentro de Configuración.
- **Impacto:** alto para "sirve a cualquier rubro" y para el tiempo de carga.
- **Riesgo:** medio: cambiar el listado de arranque necesita una migración **nueva** (la existente no se toca) y una decisión sobre qué pasa con el catálogo de quien ya lo usa (se conserva).

### U7 — Conceptos contables se filtran a la pantalla  *(prioridad 3)*
- **Dónde:** "Dinero sin presupuesto" (ficha del cliente), "Usar un pago ya recibido", "Elegir presupuesto", "Sin usar", comisión de la billetera, "carga manual", "Para revisar".
- **Qué vive el usuario:** pregunta qué es plata "sin presupuesto" y qué tiene que hacer.
- **Por qué:** el sistema permite pagos sin asignar (sobrantes o pagos que Mercado Pago aprobó sin coincidir) y los muestra como son.
- **Cómo:** esconderlos mientras no existan; cuando existan, un aviso con una acción en lenguaje común ("Entraron $X que no sabemos de qué presupuesto son — elegí cuál"). Recibidos: mostrar *quién, cuánto, cuándo, cómo*; comisión y origen quedan en el detalle.
- **Impacto:** medio.
- **Riesgo:** bajo.

### U8 — La ficha del cliente parece un mini-ERP  *(prioridad 3)*
- **Dónde:** Clientes → ficha.
- **Qué vive el usuario:** cuatro números, tres listas (presupuestos, cobros solicitados, pagos recibidos), la frase "No incluye información médica", y el botón "Volver a agenda" aunque la sección se llama Clientes.
- **Cómo:** cabecera con nombre, teléfono y WhatsApp; **un solo número** (cuánto debe) y **una lista de sus presupuestos**; los cobros y pagos se ven dentro de cada presupuesto. Quitar la frase médica y unificar el nombre de la sección.
- **Impacto:** medio. **Riesgo:** bajo.

### U9 — Control muestra indicadores, no ayuda a decidir  *(prioridad 3)*
- **Dónde:** Control.
- **Qué vive el usuario:** ocho cifras con explicaciones; lo accionable ("N cobros vencidos", "presupuestos sin respuesta hace más de 7 días", "pagos para revisar") queda arriba, como una línea fácil de pasar por alto.
- **Cómo:** ordenar Control por **tres preguntas**: ¿cuánto cobré? ¿cuánto me deben? ¿qué tengo que hacer hoy? (las alertas, grandes y con acción). Ticket promedio y aceptación pasan a "Ver más". Además, **una sola línea en Inicio solo cuando hay algo urgente** ("2 cobros vencidos · Ver").
- **Impacto:** medio. **Riesgo:** bajo (la línea de Inicio es un agregado mínimo; si preferís Inicio intacto, queda solo en Control).

### U10 — Primera vez: no hay guía para dejar la app lista  *(prioridad 3)*
- **Dónde:** Inicio (sin ayuda) y Configuración (logo, dos colores, condiciones, vigencia, zona horaria, Mercado Pago, servicios).
- **Qué vive el usuario:** puede crear presupuestos sin haber puesto nombre ni logo; el PDF sale sin identidad. La guía "primeros pasos" existe pero solo en Control.
- **Cómo:** dos pasos cortos en Inicio mientras falten: "Poné el nombre de tu negocio" y "Conectá Mercado Pago (opcional)". Desaparecen solos. Colores y condiciones quedan en Configuración, sin empujar.
- **Impacto:** medio. **Riesgo:** bajo.

### U11 — Crear presupuesto: detalles que se pueden pulir  *(prioridad 4)*
- Pedir **nombre, apellido y teléfono** para un cliente nuevo es la parte más lenta (decisión tuya: teléfono obligatorio por WhatsApp). Posible alivio: permitir "guardar ahora, teléfono después" y pedirlo recién al compartir. **Necesito tu decisión.**
- En el celular, la barra "Total + Crear" y la barra de navegación inferior se apilan (≈140 px). Ocultar la navegación inferior en esa pantalla.
- "Fechas" abre emisión y validez juntas; casi nadie cambia la emisión: dejar solo "Válido hasta".

### U12 — Consistencia de palabras  *(necesito tu decisión)*
- En este brief pedís **"Cliente"**; antes me pediste **otra palabra que no sea "cliente"** y quedó **"Cliente"**. Hoy la app dice Clientes en todos lados. Elegí una y la dejo igual en toda la app, el mensaje de WhatsApp y los reportes.
- También conviven "Agenda" (resto de textos) y "Clientes", "Cobro/Pago/Pedido", "Presupuesto/Trabajo". Propuesta: *Cliente, Trabajo, Presupuesto, Pedido de pago, Pago recibido, Falta cobrar*.

## 3. Problemas de lógica financiera o arquitectura (no son de UX)

| | Qué es | Qué hacer |
|---|---|---|
| L1 | Un pago manual sobre un cobro con link **cierra el link**; si el cliente igual paga con Mercado Pago, ese pago queda en "Para revisar" (por diseño, no se pierde). | Nada en el backend. La pantalla debe avisarlo (U1). |
| L2 | Existen pagos "sin presupuesto" (sobrantes, o aprobados por Mercado Pago sin coincidir). | Se mantiene; solo se muestra mejor (U7). |
| L3 | "Enviado" es el estado inicial en la base. | Solo se renombra la etiqueta (U5). No tocar el modelo. |
| L4 | Compartir por WhatsApp no se registra (ocurre fuera de la app), por eso Actividad no puede decir "Compartiste…". | Opcional: guardar un registro al tocar "Compartir". Aclaralo si lo querés. |
| L5 | La transferencia ya está soportada en backend (`method: transfer`). | Solo exponerla (U1). |
| L6 | El catálogo inicial vive en una migración. | Cambiarlo requiere una migración nueva (U6). |
| L7 | Dos bases (app y servicio de pagos), reservas atómicas, bitácora, idempotencia, separación real/simulado. | Sin cambios. Es lo que hace sólido al producto. |

## 4. Propuesta priorizada

**Fase A — Cobrar sin pensar (lo que más pesa en la prueba definitiva)**
1. U1 Registrar pago: frase natural, efectivo/transferencia, elección automática del presupuesto.
2. U2 Efectivo/transferencia: "Ya me pagó" en vez de "solicitar".
3. U5 Etiquetas de estado en lenguaje común.

**Fase B — Menos caminos, menos pasos**
4. U3 Un solo "Pedir un pago" en los tres lugares; sacar "crear presupuesto" de Cobros.
5. U4 Compartir en un toque (después de probar el envío nativo con PDF en teléfonos reales).

**Fase C — Que sirva a cualquier rubro**
6. U6 Sin catálogo de arranque; sugerencias de tus propios trabajos.
7. U12 Palabras unificadas (con tu decisión).

**Fase D — Limpieza**
8. U7 Esconder conceptos contables hasta que hagan falta.
9. U8 Ficha de cliente simple.
10. U9 Control en tres preguntas (+ línea de urgencias opcional).
11. U10 Primeros pasos mínimos en Inicio; U11 pulidos de creación.

Cada fase se puede aprobar por separado. Ninguna cambia reglas financieras ni arquitectura.

## 5. Decisiones que necesito de vos

1. **Palabra para la persona**: ¿Cliente o Cliente?
2. **U2**: para efectivo/transferencia, ¿"Ya me pagó" como opción principal y "Me va a pagar" como secundaria?
3. **U11**: ¿teléfono obligatorio al crear el cliente, o "después, al compartir"?
4. **U9**: ¿una línea de urgencias en Inicio solo cuando hay algo, o Inicio queda exactamente como está?
5. **U6**: ¿arrancar sin catálogo (y sugerir lo que ya presupuestaste)?
6. **U4**: ¿puedo probar el compartir nativo con PDF en un iPhone y un Android antes de decidir?
