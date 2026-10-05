Las vacaciones se agregan como bloques manuales de una o más semanas completas de siete días. El día inicial puede ser cualquier día de la semana; la fecha final se calcula y puede reprogramarse o cancelarse desde el calendario. El cierre anual de Soma no crea vacaciones automáticamente.

# ShiftPilot

ShiftPilot es una aplicación personal para organizar turnos, eventos y finanzas. Esta guía está escrita para quien quiera crear y mantener su propia bifurcación (fork), usar sus propios datos y desplegar una instancia independiente.

## Antes de usar el fork

El proyecto no tiene autenticación y está pensado para una sola persona en un entorno local o privado. No publiques el puerto de la aplicación en Internet sin añadir una capa de acceso segura.

El seed actual incluye datos personales de ejemplo/origen: un plan de deuda de acciones de 72 cuotas y un pago real. Antes de ejecutar `npm run db:seed` en un fork que vayas a compartir, revisa `prisma/debt-schedule.ts` y `prisma/seed.ts`; reemplaza o elimina esos registros si no son tuyos. No subas `.env`, copias de seguridad ni datos financieros reales a un repositorio público.

Los importes de negocio se expresan en miles de COP. Por ejemplo, `685` representa `$685.000 COP`. Las tasas se almacenan como partes por millón para calcular porcentajes con enteros. Las contribuciones de seguridad social conservan una décima de mil COP en enteros, equivalente a unidades de `$100 COP`.

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

La aplicación queda en <http://localhost:3000>. Compose inicia PostgreSQL, espera a que esté saludable, aplica las migraciones y ejecuta el seed antes de arrancar Next.js. El valor predeterminado de `SHIFTPILOT_BIND_ADDRESS` es `127.0.0.1`, y el puerto de PostgreSQL no se publica en el host.

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

Compose ejecuta el seed cada vez que arranca el contenedor de la aplicación. Las claves de configuración se actualizan con los valores declarados en `prisma/seed.ts`; si cambias esos valores directamente en la base, el siguiente arranque los restablece. Trata el seed como la fuente de los valores iniciales de tu fork.

## Despliegue en tu servidor

En un servidor Linux con Docker Compose, clona tu fork, crea `.env`, establece una contraseña aleatoria y configura `SHIFTPILOT_BIND_ADDRESS` con `127.0.0.1` o con una dirección privada del servidor. Después:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

La aplicación no tiene login, roles ni control de acceso. Mantén el servicio en loopback o en una red privada. Si necesitas publicarlo, añade primero autenticación y HTTPS mediante una arquitectura de acceso que controles; no publiques PostgreSQL.

## Copias de seguridad

Con Compose activo, crea una copia SQL usando las credenciales configuradas en el servicio de base:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/shiftpilot-$(date +%Y%m%d-%H%M%S).sql"
```

Restaura en una base vacía:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/shiftpilot-YYYYMMDD-HHMMSS.sql
```

Guarda las copias fuera del volumen del servidor, protégelas como datos privados y verifica periódicamente una restauración.

## Alcance actual

Implementado: calendario mensual, semanal y agenda; filtros y alta de turnos Soma, reservas, eventos y vacaciones; persistencia de calendario vía PostgreSQL con fallback local; modelos y cálculos base de facturación, IBC, seguridad social y deuda; carga del plan original y pruebas para sus reglas principales.

Pendiente: pantallas y operaciones completas de facturación y seguridad social, pagos reales/asignación de deuda, cobertura de turnos, configuración editable y reportes. Revisa el estado del código antes de basar un proceso financiero en datos de la interfaz.
