Las vacaciones se agregan como bloques manuales de una o más semanas completas de siete días. El día inicial puede ser cualquier día de la semana; la fecha final se calcula y puede reprogramarse o cancelarse desde el calendario. El cierre anual de Soma no crea vacaciones automáticamente.

# ShiftPilot

ShiftPilot es una aplicación personal para organizar turnos, eventos y finanzas. Esta guía está escrita para quien quiera crear y mantener su propia bifurcación (fork), usar sus propios datos y desplegar una instancia independiente.

La creación de registros se realiza desde la página Calendario. El Resumen muestra la actividad y enlaces de consulta, sin botones para agregar eventos.

## Antes de usar el fork

El proyecto no tiene autenticación y está pensado para una sola persona en un entorno local o privado. No publiques el puerto de la aplicación en Internet sin añadir una capa de acceso segura.

El seed actual incluye datos personales de ejemplo/origen: un plan de deuda de acciones de 72 cuotas y un pago real. Antes de ejecutar `npm run db:seed` en un fork que vayas a compartir, revisa `prisma/debt-schedule.ts` y `prisma/seed.ts`; reemplaza o elimina esos registros si no son tuyos. No subas `.env`, copias de seguridad ni datos financieros reales a un repositorio público.

Los importes de negocio se guardan, calculan y muestran en miles de COP. Por ejemplo, `685` representa `$685.000 COP`; se admiten hasta tres decimales, donde `0,001` equivale a `$1 COP`. Las fuentes oficiales y documentos que informan pesos completos se convierten a miles al ingresar al sistema. Las tasas se almacenan como partes por millón y no son importes monetarios.

## Crear tu fork

1. Crea un fork del repositorio en tu proveedor Git.
2. Clona tu fork y entra al directorio:

```bash
git clone https://github.com/TU-USUARIO/shiftpilot.git
cd shiftpilot
```

3. Personaliza los valores iniciales de `prisma/seed.ts` y, si corresponde, las filas de `prisma/debt-schedule.ts`.
4. Crea tu archivo local de entorno y cambia la contraseña de ejemplo:

```bash
cp .env.example .env
openssl rand -hex 32
```

Copia el valor generado a `POSTGRES_PASSWORD` en `.env`. Mantén `.env` fuera de Git. No uses la contraseña de ejemplo en un servidor.

## Inicio con Docker

Requisitos: Docker Engine y Docker Compose v2.

```bash
docker compose up -d --build
```

La aplicación queda en <http://localhost:3000>. Compose inicia PostgreSQL, espera a que esté saludable y aplica las migraciones antes de arrancar Next.js. No ejecuta el seed: para una base nueva, carga los datos revisados con `docker compose run --rm --no-deps app npm run db:seed`. El valor predeterminado de `SHIFTPILOT_BIND_ADDRESS` es `127.0.0.1`; `SHIFTPILOT_PORT` permite cambiar el puerto sin afectar el 3000 interno. PostgreSQL no se publica en el host.

Para detener los servicios sin borrar los datos:

```bash
docker compose down
```

`docker compose down -v` elimina también el volumen de PostgreSQL. Úsalo sólo si quieres borrar la base de esa instancia.

## Desarrollo local

Requisitos: Node.js 22 LTS y PostgreSQL 16 accesible desde el equipo. Configura `DATABASE_URL` en `.env` para que apunte a esa base; el servicio PostgreSQL de Compose no publica el puerto para el desarrollo desde el host.

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Abre <http://localhost:3000>. Si partes de una base sin migraciones, `db:deploy` aplica las migraciones incluidas. No ejecutes el seed antes de revisar sus datos en un fork compartido.

## Comandos de trabajo

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Alcance de las pruebas

La auditoría de Fase 14 amplía las suites existentes de Vitest con fronteras de negocio:

