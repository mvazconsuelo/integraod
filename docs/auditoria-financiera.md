# Auditoría financiera — Etapa 1 (diagnóstico)

Fecha: 3/11/2026. Solo lectura del código: **no se modificó nada** para escribir este documento.

## 1. Cómo está armado hoy

Dos bases, una fuente de verdad por tipo de dato:

| Dato | Dónde vive | Quién lo escribe |
|---|---|---|
| Presupuestos, ítems, contactos, aplicaciones de pagos | App (`integra-od`, su D1) | La app |
| Cobros (`intents`), pagos (`payments`), bitácora, credenciales | Servicio de pagos (`payments/`, su D1) | Solo el servicio |
| Copia de cobros y pagos en la app (`payment_requests`, `payments`) | App | Se actualiza por respuesta + avisos firmados (outbox) |

Cadena del dinero: **cobro** (lo que se pide) → **pago** (lo que entró, solo si está aprobado) → **aplicación** (qué parte de ese pago cuenta para qué presupuesto).

Fórmulas vigentes (todas en el backend, en enteros de centavos):
- `saldo = total_presupuesto − suma(aplicaciones no anuladas)` (`utils/money.ts`, `applications.repository.ts`).
- Estado del presupuesto: `sent → in_progress` con la primera aplicación, `→ completed` con saldo 0, `cancelled` manual (`syncBudgetStatus`).
- `requestable = saldo − pendiente de los cobros abiertos` (no vencidos ni cancelados).
- Cobro: `pending / partially_paid / paid / cancelled`; "vencido" se calcula por fecha y no se guarda.
- Pago (copia): `approved / voided / refunded`. Los pagos pendientes o rechazados **no se guardan**: no son dinero.

## 2. Lo que ya cumple lo pedido (verificado en el código y los tests)

| Regla | Estado |
|---|---|
| R1 saldo desde pagos confirmados; pendientes/rechazados/anulados no reducen | ✅ (solo aplicaciones de pagos aprobados) |
| R2 anticipo pedido ≠ ingreso hasta que se paga | ✅ |
| R3 múltiples pagos parciales | ✅ (test "anticipo + segundo pago + pago final") |
| R4 sin importes negativos; pedido ≤ saldo disponible; aplicado ≤ total, validado en backend | ✅ (la aplicación es atómica: un `INSERT … WHERE` con ambos topes) |
| R5 idempotencia: webhooks (único por proveedor+id de pago), pago manual (clave), aviso repetido | ✅ (tests) |
| Cancelar no borra nada; con pagos aplicados se bloquea hasta anular | ✅ |
| Pagos nunca se borran (triggers) y bitácora encadenada en el servicio de pagos | ✅ |
| Aislamiento: una base por consultorio; en pagos, todo por `client_id` | ✅ |
| Pago sin presupuesto → "sin presupuesto", luego se aplica sin contarse dos veces | ✅ |

## 3. Problemas encontrados

Orden por gravedad.

**P1 — Alto: el modo piloto contamina las métricas.** Los pagos del checkout simulado (`provider = mock`) entran en *Cobrado*, *Anticipos cobrados*, *Sin presupuesto*, *Por medio*, *mensual*, comisiones y los reportes CSV. En la pantalla se ven rotulados "simulado", pero los totales los suman como dinero real. (`dashboard.service.ts`, `reports.service.ts`: ningún filtro por proveedor.)

**P2 — Alto: el tipo de pago (anticipo / parcial / final) lo decide el navegador.** El backend solo rechaza un segundo anticipo; acepta el `kind` que llega. Un pedido directo puede marcar como "anticipo" un pago hecho después de otros, y el indicador *Anticipos cobrados* deja de ser confiable. Además el texto del concepto ("Anticipo · Limpieza") también se arma en el frontend. (`payments.service.ts: createRequest`, `frontend/lib/payment-kind.ts`.)

