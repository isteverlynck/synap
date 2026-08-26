# SYNAP

Sistema web de gestión de equipamiento médico para el servicio de Bioingeniería del
Hospital Alemán. Proyecto Final de Carrera — Ingeniería Biomédica, ITBA (2026).

Autoras: Camila Barbagelata · Inés Steverlynck

## Estado del proyecto

En desarrollo. Implementado hasta ahora:

**Backend (FastAPI) — funcionando:**
- Autenticación: activación de cuenta en el primer ingreso, login por número de
  identificación, tokens JWT. Todos los endpoints (salvo los de auth) protegidos.
- Activos: listado, ficha por código, ficha con detalle (relaciones).
- Órdenes de trabajo: listar, ver, crear, cambiar estado y cerrar.
- Fallas: listar, ver, reportar.
- Mantenimientos preventivos: consulta.
- Planes de mantenimiento: crear (por tipo de equipo o genérico), listar, ver
  detalle con checklists, y buscar el plan que corresponde a un activo.
- Checklists: ver plantilla, registrar respuestas (PASA/NO_PASA), y generar una
  OT correctiva a partir de un ítem que no pasa.
- Stock: insumos, compras (flujo pedida → recibida), consumos con descuento
  automático vinculado a OT, y alertas de reposición en tres niveles.
- Dashboard de KPIs (jefatura): cumplimiento de MP, tiempo de inactividad,
  fallas por equipo y tipo, MTTR y MTBF.

**Frontend (React) — en desarrollo:**
- Estructura base con Vite.
- Pantalla de login conectada al backend.
- Listado de activos (pantalla molde para las demás).
- Escaneo de QR desde el navegador validado (html5-qrcode).

**Pendiente:**
- Frontend: resto de las pantallas (ficha de activo, escaneo integrado, OT,
  stock, dashboard, reporte de fallas).
- Permisos por rol (técnico / jefatura / enfermería) — requiere análisis del
  flujo de responsabilidades del hospital.
- Migración de datos reales del Hospital Alemán (objetivo de máxima).

## Tecnologías

- **Backend:** Python + FastAPI + SQLAlchemy (ORM)
- **Base de datos:** PostgreSQL (alojada en Supabase)
- **Autenticación:** JWT (tokens) + contraseñas hasheadas con bcrypt
- **Frontend:** React + Vite, react-router-dom (navegación), axios (llamadas al
  backend), html5-qrcode (escaneo QR)

## Estructura del repositorio

    synap/
    ├── backend/
    │   ├── app/
    │   │   ├── main.py          # Enciende el backend y conecta los routers
    │   │   ├── config.py        # Configuración (lee variables del .env)
    │   │   ├── database.py      # Conexión a la base de datos (Supabase)
    │   │   ├── models.py        # Tablas traducidas a Python (ORM)
    │   │   ├── schemas.py       # Contratos de entrada/salida de la API
    │   │   ├── security.py      # Hasheo de contraseñas y tokens
    │   │   └── routers/         # Endpoints, agrupados por tema
    │   │       ├── auth.py
    │   │       ├── activos.py
    │   │       ├── ordenes_trabajo.py
    │   │       ├── fallas.py
    │   │       ├── mantenimientos.py
    │   │       ├── planes_mantenimiento.py
    │   │       ├── checklists.py
    │   │       ├── stock.py
    │   │       └── dashboard.py
    │   ├── .env                 # Variables sensibles (NO se sube a GitHub)
    │   └── .env.example         # Plantilla del .env
    ├── synap-frontend/
    │   └── src/
    │       ├── api/             # Conexión al backend (cliente, auth)
    │       ├── pages/           # Cada pantalla (Login, Activos, ...)
    │       ├── components/      # Piezas reutilizables (escáner QR, etc.)
    │       └── App.jsx          # Mapa de navegación (rutas → pantallas)
    ├── bases/                   # Datos de ejemplo (CSV) para desarrollo
    ├── requirements.txt         # Librerías de Python
    └── README.md

## Requisitos previos

Instalar una sola vez en cada computadora:

- **Python 3.11+** (para el backend)
- **Node.js 18+** (para el frontend) — incluye `npm`.
  En Mac con Homebrew: `brew install node`

## Cómo levantar el proyecto localmente

El sistema tiene dos partes que corren a la vez, cada una en su terminal:
el **backend** (puerto 8000) y el **frontend** (puerto 5173).

### 1. Clonar el repositorio

```bash
git clone https://github.com/isteverlynck/synap.git
cd synap
```

### 2. Backend

Crear y activar un entorno virtual de Python:

```bash
python3 -m venv venv
source venv/bin/activate        # en Mac/Linux
```

Instalar las dependencias:

```bash
pip install -r requirements.txt
```

Configurar las variables de entorno:

```bash
cp backend/.env.example backend/.env
```

Después, abrir `backend/.env` y completar:
- `DATABASE_URL`: la connection string de Supabase (pedírsela a Ine).
- `SECRET_KEY`: generar una con
  `python3 -c "import secrets; print(secrets.token_hex(32))"`.

Correr el backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Backend en `http://localhost:8000` · documentación en `http://localhost:8000/docs`.

### 3. Frontend

En **otra terminal** (dejando el backend corriendo):

```bash
cd synap-frontend
npm install                     # solo la primera vez
npm run dev
```

El frontend queda en la dirección que muestre la terminal (normalmente
`http://localhost:5173`). Abrirla en el navegador.

**Importante:** el frontend necesita el backend corriendo para funcionar (le
pide los datos). Tener siempre las dos terminales activas al desarrollar.

## Notas

- El archivo `.env` contiene datos sensibles y no se versiona. Cada persona
  arma el suyo a partir de `.env.example`.
- Las tablas de la base ya existen en Supabase; el backend se conecta a ellas
  (no las crea).
- Los datos de la carpeta `bases/` son ficticios, con la misma estructura que
  los del Hospital Alemán, para desarrollo y pruebas.