- Facturación: descuentos hasta neto cero, rechazo de excesos, cantidades inválidas y consultas mensuales en año bisiesto y cambio de año.
- Deuda: liquidación exacta, exceso rechazado por la API, FIFO cronológico sin mutar entradas y parqueadero sin asignaciones a capital/intereses.
- Seguridad social: piso del IBC, agregación antes de redondear, saltos de solidaridad y aportes desactivados.
- Calendario: eventos contiguos sin solapamiento, medianoche, NOCHE entre años, prioridad de vacaciones y disponibilidad de eventos nocturnos.
- APIs: rechazo de fechas/importes inválidos antes de escribir y recálculo de períodos afectados.

Los tests de rutas simulan Prisma: no certifican migraciones, aislamiento de transacciones, concurrencia ni rollback sobre PostgreSQL real. Esa verificación requiere una base de prueba aislada; no ejecutar pruebas de escritura contra producción.

### Auditoría de dependencias

Revisión del 2026-10-07: Vitest se actualizó a 4.1.11 para eliminar la cadena vulnerable de `tinypool` (contaminación de prototipos/RCE) y corregir la lectura arbitraria de archivos del mocker. Prisma 6 conserva su versión; un override limitado a `@prisma/config` fija `deepmerge-ts` 8.0.0, que protege las fusiones de objetos recursivos. Generación de cliente y validación del esquema verificadas.

`npm audit --omit=dev` no reporta vulnerabilidades en el árbol de producción auditado. La auditoría completa conserva 9 avisos altos derivados de un único problema sin versión corregida publicada: agotamiento de pila con patrones anidados en `braces` 3.0.3 (GHSA-vfj7-8cjw-p6xm), usado por fast-glob/micromatch en ESLint/Next y shadcn. No se trata de nueve fallos independientes. No proceses patrones glob de fuentes no confiables con esas herramientas. La imagen Docker también instala herramientas de desarrollo; que el audit de producción esté limpio no equivale a eliminarlas de la imagen ni a demostrar ausencia de exposición.

No usar `npm audit fix --force`: las soluciones sugeridas incluyen rebajas incompatibles de herramientas. Repite `npm audit` al actualizar dependencias y retira el override cuando Prisma incorpore nativamente una versión corregida. El resolvedor de peers de npm 10 falló al actualizar Vitest; el lockfile se resolvió con npm 11 temporal (`npx --yes --package=npm@11 npm install`), manteniendo Node 22. La instalación reproducible se comprueba con `npm ci`.

Para cambiar el esquema durante el desarrollo, crea una migración con un nombre descriptivo:

```bash
npm run db:migrate -- --name nombre-del-cambio
```

Otros comandos:

- `npm run db:generate`: genera el cliente de Prisma tras un cambio de esquema.
- `npm run db:deploy`: aplica las migraciones ya creadas; se usa en producción.
- `npm run db:seed`: inicializa centros de trabajo, configuración y datos de ejemplo del seed.
- `npm run start`: inicia el build de producción de Next.js.

## Estructura

- `src/app/`: páginas y Route Handlers de Next.js App Router.
- `src/components/`: interfaz agrupada por calendario, dashboard y deuda.
- `src/lib/`: modelos de dominio, validación Zod y cálculos sin dependencias visuales.
- `src/server/`: acceso al servidor y cliente de Prisma.
- `prisma/schema.prisma`: modelo PostgreSQL.
- `prisma/migrations/`: migraciones versionadas.
- `prisma/seed.ts`: datos iniciales; revisa aquí los valores específicos de tu fork.
- `src/**/*.test.ts`: pruebas de reglas financieras, disponibilidad y deuda.

Las reglas financieras deben permanecer en `src/lib/` y probarse sin depender de componentes React. Los importes se guardan como enteros; evita `float` para dinero.

La rotación de Soma se configura por año desde la aplicación: rango principal, fecha/estado ancla y regla especial de cierre. La secuencia futura no se extrapola automáticamente, ya que su ancla se define al cerrar cada año. Los festivos colombianos se calculan por ley y Pascua; no se mantiene una tabla fija por año.

## Personalizar el seed