**P3 — Medio: carrera al pedir cobros.** El máximo pedible se valida en la app y después se crea el cobro en el servicio de pagos, sin bloqueo entre ambos pasos. Dos pedidos simultáneos pueden pasar la validación y sumar más que el saldo pedible (dos links por el saldo completo). El dinero **no** se sobre-aplica (la aplicación es atómica; el sobrante queda "sin presupuesto"), pero el pedido queda duplicado.

**P4 — Medio: zona horaria hardcodeada en tres lugares** (`worker/utils/dates.ts`, `registerManualPayment` con `-03:00`, `frontend/lib/formatters.ts: today()`), todos con -3 fijo. Funciona para Argentina; no es configurable por consultorio, y para otros rubros o países fallaría.

**P5 — Medio: sin bitácora en la app.** Las operaciones del dinero sí quedan en la bitácora del servicio de pagos. En la app no se registra quién cambió qué: ediciones de presupuesto, cambios de estado, cancelaciones, renombres de contacto. El renombre además se propaga a `patient_ref` de la copia de pagos, mientras que el servicio de pagos conserva el nombre original: los dos lados pueden mostrar nombres distintos del mismo pago.

**P6 — Medio: un solo usuario.** Hay una única clave de administración; no hay usuarios, roles ni registro de quién hizo cada cosa. Aceptable en el piloto con un consultorio; es el límite si lo usa más de una persona.

**P7 — Bajo: la copia puede atrasarse.** Entre que se aprueba un pago y llega el aviso firmado (cron, hasta ~1 minuto) el Resumen muestra el valor anterior. Está dicho en la documentación, no en pantalla.

**P8 — Bajo: faltan datos de lectura que pediste.** No hay *porcentaje pagado* en listados ni en el detalle del presupuesto, ni una línea de tiempo única de movimientos (pedidos + pagos + anulaciones) por presupuesto.

**P9 — Bajo: tests del Resumen incompletos.** Los escenarios del Resumen (pedido pendiente no cuenta como ingreso, períodos, anticipos, cancelados) no tienen tests propios; solo los reportes CSV.

## 4. Conflictos entre el pedido y decisiones ya tomadas (necesito que decidas)

1. **Estado "Aceptado".** Pediste sacarlo: se acepta pagando (hoy: Enviado → En curso → Completado, + Cancelado). Este pedido lo vuelve a incluir ("Aceptado", "Por cobrar = aceptados y en curso", "Aceptados, sin pagos todavía"). ¿Seguimos sin Aceptado? Con esa decisión, *Por cobrar* = saldo de presupuestos **En curso**, y "Enviados, esperando respuesta" se muestra aparte.
2. **Borrador.** El tipo existe pero no se usa (se sacó). ¿Lo dejamos fuera?
3. **Anticipo único.** Hoy un presupuesto tiene un solo anticipo, y los demás pagos son parciales. Es compatible con "múltiples pagos"; ¿lo mantenemos?
4. **Cancelar con pagos.** Hoy se bloquea hasta anular las aplicaciones. El pedido dice "informar las consecuencias". ¿Mantenemos el bloqueo y mejoramos el mensaje (con la lista de pagos y qué hacer), o querés permitir cancelar conservando los pagos como "sin presupuesto"?

## 5. Cobertura de los escenarios pedidos

| Escenario | Hoy |
|---|---|
| A anticipo + pago final | Cubierto parcialmente (flujo anticipo + segundo pago + final, con otros importes) |
| B tres pagos parciales | A completar con los importes pedidos |
| C solicitud pendiente no cuenta | Falta el chequeo del Resumen |
| D pago duplicado | ✅ |
| E cancelación con pago parcial | ✅ (falta verificar el mensaje) |
| F pago sin presupuesto | ✅ |
| G Resumen por períodos | Falta |

## 6. Propuesta de las etapas siguientes (sujeta a tus respuestas)

**Etapa 2 — modelo único:** un módulo `finance` en el backend con las definiciones (saldo, pedible, tipo de pago, estados y transiciones, indicadores del Resumen). El frontend solo muestra lo que devuelve.
**Etapa 3 — backend:** P1 (excluir lo simulado de las métricas, con total separado "simulado" en piloto), P2 (el servidor decide el tipo y el concepto), P3 (reserva atómica al pedir), P4 (una sola zona horaria, en la configuración), P5 (bitácora de cambios en la app).
**Etapa 4 — frontend:** P8 (porcentaje pagado, línea de tiempo de movimientos por presupuesto), mensajes de cancelación.
**Etapa 5 — tests:** escenarios A–G completos (incluido el Resumen).
**Etapa 6 — informe final.**