El seed es idempotente para una base ya inicializada. Crea Soma y Sedarte, valores iniciales de facturación y seguridad social, una tarifa de parqueadero para 2026, una deuda de acciones, el plan de 72 cuotas y el último pago indicado.

El plan conserva cada columna de origen. La fila de abril de 2030 contiene una diferencia de `1` (mil COP) entre el pago y la suma de interés más capital; el cálculo la mantiene como diferencia no clasificada. El seed se detiene si encuentra un plan existente que no coincide, en vez de sobrescribirlo. Para empezar con datos distintos, personaliza el seed antes de inicializar la base de tu fork.

El seed no se ejecuta al arrancar la aplicación: conserva `db:seed` como paso explícito de inicialización para una base nueva. Así, reiniciar o desplegar no restablece valores de configuración que ya hayas editado.

## Despliegue en tu servidor

En un servidor Linux con Docker Compose, clona tu fork, crea `.env`, establece una contraseña aleatoria y configura `SHIFTPILOT_BIND_ADDRESS` con `127.0.0.1` o con una dirección privada del servidor. Después:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

### Actualizar una instancia existente

Antes de actualizar, crea y verifica una copia de seguridad, comprueba espacio libre y revisa las migraciones incluidas. Conserva una referencia a la imagen anterior para un posible rollback compatible con el esquema. No ejecutes el seed durante una actualización.

Para cambios de la aplicación que no requieren reiniciar otros servicios:

```bash
git pull --ff-only
docker compose build app
docker compose up -d --no-deps --force-recreate app
docker compose ps
docker compose logs --tail=80 app
```

El arranque aplica las migraciones pendientes antes de iniciar Next.js. Comprueba las páginas y APIs afectadas después de actualizar. Un rollback de imagen no revierte migraciones: antes de usar la imagen anterior verifica su compatibilidad con la base actual. No restaures un backup sobre la base activa para resolver un error de interfaz. DB y `telegram-reminders` no se recrean con los comandos anteriores; si cambia el código/configuración del worker, su actualización es un paso separado.

### Recordatorios por Telegram

Los recordatorios están apagados por defecto en cada evento. Al activarlos, el worker de Compose envía el aviso en hora de Colombia y registra cada ocurrencia para evitar reenvíos. En eventos sin hora, "minutos antes" toma las 5:00 a. m. como hora de inicio.

El envío requiere `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME` en `.env`; sin ambos valores el worker permanece inactivo y no envía mensajes. El username abre el bot; el chat privado se vincula desde Configuración y ShiftPilot captura su ID automáticamente.

Para usar un bot y chat independientes de otra aplicación:

1. En Telegram abre `@BotFather`, ejecuta `/newbot` y sigue los pasos. Guarda el token y username nuevos; no reutilices el bot/token del otro proyecto.
2. Define `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME` en `.env` del servidor (el username puede ir como `ShiftPilotBot` o `@ShiftPilotBot`). No compartas el token ni lo guardes en Git.
3. Inicia el worker:

```bash
docker compose up -d --build telegram-reminders
```

4. En ShiftPilot, abre Configuración → Telegram para recordatorios, genera el enlace temporal y pulsa **Abrir Telegram y pulsar Iniciar**. El worker recibe `/start`, vincula ese chat privado y guarda su ID; no tienes que consultar ni copiar un `chat_id`.

Si cambias las variables del `.env`, recrea el worker para que cargue la nueva configuración:

```bash
docker compose up -d --force-recreate telegram-reminders
```

En cada evento puedes dejar el recordatorio apagado, elegir minutos de anticipación o las 5:00 a. m. del día del evento.

Solo al inicializar una base vacía por primera vez, carga los datos iniciales con:

```bash
docker compose run --rm --no-deps app npm run db:seed
```

La aplicación no tiene login, roles ni control de acceso. Mantén el servicio en loopback o en una red privada. Si necesitas publicarlo, añade primero autenticación y HTTPS mediante una arquitectura de acceso que controles; no publiques PostgreSQL.

### Compartir el calendario fuera de la red local

El botón **Compartir** abre la vista mensual `/AAAA/MM`. Para que el enlace apunte a un dominio público, define en `.env` el origen que publicará esa vista y recrea `app`:

```bash
SHIFTPILOT_SHARE_URL=https://calendario.example.com
docker compose up -d --no-deps --force-recreate app
```

Si la variable está vacía, el enlace usa la misma dirección desde la que abriste la aplicación. En el dominio público, el logo de la vista compartida no enlaza al resumen.

Publica ese hostname con Cloudflare Tunnel. La aplicación detecta las peticiones del dominio público (o con cabecera `cf-ray`) y sólo responde las rutas de meses y sus recursos estáticos; cualquier otra ruta muestra la página 404 de ShiftPilot:

```yaml
ingress:
  - hostname: calendario.example.com
    path: "^/[0-9]{4}/[0-9]{2}/?$"
    service: http://IP-PRIVADA:3000
  - hostname: calendario.example.com
    path: "^/(_next/static/.*|favicon\\.ico)$"
    service: http://IP-PRIVADA:3000
  # Rutas restantes: la aplicación responde con su página 404.
  - hostname: calendario.example.com
    path: ".*"
    service: http://IP-PRIVADA:3000
  - service: http_status:404
```

La tercera regla delega en la aplicación el bloqueo del resto de rutas; si prefieres que Cloudflare las corte sin pasar por ShiftPilot, omítela y verás la respuesta 404 vacía del túnel. Cualquiera con el enlace puede ver todos los meses; usa Cloudflare Access si necesitas limitar quién entra. La vista compartida omite notas y ubicaciones, y muestra las sedaciones como «Sedación» con su hora y duración.

## Copias de seguridad

Con Compose activo, crea una copia en formato custom usando las credenciales del servicio de base. Estos comandos están pensados para Bash; el archivo queda privado y sólo recibe su nombre definitivo si `pg_dump` termina correctamente:

```bash
set -euo pipefail
umask 077
mkdir -p backups
backup="$PWD/backups/shiftpilot-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup.partial" &&
	test -s "$backup.partial" && mv "$backup.partial" "$backup" &&
	sha256sum "$backup" > "$backup.sha256"
sha256sum --check "$backup.sha256"
```

Si el dump falla, no uses el archivo `.partial`. La copia contiene esquema, datos, secuencias y el historial de migraciones; no contiene roles globales, contraseñas ni configuración de `.env`. La omisión de propietarios/permisos permite restaurar bajo el usuario de la instancia destino. Protege también `.env` por separado.

### Ensayar una restauración aislada

No apuntes estos comandos al proyecto productivo. Usa un nombre de proyecto independiente, credenciales nuevas en `.env.restore`, `SHIFTPILOT_BIND_ADDRESS=127.0.0.1` y un `SHIFTPILOT_PORT` libre, por ejemplo `3100`. No copies el token de Telegram ni inicies el worker. Usa una shell sin variables exportadas de producción que puedan sobrescribir `.env.restore`.

```bash
set -euo pipefail
umask 077
cp .env.example .env.restore
# Configura .env.restore antes de continuar.
backup="$PWD/backups/shiftpilot-YYYYMMDD-HHMMSS.dump"
sha256sum --check "$backup.sha256"
docker compose -p shiftpilot-restore --env-file .env.restore up -d --wait db

tables="$(docker compose -p shiftpilot-restore --env-file .env.restore exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = current_schema();"')"
[[ "$tables" = 0 ]] || { printf 'La base destino no esta vacia; abortar.\n'; exit 1; }

docker compose -p shiftpilot-restore --env-file .env.restore exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error --single-transaction' < "$backup"
docker compose -p shiftpilot-restore --env-file .env.restore build app
docker compose -p shiftpilot-restore --env-file .env.restore up -d --wait app
docker compose -p shiftpilot-restore --env-file .env.restore ps
```