No incluyo en este alcance: usuarios y roles (P6), y habilitar cobros reales con Mercado Pago (sigue pendiente la prueba contra el sandbox real, con credenciales).

---

# Informe final (etapas 2 a 6)

Decisiones tomadas: estados Enviado / En curso / Completado / Cancelado (sin Aceptado ni Borrador); anticipo único; cancelar bloqueado con pagos aplicados, informando cuáles; *Por cobrar* = saldo de presupuestos En curso; zona horaria configurable (inicial America/Argentina/Mendoza).

## Modelo único (backend, `integra-od/worker/src/utils/money.ts`)
`deriveBudgetStatus`, `MANUAL_TRANSITIONS`, `describePayment` (tipo y texto del cobro), `paidPercent`, `requestableCents`, `budgetBalance`. El frontend ya no calcula el tipo ni el texto de los cobros (se borró `frontend/src/lib/payment-kind.ts`).

## Problemas resueltos
| | Cambio |
|---|---|
| P1 | Los pagos `mock` no suman en ningún total del Resumen ni de los reportes; se informan aparte ("simulado"). En el detalle del presupuesto se rotulan "simulado". |
| P2 | El servidor decide anticipo / parcial / final y el texto; ignora el que mande el cliente. Un segundo anticipo pedido a propósito da `advance_exists`. |
| P3 | Reserva atómica (`request_reservations`): un solo `INSERT … WHERE` verifica saldo, cobros vigentes, otras reservas y anticipo; dos pedidos simultáneos no pueden pasarse. |
| P4 | `clinic_settings.time_zone` (Configuración → Zona horaria). Todos los días, períodos y vencimientos usan esa zona en servidor y en pantalla. |
| P5 | `audit_log` en la app (solo se agrega): presupuestos, estados (incluidos los automáticos), cobros, pagos manuales, anulaciones, contactos, configuración. |
| P8 | Porcentaje pagado (listado y detalle) y línea de tiempo "Movimientos" por presupuesto. |
| P9 | Tests A–G + reglas (`tests/finance-scenarios.test.ts`). |

Además: editar el total de un presupuesto vuelve a calcular su estado (completa o reabre); cancelar con pagos explica cuáles y qué resolver (`code: has_payments` con el detalle), sin desasociar nada solo.

## Migración
`0011_finance_hardening.sql` (aditiva; deshacer: ver comentarios del archivo). Aplicada en la base local de desarrollo.

## Pruebas ejecutadas
Servicio de pagos 62 ✔ · App 185 ✔ (nuevas: escenarios A–G, concurrencia, bitácora inmutable, zona horaria, simulados) · typecheck ✔ · build ✔ · revisión visual en navegador (detalle de presupuesto escritorio y celular, ventana de cancelación, Resumen, Configuración, detalle de cobro) con escrituras bloqueadas.

## Riesgos pendientes
- Piloto: los saldos de los presupuestos sí reflejan los pagos simulados (para poder probar el flujo completo); solo el *dinero* del Resumen y los reportes los excluye. *Por cobrar* sale de los presupuestos, así que en piloto puede incluir saldos pagados con dinero simulado.
- Zonas con horario de verano: el desfase en las consultas SQL es el vigente hoy (exacto en Argentina).
- Un renombre de contacto cambia el nombre en la copia de la app, no en el servicio de pagos (que conserva el original).
- Una sola clave de administración: la bitácora registra "admin" (P6, fuera de alcance).
- La copia de pagos en la app puede atrasarse hasta ~1 minuto respecto del servicio de pagos (P7).
- Sin probar contra Mercado Pago real: falta app/credenciales, URL pública y usuarios de prueba. No se habilitaron cobros reales.