No ejecutes seed sobre una restauración. Verifica el historial de migraciones, recuentos y contenido de tablas, importes con decimales y las APIs, no sólo que PostgreSQL arranque. Para backups SQL antiguos usa `psql -v ON_ERROR_STOP=1 --single-transaction` en una base destino igualmente vacía y aislada; no uses `pg_restore` con un archivo SQL plano.

Tras verificar el resultado, elimina únicamente los recursos del ensayo:

```bash
docker compose -p shiftpilot-restore --env-file .env.restore down --volumes
```

`--volumes` destruye la copia restaurada: no omitas el nombre de proyecto ni lo ejecutes en producción. Conserva el dump y su checksum fuera del volumen de PostgreSQL, y otra copia cifrada fuera del servidor. No subas datos ni credenciales a Git. Cuando cambies de ubicación el dump, adapta la ruta registrada en el manifiesto de checksum o compara manualmente el hash esperado.

### Verificación de Fase 15

Ensayo del 2026-10-07 sobre PostgreSQL 16: instalación desde base vacía con 19 migraciones, cero sedes antes del seed explícito y dos ejecuciones de seed sin duplicar las 2 sedes, 1 deuda, 72 cuotas y 1 pago. Una copia productiva nueva se restauró en otra base del contenedor de prueba mediante `pg_restore --single-transaction`; recuentos y huellas de contenido coincidieron en las 38 tablas públicas. La app arrancó contra la copia restaurada sin migraciones pendientes y sus páginas/APIs respondieron correctamente. El proyecto de ensayo, su volumen y su imagen se retiraron; los contenedores productivos no se reiniciaron. Esta prueba no certifica concurrencia de escrituras, rollback de transacciones de negocio ni recuperación ante pérdida completa del servidor.

## Alcance actual

Implementado: calendario mensual, semanal y agenda; turnos Soma, reservas, eventos, vacaciones y cobertura; persistencia vía PostgreSQL con fallback local; facturación end-to-end con CRUD, partidas, cálculos por tipo, vencimientos y resumen mensual; seguridad social mensual integrada con facturación, piso SMMLV consultado a MinTrabajo, tasas editables, redondeo por componente y persistencia idempotente; cálculos base de deuda y carga del plan original.

Reportes mensuales, ajustes móviles y auditoría de tests están implementados. Seguridad social se recalcula con el CRUD de facturas y se persiste por mes. Quedan pendientes pruebas físicas en iPhone/VoiceOver, integración de escrituras concurrentes contra PostgreSQL aislado y validar el resguardo cifrado de backups fuera del servidor.

### Fase 9 — Seguridad social (CERRADA)

Validado: IBC mensual sobre el neto final de facturas con piso igual al salario básico mínimo legal vigente (SMMLV), incluso cuando el neto mensual es cero; salud 12.5%, pensión 16%, ARL 2.436% y caja 1%, con redondeo independiente por componente. La API consulta la nota anual oficial de MinTrabajo en el primer uso de cada año y guarda el valor por año; si aún no se publica o falla la fuente, conserva el último valor verificado, lo marca como desactualizado y reintenta al día siguiente. Crear/editar/eliminar facturas recalcula sólo los meses afectados y el upsert no duplica períodos. Gates: lint, typecheck, 125 pruebas, build y Prisma validate; smoke CRUD productivo verificó el recálculo y limpió la factura temporal.

### Fase 10 — Pagos reales y asignación de deuda (CERRADA)

La página Deuda registra pagos reales, separa el parqueadero del abono a la deuda y muestra el saldo pendiente y el detalle asignado por pago. El total sugerido de transferencia usa el saldo restante de la cuota pendiente más antigua, aunque esté atrasada, más la tarifa de parqueadero vigente. El formulario permite preconfigurar una o dos cuotas en un pago, y FIFO las distribuye por antigüedad, primero interés y luego capital; cualquier diferencia de origen se conserva como no clasificada y no se añade interés de mora. Al borrar un pago se recalculan las asignaciones restantes. El dashboard muestra el saldo, la próxima transferencia y la última transferencia reales cuando la API está disponible. Gates: suite completa, lint, typecheck, build y Prisma validate.
